// =====================================================================
//  Фоновый поток: распаковка запечённого тайла и сборка 3D-геометрии.
//  Запускается из Blob вместе с earcut (работает и с диска, file://).
//  На выходе — готовые типизированные массивы для three.js (transfer).
// =====================================================================
window.TPM_GEO_WORKER = function () {
  "use strict";
  // ---------- чтение двоичного формата (varint/zigzag) ----------
  let B, P;
  const u8 = () => B[P++];
  const vr = () => { let r = 0, s = 0, c; do { c = B[P++]; r += (c & 0x7f) * Math.pow(2, s); s += 7; } while (c >= 0x80); return r; };
  const sv = () => { const n = vr(); return n % 2 ? -(n + 1) / 2 : n / 2; };
  const u24 = () => (B[P++] << 16) | (B[P++] << 8) | B[P++];
  const pts = () => { const n = vr(), o = new Float32Array(n * 2); let x = 0, y = 0; for (let i = 0; i < n; i++) { x += sv(); y += sv(); o[i * 2] = x / 10; o[i * 2 + 1] = y / 10; } return o; };
  const td = new TextDecoder();
  const str = () => { const n = vr(), s = td.decode(B.subarray(P, P + n)); P += n; return s; };

  // ---------- сборщик геометрии ----------
  class Geo {
    constructor(withExtra) { this.p = []; this.n = []; this.c = []; this.i = []; this.e = withExtra ? [] : null; }
    get vc() { return this.p.length / 3; }
    v(x, y, z, nx, ny, nz, r, g, b, a, eu, ev) {
      this.p.push(x, y, z); this.n.push(nx * 127 | 0, ny * 127 | 0, nz * 127 | 0, 0); this.c.push(r, g, b, a);
      if (this.e) this.e.push(eu, ev);
    }
    tri(a, b, c) { this.i.push(a, b, c); }
    pack() {
      const vc = this.vc;
      return { p: new Float32Array(this.p), n: new Int8Array(this.n), c: new Uint8Array(this.c),
        e: this.e ? new Int16Array(this.e) : null, i: vc > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i) };
    }
  }
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  // ---------- палитра земли (день) ----------
  const GCOL = { base: [156, 150, 124], 0: [164, 156, 134], 1: [168, 162, 150], 2: [150, 146, 138], 3: [126, 150, 84], 4: [88, 120, 62],
    5: [150, 152, 96], 6: [196, 180, 136], 7: [122, 140, 96], 8: [62, 108, 140], 9: [98, 150, 72], 10: [172, 162, 138], 11: [100, 136, 108],
    12: [130, 130, 128], 13: [150, 152, 124], 14: [178, 160, 120], 16: [140, 142, 118], 17: [112, 146, 76] };
  const GY = { 5: 0.01, 13: 0.012, 0: 0.02, 1: 0.024, 2: 0.026, 16: 0.028, 10: 0.03, 7: 0.032, 9: 0.05, 14: 0.05, 6: 0.034, 11: 0.036, 12: 0.04, 3: 0.044, 17: 0.046, 4: 0.048, 8: 0.06 };
  // дороги: ширина (м), цвет асфальта, высота
  const RW = { 0: 24, 1: 22, 2: 18, 3: 14, 4: 11, 5: 7.5, 6: 4.5, 7: 3, 8: 2.4, 9: 4.2, 10: 3.2, 11: 45, 12: 20, 13: 22, 14: 9, 15: 3 };
  const RC = { 0: [78, 78, 82], 1: [80, 80, 84], 2: [86, 86, 90], 3: [92, 91, 93], 4: [100, 98, 98], 5: [110, 107, 104], 6: [126, 122, 116],
    7: [150, 136, 106], 8: [200, 188, 152], 9: [122, 106, 92], 10: [112, 104, 98], 11: [96, 96, 98], 12: [112, 112, 112], 13: [62, 108, 140], 14: [62, 108, 140], 15: [70, 116, 146] };
  const SIDEWALK = [182, 176, 164];

  function hash(a, b) { let h = (a * 374761393 + b * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) >>> 0; }

  const sarea = (r) => { let a = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1]; } return a; };
  function polyFill(G, rings, y, col, vary) {
    // MVT: внешний контур по часовой (площадь > 0), за ним его дырки (площадь < 0)
    const groups = [];
    for (const r of rings) {
      if (r.length < 6) continue;
      if (sarea(r) > 0 || !groups.length) groups.push([r]); else groups[groups.length - 1].push(r);
    }
    const k = 1 + vary;
    for (const g of groups) {
      let flat = g[0], holes = [];
      if (g.length > 1) {
        let len = 0; for (const r of g) len += r.length;
        flat = new Float32Array(len); let o = 0;
        for (let i = 0; i < g.length; i++) { if (i) holes.push(o / 2); flat.set(g[i], o); o += g[i].length; }
      }
      const idx = self.earcut(flat, holes.length ? holes : null);
      const base = G.vc, n = flat.length / 2;
      for (let i = 0; i < n; i++) G.v(flat[i * 2], y, flat[i * 2 + 1], 0, 1, 0, clamp(col[0] * k), clamp(col[1] * k), clamp(col[2] * k), 255);
      for (let i = 0; i < idx.length; i += 3) G.tri(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    }
  }

  // лента вдоль линии (митры + квадратные концы)
  function strip(G, l, w, y, col, ext, H) {
    const n = l.length / 2; if (n < 2) return;
    const hw = w / 2;
    const px = new Float32Array(n), pz = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = l[i * 2]; pz[i] = l[i * 2 + 1]; }
    // удлиняем концы на полширины (стыки на перекрёстках без щелей)
    if (ext) {
      let dx = px[1] - px[0], dz = pz[1] - pz[0], L = Math.hypot(dx, dz) || 1; px[0] -= dx / L * hw; pz[0] -= dz / L * hw;
      dx = px[n - 1] - px[n - 2]; dz = pz[n - 1] - pz[n - 2]; L = Math.hypot(dx, dz) || 1; px[n - 1] += dx / L * hw; pz[n - 1] += dz / L * hw;
    }
    const base = G.vc;
    for (let i = 0; i < n; i++) {
      let nx = 0, nz = 0;
      if (i > 0) { const dx = px[i] - px[i - 1], dz = pz[i] - pz[i - 1], L = Math.hypot(dx, dz) || 1; nx += -dz / L; nz += dx / L; }
      if (i < n - 1) { const dx = px[i + 1] - px[i], dz = pz[i + 1] - pz[i], L = Math.hypot(dx, dz) || 1; nx += -dz / L; nz += dx / L; }
      let L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      // длина митры
      let m = 1;
      if (i > 0 && i < n - 1) { const dx = px[i + 1] - px[i], dz = pz[i + 1] - pz[i], l2 = Math.hypot(dx, dz) || 1; const c = nx * (-dz / l2) + nz * (dx / l2); m = Math.min(2.5, 1 / Math.max(0.3, c)); }
      const yy = y + (H ? H[i] : 0);
      G.v(px[i] + nx * hw * m, yy, pz[i] + nz * hw * m, 0, 1, 0, col[0], col[1], col[2], 255);
      G.v(px[i] - nx * hw * m, yy, pz[i] - nz * hw * m, 0, 1, 0, col[0], col[1], col[2], 255);
    }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; G.tri(a, a + 2, a + 1); G.tri(a + 1, a + 2, a + 3); }
  }
  // пунктир (разметка)
  function dashes(G, l, off, w, y, col, dash, gap, H, skip) {
    const n = l.length / 2;
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      const x0 = l[i * 2], z0 = l[i * 2 + 1], x1 = l[i * 2 + 2], z1 = l[i * 2 + 3];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.01) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      let t = acc;
      while (t < L) {
        const t1 = Math.min(L, t + dash);
        if (t1 > t) {
          const ax = x0 + ux * t + nx * off, az = z0 + uz * t + nz * off, bx = x0 + ux * t1 + nx * off, bz = z0 + uz * t1 + nz * off;
          if (!skip || !skip((ax + bx) / 2, (az + bz) / 2)) {
            const base = G.vc, hw = w / 2, ya = y + (H ? H[i] + (H[i + 1] - H[i]) * t / L : 0), yb = y + (H ? H[i] + (H[i + 1] - H[i]) * t1 / L : 0);
            G.v(ax + nx * hw, ya, az + nz * hw, 0, 1, 0, col[0], col[1], col[2], 255); G.v(ax - nx * hw, ya, az - nz * hw, 0, 1, 0, col[0], col[1], col[2], 255);
            G.v(bx + nx * hw, yb, bz + nz * hw, 0, 1, 0, col[0], col[1], col[2], 255); G.v(bx - nx * hw, yb, bz - nz * hw, 0, 1, 0, col[0], col[1], col[2], 255);
            G.tri(base, base + 2, base + 1); G.tri(base + 1, base + 2, base + 3);
          }
        }
        t += dash + gap;
      }
      acc = t - L;
    }
  }

  // ---------- многоуровневые дороги ----------
  // Мосты и эстакады поднимаются плавными пандусами от свободных концов (соседние куски
  // моста и края тайла считаются продолжением), тоннели уходят вниз; высота зависит от
  // длины всей цепочки моста: мостик через арык — чуть выше земли, путепровод — 6–7 м,
  // второй ярус развязки (layer ≥ 2) — до 13 м.
  const sm01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function profiles(L, T) {
    const out = new Array(L.length).fill(null), key = (x, z) => Math.round(x * 2) + "," + Math.round(z * 2);
    const par = new Map(), find = (i) => { while (par.get(i) !== i) { par.set(i, par.get(par.get(i))); i = par.get(i); } return i; };
    const ends = new Map(), kind = (fl) => (fl & 2 ? 2 : fl & 8 ? 8 : 0);
    L.forEach(([cls, fl, l], i) => {
      const k = kind(fl); if (!k || cls >= 13 || cls === 8) return; par.set(i, i);
      for (const j of [0, l.length - 2]) { const kk = k + ":" + key(l[j], l[j + 1]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(i); }
    });
    for (const list of ends.values()) for (let a = 1; a < list.length; a++) { const ra = find(list[0]), rb = find(list[a]); if (ra !== rb) par.set(ra, rb); }
    const lenOf = (l) => { let s = 0; for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]); return s; };
    const comp = new Map(); for (const i of par.keys()) { const r = find(i); comp.set(r, (comp.get(r) || 0) + lenOf(L[i][2])); }
    const onEdge = (x, z) => x < 0.6 || z < 0.6 || x > T - 0.6 || z > T - 0.6;
    for (const i of par.keys()) {
      const [cls, fl, l] = L[i], k = kind(fl), n = l.length / 2, cl = comp.get(find(i));
      const free = (j) => !onEdge(l[j], l[j + 1]) && (ends.get(k + ":" + key(l[j], l[j + 1])) || []).length < 2;
      const f0 = free(0), f1 = free(l.length - 2);
      let Hm, R;
      if (k === 2) { Hm = cl < 30 ? 0.8 : Math.min(fl & 16 ? 13 : 6.8, 0.9 + cl / 8); R = Math.max(8, Math.min(fl & 16 ? 110 : 75, cl * 0.36)); }
      else { Hm = -7; R = Math.max(10, Math.min(45, cl * 0.3)); }
      const cum = new Float32Array(n); for (let j = 1; j < n; j++) cum[j] = cum[j - 1] + Math.hypot(l[j * 2] - l[j * 2 - 2], l[j * 2 + 1] - l[j * 2 - 1]);
      const tot = cum[n - 1], H = new Float32Array(n);
      for (let j = 0; j < n; j++) { const d = Math.min(f0 ? cum[j] : 1e9, f1 ? tot - cum[j] : 1e9); H[j] = Hm * sm01(d / R); }
      out[i] = H;
    }
    return out;
  }
  // точки перекрёстков (общие вершины разных линий) — там не рисуем разметку
  function junctions(L) {
    const seen = new Map(), J = new Map(), key = (x, z) => Math.round(x) + "," + Math.round(z);
    L.forEach(([cls, fl, l], i) => {
      if (cls > 7 || fl & 8) return;
      for (let j = 0; j < l.length; j += 2) {
        const k = key(l[j], l[j + 1]), o = seen.get(k);
        if (!o) seen.set(k, { i, x: l[j], z: l[j + 1], r: RW[cls] / 2 + 1.2, multi: false });
        else if (o.i !== i) { o.multi = true; o.r = Math.max(o.r, RW[cls] / 2 + 1.2); }
      }
    });
    for (const o of seen.values()) if (o.multi) { const c = Math.floor(o.x / 16) + "," + Math.floor(o.z / 16); if (!J.has(c)) J.set(c, []); J.get(c).push(o); }
    return (x, z) => {
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = J.get((cx + a) + "," + (cz + b)); if (l) for (const o of l) if (Math.hypot(o.x - x, o.z - z) < o.r) return true; }
      return false;
    };
  }
  // нормали полилинии (для краёв ленты)
  function edgeNormals(l) {
    const n = l.length / 2, N = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      let nx = 0, nz = 0;
      if (i > 0) { const dx = l[i * 2] - l[i * 2 - 2], dz = l[i * 2 + 1] - l[i * 2 - 1], L2 = Math.hypot(dx, dz) || 1; nx += -dz / L2; nz += dx / L2; }
      if (i < n - 1) { const dx = l[i * 2 + 2] - l[i * 2], dz = l[i * 2 + 3] - l[i * 2 + 1], L2 = Math.hypot(dx, dz) || 1; nx += -dz / L2; nz += dx / L2; }
      const L3 = Math.hypot(nx, nz) || 1; N[i * 2] = nx / L3; N[i * 2 + 1] = nz / L3;
    }
    return N;
  }
  const DECK = [170, 166, 158], PARA = [204, 200, 192], PILLAR = [150, 148, 142];
  // пролётное строение: боковые грани плиты, парапеты, опоры
  function bridgeDeck(G, l, H, w) {
    const n = l.length / 2, N = edgeNormals(l), hw = w / 2;
    let acc = 13;
    for (let i = 0; i < n - 1; i++) {
      const h0 = H[i], h1 = H[i + 1]; if (Math.max(h0, h1) < 1.2) continue;
      const x0 = l[i * 2], z0 = l[i * 2 + 1], x1 = l[i * 2 + 2], z1 = l[i * 2 + 3];
      for (const s of [1, -1]) {
        const ax = x0 + N[i * 2] * hw * s, az = z0 + N[i * 2 + 1] * hw * s, bx = x1 + N[i * 2 + 2] * hw * s, bz = z1 + N[i * 2 + 3] * hw * s;
        face(G, [[ax, h0 + 0.2, az], [bx, h1 + 0.2, bz], [bx, h1 - 0.9, bz], [ax, h0 - 0.9, az]], DECK, 255);
        face(G, [[ax, h0 + 1.15, az], [bx, h1 + 1.15, bz], [bx, h1 + 0.2, bz], [ax, h0 + 0.2, az]], PARA, 255);
      }
      // опоры каждые ~26 м
      const L2 = Math.hypot(x1 - x0, z1 - z0); if (!L2) continue;
      const ux = (x1 - x0) / L2, uz = (z1 - z0) / L2;
      for (let t = acc; t < L2; t += 26) {
        const h = h0 + (h1 - h0) * t / L2; if (h < 2.6) continue;
        const cx = x0 + ux * t, cz = z0 + uz * t, vx = -uz, vz = ux, a = 0.8, b = hw * 0.55, top = h - 0.9;
        const P4 = [[cx + ux * a + vx * b, cz + uz * a + vz * b], [cx - ux * a + vx * b, cz - uz * a + vz * b], [cx - ux * a - vx * b, cz - uz * a - vz * b], [cx + ux * a - vx * b, cz + uz * a - vz * b]];
        for (let k = 0; k < 4; k++) { const [px, pz] = P4[k], [qx, qz] = P4[(k + 1) % 4]; face(G, [[px, 0, pz], [qx, 0, qz], [qx, top, qz], [px, top, pz]], PILLAR, 255); }
        face(G, [[cx + vx * (b + 1.2) + ux * 1.2, top, cz + vz * (b + 1.2) + uz * 1.2], [cx + vx * (b + 1.2) - ux * 1.2, top, cz + vz * (b + 1.2) - uz * 1.2], [cx - vx * (b + 1.2) - ux * 1.2, top, cz - vz * (b + 1.2) - uz * 1.2], [cx - vx * (b + 1.2) + ux * 1.2, top, cz - vz * (b + 1.2) + uz * 1.2]], PILLAR, 255);
      }
      acc = ((acc - L2) % 26 + 26) % 26;
    }
  }
  // части полилинии, где выполняется условие (с интерполированными точками разреза)
  function runs(l, H, ok) {
    const n = l.length / 2, res = []; let cur = null;
    const push = (x, z, h) => { cur.p.push(x, z); cur.h.push(h); };
    for (let i = 0; i < n; i++) {
      const o = ok(H[i]);
      if (i > 0 && o !== ok(H[i - 1])) { // пересечение порога внутри сегмента
        let lo = 0, hi = 1; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (ok(H[i - 1] + (H[i] - H[i - 1]) * m) === ok(H[i - 1])) lo = m; else hi = m; }
        const t = (lo + hi) / 2, x = l[i * 2 - 2] + (l[i * 2] - l[i * 2 - 2]) * t, z = l[i * 2 - 1] + (l[i * 2 + 1] - l[i * 2 - 1]) * t, h = H[i - 1] + (H[i] - H[i - 1]) * t;
        if (cur) { push(x, z, h); res.push(cur); cur = null; } else { cur = { p: [], h: [], cut0: true }; push(x, z, h); }
      }
      if (o) { if (!cur) cur = { p: [], h: [] }; push(l[i * 2], l[i * 2 + 1], H[i]); }
    }
    if (cur) res.push(cur);
    return res.filter((r) => r.p.length >= 4).map((r) => ({ p: new Float32Array(r.p), h: new Float32Array(r.h), cut0: !!r.cut0 }));
  }
  // портал тоннеля поперёк дороги: опоры, ригель, тёмный «зев» и подпорные стенки
  function tunnelPortal(G, x, z, ux, uz, w) {
    const vx = -uz, vz = ux, hw = w / 2 + 0.6, D = [40, 40, 44], CW = [178, 174, 166];
    face(G, [[x - vx * hw, 0, z - vz * hw], [x + vx * hw, 0, z + vz * hw], [x + vx * hw, 4.6, z + vz * hw], [x - vx * hw, 4.6, z - vz * hw]], D, 255);
    for (const s of [-1, 1]) { const px = x + vx * hw * s, pz = z + vz * hw * s; face(G, [[px - ux * 0.6, 0, pz - uz * 0.6], [px + ux * 0.6, 0, pz + uz * 0.6], [px + ux * 0.6, 5.6, pz + uz * 0.6], [px - ux * 0.6, 5.6, pz - uz * 0.6]], CW, 255); }
    face(G, [[x - vx * (hw + 0.6) - ux * 0.7, 4.6, z - vz * (hw + 0.6) - uz * 0.7], [x + vx * (hw + 0.6) - ux * 0.7, 4.6, z + vz * (hw + 0.6) - uz * 0.7], [x + vx * (hw + 0.6) - ux * 0.7, 5.8, z + vz * (hw + 0.6) - uz * 0.7], [x - vx * (hw + 0.6) - ux * 0.7, 5.8, z - vz * (hw + 0.6) - uz * 0.7]], CW, 255);
  }
  function rampWalls(G, l, w) {
    const n = l.length / 2, N = edgeNormals(l), hw = w / 2 + 0.5;
    for (let i = 0; i < n - 1; i++) for (const s of [1, -1]) {
      const ax = l[i * 2] + N[i * 2] * hw * s, az = l[i * 2 + 1] + N[i * 2 + 1] * hw * s, bx = l[i * 2 + 2] + N[i * 2 + 2] * hw * s, bz = l[i * 2 + 3] + N[i * 2 + 3] * hw * s;
      face(G, [[ax, 0, az], [bx, 0, bz], [bx, 1.1, bz], [ax, 1.1, az]], [184, 180, 172], 255);
    }
  }

  // ---------- здания ----------
  function obb(fp) {
    const n = fp.length / 2; let best = null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = fp[j * 2] - fp[i * 2], dz = fp[j * 2 + 1] - fp[i * 2 + 1], L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const ux = dx / L, uz = dz / L;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (let k = 0; k < n; k++) { const a = fp[k * 2] * ux + fp[k * 2 + 1] * uz, b = -fp[k * 2] * uz + fp[k * 2 + 1] * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
      const ar = (a1 - a0) * (b1 - b0);
      if (!best || ar < best.ar) best = { ar, ux, uz, a0, a1, b0, b1 };
    }
    if (!best) return null;
    let { ux, uz, a0, a1, b0, b1 } = best;
    if (b1 - b0 > a1 - a0) { const t = ux; ux = -uz; uz = t; const o0 = a0, o1 = a1; a0 = b0; a1 = b1; b0 = -o1; b1 = -o0; } // u — длинная ось
    const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, ux, uz, vx: -uz, vz: ux, L: a1 - a0, Wd: b1 - b0 };
  }
  function face(G, pts3, col, a, wuv) { // плоский многоугольник с нормалью
    const [p0, p1, p2] = pts3;
    let ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    if (ny < -0.01) { nx = -nx; ny = -ny; nz = -nz; pts3 = pts3.slice().reverse(); }
    const base = G.vc;
    const sh = 0.85 + 0.15 * ny;
    for (const p of pts3) G.v(p[0], p[1], p[2], nx, ny, nz, clamp(col[0] * sh), clamp(col[1] * sh), clamp(col[2] * sh), a, -1, -1);
    for (let i = 1; i < pts3.length - 1; i++) G.tri(base, base + i, base + i + 1);
  }
  function building(G, fp, h, mh, roof, rh, wall, rcol, kind, id) {
    if (roof === 7) { bowl(G, fp, h, wall, id); return; }
    const n = fp.length / 2;
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += fp[i * 2] * fp[j * 2 + 1] - fp[j * 2] * fp[i * 2 + 1]; }
    const sgn = A > 0 ? 1 : -1;
    const wr = (wall >> 16) & 255, wg = (wall >> 8) & 255, wb = wall & 255;
    const rr = (rcol >> 16) & 255, rg = (rcol >> 8) & 255, rb = rcol & 255;
    const winA = kind === 4 || kind === 9 || kind === 7 || h < 2.9 ? 255 : (id % 250); // 255 — без окон
    const eaves = roof === 0 || roof === 4 || roof === 5 ? h : h;
    // стены
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = fp[i * 2], z0 = fp[i * 2 + 1], x1 = fp[j * 2], z1 = fp[j * 2 + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nx = sgn * dz / L, nz = -sgn * dx / L; // наружу
      const base = G.vc;
      const lo = 0.8, hi = 1.0; // лёгкое затемнение у земли
      G.v(x0, mh, z0, nx, 0, nz, clamp(wr * lo), clamp(wg * lo), clamp(wb * lo), winA, u * 4, 0);
      G.v(x1, mh, z1, nx, 0, nz, clamp(wr * lo), clamp(wg * lo), clamp(wb * lo), winA, (u + L) * 4, 0);
      G.v(x1, eaves, z1, nx, 0, nz, wr * hi, wg * hi, wb * hi, winA, (u + L) * 4, (eaves - mh) * 10);
      G.v(x0, eaves, z0, nx, 0, nz, wr * hi, wg * hi, wb * hi, winA, u * 4, (eaves - mh) * 10);
      // обход: внешняя сторона — лицевая
      if (sgn > 0) { G.tri(base, base + 3, base + 2); G.tri(base, base + 2, base + 1); }
      else { G.tri(base, base + 1, base + 2); G.tri(base, base + 2, base + 3); }
      u += L;
    }
    const RC2 = [rr, rg, rb];
    if (roof === 1 || roof === 2 || roof === 3) {
      const o = obb(fp);
      if (o && o.Wd > 1.5) {
        const ov = 0.35, L = o.L / 2 + ov, Wd = o.Wd / 2 + ov, y0 = h, y1 = h + rh;
        const P = (a, b, y) => [o.cx + o.ux * a + o.vx * b, y, o.cz + o.uz * a + o.vz * b];
        const c1 = P(-L, -Wd, y0), c2 = P(L, -Wd, y0), c3 = P(L, Wd, y0), c4 = P(-L, Wd, y0);
        if (roof === 1) { // двускатная
          const r1 = P(-L, 0, y1), r2 = P(L, 0, y1);
          face(G, [c1, c2, r2, r1], RC2, 255); face(G, [c3, c4, r1, r2], RC2, 255);
          face(G, [c4, c1, r1], [wr, wg, wb], 255); face(G, [c2, c3, r2], [wr, wg, wb], 255);
        } else {
          const k = roof === 3 || o.L - o.Wd < 1 ? 0 : (o.L - o.Wd) / 2;
          const r1 = P(-k, 0, y1), r2 = P(k, 0, y1);
          if (k > 0) { face(G, [c1, c2, r2, r1], RC2, 255); face(G, [c3, c4, r1, r2], RC2, 255); }
          else { face(G, [c1, c2, r1], RC2, 255); face(G, [c3, c4, r1], RC2, 255); }
          face(G, [c4, c1, r1], RC2, 255); face(G, [c2, c3, r2], RC2, 255);
        }
        return;
      }
    }
    // парапет по краю плоской крыши (светлый бортик)
    if (roof === 0 && h > 7) {
      const pr = clamp(rr * 1.18 + 14), pg = clamp(rg * 1.18 + 14), pb = clamp(rb * 1.18 + 14), ph = 0.7;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, x0 = fp[i * 2], z0 = fp[i * 2 + 1], x1 = fp[j * 2], z1 = fp[j * 2 + 1];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nx = sgn * dz / L, nz = -sgn * dx / L, base = G.vc;
        G.v(x0, h, z0, nx, 0, nz, pr, pg, pb, 255, -1, -1); G.v(x1, h, z1, nx, 0, nz, pr, pg, pb, 255, -1, -1);
        G.v(x1, h + ph, z1, nx, 0, nz, pr, pg, pb, 255, -1, -1); G.v(x0, h + ph, z0, nx, 0, nz, pr, pg, pb, 255, -1, -1);
        if (sgn > 0) { G.tri(base, base + 3, base + 2); G.tri(base, base + 2, base + 1); } else { G.tri(base, base + 1, base + 2); G.tri(base, base + 2, base + 3); }
      }
    }
    // плоская крыша
    const idx = self.earcut(fp);
    const base = G.vc;
    for (let i = 0; i < n; i++) G.v(fp[i * 2], h, fp[i * 2 + 1], 0, 1, 0, rr, rg, rb, 255, -1, -1);
    for (let i = 0; i < idx.length; i += 3) G.tri(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    if (roof === 4 || roof === 5) { // купол (мечети)
      const o = obb(fp);
      const cx = o ? o.cx : 0, cz = o ? o.cz : 0, R = Math.max(1.5, (o ? Math.min(o.L, o.Wd) : 6) * 0.34);
      dome(G, cx, h, cz, R, roof === 5 ? 1.35 : 1.0, RC2);
    }
  }
  function dome(G, cx, y, cz, R, hk, col) {
    const SEG = 12, RINGS = 5, base = G.vc;
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS * Math.PI / 2, rad = Math.cos(t) * R * (hk > 1 ? 1 + 0.25 * Math.sin(t * 2) : 1), yy = y + Math.sin(t) * R * hk;
      for (let s = 0; s < SEG; s++) {
        const a = s / SEG * Math.PI * 2, nx = Math.cos(a) * Math.cos(t), nz = Math.sin(a) * Math.cos(t), ny = Math.sin(t);
        G.v(cx + Math.cos(a) * rad, yy, cz + Math.sin(a) * rad, nx, ny, nz, col[0], col[1], col[2], 255, -1, -1);
      }
    }
    for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a = base + r * SEG + s, b = base + r * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG;
      G.tri(a, c, b); G.tri(b, c, d);
    }
  }


  // ---------- стадион-чаша (building=stadium из OSM) ----------
  // Трибуны ступенями спускаются от внешнего контура к полю; при высоте ≥ 15 м — козырёк.
  const SEATS = [[46, 92, 170], [188, 54, 48], [50, 128, 72], [226, 182, 50], [72, 142, 202]];
  function bowl(G, fp, h, wall, id) {
    const n = fp.length / 2, o = obb(fp); if (!o) return;
    const cx = o.cx, cz = o.cz, half = Math.min(o.L, o.Wd) / 2;
    const band = Math.min(34, Math.max(8, half * 0.42)), s = Math.max(0.3, 1 - band / half);
    const K = Math.max(3, Math.min(10, Math.round(h / 2.4)));
    const R = (sc, i, y) => [cx + (fp[i * 2] - cx) * sc, y, cz + (fp[i * 2 + 1] - cz) * sc];
    const ring = (scA, yA, scB, yB, col) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; face(G, [R(scA, i, yA), R(scA, j, yA), R(scB, j, yB), R(scB, i, yB)], col, 255); } };
    const wr = (wall >> 16) & 255, wg = (wall >> 8) & 255, wb = wall & 255;
    const seat = SEATS[id % SEATS.length], seat2 = SEATS[(id + 3) % SEATS.length];
    const canopy = h >= 15;
    ring(1, 0, 1, h, [wr * 0.82, wg * 0.82, wb * 0.82]);                 // внешний фасад
    if (canopy) ring(1, h, 1, h + 3, [74, 76, 84]);                       // проёмы верхнего фойе
    for (let t = 0; t < K; t++) {                                          // ступени трибун
      const sa = 1 - (1 - s) * t / K, sb = 1 - (1 - s) * (t + 1) / K, ya = h - (h - 1.2) * t / K, yb = h - (h - 1.2) * (t + 1) / K;
      const c = t === Math.floor(K / 2) || t === 0 ? seat2 : seat, k = t % 2 ? 0.9 : 1;
      ring(sa, ya, sb, ya, [c[0] * k, c[1] * k, c[2] * k]);
      ring(sb, ya, sb, yb, [c[0] * 0.62, c[1] * 0.62, c[2] * 0.62]);
    }
    ring(s, 1.2, s, 0, [186, 182, 172]);                                   // бортик у поля
    // поле
    const ip = new Float32Array(n * 2); for (let i = 0; i < n; i++) { ip[i * 2] = cx + (fp[i * 2] - cx) * s; ip[i * 2 + 1] = cz + (fp[i * 2 + 1] - cz) * s; }
    const idx = self.earcut(ip), base = G.vc;
    for (let i = 0; i < n; i++) G.v(ip[i * 2], 0.3, ip[i * 2 + 1], 0, 1, 0, 88, 146, 66, 255, -1, -1);
    for (let i = 0; i < idx.length; i += 3) G.tri(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    if (canopy) { const sc = 1 - (1 - s) * 0.55; ring(1.01, h + 3, sc, h + 2.2, [226, 226, 222]); ring(sc, h + 2.2, sc, h + 1.4, [150, 150, 152]); }
    // фасад: пояс проёмов и пилястры
    for (let i = 0; i < n; i += 2) { const j = (i + 1) % n; face(G, [R(1.004, i, h * 0.55), R(1.004, j, h * 0.55), R(1.004, j, h * 0.75), R(1.004, i, h * 0.75)], [wr * 0.45, wg * 0.47, wb * 0.52], 255); }
    // футбольное поле с полосами и разметкой, если помещается
    const fl = o.L * s, fw = o.Wd * s;
    if (fl > 100 && fw > 64) {
      const q = (a0, a1, b0, b1, y, c) => face(G, [[cx + o.ux * a0 + o.vx * b0, y, cz + o.uz * a0 + o.vz * b0], [cx + o.ux * a1 + o.vx * b0, y, cz + o.uz * a1 + o.vz * b0], [cx + o.ux * a1 + o.vx * b1, y, cz + o.uz * a1 + o.vz * b1], [cx + o.ux * a0 + o.vx * b1, y, cz + o.uz * a0 + o.vz * b1]], c, 255);
      for (let i = 0; i < 10; i++) q(-52.5 + i * 10.5, -42 + i * 10.5, -34, 34, 0.34, i % 2 ? [76, 136, 58] : [92, 152, 68]);
      const W = [232, 234, 228], t = 0.25;
      q(-52.5, 52.5, -34, -34 + t, 0.36, W); q(-52.5, 52.5, 34 - t, 34, 0.36, W); q(-52.5, -52.5 + t, -34, 34, 0.36, W); q(52.5 - t, 52.5, -34, 34, 0.36, W); q(-t / 2, t / 2, -34, 34, 0.36, W);
      for (const sg of [-1, 1]) { const x0 = sg * 52.5, x1 = sg * 36; q(Math.min(x0, x1), Math.max(x0, x1), -20.2, -20.2 + t, 0.36, W); q(Math.min(x0, x1), Math.max(x0, x1), 20.2 - t, 20.2, 0.36, W); q(x1 - t / 2, x1 + t / 2, -20.2, 20.2, 0.36, W); }
    }
  }

  // ---------- дальний план: тайл как одна текстура («фейковая» прорисовка) ----------
  // RGB — цвет земли, дорог, крон и крыш; A — сила тени (тени нарисованы заранее).
  const SHADOW = [0.41, -0.62]; // смещение тени на 1 м высоты (солнце с юго-юго-запада)
  const css = (c, k = 1) => "rgb(" + clamp(c[0] * k) + "," + clamp(c[1] * k) + "," + clamp(c[2] * k) + ")";
  function raster(R, T, areas, lines, trees, blds, treePal) {
    // willReadFrequently — растеризация на CPU: быстрее для разового рисования с чтением пикселей
    const cv = new OffscreenCanvas(R, R), x = cv.getContext("2d", { willReadFrequently: true }), sv2 = new OffscreenCanvas(R, R), sx = sv2.getContext("2d", { willReadFrequently: true });
    const k = R / T;
    x.fillStyle = css(GCOL.base); x.fillRect(0, 0, R, R);
    sx.fillStyle = "#fff"; sx.fillRect(0, 0, R, R);
    const path = (c, r) => { c.moveTo(r[0] * k, r[1] * k); for (let i = 2; i < r.length; i += 2) c.lineTo(r[i] * k, r[i + 1] * k); c.closePath(); };
    for (const [cls, rings, vary] of areas) {
      x.beginPath(); for (const r of rings) path(x, r);
      x.fillStyle = css(GCOL[cls] || GCOL.base, cls === 8 ? 1 : 1 + vary); x.fill("evenodd");
    }
    // линии: одна обводка на класс (тысячи линий — десятки вызовов вместо тысяч)
    x.lineJoin = "bevel"; x.lineCap = "square";
    const strokeCls = (pred, wOf, colOf) => {
      const by = new Map();
      for (const [cls, , l] of lines) if (pred(cls)) { let a = by.get(cls); if (!a) by.set(cls, a = []); a.push(l); }
      for (const [cls, ls] of by) {
        x.beginPath();
        for (const l of ls) { x.moveTo(l[0] * k, l[1] * k); for (let i = 2; i < l.length; i += 2) x.lineTo(l[i] * k, l[i + 1] * k); }
        x.lineWidth = Math.max(0.7, wOf(cls) * k); x.strokeStyle = colOf(cls); x.stroke();
      }
    };
    strokeCls((c) => c >= 13, (c) => RW[c], (c) => css(RC[c]));
    strokeCls((c) => c <= 5, (c) => RW[c] + (c <= 4 ? 5 : 2.6), () => css(SIDEWALK));
    strokeCls((c) => c < 13, (c) => RW[c], (c) => css(RC[c], c === 9 || c === 10 ? 0.8 : 1));
    // карта высот (в канале R второго холста, 0,4 м на единицу) — из неё потом считаются тени
    const hq = (h) => Math.max(1, Math.min(255, Math.round(h * 2.5)));
    const hGroups = new Map();
    const hPush = (v, item) => { let a = hGroups.get(v); if (!a) hGroups.set(v, a = []); a.push(item); };
    // кроны деревьев (квадратики 1–3 px неотличимы от кругов, но рисуются в разы быстрее)
    if (trees) {
      const n = trees.length / 3, groups = treePal.map(() => []);
      for (let i = 0; i < n; i++) {
        const r = trees[i * 3 + 2], f = r % 1, poplar = r >= 2, hgt = poplar ? 13 + f * 8 : 6 + f * 7.5;
        const d = Math.max(1, (poplar ? 3.2 : hgt * 0.62) * k), px = trees[i * 3] * k - d / 2, pz = trees[i * 3 + 1] * k - d / 2;
        groups[Math.floor(f * 997) % treePal.length].push(px, pz, d);
        hPush(hq(hgt * 0.85), [px, pz, d]);
      }
      groups.forEach((g, gi) => {
        if (!g.length) return;
        x.beginPath(); for (let i = 0; i < g.length; i += 3) x.rect(g[i], g[i + 1], g[i + 2], g[i + 2]);
        x.fillStyle = treePal[gi]; x.fill();
      });
    }
    // крыши низких домов (высокие стоят 3D-мешем поверх): заливка группами по цвету + тонкая обводка
    const byCol = new Map();
    x.beginPath();
    for (const b of blds) {
      hPush(hq(b[1]), b[0]);
      if (b[3]) continue;
      let a = byCol.get(b[2]); if (!a) byCol.set(b[2], a = []); a.push(b[0]);
      path(x, b[0]);
    }
    x.lineWidth = 0.9; x.strokeStyle = "rgba(40,34,28,0.5)"; x.stroke();
    for (const [c, fps] of byCol) {
      x.beginPath(); for (const fp of fps) path(x, fp);
      x.fillStyle = "rgb(" + ((c >> 16) & 255) + "," + ((c >> 8) & 255) + "," + (c & 255) + ")"; x.fill();
    }
    sx.fillStyle = "#000"; sx.fillRect(0, 0, R, R);
    for (const v of [...hGroups.keys()].sort((p, q) => p - q)) { // от низких к высоким — в пикселе остаётся максимум
      sx.beginPath();
      for (const it of hGroups.get(v)) { if (it.length === 3) sx.rect(it[0], it[1], it[2], it[2]); else path(sx, it); }
      sx.fillStyle = "rgb(" + v + ",0,0)"; sx.fill();
    }
    const img = x.getImageData(0, 0, R, R), hm = sx.getImageData(0, 0, R, R).data, d = img.data;
    // тень: идём от пикселя к солнцу; если что-то выше луча — пиксель в тени
    const H = new Uint8Array(R * R); for (let i = 0; i < H.length; i++) H[i] = hm[i * 4];
    const L = Math.hypot(SHADOW[0], SHADOW[1]), ux = -SHADOW[0] / L, uz = -SHADOW[1] / L;
    const rise = (T / R) / L * 2.5; // на сколько единиц высоты поднимается луч за 1 тексель
    const maxS = Math.min(48, Math.ceil(255 / rise));
    for (let zz = 0; zz < R; zz++) for (let xx = 0; xx < R; xx++) {
      const i = zz * R + xx, h0 = H[i]; let sh = 0;
      for (let st = 1; st <= maxS; st++) {
        const qx = (xx + ux * st + 0.5) | 0, qz = (zz + uz * st + 0.5) | 0;
        if (qx < 0 || qz < 0 || qx >= R || qz >= R) break;
        if (H[qz * R + qx] - h0 > st * rise) { sh = 255; break; }
      }
      d[i * 4 + 3] = sh;
    }
    return d;
  }

  // ---------- разбор тайла ----------
  function build(buf, msg) {
    const tb0 = performance.now();
    B = buf; P = 0;
    const ground = new Geo(false), roads = new Geo(false), water = new Geo(false), bld = new Geo(true);
    const T = msg.tileM, far = msg.lod === 2;
    const rA = far ? [] : null, rL = far ? [] : null, rB = far ? [] : null; // данные для текстуры дальнего плана
    let treesRaw = null;
    // базовая плита тайла
    { const c = GCOL.base, b = ground.vc; ground.v(0, 0, 0, 0, 1, 0, c[0], c[1], c[2], 255); ground.v(T, 0, 0, 0, 1, 0, c[0], c[1], c[2], 255); ground.v(T, 0, T, 0, 1, 0, c[0], c[1], c[2], 255); ground.v(0, 0, T, 0, 1, 0, c[0], c[1], c[2], 255); ground.tri(b, b + 2, b + 1); ground.tri(b, b + 3, b + 2); }
    const out = { lines: [], trees: null, signals: null, places: [], lamps: null, bcount: 0 };
    const lamps = [];
    // фонари вдоль улиц
    function lampsAlong(l, cls, fl, H) {
      const off = RW[cls] / 2 + 1.2; let acc = 14;
      for (let i = 0; i + 3 < l.length; i += 2) {
        const dx = l[i + 2] - l[i], dz = l[i + 3] - l[i + 1], Ls = Math.hypot(dx, dz); if (!Ls) continue;
        const ux = dx / Ls, uz = dz / Ls;
        for (let t = acc; t < Ls; t += 34) { const j = i >> 1, br = H ? H[j] + (H[j + 1] - H[j]) * t / Ls : 0; lamps.push(l[i] + ux * t - uz * off, 6.5 + br, l[i + 1] + uz * t + ux * off); if (!(fl & 1)) lamps.push(l[i] + ux * t + uz * off, 6.5 + br, l[i + 1] + uz * t - ux * off); }
        acc = ((acc - Ls) % 34 + 34) % 34;
      }
    }
    let tag;
    while ((tag = u8()) !== 0 && P < B.length) {
      if (tag === 1) {
        const n = vr();
        for (let f = 0; f < n; f++) {
          const cls = u8(), nr = vr(), rings = [];
          for (let r = 0; r < nr; r++) rings.push(pts());
          const vary = ((hash(f, cls) % 100) / 100 - 0.5) * 0.07;
          if (far) { rA.push([cls, rings, vary]); continue; }
          if (cls === 8) polyFill(water, rings, GY[8], GCOL[8], 0);
          else polyFill(ground, rings, GY[cls] || 0.02, GCOL[cls] || GCOL.base, vary);
        }
      } else if (tag === 2) {
        const n = vr();
        const L = [];
        for (let f = 0; f < n; f++) { const cls = u8(), fl = u8(); L.push([cls, fl, pts()]); }
        if (far) {
          const PH = profiles(L, T);
          L.forEach(([cls, fl, l], f) => {
            if (!(fl & 8)) rL.push([cls, fl, l]);
            if (cls <= 5) out.lines.push({ cls, fl, p: l, h: PH[f] });
            if (cls <= 4 && !(fl & 8)) lampsAlong(l, cls, fl, PH[f]);
          });
          continue;
        }
        // порядок: тротуары → вода → асфальт → разметка.
        // У каждого класса своя высота: крупная дорога всегда сверху, без мерцания на стыках.
        const PH = profiles(L, T), skipJ = junctions(L);
        const ay = (cls) => (cls === 8 ? 0.12 : cls === 9 || cls === 10 ? 0.15 : 0.2 + (12 - Math.min(cls, 12)) * 0.006);
        const sideW = (cls) => RW[cls] + (cls <= 4 ? 5 : 2.6);
        for (let f = 0; f < L.length; f++) {
          const [cls, fl, l] = L[f], H = PH[f];
          if (cls >= 13) { strip(water, l, RW[cls], 0.065, RC[cls], false); continue; }
          if (fl & 8) continue; // тротуары у тоннелей не рисуем
          if (cls <= 5) strip(roads, l, sideW(cls), 0.13 + (5 - cls) * 0.002, SIDEWALK, true, H);
        }
        for (let f = 0; f < L.length; f++) {
          const [cls, fl, l] = L[f];
          if (cls >= 13) continue;
          let H = PH[f];
          if (fl & 8) { // тоннель: видны только въезды, между порталами дорога уходит под землю
            const RR = runs(l, H, (h) => h > -2.4);
            for (const r of RR) {
              strip(roads, r.p, RW[cls], 0.17, RC[cls], false);
              rampWalls(bld, r.p, RW[cls]);
              const m = r.p.length;
              // портал — на том конце, где начинается подземная часть
              const atStart = r.cut0, i0 = atStart ? 0 : m - 2, i1 = atStart ? 2 : m - 4;
              const dx = r.p[i0] - r.p[i1], dz = r.p[i0 + 1] - r.p[i1 + 1], L2 = Math.hypot(dx, dz) || 1;
              if (r.cut0 || r.h[r.h.length - 1] < -2) tunnelPortal(bld, r.p[i0], r.p[i0 + 1], dx / L2, dz / L2, RW[cls]);
            }
            if (cls <= 5) out.lines.push({ cls, fl, p: l, h: H });
            continue;
          }
          const y = ay(cls);
          strip(roads, l, RW[cls], y, RC[cls], cls <= 6, H);
          if (H && (fl & 2)) bridgeDeck(bld, l, H, cls <= 5 ? sideW(cls) : RW[cls]);
          if (cls === 9 || cls === 10) { // рельсы и шпалы
            dashes(roads, l, 0, RW[cls] * 0.9, y + 0.01, [96, 80, 66], 0.35, 0.55, H);
            dashes(roads, l, 0.72, 0.14, y + 0.02, [60, 58, 58], 1000, 0, H); dashes(roads, l, -0.72, 0.14, y + 0.02, [60, 58, 58], 1000, 0, H);
          }
          if (cls <= 4) { // разметка (не заходит на перекрёстки)
            const mk = [232, 228, 214], my = y + 0.003;
            if (cls <= 2 && !(fl & 1)) { dashes(roads, l, 0.18, 0.16, my, mk, 5, 0, H, skipJ); dashes(roads, l, -0.18, 0.16, my, mk, 5, 0, H, skipJ); }
            else if (!(fl & 1)) dashes(roads, l, 0, 0.16, my, mk, 3, 4, H, skipJ);
            if (cls <= 2) { const q = RW[cls] / 4; dashes(roads, l, q, 0.14, my, mk, 3, 6, H, skipJ); dashes(roads, l, -q, 0.14, my, mk, 3, 6, H, skipJ); }
          }
          if (cls <= 5) out.lines.push({ cls, fl, p: l, h: H });
          if (cls <= 4) lampsAlong(l, cls, fl, H);
        }
      } else if (tag === 3) {
        const n = vr(); out.bcount = n;
        for (let f = 0; f < n; f++) {
          const h = vr() / 10, mh = vr() / 10, roof = u8(), rh = vr() / 10, wall = u24(), rc = u24(), kind = u8(), fp = pts();
          if (msg.skipBld) continue;
          const id = hash(f, fp.length) % 1000;
          if (far) {
            // дальний план: 3D остаются только заметные по высоте здания, остальные — в текстуре
            const tall = h >= msg.tallH || roof === 7 || roof === 4 || roof === 5;
            rB.push([fp, h + (roof && roof < 4 ? rh * 0.5 : 0), rc, tall]);
            if (tall) building(bld, fp, h, mh, roof, rh, wall, rc, kind, id);
            continue;
          }
          building(bld, fp, h, mh, roof, rh, wall, rc, kind, id);
        }
      } else if (tag === 4) {
        const n = vr(), tr = new Float32Array(n * 3); let x = 0, y = 0;
        for (let i = 0; i < n; i++) { x += sv(); y += sv(); tr[i * 3] = x / 10; tr[i * 3 + 1] = y / 10; tr[i * 3 + 2] = u8() / 85; }
        if (far) treesRaw = tr; else out.trees = tr;
      } else if (tag === 5) {
        out.signals = pts();
      } else if (tag === 6) {
        const n = vr();
        for (let i = 0; i < n; i++) { const c = u8(), x = sv() / 10, z = sv() / 10, nm = str(), lt = str(); out.places.push({ c, x, z, n: nm, lt }); }
      } else break;
    }
    out.ground = ground.pack(); out.roads = roads.pack(); out.water = water.pack(); out.bld = bld.pack();
    out.lamps = new Float32Array(lamps);
    const tr0 = performance.now();
    if (far) out.tex = raster(msg.res, T, rA, rL, treesRaw, rB, msg.treePal);
    out.prof = [Math.round(tr0 - tb0), Math.round(performance.now() - tr0), rB ? rB.length : 0, treesRaw ? treesRaw.length / 3 : 0];
    return out;
  }

  let canRaster = false;
  try { canRaster = typeof OffscreenCanvas !== "undefined" && !!new OffscreenCanvas(2, 2).getContext("2d"); } catch (e) {}
  self.onmessage = async (ev) => {
    const m = ev.data;
    if (m.lod === 2 && !canRaster) { self.postMessage({ id: m.id, noRaster: true }); return; }
    try {
      const bin = atob(m.b64), raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      const ab = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
      const r = build(new Uint8Array(ab), m);
      r.id = m.id;
      const tr = [];
      for (const k of ["ground", "roads", "water", "bld"]) for (const a of ["p", "n", "c", "e", "i"]) if (r[k][a]) tr.push(r[k][a].buffer);
      for (const k of ["trees", "signals", "lamps", "tex"]) if (r[k]) tr.push(r[k].buffer);
      self.postMessage(r, tr);
    } catch (e) { self.postMessage({ id: m.id, error: String(e && e.stack || e) }); }
  };
};
