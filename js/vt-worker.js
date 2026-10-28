// =====================================================================
//  Фоновый поток (Web Worker): загрузка и разбор векторных тайлов OSM.
//  Запускается из Blob (работает и при открытии сайта с диска, file://).
//
//  Что делает для каждого тайла:
//   • качает .pbf (или берёт из IndexedDB-кэша);
//   • декодирует Mapbox Vector Tile (protobuf) — свой мини-декодер;
//   • раскладывает землю по классам (жильё, парки, вода…), дороги по типам;
//   • для детального зума: здания с высотами, граф дорог (разрезка на
//     перекрёстках, обрезка по краю тайла), «посадка» деревьев по растру
//     (парки, леса, дворы, вдоль улиц; не на домах и не на дорогах).
//  Результат отдаётся в основной поток типизированными массивами (transfer).
// =====================================================================
window.TPM_WORKER = function () {
  "use strict";
  const td = new TextDecoder();

  // ---------------- protobuf ----------------
  function Pbf(buf) { this.buf = buf; this.pos = 0; this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  Pbf.prototype.varint = function () {
    const b = this.buf; let c = b[this.pos++], v = c & 0x7f;
    if (c < 0x80) return v; c = b[this.pos++]; v |= (c & 0x7f) << 7;
    if (c < 0x80) return v; c = b[this.pos++]; v |= (c & 0x7f) << 14;
    if (c < 0x80) return v; c = b[this.pos++]; v |= (c & 0x7f) << 21;
    if (c < 0x80) return v;
    let m = 268435456;
    do { c = b[this.pos++]; v += (c & 0x7f) * m; m *= 128; } while (c >= 0x80);
    return v;
  };
  Pbf.prototype.svarint = function () { const n = this.varint(); return n % 2 === 1 ? (n + 1) / -2 : n / 2; };
  Pbf.prototype.string = function () { const l = this.varint(); const s = td.decode(this.buf.subarray(this.pos, this.pos + l)); this.pos += l; return s; };
  Pbf.prototype.skip = function (t) {
    if (t === 0) this.varint(); else if (t === 1) this.pos += 8; else if (t === 2) { const l = this.varint(); this.pos += l; } else if (t === 5) this.pos += 4; else throw new Error("wire type " + t);
  };

  function readTile(buf) {
    const p = new Pbf(buf), layers = {};
    while (p.pos < buf.length) {
      const tag = p.varint();
      if ((tag >> 3) === 3 && (tag & 7) === 2) {
        const len = p.varint(), end = p.pos + len;
        const L = { name: "", extent: 4096, keys: [], values: [], feats: [], p };
        while (p.pos < end) {
          const t = p.varint(), f = t >> 3;
          if (f === 1) L.name = p.string();
          else if (f === 2) { const l = p.varint(); L.feats.push(p.pos, p.pos + l); p.pos += l; }
          else if (f === 3) L.keys.push(p.string());
          else if (f === 4) { const l = p.varint(), e = p.pos + l; let v = null;
            while (p.pos < e) { const tt = p.varint(), ff = tt >> 3;
              if (ff === 1) v = p.string(); else if (ff === 2) { v = p.view.getFloat32(p.pos, true); p.pos += 4; }
              else if (ff === 3) { v = p.view.getFloat64(p.pos, true); p.pos += 8; } else if (ff === 4 || ff === 5) v = p.varint();
              else if (ff === 6) v = p.svarint(); else if (ff === 7) v = !!p.varint(); else p.skip(tt & 7); }
            L.values.push(v); }
          else if (f === 5) L.extent = p.varint();
          else p.skip(t & 7);
        }
        layers[L.name] = L; p.pos = end;
      } else p.skip(tag & 7);
    }
    return layers;
  }
  function* features(L) {
    const p = L.p;
    for (let i = 0; i < L.feats.length; i += 2) {
      p.pos = L.feats[i]; const end = L.feats[i + 1];
      const F = { type: 0, props: {}, g0: 0, g1: 0 };
      while (p.pos < end) {
        const t = p.varint(), f = t >> 3;
        if (f === 1) p.varint();
        else if (f === 2) { const l = p.varint(), e = p.pos + l; while (p.pos < e) { const k = L.keys[p.varint()]; F.props[k] = L.values[p.varint()]; } }
        else if (f === 3) F.type = p.varint();
        else if (f === 4) { const l = p.varint(); F.g0 = p.pos; F.g1 = p.pos + l; p.pos += l; }
        else p.skip(t & 7);
      }
      yield F;
    }
  }
  function geom(L, F) {
    const p = L.p; p.pos = F.g0;
    let x = 0, y = 0, cmd = 0, n = 0, cur = null;
    const out = [];
    while (p.pos < F.g1) {
      if (n <= 0) { const c = p.varint(); cmd = c & 7; n = c >> 3; }
      n--;
      if (cmd === 1 || cmd === 2) {
        x += p.svarint(); y += p.svarint();
        if (cmd === 1) { cur = []; out.push(cur); }
        cur.push(x, y);
      } else if (cmd === 7 && cur && cur.length) cur.push(cur[0], cur[1]);
    }
    return out;
  }
  const ringArea = (r) => { let a = 0; for (let i = 0; i + 3 < r.length; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1]; return a / 2; };

  // ---------------- классы ----------------
  // земля (порядок отрисовки задаётся в основном потоке)
  const LU = { residential: 0, commercial: 1, retail: 1, industrial: 2, garages: 2, railway: 2, quarry: 2, military: 2, dam: 2,
    cemetery: 7, school: 10, university: 10, college: 10, hospital: 10, kindergarten: 10, library: 10,
    stadium: 9, pitch: 9, track: 9, playground: 3, theme_park: 3, zoo: 3 };
  const LC = { grass: 3, wood: 4, farmland: 5, sand: 6, rock: 6, ice: 6, wetland: 11 };
  const RD = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5, service: 6, track: 7, path: 8, rail: 9, transit: 9, busway: 6 };
  const WW = { river: 0, canal: 1, stream: 2, drain: 2, ditch: 2 };
  const ROAD_W = [26, 22, 17, 13, 11, 7.5, 4.5, 3, 2, 3]; // ширина в метрах
  const PARKLIKE = { park: 1, garden: 1, recreation_ground: 1, village_green: 1, golf_course: 1, grass: 0.35, meadow: 0.15, allotments: 0.5 };

  class Coll { // плоский набор колец/линий
    constructor() { this.c = []; this.s = []; this.a = []; }
    add(pts, attr) { this.s.push(this.c.length / 2); for (let i = 0; i < pts.length; i++) this.c.push(pts[i]); this.a.push(attr || 0); }
    pack() { return { c: new Float32Array(this.c), s: new Uint32Array(this.s.concat([this.c.length / 2])), a: new Int16Array(this.a) }; }
  }

  // ---------------- растр для деревьев ----------------
  const N = 256;
  function rasterPoly(grid, rings, ext, val, mode) {
    const cs = ext / N;
    let y0 = Infinity, y1 = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { if (r[i] < y0) y0 = r[i]; if (r[i] > y1) y1 = r[i]; }
    const r0 = Math.max(0, Math.floor(y0 / cs)), r1 = Math.min(N - 1, Math.floor(y1 / cs));
    const xs = [];
    for (let row = r0; row <= r1; row++) {
      const yc = (row + 0.5) * cs; xs.length = 0;
      for (const r of rings) for (let i = 0; i + 3 < r.length; i += 2) {
        const ay = r[i + 1], by = r[i + 3];
        if ((ay > yc) !== (by > yc)) xs.push(r[i] + (yc - ay) / (by - ay) * (r[i + 2] - r[i]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k] / cs - 0.5)), c1 = Math.min(N - 1, Math.floor(xs[k + 1] / cs - 0.5));
        for (let c = c0; c <= c1; c++) { const o = row * N + c; if (mode === 1) grid[o] = 1; else if (val > grid[o]) grid[o] = val; }
      }
    }
  }
  function stampLine(grid, pts, ext, halfW) {
    const cs = ext / N, rad = Math.max(0, Math.ceil(halfW / cs - 0.3));
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const dx = pts[i + 2] - pts[i], dy = pts[i + 3] - pts[i + 1], L = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(L / (cs * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const x = (pts[i] + dx * s / steps) / cs, y = (pts[i + 1] + dy * s / steps) / cs;
        const cx = x | 0, cy = y | 0;
        for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
          const gx = cx + a, gy = cy + b;
          if (gx >= 0 && gy >= 0 && gx < N && gy < N) grid[gy * N + gx] = 1;
        }
      }
    }
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296); }

  // Лиан–Барски: обрезка полилинии по квадрату [0,ext]
  function clipLine(pts, ext, out) {
    let cur = null;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], y0 = pts[i + 1], dx = pts[i + 2] - x0, dy = pts[i + 3] - y0;
      let t0 = 0, t1 = 1, ok = true;
      const P = [-dx, dx, -dy, dy], Q = [x0, ext - x0, y0, ext - y0];
      for (let k = 0; k < 4; k++) {
        if (P[k] === 0) { if (Q[k] < 0) { ok = false; break; } }
        else { const r = Q[k] / P[k]; if (P[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
      }
      if (!ok) { if (cur) { if (cur.length >= 4) out.push(cur); cur = null; } continue; }
      if (!cur || t0 > 0) { if (cur && cur.length >= 4) out.push(cur); cur = [x0 + dx * t0, y0 + dy * t0]; }
      cur.push(x0 + dx * t1, y0 + dy * t1);
      if (t1 < 1) { if (cur.length >= 4) out.push(cur); cur = null; }
    }
    if (cur && cur.length >= 4) out.push(cur);
  }

  function hexColor(s) {
    if (typeof s !== "string") return -1;
    const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
    return m ? parseInt(m[1], 16) : -1;
  }

  // ---------------- обработка тайла ----------------
  function process(buf, msg) {
    const { z, x, y, detail, mpu, lms, density } = msg;
    const layers = readTile(buf);
    const ext = (layers.transportation || layers.landuse || layers.water || { extent: 4096 }).extent || 4096;
    const size = 256 / Math.pow(2, z), ox = x * size, oy = y * size, f = size / ext;
    const mPerU = f * mpu; // метров в единице тайла
    const ground = {}, lines = {}, ww = {};
    const G = (k) => ground[k] || (ground[k] = new Coll());
    const Ln = (k) => lines[k] || (lines[k] = new Coll());
    const WWc = (k) => ww[k] || (ww[k] = new Coll());
    const treeZone = detail ? new Float32Array(N * N) : null;
    const blocked = detail ? new Uint8Array(N * N) : null;

    const polyLayer = (name, map, cb) => {
      const L = layers[name]; if (!L) return;
      for (const F of features(L)) {
        if (F.type !== 3) continue;
        const cls = cb ? cb(F) : map[F.props.class];
        if (cls === undefined || cls === null) continue;
        const rings = geom(L, F);
        for (const r of rings) G(cls).add(r);
        if (detail) {
          const sub = F.props.subclass;
          if (name === "landcover" && F.props.class === "wood") rasterPoly(treeZone, rings, ext, 0.62);
          else if (name === "landcover" && F.props.class === "grass") rasterPoly(treeZone, rings, ext, (PARKLIKE[sub] || 0.12) * 0.5);
          else if (name === "landuse" && F.props.class === "cemetery") rasterPoly(treeZone, rings, ext, 0.3);
          else if (name === "landuse" && F.props.class === "residential") rasterPoly(treeZone, rings, ext, 0.075);
          else if (name === "landuse" && (F.props.class === "school" || F.props.class === "hospital" || F.props.class === "university")) rasterPoly(treeZone, rings, ext, 0.12);
          if (name === "water") rasterPoly(blocked, rings, ext, 1, 1);
        }
      }
    };
    polyLayer("landuse", LU);
    polyLayer("landcover", LC);
    polyLayer("park", null, (F) => (F.props.class === "park" ? 3 : null));
    polyLayer("aeroway", null, (F) => (F.props.class === "aerodrome" ? 13 : 12));
    polyLayer("water", null, (F) => (F.props.brunnel === "tunnel" ? null : 8));

    // водотоки
    if (layers.waterway) for (const F of features(layers.waterway)) {
      const c = WW[F.props.class]; if (c === undefined || F.props.brunnel === "tunnel") continue;
      for (const l of geom(layers.waterway, F)) WWc(c).add(l);
    }

    // дороги
    const sim = []; // линии для графа машин
    const flow = new Coll();
    if (layers.transportation) for (const F of features(layers.transportation)) {
      if (F.type !== 2) continue;
      const p = F.props;
      let c = RD[p.class];
      if (c === undefined || p.brunnel === "tunnel") continue;
      if (c === 9 && (p.subclass === "subway" || p.subclass === "funicular")) continue;
      const ow = p.oneway === 1 || p.oneway === "1" ? 1 : p.oneway === -1 || p.oneway === "-1" ? -1 : 0;
      for (let l of geom(layers.transportation, F)) {
        if (ow === -1) { const r = []; for (let i = l.length - 2; i >= 0; i -= 2) r.push(l[i], l[i + 1]); l = r; }
        Ln(c).add(l, ow ? 1 : 0);
        if (c <= 3) flow.add(l, c * 2 + (ow ? 1 : 0));
        if (detail) {
          if (c <= 5) sim.push({ l, c, ow: ow ? 1 : 0, ramp: p.ramp ? 1 : 0 });
          if (c !== 8) stampLine(blocked, l, ext, ROAD_W[c] / 2 / mPerU);
        }
      }
    }
    if (layers.aeroway) for (const F of features(layers.aeroway)) {
      if (F.type !== 2) continue;
      for (const l of geom(layers.aeroway, F)) Ln(F.props.class === "runway" ? 10 : 11).add(l);
    }

    // места (названия районов/кварталов)
    const places = [];
    if (layers.place) for (const F of features(layers.place)) {
      if (F.type !== 1) continue;
      const p = F.props, g = geom(layers.place, F)[0];
      if (!g || g[0] < 0 || g[1] < 0 || g[0] >= ext || g[1] >= ext) continue;
      const name = p["name:ru"] || p.name || p["name:latin"] || p.name_int;
      if (!name) continue;
      places.push({ n: name, uz: p["name:uz"] || p["name:latin"] || "", c: p.class, x: ox + g[0] * f, y: oy + g[1] * f });
    }

    const res = { z, x, y, ext, ox, oy, f, ground: {}, lines: {}, ww: {}, places, flow: flow.pack() };
    for (const k in ground) res.ground[k] = ground[k].pack();
    for (const k in lines) res.lines[k] = lines[k].pack();
    for (const k in ww) res.ww[k] = ww[k].pack();

    if (detail) {
      // ---- здания ----
      const lmU = lms.map((l) => [(l.x - ox) / f, (l.y - oy) / f, (l.r / mPerU) * (l.r / mPerU)]);
      const nearLm = (px, py) => { for (const l of lmU) { const dx = px - l[0], dy = py - l[1]; if (dx * dx + dy * dy < l[2]) return true; } return false; };
      const bc = [], bs = [], bh = [], bmin = [], bcol = [], bcx = [], bcy = [];
      if (layers.building) for (const F of features(layers.building)) {
        if (F.type !== 3 || F.props.hide_3d) continue;
        const rings = geom(layers.building, F);
        for (const r of rings) {
          if (ringArea(r) <= 0) continue; // дырки пропускаем
          const n = r.length / 2 - 1; if (n < 3) continue;
          let cx = 0, cy = 0;
          for (let i = 0; i < n; i++) { cx += r[i * 2]; cy += r[i * 2 + 1]; }
          cx /= n; cy /= n;
          if (cx < 0 || cy < 0 || cx >= ext || cy >= ext) continue; // этот дом принадлежит соседнему тайлу
          rasterPoly(blocked, [r], ext, 1, 1);
          if (nearLm(cx, cy)) continue;
          bs.push(bc.length / 2);
          for (let i = 0; i < n; i++) bc.push(r[i * 2], r[i * 2 + 1]);
          bh.push(+F.props.render_height || 0); bmin.push(+F.props.render_min_height || 0);
          bcol.push(hexColor(F.props.colour)); bcx.push(cx); bcy.push(cy);
        }
      }
      bs.push(bc.length / 2);
      res.bld = { c: new Float32Array(bc), s: new Uint32Array(bs), h: new Float32Array(bh), mh: new Float32Array(bmin), col: new Int32Array(bcol), cx: new Float32Array(bcx), cy: new Float32Array(bcy) };

      // ---- деревья ----
      const R = rng((x * 73856093) ^ (y * 19349663));
      const cs = ext / N, tr = [];
      const maxT = 14000 * density;
      for (let o = 0; o < N * N && tr.length < maxT * 4; o++) {
        const zv = treeZone[o];
        if (zv <= 0 || blocked[o]) continue;
        if (R() > zv * density) continue;
        const px = ((o % N) + 0.2 + R() * 0.6) * cs, py = (((o / N) | 0) + 0.2 + R() * 0.6) * cs;
        if (nearLm(px, py)) continue;
        tr.push(px, py, R(), 5 + R() * 4.5);
      }
      // вдоль улиц (Ташкент — город чинар)
      for (const s of sim) {
        if (s.c < 2 || s.ramp) continue;
        const half = ROAD_W[s.c] / 2 + 4.2, step = 11.5 / mPerU, off = half / mPerU;
        const l = s.l;
        let acc = R() * step;
        for (let i = 0; i + 3 < l.length; i += 2) {
          const dx = l[i + 2] - l[i], dy = l[i + 3] - l[i + 1], L = Math.hypot(dx, dy);
          if (!L) continue;
          const ux = dx / L, uy = dy / L;
          for (let t = acc; t < L; t += step) {
            for (const side of [1, -1]) {
              if (R() > 0.78 * density) continue;
              const px = l[i] + ux * t - uy * off * side, py = l[i + 1] + uy * t + ux * off * side;
              if (px < 0 || py < 0 || px >= ext || py >= ext) continue;
              const o = ((py / cs) | 0) * N + ((px / cs) | 0);
              if (blocked[o] || nearLm(px, py)) continue;
              blocked[o] = 1;
              tr.push(px, py, R(), 6 + R() * 4);
            }
          }
          acc = (acc - L) % step; if (acc < 0) acc += step;
        }
      }
      res.trees = new Float32Array(tr);

      // ---- граф дорог: разрезаем на перекрёстках и по краю тайла ----
      const cnt = new Map();
      const key = (a, b) => (a + 8192) * 32768 + (b + 8192);
      for (const s of sim) for (let i = 0; i < s.l.length; i += 2) {
        const k = key(s.l[i], s.l[i + 1]);
        cnt.set(k, (cnt.get(k) || 0) + ((i === 0 || i === s.l.length - 2) ? 2 : 1));
      }
      const ec = [], es = [], ecls = [];
      for (const s of sim) {
        let cur = [s.l[0], s.l[1]];
        const flush = () => {
          if (cur.length < 4) return;
          const pieces = []; clipLine(cur, ext, pieces);
          for (const pc of pieces) { es.push(ec.length / 2); for (const v of pc) ec.push(v); ecls.push(s.c | (s.ow << 4) | (s.ramp << 5)); }
        };
        for (let i = 2; i < s.l.length; i += 2) {
          cur.push(s.l[i], s.l[i + 1]);
          if ((cnt.get(key(s.l[i], s.l[i + 1])) || 0) >= 2 && i < s.l.length - 2) { flush(); cur = [s.l[i], s.l[i + 1]]; }
        }
        flush();
      }
      es.push(ec.length / 2);
      res.edges = { c: new Float32Array(ec), s: new Uint32Array(es), a: new Int16Array(ecls) };
    }
    return res;
  }

  function transfers(res) {
    const t = [];
    const add = (o) => { if (!o) return; for (const k in o) if (o[k] && o[k].buffer) t.push(o[k].buffer); };
    for (const g of ["ground", "lines", "ww"]) for (const k in res[g]) add(res[g][k]);
    add(res.flow); add(res.bld); add(res.edges);
    if (res.trees) t.push(res.trees.buffer);
    return t;
  }

  // ---------------- загрузка + кэш ----------------
  let db = null;
  const dbReady = new Promise((ok) => {
    try {
      const r = indexedDB.open("tpm-vt", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("t");
      r.onsuccess = () => { db = r.result; ok(); };
      r.onerror = () => ok();
    } catch (e) { ok(); }
  });
  const idbGet = (k) => new Promise((ok) => {
    if (!db) return ok(null);
    try { const q = db.transaction("t").objectStore("t").get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); } catch (e) { ok(null); }
  });
  const idbPut = (k, v) => { if (!db) return; try { db.transaction("t", "readwrite").objectStore("t").put(v, k); } catch (e) {} };

  async function gunzipIfNeeded(u8) {
    if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b && typeof DecompressionStream !== "undefined") {
      const ds = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip")));
      return new Uint8Array(await ds.arrayBuffer());
    }
    return u8;
  }

  self.onmessage = async (ev) => {
    const msg = ev.data;
    try {
      await dbReady;
      let ab = await idbGet(msg.url);
      let fromCache = !!ab;
      if (!ab) {
        const r = await fetch(msg.url);
        if (r.status === 204 || r.status === 404) ab = new ArrayBuffer(0);
        else if (!r.ok) throw new Error("HTTP " + r.status);
        else ab = await r.arrayBuffer();
        idbPut(msg.url, ab);
      }
      const u8 = await gunzipIfNeeded(new Uint8Array(ab));
      const res = process(u8, msg);
      res.id = msg.id; res.cached = fromCache;
      self.postMessage(res, transfers(res));
    } catch (e) {
      self.postMessage({ id: msg.id, error: String(e && e.message || e) });
    }
  };
};
