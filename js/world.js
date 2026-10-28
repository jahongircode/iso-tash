// =====================================================================
//  Менеджер векторных тайлов OSM (основной поток)
//   • решает, какие тайлы нужны для текущего вида (LOD: z10/z12/z14);
//   • очередь загрузки: ближние к центру — первыми, параллельно в 2 воркерах;
//   • LRU: держим ограниченное число тайлов в памяти;
//   • строит Path2D (быстрая отрисовка земли и дорог без пересборки путей);
//   • наращивает/убирает граф дорог для машин, ищет светофоры.
// =====================================================================
(function () {
  const C = TPM.config, geo = TPM.geo, E = TPM.engine;
  const MPU = geo.MPU;

  const W = TPM.world = {
    ready: false, failed: false, url: null,
    tiles: new Map(), // key -> tile
    nodes: new Map(), sigNodes: new Set(), signals: null, ctrlHash: new Map(),
    stats: { loaded: 0, cached: 0 },
    onTile: [],
  };
  const DETAIL_Z = C.detailZoom;
  const key = (z, x, y) => z + "/" + x + "/" + y;
  W.key = key;

  // ---------------- воркеры ----------------
  let workers = [], wi = 0, nextId = 1;
  const pending = new Map(); // id -> {key}
  function makeWorkers() {
    const src = "(" + window.TPM_WORKER.toString() + ")()";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = (e) => onResult(e.data);
      workers.push(w);
    }
  }

  // ---------------- TileJSON ----------------
  W.init = async function () {
    let tj = null;
    try { const c = JSON.parse(localStorage.getItem("tpm-tilejson") || "null"); if (c && Date.now() - c.t < 864e5) tj = c.d; } catch (e) {}
    if (!tj) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 10000);
        const r = await fetch(C.vector.tilejson, { signal: ctl.signal });
        tj = await r.json();
        try { localStorage.setItem("tpm-tilejson", JSON.stringify({ t: Date.now(), d: { tiles: tj.tiles, maxzoom: tj.maxzoom } })); } catch (e) {}
      } catch (e) {
        // офлайн или сервер недоступен — пробуем последний известный адрес
        try { const c = JSON.parse(localStorage.getItem("tpm-tilejson") || "null"); if (c) tj = c.d; } catch (e2) {}
      }
    }
    if (!tj || !tj.tiles || !tj.tiles.length) { W.failed = true; return false; }
    W.url = tj.tiles[0];
    W.maxZ = Math.min(14, tj.maxzoom || 14);
    makeWorkers();
    W.ready = true;
    return true;
  };

  // ---------------- очередь ----------------
  let queue = [];
  const MAX_INFLIGHT = 8;
  let inflight = 0;
  function request(z, x, y, prio) {
    const k = key(z, x, y);
    const t = W.tiles.get(k);
    if (t) { t.used = performance.now(); return t.ok ? t : null; }
    queue.push({ z, x, y, k, prio });
    return null;
  }
  function pump() {
    if (!W.ready) return;
    queue.sort((a, b) => a.prio - b.prio);
    const seen = new Set();
    while (inflight < MAX_INFLIGHT && queue.length) {
      const q = queue.shift();
      if (W.tiles.has(q.k) || seen.has(q.k)) continue;
      seen.add(q.k);
      const id = nextId++;
      W.tiles.set(q.k, { ok: false, loading: true, used: performance.now(), z: q.z, x: q.x, y: q.y, key: q.k });
      pending.set(id, q.k);
      inflight++;
      const url = W.url.replace("{z}", q.z).replace("{x}", q.x).replace("{y}", q.y);
      const detail = q.z >= W.maxZ;
      workers[wi++ % workers.length].postMessage({
        id, url, z: q.z, x: q.x, y: q.y, detail, mpu: MPU, density: TPM.city.Q.treeDensity,
        lms: detail ? TPM.landmarks.map((l) => ({ x: geo.x(l.lng), y: geo.y(l.lat), r: l.r })) : [],
      });
    }
    queue.length = 0; // остальное перезапросится на следующем проходе
  }

  function onResult(res) {
    const k = pending.get(res.id); pending.delete(res.id); inflight--;
    if (!k) return;
    if (res.error) {
      W.tiles.delete(k);
      W.errors = (W.errors || 0) + 1;
      if (W.errors > 25 && W.stats.loaded === 0) W.failed = true;
      return;
    }
    const t = buildTile(res);
    t.key = k;
    W.tiles.set(k, t);
    W.stats.loaded++; if (res.cached) W.stats.cached++;
    if (t.edgesRaw) addEdges(t);
    for (const fn of W.onTile) fn(t);
    evict();
  }

  // ---------------- построение тайла ----------------
  function path(coll, close) {
    const p = new Path2D(), c = coll.c, s = coll.s;
    for (let r = 0; r + 1 < s.length; r++) {
      const a = s[r], b = s[r + 1];
      if (b - a < 2) continue;
      p.moveTo(c[a * 2], c[a * 2 + 1]);
      for (let i = a + 1; i < b; i++) p.lineTo(c[i * 2], c[i * 2 + 1]);
      if (close) p.closePath();
    }
    return p;
  }
  function buildTile(r) {
    const t = { ok: true, z: r.z, x: r.x, y: r.y, ext: r.ext, ox: r.ox, oy: r.oy, f: r.f, used: performance.now(), places: r.places };
    t.size = r.f * r.ext;
    t.ground = {}; t.lines = {}; t.ww = {};
    for (const k in r.ground) t.ground[k] = path(r.ground[k], true);
    for (const k in r.lines) { t.lines[k] = path(r.lines[k], false); }
    for (const k in r.ww) t.ww[k] = path(r.ww[k], false);
    // линии для «потока машин» на дальнем зуме
    const fl = r.flow, flow = [];
    for (let i = 0; i + 1 < fl.s.length; i++) {
      const a = fl.s[i], b = fl.s[i + 1];
      if (b - a < 2) continue;
      const xs = fl.c.subarray(a * 2, b * 2), cum = new Float32Array(b - a);
      for (let j = 1; j < b - a; j++) cum[j] = cum[j - 1] + Math.hypot(xs[j * 2] - xs[j * 2 - 2], xs[j * 2 + 1] - xs[j * 2 - 1]);
      flow.push({ xs, cum, len: cum[b - a - 1], cls: fl.a[i] >> 1, ow: fl.a[i] & 1 });
    }
    t.flow = flow;
    if (r.bld) t.bld = r.bld;
    if (r.trees) t.trees = r.trees;
    if (r.edges) t.edgesRaw = r.edges;
    return t;
  }

  function evict() {
    const lim = { 10: 8, 12: 40, 14: TPM.city.Q.maxDetailTiles || 36 };
    const by = {};
    for (const t of W.tiles.values()) if (t.ok) (by[t.z] || (by[t.z] = [])).push(t);
    for (const z in by) {
      const arr = by[z];
      const max = lim[z] || 30;
      if (arr.length <= max) continue;
      arr.sort((a, b) => a.used - b.used);
      for (let i = 0; i < arr.length - max; i++) {
        const t = arr[i];
        if (performance.now() - t.used < 1500) continue;
        if (t.edges) removeEdges(t);
        W.tiles.delete(t.key);
      }
    }
  }

  // ---------------- покрытие вида тайлами ----------------
  function viewBBox(v, pad = 0) {
    const { W: w, H: h, k, x: cx, y: cy } = v;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [X, Y] of [[-pad, -pad], [w + pad, -pad], [-pad, h + pad], [w + pad, h + pad]]) {
      const u = (X - w / 2) / k, vv = 2 * (Y - h / 2) / k;
      const x = cx + (u - vv) / 2, y = cy + (u + vv) / 2;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1];
  }
  W.viewBBox = viewBBox;
  // список тайлов зума z, пересекающих вид (с проверкой ромба)
  W.cover = function (v, z, pad = 0) {
    const [x0, y0, x1, y1] = viewBBox(v, pad);
    const n = 1 << z, size = 256 / n, out = [];
    const k = v.k;
    const lo = Math.max(0, Math.floor(x0 / size)), hi = Math.min(n - 1, Math.floor(x1 / size));
    const lo2 = Math.max(0, Math.floor(y0 / size)), hi2 = Math.min(n - 1, Math.floor(y1 / size));
    for (let ty = lo2; ty <= hi2; ty++) for (let tx = lo; tx <= hi; tx++) {
      const dx = (tx + 0.5) * size - v.x, dy = (ty + 0.5) * size - v.y;
      const X = k * (dx + dy) + v.W / 2, Y = k * 0.5 * (dy - dx) + v.H / 2, R = k * size * 1.1;
      if (X < -R - pad || X > v.W + R + pad || Y < -R - pad || Y > v.H + R + pad) continue;
      out.push({ z, x: tx, y: ty, d: (X - v.W / 2) ** 2 + (Y - v.H / 2) ** 2 });
    }
    return out;
  };
  W.groundZoom = (z) => (z >= DETAIL_Z ? W.maxZ : 12);

  // Вызывается каждые ~150 мс: запрашивает нужные тайлы
  W.update = function () {
    if (!W.ready) return;
    const v = { x: E.cam.x, y: E.cam.y, z: E.cam.z, k: E.k, W: E.W, H: E.H };
    const gz = W.groundZoom(v.z);
    // всегда держим обзорный уровень z12 (быстрый фон), детальный — поверх
    for (const c of W.cover(v, 12, 40)) request(12, c.x, c.y, c.d);
    if (gz > 12) for (const c of W.cover(v, gz, 30)) request(gz, c.x, c.y, -1e7 + c.d);
    pump();
  };
  W.preloadOverview = function () {
    const b = C.bounds;
    const z = 10, n = 1 << z;
    const x0 = Math.floor(geo.x(b.w) / 256 * n), x1 = Math.floor(geo.x(b.e) / 256 * n);
    const y0 = Math.floor(geo.y(b.n) / 256 * n), y1 = Math.floor(geo.y(b.s) / 256 * n);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) request(z, x, y, 1e9);
    pump();
  };
  W.get = (z, x, y) => { const t = W.tiles.get(key(z, x, y)); if (t && t.ok) { t.used = performance.now(); return t; } return null; };
  W.loadedOf = (z) => { const out = []; for (const t of W.tiles.values()) if (t.ok && t.z === z) out.push(t); return out; };
  W.isLoading = () => inflight > 0;

  // ---------------- названия мест ----------------
  W.nearestPlace = function (x, y) {
    let best = null, bd = Infinity;
    const W2 = { neighbourhood: 1, quarter: 1, suburb: 1.5, hamlet: 1, village: 1.2, town: 2.5, isolated_dwelling: 0.6 };
    for (const t of W.tiles.values()) {
      if (!t.ok || !t.places) continue;
      for (const p of t.places) {
        const w = W2[p.c]; if (!w) continue;
        const d = Math.hypot(p.x - x, p.y - y) * MPU / w;
        if (d < bd) { bd = d; best = p; }
      }
    }
    return bd < 1600 ? best : null;
  };

  // =====================================================================
  //  ГРАФ ДОРОГ (только из детальных тайлов)
  // =====================================================================
  const Q = 2 / MPU; // сетка «склейки» концов на границах тайлов (~2 м)
  function nodeAt(x, y) {
    const kx = Math.round(x / Q), ky = Math.round(y / Q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const n = W.nodes.get((kx + a) + "," + (ky + b));
      if (n && Math.hypot(n.x - x, n.y - y) < Q * 1.6) return n;
    }
    const n = { x, y, adj: [], inl: [], key: kx + "," + ky, ctrl: undefined, poles: null };
    W.nodes.set(n.key, n);
    return n;
  }
  const LANE = 3.3;
  function addEdges(t) {
    const r = t.edgesRaw; t.edges = [];
    const nearLm = (x, y) => { for (const l of TPM.landmarks) { if (Math.hypot((x - geo.x(l.lng)) * MPU, (y - geo.y(l.lat)) * MPU) < l.r + 10) return true; } return false; };
    for (let i = 0; i + 1 < r.s.length; i++) {
      const a = r.s[i], b = r.s[i + 1], n = b - a;
      if (n < 2) continue;
      const cls = r.a[i] & 15, oneway = (r.a[i] >> 4) & 1, ramp = (r.a[i] >> 5) & 1;
      const xs = new Float64Array(n), ys = new Float64Array(n), cum = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n);
      for (let j = 0; j < n; j++) { xs[j] = t.ox + r.c[(a + j) * 2] * t.f; ys[j] = t.oy + r.c[(a + j) * 2 + 1] * t.f; }
      for (let j = 1; j < n; j++) {
        const dx = xs[j] - xs[j - 1], dy = ys[j] - ys[j - 1], L = Math.hypot(dx, dy) || 1e-12;
        cum[j] = cum[j - 1] + L * MPU; ux[j - 1] = dx / L; uy[j - 1] = dy / L;
      }
      ux[n - 1] = ux[n - 2]; uy[n - 1] = uy[n - 2];
      const len = cum[n - 1];
      if (len < 2) continue;
      const lanes = cls <= 1 ? (oneway ? 3 : 2) : cls <= 3 ? (oneway ? 2 : 2) : (oneway ? 1 : 1);
      const e = {
        xs, ys, cum, ux, uy, n, len, cls, oneway: !!oneway, ramp: !!ramp, lanes, tile: t, alive: true,
        half: oneway ? lanes * LANE / 2 : lanes * LANE,
        a: nodeAt(xs[0], ys[0]), b: nodeAt(xs[n - 1], ys[n - 1]),
        hid: nearLm((xs[0] + xs[n - 1]) / 2, (ys[0] + ys[n - 1]) / 2),
      };
      e.a.adj.push({ e, dir: 1 }); e.b.inl.push({ e, dir: 1 });
      if (!e.oneway) { e.b.adj.push({ e, dir: -1 }); e.a.inl.push({ e, dir: -1 }); }
      t.edges.push(e);
    }
    // веса для появления машин
    let acc = 0; t.edgeW = new Float64Array(t.edges.length);
    for (let i = 0; i < t.edges.length; i++) { const e = t.edges[i]; acc += e.len * (e.cls <= 2 ? 3 : e.cls <= 4 ? 2 : 0.6) * e.lanes; t.edgeW[i] = acc; }
    t.edgeWT = acc;
    const touched = new Set();
    for (const e of t.edges) { touched.add(e.a); touched.add(e.b); }
    for (const n of touched) evalSignal(n);
    delete t.edgesRaw;
  }
  function removeEdges(t) {
    const touched = new Set();
    for (const e of t.edges) {
      e.alive = false;
      for (const n of [e.a, e.b]) {
        n.adj = n.adj.filter((o) => o.e !== e);
        n.inl = n.inl.filter((o) => o.e !== e);
        n.poles = null; touched.add(n);
      }
    }
    for (const n of touched) {
      if (!n.adj.length && !n.inl.length) { W.nodes.delete(n.key); W.sigNodes.delete(n); }
      else evalSignal(n);
    }
    t.edges = null;
  }

  // ---------------- светофоры ----------------
  // Реальные светофоры из OSM (если загрузились) или «синтетические» на крупных перекрёстках.
  let sigHash = null; const SH = 40 / MPU;
  W.setSignals = function (arr) {
    W.signals = arr; sigHash = new Map();
    for (let i = 0; i < arr.length; i += 2) {
      const k = Math.floor(arr[i] / SH) + "," + Math.floor(arr[i + 1] / SH);
      if (!sigHash.has(k)) sigHash.set(k, []);
      sigHash.get(k).push(arr[i], arr[i + 1]);
    }
    for (const n of W.nodes.values()) evalSignal(n);
  };
  W.noSignals = function () { W.signals = false; sigHash = null; for (const n of W.nodes.values()) evalSignal(n); };
  function signalNear(x, y, r) {
    const cx = Math.floor(x / SH), cy = Math.floor(y / SH);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = sigHash.get((cx + a) + "," + (cy + b)); if (!l) continue;
      for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - y) * MPU < r) return true;
    }
    return false;
  }
  function ctrlFor(n) {
    const CS = 45 / MPU, cx = Math.floor(n.x / CS), cy = Math.floor(n.y / CS);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = W.ctrlHash.get((cx + a) + "," + (cy + b));
      if (l) for (const c of l) if (Math.hypot(c.x - n.x, c.y - n.y) * MPU < 45) return c;
    }
    const c = { x: n.x, y: n.y, off: Math.random() * 60, axis: null };
    const k = cx + "," + cy;
    if (!W.ctrlHash.has(k)) W.ctrlHash.set(k, []);
    W.ctrlHash.get(k).push(c);
    return c;
  }
  function evalSignal(n) {
    n.poles = null;
    const es = new Set(); for (const o of n.adj) es.add(o.e); for (const o of n.inl) es.add(o.e);
    const deg = es.size;
    let on = false;
    if (deg >= 3) {
      if (sigHash) on = signalNear(n.x, n.y, 28);
      else if (W.signals === false) { // светофоры не загрузились: ставим на пересечениях крупных улиц
        let majors = 0; for (const e of es) if (e.cls <= 4) majors++;
        on = majors >= 3;
      }
    }
    if (on) { n.ctrl = n.ctrl || ctrlFor(n); W.sigNodes.add(n); }
    else { n.ctrl = null; W.sigNodes.delete(n); }
  }

  // случайное ребро в пределах вида (для появления машин)
  W.randomEdge = function (v, pick, offscreen) {
    const tiles = [];
    let tot = 0;
    for (const c of W.cover(v, W.maxZ, 40)) {
      const t = W.get(c.z, c.x, c.y);
      if (t && t.edges && t.edgeWT > 0) { tiles.push(t); tot += t.edgeWT; }
    }
    if (!tot) return null;
    for (let tries = 0; tries < 6; tries++) {
      let r = pick() * tot, t = tiles[0];
      for (const tt of tiles) { r -= tt.edgeWT; if (r <= 0) { t = tt; break; } }
      const w = t.edgeW, rr = pick() * t.edgeWT;
      let lo = 0, hi = w.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (w[m] < rr) lo = m + 1; else hi = m; }
      const e = t.edges[lo];
      if (!offscreen || tries === 5) return e;
      const p = E.project((e.xs[0] + e.xs[e.n - 1]) / 2, (e.ys[0] + e.ys[e.n - 1]) / 2);
      if (p[0] < -10 || p[0] > E.W + 10 || p[1] < -10 || p[1] > E.H + 10) return e;
    }
    return null;
  };
})();
