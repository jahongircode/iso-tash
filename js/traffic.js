// =====================================================================
//  Транспорт: граф улиц (собирается из загруженных тайлов), машины,
//  светофоры (реальные из OSM либо на крупных перекрёстках). Машины едут по модели IDM:
//  держат дистанцию до лидера (в т.ч. за перекрёстком), по очереди проезжают нерегулируемые
//  перекрёстки, тормозят перед поворотами; ночью их меньше, общественный транспорт не ходит.
// =====================================================================
(function () {
  const C = TPM.config, S = TPM.scene, T = TPM.tiles;
  const TR = TPM.traffic = { nodes: new Map(), sig: new Set(), cars: [] };
  const LANE = 3.3, Q = 1.6;
  const RW = { 0: 24, 1: 22, 2: 18, 3: 14, 4: 11, 5: 7.5 };
  const VMAX = [22, 18, 15, 13, 11, 8];
  let rnd = (() => { let s = 99; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296); })();

  function nodeAt(x, z) {
    const kx = Math.round(x / Q), kz = Math.round(z / Q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const n = TR.nodes.get((kx + a) + "," + (kz + b));
      if (n && Math.hypot(n.x - x, n.z - z) < Q * 1.6) return n;
    }
    const n = { x, z, adj: [], inl: [], key: kx + "," + kz, ctrl: null, poles: null };
    TR.nodes.set(n.key, n); return n;
  }
  // ---------- добавление дорог тайла ----------
  function addTile(rec) {
    rec.edges = [];
    const nearLm = (x, z) => TPM.models && TPM.models.near(x, z, 10);
    // перекрёстки: одинаковые вершины у разных линий (внутри тайла) — режем там
    const cnt = new Map(), key = (x, z) => Math.round(x * 4) + "," + Math.round(z * 4);
    for (const L of rec.lines) for (let i = 0; i < L.p.length; i += 2) { const k = key(L.p[i], L.p[i + 1]); cnt.set(k, (cnt.get(k) || 0) + ((i === 0 || i === L.p.length - 2) ? 2 : 1)); }
    for (const L of rec.lines) {
      if (L.cls > 5) continue;
      const hh = (i) => (L.h ? L.h[i >> 1] : 0);
      let cur = [L.p[0], L.p[1]], curH = [hh(0)];
      const flush = () => { if (cur.length >= 4) addEdge(rec, cur, L.cls, !!(L.fl & 1), curH, nearLm); };
      for (let i = 2; i < L.p.length; i += 2) {
        cur.push(L.p[i], L.p[i + 1]); curH.push(hh(i));
        if (i < L.p.length - 2 && (cnt.get(key(L.p[i], L.p[i + 1])) || 0) >= 2) { flush(); cur = [L.p[i], L.p[i + 1]]; curH = [hh(i)]; }
      }
      flush();
    }
    let acc = 0; rec.edgeW = new Float64Array(rec.edges.length);
    rec.edges.forEach((e, i) => { acc += e.len * (e.cls <= 2 ? 3 : e.cls <= 4 ? 2 : 0.5) * e.lanes; rec.edgeW[i] = acc; });
    rec.edgeWT = acc;
    // светофоры
    if (rec.signals && rec.signals.length) {
      rec.sigW = [];
      for (let i = 0; i < rec.signals.length; i += 2) rec.sigW.push(rec.signals[i] + rec.ox, rec.signals[i + 1] + rec.oz);
    }
    const touched = new Set(); for (const e of rec.edges) { touched.add(e.a); touched.add(e.b); }
    for (const n of touched) evalSignal(n, rec);
  }
  function addEdge(rec, p, cls, oneway, hs, nearLm) {
    const n = p.length / 2, xs = new Float64Array(n), zs = new Float64Array(n), cum = new Float64Array(n), ux = new Float64Array(n), uz = new Float64Array(n), ys = new Float32Array(n);
    let ymax = -1e9, ymin = 1e9;
    for (let i = 0; i < n; i++) { xs[i] = p[i * 2] + rec.ox; zs[i] = p[i * 2 + 1] + rec.oz; ys[i] = hs[i] || 0; ymax = Math.max(ymax, ys[i]); ymin = Math.min(ymin, ys[i]); }
    for (let i = 1; i < n; i++) { const dx = xs[i] - xs[i - 1], dz = zs[i] - zs[i - 1], L = Math.hypot(dx, dz) || 1e-9; cum[i] = cum[i - 1] + L; ux[i - 1] = dx / L; uz[i - 1] = dz / L; }
    ux[n - 1] = ux[n - 2]; uz[n - 1] = uz[n - 2];
    if (cum[n - 1] < 2) return;
    const lanes = cls <= 1 ? (oneway ? 3 : 2) : cls <= 3 ? 2 : 1;
    const e = { xs, zs, cum, ux, uz, n, len: cum[n - 1], cls, oneway, lanes, alive: true, ys: ymax !== 0 || ymin !== 0 ? ys : null, y: Math.max(0, ys[0], ys[n - 1]) * 0.5,
      half: oneway ? RW[cls] / 2 : RW[cls] / 2, a: nodeAt(xs[0], zs[0]), b: nodeAt(xs[n - 1], zs[n - 1]), hid: nearLm((xs[0] + xs[n - 1]) / 2, (zs[0] + zs[n - 1]) / 2) };
    e.a.adj.push({ e, dir: 1 }); e.b.inl.push({ e, dir: 1 });
    if (!oneway) { e.b.adj.push({ e, dir: -1 }); e.a.inl.push({ e, dir: -1 }); }
    rec.edges.push(e);
  }
  function removeTile(rec) {
    if (!rec.edges) return;
    const touched = new Set();
    for (const e of rec.edges) {
      e.alive = false;
      for (const n of [e.a, e.b]) { n.adj = n.adj.filter((o) => o.e !== e); n.inl = n.inl.filter((o) => o.e !== e); n.poles = null; touched.add(n); }
    }
    for (const n of touched) if (!n.adj.length && !n.inl.length) { TR.nodes.delete(n.key); TR.sig.delete(n); }
    rec.edges = null;
  }
  // ---------- светофоры ----------
  const ctrls = new Map();
  function ctrlFor(n) {
    const cx = Math.floor(n.x / 45), cz = Math.floor(n.z / 45);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = ctrls.get((cx + a) + "," + (cz + b)); if (l) for (const c of l) if (Math.hypot(c.x - n.x, c.z - n.z) < 45) return c; }
    const c = { x: n.x, z: n.z, off: rnd() * 60, axis: null }, k = cx + "," + cz;
    if (!ctrls.has(k)) ctrls.set(k, []); ctrls.get(k).push(c); return c;
  }
  function evalSignal(n, rec) {
    n.poles = null;
    const es = new Set(); for (const o of n.adj) es.add(o.e); for (const o of n.inl) es.add(o.e);
    let on = false;
    if (es.size >= 3) {
      const s = rec && rec.sigW;
      if (s && s.length) { for (let i = 0; i < s.length; i += 2) if (Math.hypot(s[i] - n.x, s[i + 1] - n.z) < 26) { on = true; break; } }
      else if (!TPM.hasSignals) { let maj = 0; for (const e of es) if (e.cls <= 3) maj++; on = maj >= 3; }
    }
    if (on) { n.ctrl = n.ctrl || ctrlFor(n); TR.sig.add(n); } else { n.ctrl = null; TR.sig.delete(n); }
  }
  const SG = C.signal, CYC = 2 * (SG.green + SG.yellow + SG.allRed);
  function sigState(c, ph, t) { let l = (t + c.off) % CYC; if (ph) l = (l + CYC / 2) % CYC; return l < SG.green ? 0 : l < SG.green + SG.yellow ? 1 : 2; }
  function phaseFor(c, hx, hz) { const a = Math.atan2(hz, hx); if (c.axis === null) c.axis = a; return Math.abs(Math.cos(a - c.axis)) >= 0.7071 ? 0 : 1; }
  const endH = (e, dir) => { const i = dir > 0 ? e.n - 2 : 0; return [e.ux[i] * dir, e.uz[i] * dir]; };

  // ---------- машины ----------
  const COLORS = [[0.95, 0.94, 0.92, 30], [0.85, 0.86, 0.87, 12], [0.6, 0.62, 0.64, 8], [0.16, 0.17, 0.19, 10], [0.22, 0.3, 0.46, 5], [0.55, 0.18, 0.16, 5], [0.18, 0.36, 0.27, 3], [0.8, 0.7, 0.52, 4], [0.92, 0.75, 0.22, 4]];
  const pickColor = () => { let r = rnd() * 81; for (const c of COLORS) { r -= c[3]; if (r <= 0) return c; } return COLORS[0]; };

  // ---------- модели ----------
  // Ось +x — вперёд, y — вверх, z — вбок. Деталь — брус [x0, x1, y0, y1, z0, z1, цвет, сужение верха спереди,
  // сзади, с боков]. PAINT — белая «краска»: её умножает цвет экземпляра (цвет машины); у автобусов и
  // «Газелей» окраска заводская, экземпляр белый.
  const PAINT = [1, 1, 1], GLS = [0.15, 0.18, 0.22], TYR = [0.08, 0.08, 0.09], TRIM = [0.3, 0.3, 0.32], TAIL = [0.75, 0.1, 0.08];
  const GRN = [0.22, 0.62, 0.32], WRF = [0.9, 0.92, 0.92], WHT = [0.95, 0.95, 0.94];
  const wheels = (xs, r, w0, w1) => xs.flatMap((x) => [[x - r * 0.55, x + r * 0.55, 0, r, w0, w1, TYR], [x - r * 0.55, x + r * 0.55, 0, r, -w1, -w0, TYR]]);
  const ends = (a, w, y0, y1) => [[a - 0.08, a + 0.06, y0, y1, -w, w, TRIM], [-a - 0.06, -a + 0.08, y0, y1, -w, w, TRIM], [-a - 0.07, -a + 0.02, y1 + 0.05, y1 + 0.18, -w + 0.05, -w + 0.3, TAIL], [-a - 0.07, -a + 0.02, y1 + 0.05, y1 + 0.18, w - 0.3, w - 0.05, TAIL]];
  const busBody = (a, w, front, rear) => [
    [-a, a, 0.3, 1.2, -w, w, GRN], [-a + 0.1, a - 0.05, 1.2, 2.3, -w - 0.01, w + 0.01, GLS], [-a, a, 2.3, 2.55, -w, w, GRN], [-a + 0.2, a - 0.2, 2.55, 2.72, -w + 0.12, w - 0.12, WRF],
    [-1.4, 1.4, 2.72, 2.98, -0.8, 0.8, WRF],
    ...(front ? [[a - 0.05, a + 0.04, 0.75, 2.35, -w + 0.12, w - 0.12, GLS], [a - 0.04, a + 0.06, 2.32, 2.5, -0.8, 0.8, [1, 0.62, 0.12]], [a, a + 0.12, 0.28, 0.6, -w, w, TRIM]] : []),
    ...(rear ? [[-a - 0.06, -a + 0.02, 0.7, 1.0, -w + 0.1, -w + 0.4, TAIL], [-a - 0.06, -a + 0.02, 0.7, 1.0, w - 0.4, w - 0.1, TAIL]] : []),
  ];
  const SPEC = {
    sedan: { len: 4.5, wid: 1.78, parts: [[-2.25, 2.25, 0.3, 0.8, -0.89, 0.89, PAINT, 0.28, 0.1, 0.03], [-1.3, 0.85, 0.8, 1.38, -0.82, 0.82, GLS, 0.5, 0.38, 0.1], [-1.0, 0.38, 1.38, 1.43, -0.7, 0.7, PAINT], ...ends(2.25, 0.86, 0.3, 0.55), ...wheels([-1.38, 1.38], 0.62, 0.66, 0.92)] },
    hatch: { len: 3.9, wid: 1.72, parts: [[-1.95, 1.95, 0.3, 0.82, -0.86, 0.86, PAINT, 0.36, 0.02, 0.03], [-1.86, 0.6, 0.82, 1.42, -0.8, 0.8, GLS, 0.5, 0.1, 0.1], [-1.7, 0.18, 1.42, 1.47, -0.7, 0.7, PAINT], ...ends(1.95, 0.84, 0.3, 0.55), ...wheels([-1.2, 1.2], 0.6, 0.64, 0.9)] },
    suv: { len: 4.7, wid: 1.9, parts: [[-2.35, 2.35, 0.42, 1.02, -0.95, 0.95, PAINT, 0.22, 0.05, 0.03], [-2.2, 0.95, 1.02, 1.66, -0.88, 0.88, GLS, 0.45, 0.08, 0.08], [-2.0, 0.55, 1.66, 1.72, -0.78, 0.78, PAINT], [-1.6, 0.3, 1.72, 1.78, -0.7, -0.62, TRIM], [-1.6, 0.3, 1.72, 1.78, 0.62, 0.7, TRIM], ...ends(2.35, 0.92, 0.38, 0.66), ...wheels([-1.5, 1.5], 0.74, 0.7, 0.98)] },
    damas: { len: 3.5, wid: 1.4, parts: [[-1.75, 1.75, 0.28, 1.86, -0.7, 0.7, PAINT, 0.32, 0.0, 0.05], [-1.6, 1.25, 1.16, 1.62, -0.72, 0.72, GLS], [1.3, 1.62, 0.98, 1.66, -0.6, 0.6, GLS, 0.24, 0], ...ends(1.75, 0.68, 0.26, 0.5), ...wheels([-1.15, 1.15], 0.52, 0.5, 0.72)] },
    bus: { len: 12, wid: 2.55, parts: [...busBody(6, 1.275, true, true), ...wheels([-3.9, 3.9], 0.95, 1.08, 1.3)] },
    artF: { len: 10.6, wid: 2.55, parts: [...busBody(5.3, 1.275, true, false), ...wheels([-2.6, 3.4], 0.95, 1.08, 1.3)] },
    artR: { len: 7.2, wid: 2.55, parts: [...busBody(3.6, 1.275, false, true), ...wheels([-1.4], 0.95, 1.08, 1.3)] },
    bellows: { len: 0.9, wid: 2.4, parts: [[-0.45, 0.45, 0.4, 2.6, -1.2, 1.2, [0.14, 0.14, 0.15]]] },
    gaz: { len: 5.9, wid: 2.05, parts: [[-2.95, 2.1, 0.35, 2.45, -1.025, 1.025, WHT], [2.1, 2.95, 0.35, 1.15, -1.0, 1.0, WHT, 0.18, 0, 0.06], [2.0, 2.52, 1.15, 2.2, -0.96, 0.96, GLS, 0.38, 0], [-2.8, 1.95, 1.35, 1.95, -1.035, 1.035, GLS],
      [2.0, 2.14, 2.2, 2.42, -0.6, 0.6, [0.95, 0.78, 0.2]], [2.9, 3.0, 0.32, 0.62, -1.0, 1.0, TRIM], [-3.0, -2.92, 1.0, 1.3, -1.0, -0.75, TAIL], [-3.0, -2.92, 1.0, 1.3, 0.75, 1.0, TAIL], ...wheels([-1.9, 1.75], 0.7, 0.78, 1.03)] },
  };
  function vgeo(parts) {
    const pos = [], cl = [];
    for (const [x0, x1, y0, y1, z0, z1, c, tf = 0, tb = 0, tz = 0] of parts) {
      const B = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], U = [[x0 + tb, y1, z0 + tz], [x1 - tf, y1, z0 + tz], [x1 - tf, y1, z1 - tz], [x0 + tb, y1, z1 - tz]];
      const quad = (a, b, d, e) => { pos.push(...a, ...b, ...d, ...a, ...d, ...e); for (let i = 0; i < 6; i++) cl.push(c[0], c[1], c[2]); };
      quad(U[0], U[3], U[2], U[1]); quad(B[0], B[1], B[2], B[3]);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(B[i], B[j], U[j], U[i]); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
    g.computeVertexNormals(); return g;
  }
  const CAR_KIND = [["sedan", 50], ["hatch", 20], ["suv", 15], ["damas", 15]];
  const pickKind = () => { let r = rnd() * 100; for (const [k, w] of CAR_KIND) { r -= w; if (r <= 0) return k; } return "sedan"; };
  // общественный транспорт Ташкента: зелёные автобусы (обычные и сочленённые «гармошки»)
  // и белые маршрутки-«Газели». Ездят только по крупным улицам и останавливаются на остановках.
  const VT = {
    car:   { len: 4.4, wid: 1.8, acc: 2.2 },
    bus:   { len: 12, wid: 2.55, pt: true, vk: 0.8, acc: 1.1 },
    artic: { len: 18.6, wid: 2.55, pt: true, vk: 0.75, acc: 0.9, front: 10.6, rear: 7.2 },
    gaz:   { len: 5.9, wid: 2.05, pt: true, vk: 1.0, acc: 1.6 },
  };
  const PT_KIND = ["bus", "artic", "gaz", "gaz", "bus", "artic", "gaz"];
  // сколько машин на улицах в зависимости от часа: ночью пусто, утром и вечером — час пик;
  // общественный транспорт ходит примерно с 5:30 до 23:30
  const DENS = [0.42, 0.3, 0.2, 0.16, 0.18, 0.3, 0.55, 0.85, 1, 1, 0.85, 0.8, 0.8, 0.82, 0.8, 0.82, 0.9, 1, 1, 0.95, 0.85, 0.75, 0.65, 0.52];
  const density = (h) => { const i = Math.floor(h) % 24, f = h - Math.floor(h); return DENS[i] + (DENS[(i + 1) % 24] - DENS[i]) * f; };
  const ptRuns = (h) => h >= 5.5 && h < 23.5;

  function randomEdge(offscreen, major) {
    const recs = [...T.loaded.values()].filter((r) => r.state === "ok" && r.edges && r.edgeWT > 0 && T.wanted && T.wanted.has(r.k));
    let tot = 0; for (const r of recs) tot += r.edgeWT;
    if (!tot) return null;
    for (let tries = 0; tries < 6; tries++) {
      let x = rnd() * tot, rec = recs[0];
      for (const r of recs) { x -= r.edgeWT; if (x <= 0) { rec = r; break; } }
      const w = rec.edgeW, v = rnd() * rec.edgeWT; let lo = 0, hi = w.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (w[m] < v) lo = m + 1; else hi = m; }
      const e = rec.edges[lo];
      if (major && (e.cls > 3 || e.hid) && tries < 5) continue;
      if (major && e.cls > 3) return null;
      if (!offscreen || tries === 5) return e;
      if (!onScreen((e.xs[0] + e.xs[e.n - 1]) / 2, (e.zs[0] + e.zs[e.n - 1]) / 2, 20)) return e;
    }
    return null;
  }
  const PR = [0, 0];
  function onScreen(x, z, pad) { const p = S.project(x, 0, z, PR); return p[0] > -pad && p[0] < S.W + pad && p[1] > -pad && p[1] < S.H + pad; }
  // свободно ли место на ребре (та же полоса и направление): новые машины не появляются друг в друге
  function freeAt(e, dir, lane, s, len) {
    const b = byEdge.get(e); if (!b) return true;
    for (const o of b) if (o.dir === dir && o.lane === lane && Math.abs(o.s - s) < (o.len + len) / 2 + 6) return false;
    return true;
  }
  function place(c, off) {
    const pt = VT[c.type].pt;
    for (let k = 0; k < 4; k++) {
      const e = randomEdge(off, pt); if (!e) return false;
      const dir = e.oneway ? 1 : (rnd() < 0.5 ? 1 : -1), lane = pt ? e.lanes - 1 : (rnd() * e.lanes) | 0, s = c.len / 2 + rnd() * Math.max(0, e.len - c.len);
      if (e.len < c.len + 2 || !freeAt(e, dir, lane, s, c.len)) continue;
      Object.assign(c, { e, dir, lane, s, prev: null, next: null, ph: -1, far: 0, v: VMAX[e.cls] * c.vk * 0.5, vmax: VMAX[e.cls] * c.vk, dwell: 0, stopIn: 120 + rnd() * 380, jx: 0, jz: 0, yawR: null, acc: 0, pitch: 0, roll: 0, hold: null, wait: 0 });
      add(c); return true;
    }
    return false;
  }
  function nextEdge(e, dir, major) {
    const node = dir > 0 ? e.b : e.a, [hx, hz] = endH(e, dir); let tot = 0; const opts = [];
    const hasMajor = major && node.adj.some((o) => o.e !== e && o.e.alive && o.e.cls <= 3);
    for (const o of node.adj) {
      if (o.e === e || !o.e.alive) continue;
      if (hasMajor && o.e.cls > 3) continue;
      const [ox, oz] = startH(o.e, o.dir);
      const w = 0.25 + Math.max(0, hx * ox + hz * oz) * 2.5 + (o.e.cls <= 2 ? 1 : o.e.cls <= 4 ? 0.6 : 0.15);
      opts.push(o, w); tot += w;
    }
    if (!opts.length) return e.oneway ? null : { e, dir: -dir };
    let r = rnd() * tot; for (let i = 0; i < opts.length; i += 2) { r -= opts[i + 1]; if (r <= 0) return opts[i]; } return opts[0];
  }
  const startH = (e, dir) => (dir > 0 ? [e.ux[0], e.uz[0]] : [-e.ux[e.n - 2], -e.uz[e.n - 2]]);
  const laneOf = (c, e) => (c.type !== "car" ? e.lanes - 1 : Math.min(c.lane, e.lanes - 1));
  const offOf = (e, lane) => (e.oneway ? (lane - (e.lanes - 1) / 2) * LANE : (lane + 0.5) * LANE);
  // перекрёсток — узел, где сходятся 3+ ребра (2 — просто излом одной улицы)
  const isJunction = (n) => { if (n.jn === undefined || n.jv !== n.adj.length + n.inl.length) { const es = new Set(); for (const o of n.adj) es.add(o.e); for (const o of n.inl) es.add(o.e); n.jn = es.size >= 3; n.jv = n.adj.length + n.inl.length; } return n.jn; };

  // машины по рёбрам: e → массив; порядок внутри не важен, лидеров ищем по s
  const byEdge = new Map();
  const add = (c) => { let b = byEdge.get(c.e); if (!b) byEdge.set(c.e, b = []); b.push(c); };
  const del = (c) => { const b = byEdge.get(c.e); if (b) { const i = b.indexOf(c); if (i >= 0) b.splice(i, 1); if (!b.length) byEdge.delete(c.e); } };
  // ближайшая машина впереди на ребре e (направление dir, полоса lane), начиная с s
  function leaderOn(e, dir, lane, s, self) {
    const b = byEdge.get(e); let best = null;
    if (b) for (const o of b) if (o !== self && o.dir === dir && o.lane === lane && o.s > s && (!best || o.s < best.s)) best = o;
    return best;
  }

  let meshes = null, lightPts, cap = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color(), eul = new THREE.Euler(0, 0, 0, "YZX");
  function ensureMeshes(n) {
    if (meshes && cap >= n) return;
    if (meshes) for (const m of Object.values(meshes)) { S.scene.remove(m); m.dispose(); }
    cap = n; meshes = {};
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (const k in SPEC) {
      const m = new THREE.InstancedMesh(vgeo(SPEC[k].parts), mat, n);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0; S.scene.add(m);
      for (let i = 0; i < n; i++) m.setColorAt(i, col.setRGB(1, 1, 1));
      meshes[k] = m;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    if (lightPts) S.scene.remove(lightPts);
    lightPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lightPts.frustumCulled = false; S.scene.add(lightPts);
  }
  let poleMesh, headMesh;
  function ensureSignals(n) {
    if (poleMesh && poleMesh.userData.cap >= n) return;
    for (const m of [poleMesh, headMesh]) if (m) { S.scene.remove(m); m.dispose(); }
    const pole = new THREE.BoxGeometry(0.18, 4.2, 0.18); pole.translate(0, 2.1, 0);
    const head = new THREE.BoxGeometry(0.45, 1.1, 0.45); head.translate(0, 4.6, 0);
    poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x2b2b30 }), n);
    headMesh = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    for (const m of [poleMesh, headMesh]) { m.frustumCulled = false; m.count = 0; m.userData.cap = n; S.scene.add(m); }
    for (let i = 0; i < n; i++) headMesh.setColorAt(i, col.setRGB(1, 0, 0));
  }
  const SIGC = [[0.2, 1, 0.42], [1, 0.82, 0.2], [1, 0.2, 0.15]];
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // точка на ребре по расстоянию от начала ребра (за концами — продолжение по касательной)
  function pos(e, sAbs, off, dir, o) {
    let i = 0; const ss = Math.max(0, Math.min(e.len, sAbs));
    while (i < e.n - 2 && e.cum[i + 1] < ss) i++;
    const tt = sAbs - e.cum[i], tx = e.ux[i] * dir, tz = e.uz[i] * dir, segL = (e.cum[i + 1] - e.cum[i]) || 1;
    o.x = e.xs[i] + e.ux[i] * tt - tz * off; o.z = e.zs[i] + e.uz[i] * tt + tx * off; o.tx = tx; o.tz = tz;
    o.y = e.ys ? e.ys[i] + (e.ys[i + 1] - e.ys[i]) * Math.max(0, Math.min(1, tt / segL)) : 0;
    return o;
  }
  // точка на пути машины на расстоянии back позади центра (с переходом на предыдущее ребро)
  function along(c, back, o) {
    let s = c.s - back, e = c.e, dir = c.dir, lane = c.lane;
    if (s < 0 && c.prev && c.prev.e.alive) { e = c.prev.e; dir = c.prev.dir; lane = c.prev.lane; s += e.len; }
    return pos(e, dir > 0 ? s : e.len - s, offOf(e, lane), dir, o);
  }

  TR.update = function (dt, t, Q) {
    const active = S.mpp < C.carMpp;
    if (meshes) { for (const m of Object.values(meshes)) m.visible = active; lightPts.visible = active; }
    if (poleMesh) poleMesh.visible = headMesh.visible = S.mpp < C.signalMpp;
    if (!active) return;
    ensureMeshes(Math.ceil((Q.cars + (Q.pt || 0)) * 1.1) + 8);
    const nPT = Q.pt || 0, nAll = Q.cars + nPT;
    if (TR.cars.length !== nAll) {
      for (const c of TR.cars) if (c.e) del(c);
      TR.cars.length = 0;
      for (let i = 0; i < Q.cars; i++) { const k = pickKind(), d = SPEC[k]; TR.cars.push({ e: null, type: "car", kind: k, vk: 0.8 + rnd() * 0.35, len: d.len, wid: d.wid, col: k === "damas" && rnd() < 0.8 ? COLORS[0] : pickColor(), far: 0 }); }
      for (let i = 0; i < nPT; i++) { const ty = PT_KIND[i % PT_KIND.length], d = VT[ty]; TR.cars.push({ e: null, type: ty, kind: ty, vk: d.vk * (0.92 + rnd() * 0.12), len: d.len, wid: d.wid, col: WHT, far: 0 }); }
    }
    const ext = Math.max(S.w, S.h) * S.mpp * 0.8, hour = TPM.city.hour, want = Math.round(Q.cars * density(hour)), ptOn = ptRuns(hour);
    // появление и уход: лишние машины исчезают только вне экрана, новые появляются тоже вне экрана
    let placed = 0, ci = 0;
    for (const c of TR.cars) {
      const wanted = c.type === "car" ? ci++ < want : ptOn;
      if (c.e && (!c.e.alive || c.far > 2.5 || (!wanted && !onScreen(c.x || 0, c.z || 0, 40)))) { del(c); c.e = null; }
      if (c.e && !wanted && c.type !== "car") c.stopIn = 1e9;                     // после смены уходит в парк без остановок
      if (!c.e && wanted && placed < 30 && place(c, true)) placed++;
    }

    // ---------- движение: модель IDM (плавный разгон и торможение, дистанция до лидера) ----------
    for (const c of TR.cars) {
      const e = c.e; if (!e) continue;
      const VT2 = VT[c.type], node = c.dir > 0 ? e.b : e.a, half = c.len / 2, toEnd = e.len - c.s;
      if (!c.next || !c.next.e.alive) c.next = nextEdge(e, c.dir, c.type !== "car");
      const nx = c.next;
      let gap = 1e9, vLead = 0, v0 = c.vmax;
      // лидер на своём ребре
      const L1 = leaderOn(e, c.dir, c.lane, c.s, c);
      if (L1) { gap = L1.s - c.s - (L1.len + c.len) / 2; vLead = L1.v; }
      // лидер на следующем ребре
      else if (nx && toEnd < 70) {
        const ln = laneOf(c, nx.e), L2 = leaderOn(nx.e, nx.dir, ln, -1e9, c);
        if (L2) { gap = toEnd + L2.s - (L2.len + c.len) / 2; vLead = L2.v; }
      }
      // скорость в повороте: чем круче, тем медленнее
      if (nx && toEnd < 35) {
        const [hx, hz] = endH(e, c.dir), [ox, oz] = startH(nx.e, nx.dir), cs = hx * ox + hz * oz;
        v0 = Math.min(v0, nx.e === e ? 3 : 4.5 + 13 * Math.max(0, cs) ** 2);
      }
      const stopAt = (d) => { if (d < gap) { gap = d; vLead = 0; } };
      const line = toEnd - half - (node.ctrl ? 6 : 3.5);                            // стоп-линия перед перекрёстком
      // светофор
      if (node.ctrl && toEnd < 70) {
        if (c.ph < 0) { const [hx, hz] = endH(e, c.dir); c.ph = phaseFor(node.ctrl, hx, hz); }
        const st = sigState(node.ctrl, c.ph, t);
        if (line > -0.5 && (st === 2 || (st === 1 && line > c.v * 1.4 + 1))) stopAt(line);
      }
      // нерегулируемый перекрёсток: проезжает одно направление за раз (кто первый подъехал);
      // въезжать можно, только если за перекрёстком есть место (не «запираем» перекрёсток)
      if (nx && toEnd < 16 + c.v && isJunction(node)) {
        const key = e.a === node ? -1 : 1, me = e, ln = laneOf(c, nx.e);
        const room = c.wait > 20 || (() => { const L2 = leaderOn(nx.e, nx.dir, ln, -1e9, c); return !L2 || L2.s - L2.len / 2 > c.len + 2; })();
        // полоса за перекрёстком «бронируется» подходом: машины с разных подходов не въезжают в неё одновременно
        const ck = nx.dir + ":" + ln, cl = nx.e.claim && nx.e.claim[ck], clFree = !cl || t - cl.t > 1.5 || cl.from === me;
        const r = node.res, fresh = r && t - r.last < 1.2;
        const mine = c.hold === node || line < 0.3;                                 // уже за стоп-линией — проезжаем
        const grant = mine || (room && clFree && (node.ctrl || !fresh || (r.e === me && r.k === key && t - r.since < 9)));
        if (grant) {
          if (!node.ctrl) { if (!fresh || r.e !== me || r.k !== key) node.res = { e: me, k: key, since: t, last: t }; else r.last = t; }
          (nx.e.claim = nx.e.claim || {})[ck] = { from: me, t };
          c.hold = node;
        }
        else stopAt(line);
        if (!room && !mine) stopAt(line);
      }
      if (c.hold && c.hold !== node && c.hold.res && c.s < c.len + 8) c.hold.res.last = t; // ещё на перекрёстке — держим его
      // остановки общественного транспорта
      if (c.type !== "car") {
        if (c.dwell > 0) { c.dwell -= dt; stopAt(0); if (c.dwell <= 0) c.stopIn = (c.type === "gaz" ? 180 : 320) + rnd() * 320; }
        else if (c.stopIn < 45 && toEnd > 30) { stopAt(c.stopIn); if (c.stopIn < 0.8 && c.v < 0.4) c.dwell = c.type === "gaz" ? 3 + rnd() * 3 : 6 + rnd() * 6; }
      }
      // IDM
      const a = VT2.acc, bComf = 2.6, s0 = 2.2, Th = 1.1;
      let acc = a * (1 - Math.pow(Math.max(0, c.v) / Math.max(0.5, v0), 4));
      if (gap < 1e8) {
        const ss = s0 + Math.max(0, c.v * Th + c.v * (c.v - vLead) / (2 * Math.sqrt(a * bComf)));
        acc -= a * (ss / Math.max(0.3, gap)) ** 2;
      }
      acc = Math.max(-7.5, Math.min(a, acc));
      c.v = Math.max(0, c.v + acc * dt);
      if (gap < 0.4 && vLead < c.v) c.v = Math.max(0, vLead);                          // никогда не въезжаем в лидера
      c.acc += (acc - c.acc) * Math.min(1, dt * 4);
      c.brake = acc < -0.6 || (c.v < 0.3 && gap < 8);
      const ds = c.v * dt; c.s += ds; if (c.type !== "car" && c.dwell <= 0) c.stopIn -= ds;
      // долгое ожидание: через 20 с проезжаем, застрявшую вне экрана машину переставляем
      c.wait = c.v < 0.2 && !(c.dwell > 0) ? (c.wait || 0) + dt : 0;
      if (c.wait > 45 && c.far > 0) { del(c); c.e = null; continue; }
      // переход на следующее ребро
      if (c.s >= e.len) {
        if (!nx) { del(c); c.e = null; continue; }
        const o1 = pos(e, c.dir > 0 ? e.len : 0, offOf(e, c.lane), c.dir, {});
        del(c);
        c.prev = { e, dir: c.dir, lane: c.lane }; c.s -= e.len; c.e = nx.e; c.dir = nx.dir; c.lane = laneOf(c, nx.e); c.next = null; c.ph = -1;
        c.vmax = VMAX[c.e.cls] * c.vk; if (c.s > c.e.len) c.s = 0;
        add(c);
        // плавность: смещение между концом старой полосы и началом новой гасится за доли секунды
        const o2 = pos(c.e, c.dir > 0 ? c.s : c.e.len - c.s, offOf(c.e, c.lane), c.dir, {});
        c.jx += o1.x - o2.x; c.jz += o1.z - o2.z;
      }
    }

    // ---------- отрисовка ----------
    const night = TPM.city.night > 0.1;
    const lp = lightPts.geometry.attributes.position.array, lc = lightPts.geometry.attributes.color.array;
    const cnt = {}; for (const k in meshes) cnt[k] = 0;
    let li = 0;
    const A = {}, Bp = {};
    const put = (kind, x, y, z, yaw, pitch, roll, colr) => {
      const m = meshes[kind], i = cnt[kind]++;
      eul.set(roll, yaw, pitch); q4.setFromEuler(eul); p3.set(x, y, z); s3.set(1, 1, 1); m4.compose(p3, q4, s3);
      m.setMatrixAt(i, m4); m.setColorAt(i, col.setRGB(colr[0], colr[1], colr[2]));
    };
    const light = (x, y, z, r, g, b) => { lp[li * 3] = x; lp[li * 3 + 1] = y; lp[li * 3 + 2] = z; lc[li * 3] = r; lc[li * 3 + 1] = g; lc[li * 3 + 2] = b; li++; };
    const kd = Math.exp(-dt * 3.2);
    for (const c of TR.cars) {
      const e = c.e; if (!e) continue;
      c.jx *= kd; c.jz *= kd;
      // курс — по точкам переднего и заднего моста: на изломах и поворотах машина поворачивает плавно
      const wb = Math.min(c.len * 0.6, c.type === "artic" ? 6 : c.len * 0.6);
      along(c, -wb / 2, A); const fx = A.x, fz = A.z; along(c, wb / 2, Bp);
      along(c, 0, A);
      const x = A.x + c.jx, z = A.z + c.jz;
      c.x = x; c.z = z;
      if (Math.abs(x - S.target.x) > ext || Math.abs(z - S.target.z) > ext) { c.far += dt; continue; }
      c.far = 0;
      if (li + 4 >= cap * 4) break;
      const yawT = Math.atan2(-(fz - Bp.z), fx - Bp.x);
      if (c.yawR === null) c.yawR = yawT;
      const dy = angDiff(yawT, c.yawR), yr = dy * Math.min(1, dt * 10); c.yawR += yr;
      const yawRate = dt > 0 ? yr / dt : 0;
      // кузов: «клюёт» при торможении, приседает при разгоне, кренится в повороте
      const tp = Math.max(-0.06, Math.min(0.05, -c.acc * 0.011)), tr = Math.max(-0.05, Math.min(0.05, -yawRate * c.v * 0.012));
      c.pitch += (tp - c.pitch) * Math.min(1, dt * 6); c.roll += (tr - c.roll) * Math.min(1, dt * 6);
      const yaw = c.yawR, tx = Math.cos(yaw), tz = -Math.sin(yaw), y = A.y;
      if (c.type === "artic") {
        const T2 = VT.artic, fo = T2.len / 2 - T2.front / 2;
        along(c, -fo, A); along(c, -fo - 3, Bp);
        const fyaw = Math.atan2(-(A.z - Bp.z), A.x - Bp.x);
        put("artF", A.x + c.jx, A.y + 0.02, A.z + c.jz, fyaw, c.pitch, c.roll, WHT);
        const ro = T2.len / 2 - T2.rear / 2; along(c, ro, Bp); const Rx = Bp.x, Rz = Bp.z, Ry = Bp.y; along(c, ro - 3, A);
        const ryaw = Math.atan2(-(A.z - Rz), A.x - Rx);
        put("artR", Rx + c.jx, Ry + 0.02, Rz + c.jz, ryaw, c.pitch * 0.5, c.roll, WHT);
        along(c, T2.len / 2 - T2.rear - 0.45, A);
        put("bellows", A.x + c.jx, A.y, A.z + c.jz, (fyaw + ryaw) / 2 + (Math.abs(fyaw - ryaw) > Math.PI ? Math.PI : 0), 0, 0, WHT);
      } else put(c.kind, x, y + 0.02, z, yaw, c.pitch, c.roll, c.type === "car" ? c.col : WHT);
      // фары и стоп-сигналы
      if (night || c.brake) {
        const h = c.len / 2, w = c.wid * 0.32, sx = -tz * w, sz = tx * w, ly = y + (c.type === "car" ? 0.6 : 0.9);
        if (night) { light(x + tx * h + sx, ly, z + tz * h + sz, 1, 0.95, 0.75); light(x + tx * h - sx, ly, z + tz * h - sz, 1, 0.95, 0.75); }
        const br = c.brake ? [1, 0.18, 0.1] : [0.55, 0.08, 0.06];
        light(x - tx * h + sx, ly, z - tz * h + sz, ...br); light(x - tx * h - sx, ly, z - tz * h - sz, ...br);
      }
    }
    for (const k in meshes) { const m = meshes[k]; m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    lightPts.geometry.setDrawRange(0, li); lightPts.geometry.attributes.position.needsUpdate = true; lightPts.geometry.attributes.color.needsUpdate = true;
    // светофоры
    if (S.mpp < C.signalMpp) {
      const list = [];
      for (const n of TR.sig) {
        if (Math.abs(n.x - S.target.x) > ext || Math.abs(n.z - S.target.z) > ext) continue;
        if (!n.poles) {
          n.poles = [];
          for (const o of n.inl) { const e = o.e, [hx, hz] = endH(e, o.dir); n.poles.push({ x: n.x - hx * 7 - hz * (e.half + 1.4), z: n.z - hz * 7 + hx * (e.half + 1.4), ph: phaseFor(n.ctrl, hx, hz), y: e.y }); }
        }
        for (const p of n.poles) list.push(n, p);
      }
      ensureSignals(Math.max(64, list.length / 2 + 32));
      let j = 0;
      for (let i = 0; i < list.length; i += 2) {
        const n = list[i], p = list[i + 1];
        p3.set(p.x, p.y, p.z); s3.set(1, 1, 1); q4.identity(); m4.compose(p3, q4, s3);
        poleMesh.setMatrixAt(j, m4); headMesh.setMatrixAt(j, m4);
        const st = sigState(n.ctrl, p.ph, t), c = SIGC[st];
        headMesh.setColorAt(j, col.setRGB(c[0], c[1], c[2]));
        j++;
      }
      poleMesh.count = headMesh.count = j;
      poleMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = true; if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    }
  };
  TR.init = function () {
    T.onLoad.push(addTile);
    T.onUnload = T.onUnload || []; T.onUnload.push(removeTile);
  };
})();
