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
  // OV: готовые профили линий, пересекающих край тайла (блок 7, tools/bake/seams.py) — сквозные по городу
  function profiles(L, T, OV) {
    const out = new Array(L.length).fill(null), key = (x, z) => Math.round(x * 2) + "," + Math.round(z * 2);
    const par = new Map(), find = (i) => { while (par.get(i) !== i) { par.set(i, par.get(par.get(i))); i = par.get(i); } return i; };
    const ends = new Map(), kind = (fl) => (fl & 2 ? 2 : fl & 8 ? 8 : 0), flat = new Set();
    L.forEach(([cls, fl, l], i) => {
      const k = kind(fl);
      if (!k) { if (cls < 13 && cls !== 8) for (const j of [0, l.length - 2]) flat.add(cls + ":" + key(l[j], l[j + 1])); return; }
      if (cls >= 13 || cls === 8) return; par.set(i, i);
      for (const j of [0, l.length - 2]) { const kk = k + ":" + key(l[j], l[j + 1]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(i); }
    });
    for (const list of ends.values()) for (let a = 1; a < list.length; a++) { const ra = find(list[0]), rb = find(list[a]); if (ra !== rb) par.set(ra, rb); }
    const lenOf = (l) => { let s = 0; for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]); return s; };
    const onEdge = (x, z) => x < 0.6 || z < 0.6 || x > T - 0.6 || z > T - 0.6;
    // цепочка, уходящая за край тайла, длиннее, чем видно здесь: высоту берём как у длинного моста,
    // иначе соседние тайлы поднимут её по-разному и на стыке будет ступенька
    const comp = new Map(), edge = new Set();
    for (const i of par.keys()) {
      const r = find(i), l = L[i][2]; comp.set(r, (comp.get(r) || 0) + lenOf(l));
      if (onEdge(l[0], l[1]) || onEdge(l[l.length - 2], l[l.length - 1])) edge.add(r);
    }
    for (const i of par.keys()) {
      const [cls, fl, l] = L[i], k = kind(fl), n = l.length / 2, cl = comp.get(find(i)), clH = edge.has(find(i)) ? Math.max(cl, 48) : cl;
      // свободный конец — не продолжается тем же мостом/тоннелем; на краю тайла — только если там же
      // начинается обычный (не мостовой) участок того же класса
      const free = (j) => (!onEdge(l[j], l[j + 1]) || flat.has(cls + ":" + key(l[j], l[j + 1]))) && (ends.get(k + ":" + key(l[j], l[j + 1])) || []).length < 2;
      const f0 = free(0), f1 = free(l.length - 2);
      let Hm, R;
      if (k === 2) { Hm = clH < 30 ? 0.8 : Math.min(fl & 16 ? 13 : 6.8, 0.9 + clH / 8); R = Math.max(8, Math.min(fl & 16 ? 110 : 75, cl * 0.36)); }
      else { Hm = -7; R = Math.max(10, Math.min(45, cl * 0.3)); }
      const cum = new Float32Array(n); for (let j = 1; j < n; j++) cum[j] = cum[j - 1] + Math.hypot(l[j * 2] - l[j * 2 - 2], l[j * 2 + 1] - l[j * 2 - 1]);
      const tot = cum[n - 1], H = new Float32Array(n);
      for (let j = 0; j < n; j++) { const d = Math.min(f0 ? cum[j] : 1e9, f1 ? tot - cum[j] : 1e9); H[j] = Hm * sm01(d / R); }
      out[i] = H;
    }
    if (OV) for (const [i, h] of OV) if (out[i] && h.length === out[i].length) out[i] = h;
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
  const DECK = [172, 168, 160], GIRDER = [128, 125, 120], PARA = [206, 202, 194], CAPC = [226, 222, 214], PILLAR = [152, 150, 144], WALL = [178, 174, 166], WALLB = [150, 146, 140];
  // брус-призма: центр (cx, cz), ось u — вдоль, a/b — полудлина/полуширина, от y0 до y1
  function prism(G, cx, cz, ux, uz, a, b, y0, y1, col, top = true) {
    const vx = -uz, vz = ux, P4 = [[a, -b], [a, b], [-a, b], [-a, -b]].map(([p, q]) => [cx + ux * p + vx * q, cz + uz * p + vz * q]);
    for (let k = 0; k < 4; k++) { const [px, pz] = P4[k], [qx, qz] = P4[(k + 1) % 4]; face(G, [[px, y0, pz], [qx, y0, qz], [qx, y1, qz], [px, y1, pz]], col, 255); }
    if (top) face(G, P4.map(([px, pz]) => [px, y1, pz]), col, 255);
  }
  // Мост, эстакада, путепровод. Низкие участки (съезды до ~3,6 м) — сплошные подпорные стенки до
  // земли (насыпь), высокие — толстая плита с балкой снизу на опорах-«молотках»; по краям —
  // бетонные парапеты со светлым верхом. metro — путепровод метро: узкая коробчатая балка на одиночных опорах.
  function bridgeDeck(G, l, H, w, metro) {
    const n = l.length / 2, N = edgeNormals(l), hw = w / 2, LOW = 3.6, step = metro ? 30 : 24;
    let acc = step / 2;
    for (let i = 0; i < n - 1; i++) {
      const h0 = H[i], h1 = H[i + 1]; if (Math.max(h0, h1) < 0.12) continue;
      const x0 = l[i * 2], z0 = l[i * 2 + 1], x1 = l[i * 2 + 2], z1 = l[i * 2 + 3];
      const E = (k, off, s) => [l[k * 2] + N[k * 2] * off * s, l[k * 2 + 1] + N[k * 2 + 1] * off * s];
      const low = Math.min(h0, h1) < LOW;
      for (const s of [1, -1]) {
        const [ax, az] = E(i, hw, s), [bx, bz] = E(i + 1, hw, s);
        if (low) { // подпорная стенка насыпи с цоколем
          face(G, [[ax, h0 + 0.2, az], [bx, h1 + 0.2, bz], [bx, 0.6, bz], [ax, 0.6, az]], WALL, 255);
          face(G, [[ax, 0.6, az], [bx, 0.6, bz], [bx, 0, bz], [ax, 0, az]], WALLB, 255);
        } else {
          face(G, [[ax, h0 + 0.2, az], [bx, h1 + 0.2, bz], [bx, h1 - 0.75, bz], [ax, h0 - 0.75, az]], DECK, 255);   // торец плиты
          const [cx, cz] = E(i, hw * 0.62, s), [dx, dz] = E(i + 1, hw * 0.62, s);                                     // балка под плитой
          face(G, [[cx, h0 - 0.75, cz], [dx, h1 - 0.75, dz], [dx, h1 - 1.9, dz], [cx, h0 - 1.9, cz]], GIRDER, 255);
          const [ex, ez] = E(i, hw, s), [fx, fz] = E(i + 1, hw, s);                                                   // нижняя кромка консоли
          face(G, [[ex, h0 - 0.75, ez], [fx, h1 - 0.75, fz], [dx, h1 - 0.75, dz], [cx, h0 - 0.75, cz]], k3c(DECK, 0.8), 255);
        }
        // парапет: наружная и внутренняя грани, светлый верх
        const [px, pz] = E(i, hw - 0.35, s), [qx, qz] = E(i + 1, hw - 0.35, s), ph = metro ? 1.6 : 1.05;
        face(G, [[ax, h0 + 0.2 + ph, az], [bx, h1 + 0.2 + ph, bz], [bx, h1 + 0.2, bz], [ax, h0 + 0.2, az]], PARA, 255);
        face(G, [[px, h0 + 0.2 + ph, pz], [qx, h1 + 0.2 + ph, qz], [qx, h1 + 0.2, qz], [px, h0 + 0.2, pz]], k3c(PARA, 0.92), 255);
        face(G, [[ax, h0 + 0.2 + ph, az], [bx, h1 + 0.2 + ph, bz], [qx, h1 + 0.2 + ph, qz], [px, h0 + 0.2 + ph, pz]], CAPC, 255);
      }
      // опоры
      const L2 = Math.hypot(x1 - x0, z1 - z0); if (!L2) continue;
      const ux = (x1 - x0) / L2, uz = (z1 - z0) / L2, vx = -uz, vz = ux;
      for (let t = acc; t < L2; t += step) {
        const h = h0 + (h1 - h0) * t / L2; if (h < LOW) continue;
        const cx = x0 + ux * t, cz = z0 + uz * t, top = h - 1.9;
        if (!metro && w > 13) for (const q of [-0.3, 0.3]) prism(G, cx + vx * w * q, cz + vz * w * q, ux, uz, 0.75, 0.75, 0, top - 1, PILLAR, false);
        else prism(G, cx, cz, ux, uz, metro ? 0.9 : 0.8, metro ? 1.1 : 0.9, 0, top - 1, PILLAR, false);
        prism(G, cx, cz, ux, uz, 0.9, hw * 0.78, top - 1, top, k3c(PILLAR, 1.05));                                   // ригель-«молоток»
      }
      acc = ((acc - L2) % step + step) % step;
    }
  }
  const k3c = (c, k) => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
  // балластная призма под рельсами: откосы из щебня (верх рисует сама полоса пути)
  function railBed(G, l, H, w, hb) {
    const n = l.length / 2, N = edgeNormals(l), BAL = [118, 110, 102];
    for (let i = 0; i < n - 1; i++) {
      const h0 = H ? H[i] : 0, h1 = H ? H[i + 1] : 0; if (Math.max(h0, h1) > 0.3) continue;   // на мостах — без откосов
      for (const s of [1, -1]) {
        const T0 = [l[i * 2] + N[i * 2] * w / 2 * s, l[i * 2 + 1] + N[i * 2 + 1] * w / 2 * s], T1 = [l[i * 2 + 2] + N[i * 2 + 2] * w / 2 * s, l[i * 2 + 3] + N[i * 2 + 3] * w / 2 * s];
        const B0 = [l[i * 2] + N[i * 2] * (w / 2 + 0.9) * s, l[i * 2 + 1] + N[i * 2 + 1] * (w / 2 + 0.9) * s], B1 = [l[i * 2 + 2] + N[i * 2 + 2] * (w / 2 + 0.9) * s, l[i * 2 + 3] + N[i * 2 + 3] * (w / 2 + 0.9) * s];
        face(G, [[T0[0], hb + h0, T0[1]], [T1[0], hb + h1, T1[1]], [B1[0], 0.06 + h1, B1[1]], [B0[0], 0.06 + h0, B0[1]]], BAL, 255);
      }
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
  // подпорные стенки въезда в тоннель: растут вместе с глубиной спуска (дорога как бы уходит вниз),
  // сверху — светлая кромка
  function rampWalls(G, l, w, hs) {
    const n = l.length / 2, N = edgeNormals(l), hw = w / 2 + 0.5, wh = (k) => Math.max(0.9, Math.min(5.4, 0.9 - (hs ? hs[k] : 0) * 0.85));
    for (let i = 0; i < n - 1; i++) for (const s of [1, -1]) {
      const ax = l[i * 2] + N[i * 2] * hw * s, az = l[i * 2 + 1] + N[i * 2 + 1] * hw * s, bx = l[i * 2 + 2] + N[i * 2 + 2] * hw * s, bz = l[i * 2 + 3] + N[i * 2 + 3] * hw * s;
      const cx = l[i * 2] + N[i * 2] * (hw + 0.45) * s, cz = l[i * 2 + 1] + N[i * 2 + 1] * (hw + 0.45) * s, dx = l[i * 2 + 2] + N[i * 2 + 2] * (hw + 0.45) * s, dz = l[i * 2 + 3] + N[i * 2 + 3] * (hw + 0.45) * s;
      const h0 = wh(i), h1 = wh(i + 1);
      face(G, [[ax, 0, az], [bx, 0, bz], [bx, h1, bz], [ax, h0, az]], [184, 180, 172], 255);
      face(G, [[cx, 0, cz], [dx, 0, dz], [dx, h1, dz], [cx, h0, cz]], [164, 160, 152], 255);
      face(G, [[ax, h0, az], [bx, h1, bz], [dx, h1, dz], [cx, h0, cz]], [222, 218, 210], 255);
    }
  }

  // ---------- железная дорога и метро ----------
  // «висячие» концы рельсовых линий: рядом нет другой рельсовой линии и это не край тайла
  function railEnds(L, T) {
    const R = [], bb = new Map();
    L.forEach(([cls, fl, l], i) => {
      if (cls !== 9 && cls !== 10) return; R.push(i);
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let k = 0; k < l.length; k += 2) { x0 = Math.min(x0, l[k]); x1 = Math.max(x1, l[k]); z0 = Math.min(z0, l[k + 1]); z1 = Math.max(z1, l[k + 1]); }
      bb.set(i, [x0 - 3, z0 - 3, x1 + 3, z1 + 3]);
    });
    const near = (i, x, z) => {
      for (const j of R) {
        if (j === i) continue; const b = bb.get(j); if (x < b[0] || z < b[1] || x > b[2] || z > b[3]) continue;
        const l = L[j][2];
        for (let k = 0; k + 3 < l.length; k += 2) {
          const ax = l[k], az = l[k + 1], dx = l[k + 2] - ax, dz = l[k + 3] - az, q = dx * dx + dz * dz;
          const t = q ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0;
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 2.5) return true;
        }
      }
      return false;
    };
    const dead = new Map();
    for (const i of R) { const l = L[i][2]; dead.set(i, [0, l.length - 2].map((k) => !(l[k] < 2 || l[k + 1] < 2 || l[k] > T - 2 || l[k + 1] > T - 2) && !near(i, l[k], l[k + 1]))); }
    return dead;
  }
  // мост метро, обрывающийся без продолжения, — это выход линии на поверхность в крытой галерее
  // (так в Ташкенте метро пересекает каналы: у телебашни, у Анхора, у Салара)
  function galleries(L, dead) {
    const key = (x, z) => Math.round(x * 2) + "," + Math.round(z * 2), par = new Map(), at = new Map();
    const find = (i) => { while (par.get(i) !== i) { par.set(i, par.get(par.get(i))); i = par.get(i); } return i; };
    L.forEach(([cls, fl, l], i) => {
      if (cls !== 10 || !(fl & 2)) return; par.set(i, i);
      for (const j of [0, l.length - 2]) { const k = key(l[j], l[j + 1]); if (at.has(k)) par.set(find(i), find(at.get(k))); else at.set(k, i); }
    });
    const open = new Set(); for (const i of par.keys()) if (dead.get(i).some(Boolean)) open.add(find(i));
    return new Set([...par.keys()].filter((i) => open.has(find(i))));
  }
  const GAL_W = [198, 194, 186], GAL_RIB = [216, 212, 204], GAL_ROOF = [150, 150, 148], GAL_SKY = [188, 204, 212], GAL_WIN = [58, 68, 80], GRASS = [104, 128, 72];
  function gallery(G, l, d0, d1) {
    const n = l.length / 2, N = edgeNormals(l), hw = 3.3, H0 = 6.2;
    const P = (k, s, w) => [l[k * 2] + N[k * 2] * w * s, l[k * 2 + 1] + N[k * 2 + 1] * w * s];
    let acc = 3;
    for (let i = 0; i < n - 1; i++) {
      for (const s of [1, -1]) {
        const [ax, az] = P(i, s, hw), [bx, bz] = P(i + 1, s, hw), [cx, cz] = P(i, s, hw + 0.06), [ex, ez] = P(i + 1, s, hw + 0.06);
        face(G, [[ax, 0, az], [bx, 0, bz], [bx, H0, bz], [ax, H0, az]], GAL_W, 255);
        face(G, [[cx, 3.0, cz], [ex, 3.0, ez], [ex, 4.3, ez], [cx, 4.3, cz]], GAL_WIN, 255);           // ленточное окно
      }
      const [ax, az] = P(i, 1, hw + 0.4), [bx, bz] = P(i + 1, 1, hw + 0.4), [cx, cz] = P(i + 1, -1, hw + 0.4), [ex, ez] = P(i, -1, hw + 0.4);
      face(G, [[ax, H0, az], [bx, H0, bz], [cx, H0, cz], [ex, H0, ez]], GAL_ROOF, 255);
      const [fx, fz] = P(i, 1, 0.8), [gx, gz] = P(i + 1, 1, 0.8), [hx, hz] = P(i + 1, -1, 0.8), [jx, jz] = P(i, -1, 0.8);
      face(G, [[fx, H0 + 0.35, fz], [gx, H0 + 0.35, gz], [hx, H0 + 0.35, hz], [jx, H0 + 0.35, jz]], GAL_SKY, 255); // световой фонарь
      // рёбра-пилястры каждые 6 м
      const x0 = l[i * 2], z0 = l[i * 2 + 1], dx = l[i * 2 + 2] - x0, dz = l[i * 2 + 3] - z0, L2 = Math.hypot(dx, dz); if (!L2) continue;
      const ux = dx / L2, uz = dz / L2, vx = -uz, vz = ux;
      for (let t = acc; t < L2; t += 6) for (const s of [1, -1]) {
        const cx2 = x0 + ux * t + vx * (hw + 0.12) * s, cz2 = z0 + uz * t + vz * (hw + 0.12) * s;
        face(G, [[cx2 - ux * 0.3, 0, cz2 - uz * 0.3], [cx2 + ux * 0.3, 0, cz2 + uz * 0.3], [cx2 + ux * 0.3, H0 + 0.2, cz2 + uz * 0.3], [cx2 - ux * 0.3, H0 + 0.2, cz2 - uz * 0.3]], GAL_RIB, 255);
      }
      acc = ((acc - L2) % 6 + 6) % 6;
    }
    // там, где галерея уходит под землю, — портал и травяная насыпь над тоннелем
    for (const [d, a, b] of [[d0, 0, 2], [d1, l.length - 2, l.length - 4]]) {
      if (!d) continue;
      const x = l[a], z = l[a + 1], L2 = Math.hypot(x - l[b], z - l[b + 1]) || 1, ux = (x - l[b]) / L2, uz = (z - l[b + 1]) / L2;
      portalMound(G, x, z, ux, uz, hw + 1.4, H0 + 1.2, GAL_W);
    }
  }
  // торцевая стенка поперёк пути и насыпь за ней (u — наружу, туда, где путь уходит под землю)
  function portalMound(G, x, z, ux, uz, hw, h, col) {
    const vx = -uz, vz = ux, Lm = 18, w2 = hw + 2;
    face(G, [[x - vx * hw, 0, z - vz * hw], [x + vx * hw, 0, z + vz * hw], [x + vx * hw, h, z + vz * hw], [x - vx * hw, h, z - vz * hw]], col, 255);
    face(G, [[x - vx * (hw + 0.3) - ux * 0.4, h, z - vz * (hw + 0.3) - uz * 0.4], [x + vx * (hw + 0.3) - ux * 0.4, h, z + vz * (hw + 0.3) - uz * 0.4], [x + vx * (hw + 0.3) + ux * 0.6, h, z + vz * (hw + 0.3) + uz * 0.6], [x - vx * (hw + 0.3) + ux * 0.6, h, z - vz * (hw + 0.3) + uz * 0.6]], [214, 210, 202], 255);
    const tx = x + ux * 0.6, tz = z + uz * 0.6, ex = x + ux * Lm, ez = z + uz * Lm;
    face(G, [[tx - vx * hw, h - 0.1, tz - vz * hw], [tx + vx * hw, h - 0.1, tz + vz * hw], [ex + vx * w2, 0.02, ez + vz * w2], [ex - vx * w2, 0.02, ez - vz * w2]], GRASS, 255);
    for (const s of [1, -1]) face(G, [[tx + vx * hw * s, h - 0.1, tz + vz * hw * s], [ex + vx * w2 * s, 0.02, ez + vz * w2 * s], [tx + vx * (hw + 3) * s, 0.02, tz + vz * (hw + 3) * s]], [92, 114, 64], 255);
  }
  // тупиковый упор: бетонный блок и красно-белый брус поперёк пути
  // ---------- спортплощадки (футбол, теннис, баскетбол, волейбол) ----------
  // sp: 0 футбол, 1 теннис, 2 баскетбол, 3 волейбол, 4 мультиспорт, 5 прочее;
  // sf: 0 трава, 1 искусственный газон, 2 грунт («клей»), 3 хард/асфальт, 4 песок/земля, 255 — не указано
  const SPORT_COL = {
    turf: [70, 150, 74], grass: [96, 146, 70], clay: [186, 96, 62], hardB: [52, 100, 164], hardG: [70, 128, 86], asph: [96, 98, 104], sand: [196, 176, 132], rub: [176, 76, 64],
  };
  function courtColors(sp, sf) {
    let base, inner;
    if (sp === 1) { if (sf === 2) { base = SPORT_COL.clay; inner = SPORT_COL.clay; } else if (sf === 0 || sf === 1) { base = SPORT_COL.turf; inner = SPORT_COL.turf; } else { base = SPORT_COL.hardG; inner = SPORT_COL.hardB; } }
    else if (sp === 0) { base = sf === 0 ? SPORT_COL.grass : sf === 3 ? SPORT_COL.asph : sf === 4 ? SPORT_COL.sand : SPORT_COL.turf; inner = base; }
    else if (sp === 3 && sf === 4) { base = inner = SPORT_COL.sand; }
    else if (sp === 2 || sp === 3 || sp === 4) { base = sf === 1 || sf === 0 ? SPORT_COL.turf : SPORT_COL.hardG; inner = sf === 1 || sf === 0 ? SPORT_COL.turf : sp === 2 ? SPORT_COL.rub : SPORT_COL.hardB; }
    else { base = inner = sf === 3 ? SPORT_COL.asph : SPORT_COL.turf; }
    const key = "court" + base.join("_");
    if (!GCOL[key]) GCOL[key] = base;
    return { base, inner, key };
  }
  const LINE = [236, 236, 228], FENCE = [44, 70, 54], POST = [200, 202, 204];
  function court(Gg, Gb, fp, sp, C) {
    const o = obb(fp); if (!o || o.L < 6 || o.Wd < 4) { polyFill(Gg, [fp], 0.066, C.base, 0); return; }
    polyFill(Gg, [fp], 0.066, C.base, 0);
    const R = (a0, a1, b0, b1, y, col) => { // прямоугольник в осях площадки: a — вдоль, b — поперёк
      const P = (a, b) => [o.cx + o.ux * a + o.vx * b, y, o.cz + o.uz * a + o.vz * b];
      face(Gg, [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], col, 255);
    };
    const ring = (ca, cb, r, w, y, col, from = 0, to = Math.PI * 2, n = 18) => { for (let k = 0; k < n; k++) { const t0 = from + (to - from) * k / n, t1 = from + (to - from) * (k + 1) / n; const P = (t, rr) => [o.cx + o.ux * (ca + Math.cos(t) * rr) + o.vx * (cb + Math.sin(t) * rr), y, o.cz + o.uz * (ca + Math.cos(t) * rr) + o.vz * (cb + Math.sin(t) * rr)]; face(Gg, [P(t0, r - w / 2), P(t1, r - w / 2), P(t1, r + w / 2), P(t0, r + w / 2)], col, 255); } };
    const frame = (A, B, w, y, col) => { R(-A, A, -B, -B + w, y, col); R(-A, A, B - w, B, y, col); R(-A, -A + w, -B, B, y, col); R(A - w, A, -B, B, y, col); };
    const P3 = (a, b) => [o.cx + o.ux * a + o.vx * b, o.cz + o.uz * a + o.vz * b];
    const post = (a, b, h, col = POST, s = 0.09) => { const [x, z] = P3(a, b); for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = o.ux * dx + o.vx * dz, nz = o.uz * dx + o.vz * dz, tx = -nz, tz = nx; face(Gb, [[x + nx * s - tx * s, 0, z + nz * s - tz * s], [x + nx * s + tx * s, 0, z + nz * s + tz * s], [x + nx * s + tx * s, h, z + nz * s + tz * s], [x + nx * s - tx * s, h, z + nz * s - tz * s]], col, 255); } };
    const bar = (a0, b0, a1, b1, y0, y1, col) => { const [x0, z0] = P3(a0, b0), [x1, z1] = P3(a1, b1); face(Gb, [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], col, 255); };
    const HL = o.L / 2, HW = o.Wd / 2, yl = 0.072;
    if (sp === 1) { // теннис: один или несколько кортов рядом (по ширине контура)
      const k = Math.max(1, Math.round(o.Wd / 17)), cw = o.Wd / k, s = Math.min(1, (o.L - 3) / 23.77, (cw - 2) / 10.97);
      const A = 11.885 * s, B = 5.485 * s, Bs = 4.115 * s, Sv = 6.4 * s;
      for (let i = 0; i < k; i++) {
        const cb = -HW + cw * (i + 0.5), Rb = (a0, a1, b0, b1, col) => R(a0, a1, cb + b0, cb + b1, yl, col);
        Rb(-A, A, -B, B, C.inner);
        const w = 0.1;
        Rb(-A, A, -B, -B + w, LINE); Rb(-A, A, B - w, B, LINE); Rb(-A, A, -Bs, -Bs + w, LINE); Rb(-A, A, Bs - w, Bs, LINE);
        Rb(-A, -A + w * 1.5, -B, B, LINE); Rb(A - w * 1.5, A, -B, B, LINE); Rb(-Sv, -Sv + w, -Bs, Bs, LINE); Rb(Sv - w, Sv, -Bs, Bs, LINE); Rb(-Sv, Sv, -w / 2, w / 2, LINE);
        // сетка
        post(0, cb - B - 0.6, 1.07, [60, 60, 64]); post(0, cb + B + 0.6, 1.07, [60, 60, 64]);
        bar(0, cb - B - 0.6, 0, cb + B + 0.6, 0.15, 0.95, [36, 38, 40]); bar(0, cb - B - 0.6, 0, cb + B + 0.6, 0.95, 1.07, LINE);
        if (i) R(-HL + 0.5, HL - 0.5, -HW + cw * i - 0.15, -HW + cw * i + 0.15, yl, LINE);
      }
    } else if (sp === 0) { // футбол
      const w = o.L > 60 ? 0.15 : 0.12, ia = HL - 1, ib = HW - 1;
      frame(ia, ib, w, yl, LINE); R(-w / 2, w / 2, -ib, ib, yl, LINE);
      ring(0, 0, Math.min(9.15, ib * 0.35), w, yl, LINE);
      const pd = Math.min(16.5, ia * 0.3), pw = Math.min(20.16, ib * 0.6), gw = Math.min(3.66, ib * 0.22), gh = o.L > 60 ? 2.44 : 2.0;
      for (const s of [-1, 1]) {
        R(s * ia - s * pd - w / 2, s * ia - s * pd + w / 2, -pw, pw, yl, LINE); R(Math.min(s * ia, s * (ia - pd)), Math.max(s * ia, s * (ia - pd)), -pw, -pw + w, yl, LINE); R(Math.min(s * ia, s * (ia - pd)), Math.max(s * ia, s * (ia - pd)), pw - w, pw, yl, LINE);
        // ворота
        post(s * ia, -gw, gh, [244, 244, 240]); post(s * ia, gw, gh, [244, 244, 240]); bar(s * ia, -gw, s * ia, gw, gh - 0.12, gh, [244, 244, 240]);
        bar(s * (ia + 1.2), -gw, s * (ia + 1.2), gw, 0, gh * 0.8, [190, 196, 196]);
      }
    } else if (sp === 2 || sp === 3 || sp === 4) { // баскетбол, волейбол, мультиспорт
      const sB = sp === 3 ? Math.min(1, (o.L - 2) / 18, (o.Wd - 2) / 9) : Math.min(1, (o.L - 2) / 28, (o.Wd - 2) / 15);
      const A = (sp === 3 ? 9 : 14) * sB, B = (sp === 3 ? 4.5 : 7.5) * sB, w = 0.1;
      R(-A, A, -B, B, yl, C.inner); frame(A, B, w, yl + 0.002, LINE); R(-w / 2, w / 2, -B, B, yl + 0.002, LINE);
      if (sp === 3) { post(0, -B - 0.8, 2.5, [70, 70, 74]); post(0, B + 0.8, 2.5, [70, 70, 74]); bar(0, -B - 0.8, 0, B + 0.8, 1.6, 2.43, [40, 42, 44]); }
      else {
        ring(0, 0, 1.8 * sB, w, yl + 0.002, LINE);
        for (const s of [-1, 1]) {
          ring(s * A, 0, 6.75 * sB, w, yl + 0.002, LINE, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, 12);
          post(s * (A + 0.6), 0, 3.4, [70, 70, 74], 0.08);
          bar(s * (A - 0.4), -0.9, s * (A - 0.4), 0.9, 2.9, 3.95, [244, 244, 240]);
        }
      }
    } else frame(HL - 0.8, HW - 0.8, 0.12, yl, LINE);
    // ограждение: сетка-рабица на столбах (небольшие площадки и все корты)
    if (sp !== 0 || o.L * o.Wd < 3000) {
      const hF = sp === 1 ? 3.6 : 3.0, n = fp.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, x0 = fp[i * 2], z0 = fp[i * 2 + 1], x1 = fp[j * 2], z1 = fp[j * 2 + 1], Le = Math.hypot(x1 - x0, z1 - z0); if (Le < 0.5) continue;
        const m = Math.max(1, Math.round(Le / 3.2));
        for (let k = 0; k < m; k++) { const t = k / m, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; face(Gb, [[x - 0.06, 0, z], [x + 0.06, 0, z], [x + 0.06, hF, z], [x - 0.06, hF, z]], FENCE, 255); face(Gb, [[x, 0, z - 0.06], [x, 0, z + 0.06], [x, hF, z + 0.06], [x, hF, z - 0.06]], FENCE, 255); }
        face(Gb, [[x0, hF - 0.12, z0], [x1, hF - 0.12, z1], [x1, hF, z1], [x0, hF, z0]], FENCE, 255);
        face(Gb, [[x0, 1.15, z0], [x1, 1.15, z1], [x1, 1.25, z1], [x0, 1.25, z0]], FENCE, 255);
      }
    }
  }
  function bufferStop(G, x, z, ux, uz) {
    const vx = -uz, vz = ux;
    const blk = (a0, a1, b, y0, y1, col) => {
      const P4 = [[a0, -b], [a1, -b], [a1, b], [a0, b]].map(([a, c]) => [x + ux * a + vx * c, z + uz * a + vz * c]);
      for (let k = 0; k < 4; k++) { const [px, pz] = P4[k], [qx, qz] = P4[(k + 1) % 4]; face(G, [[px, y0, pz], [qx, y0, qz], [qx, y1, qz], [px, y1, pz]], col, 255); }
      face(G, P4.map(([px, pz]) => [px, y1, pz]), col, 255);
    };
    blk(0.2, 1.6, 1.3, 0, 0.8, [120, 116, 110]);
    blk(-0.1, 0.2, 1.5, 0.6, 1.2, [200, 52, 44]); blk(-0.12, 0.22, 0.45, 0.6, 1.22, [236, 236, 232]);
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
  // Сблокированные здания (стоят вплотную, общие вершины контура) — один дом или квартал из корпусов:
  // в небольшой группе стены берут цвет самого большого здания (с лёгким разбросом яркости),
  // плоские крыши — общий цвет. Иначе квартал выглядит лоскутным одеялом со швами на стыках.
  // Большие цепочки домов (махалли) не трогаем — там пестрота настоящая.
  function harmonize(BL) {
    const par = BL.map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const grid = new Map(), C = 0.7;
    BL.forEach((b, i) => {
      const fp = b.fp;
      for (let k = 0; k < fp.length; k += 2) {
        const gx = Math.round(fp[k] / C), gz = Math.round(fp[k + 1] / C);
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
          const l = grid.get((gx + a) + "," + (gz + c)); if (!l) continue;
          for (const [j, x, z] of l) if (j !== i && Math.abs(x - fp[k]) < 0.6 && Math.abs(z - fp[k + 1]) < 0.6) { const ra = find(i), rb = find(j); if (ra !== rb) par[ra] = rb; }
        }
        const key = gx + "," + gz; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push([i, fp[k], fp[k + 1]]);
      }
    });
    const groups = new Map();
    BL.forEach((b, i) => { if (b.roof === 7 || b.roof === 4 || b.roof === 5) return; const r = find(i); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(i); });
    const area = (fp) => { let a = 0; const m = fp.length / 2; for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += fp[i * 2] * fp[j * 2 + 1] - fp[j * 2] * fp[i * 2 + 1]; } return Math.abs(a) / 2; };
    const shade = (c, k) => (clamp(((c >> 16) & 255) * k) << 16) | (clamp(((c >> 8) & 255) * k) << 8) | clamp((c & 255) * k);
    for (const g of groups.values()) {
      if (g.length < 2 || g.length > 16) continue;
      let rep = g[0], best = -1; for (const i of g) { const a = area(BL[i].fp); if (a > best) { best = a; rep = i; } }
      const R = BL[rep];
      for (const i of g) {
        if (i === rep) continue;
        const b = BL[i];
        b.wall = shade(R.wall, 0.97 + (hash(i, 7) % 7) / 100);
        if (b.roof === 0 && R.roof === 0) b.rc = R.rc;
      }
    }
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
    const RC2 = [rr, rg, rb], Aabs = Math.abs(A) / 2;
    if (roof === 1 || roof === 2 || roof === 3) {
      const o = obb(fp);
      // скатная крыша — только над (почти) прямоугольным домом: над Г-образным или неровным контуром
      // крыша по описанному прямоугольнику нависала бы над двором и врезалась в соседей
      if (o && o.Wd > 1.5 && n <= 8 && Aabs / (o.L * o.Wd) > 0.86) {
        const ov = 0.12, L = o.L / 2 + ov, Wd = o.Wd / 2 + ov, y0 = h, y1 = h + rh;
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
      roof = 0; // неровный контур — плоская крыша с бортиком
    }
    // парапет по краю плоской крыши (светлый бортик)
    if (roof === 0 && (h > 7 || n > 4)) {
      const pr = clamp(rr * 1.18 + 14), pg = clamp(rg * 1.18 + 14), pb = clamp(rb * 1.18 + 14), ph = h > 7 ? 0.7 : 0.35;
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
    } else if (roof === 0 && n >= 10 && Aabs > 250) {
      // круглое здание (цирк, павильоны) — пологий купол вместо плоской крыши
      let P = 0, cx = 0, cz = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; P += Math.hypot(fp[j * 2] - fp[i * 2], fp[j * 2 + 1] - fp[i * 2 + 1]); cx += fp[i * 2]; cz += fp[i * 2 + 1]; }
      if (4 * Math.PI * Aabs / (P * P) > 0.86) dome(G, cx / n, h, cz / n, Math.sqrt(Aabs / Math.PI) * 0.94, 0.32, [clamp(rr * 0.6 + 70), clamp(rg * 0.6 + 74), clamp(rb * 0.6 + 80)]);
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
    const out = { lines: [], trees: null, signals: null, places: [], lamps: null, bcount: 0 }, courts = [];
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
    let tag, OV = null;
    while ((tag = u8()) !== 0 && P < B.length) {
      if (tag === 7) { // сквозные высоты мостов и тоннелей у краёв тайла
        OV = new Map();
        for (let n = vr(); n > 0; n--) { const i = vr(), m = vr(), h = new Float32Array(m); for (let j = 0; j < m; j++) h[j] = sv() / 10; OV.set(i, h); }
      } else if (tag === 1) {
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
        const RD = railEnds(L, T), GL = galleries(L, RD);
        // наземный кусок метро, оборванный с обеих сторон, — подземный участок без отметки тоннеля в OSM
        const hiddenMetro = (f) => L[f][0] === 10 && !(L[f][1] & 2) && RD.get(f)[0] && RD.get(f)[1];
        if (far) {
          const PH = profiles(L, T, OV);
          L.forEach(([cls, fl, l], f) => {
            if (GL.has(f)) { // крытая галерея метро — крыша в текстуре
              const N = edgeNormals(l), m = l.length / 2, fp = new Float32Array(m * 4);
              for (let i = 0; i < m; i++) { fp[i * 2] = l[i * 2] + N[i * 2] * 3.7; fp[i * 2 + 1] = l[i * 2 + 1] + N[i * 2 + 1] * 3.7; const j = (m * 2 - 1 - i) * 2; fp[j] = l[i * 2] - N[i * 2] * 3.7; fp[j + 1] = l[i * 2 + 1] - N[i * 2 + 1] * 3.7; }
              rB.push([fp, 6.2, (GAL_ROOF[0] << 16) | (GAL_ROOF[1] << 8) | GAL_ROOF[2], false]);
              return;
            }
            if (hiddenMetro(f)) return;
            if (!(fl & 8)) rL.push([cls, fl, l]);
            if (cls <= 5) out.lines.push({ cls, fl, p: l, h: PH[f] });
            if (cls <= 4 && !(fl & 8)) lampsAlong(l, cls, fl, PH[f]);
          });
          continue;
        }
        // порядок: тротуары → вода → асфальт → разметка.
        // У каждого класса своя высота: крупная дорога всегда сверху, без мерцания на стыках.
        const PH = profiles(L, T, OV), skipJ = junctions(L);
        const ay = (cls) => (cls === 8 ? 0.12 : cls === 9 || cls === 10 ? 0.42 : 0.2 + (12 - Math.min(cls, 12)) * 0.006); // рельсы — на балластной призме
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
          if (GL.has(f)) { const d = RD.get(f); gallery(bld, l, d[0], d[1]); continue; }
          if (hiddenMetro(f)) continue;
          let H = PH[f];
          if (fl & 8) { // тоннель: видны только въезды, между порталами дорога уходит под землю
            const RR = runs(l, H, (h) => h > -2.4);
            for (const r of RR) {
              strip(roads, r.p, RW[cls], 0.17, RC[cls], false);
              rampWalls(bld, r.p, RW[cls], r.h);
              const m = r.p.length;
              // портал — на том конце, где начинается подземная часть
              const atStart = r.cut0, i0 = atStart ? 0 : m - 2, i1 = atStart ? 2 : m - 4;
              const dx = r.p[i0] - r.p[i1], dz = r.p[i0 + 1] - r.p[i1 + 1], L2 = Math.hypot(dx, dz) || 1;
              if (r.cut0 || r.h[r.h.length - 1] < -2) tunnelPortal(bld, r.p[i0], r.p[i0 + 1], dx / L2, dz / L2, RW[cls]);
            }
            // чем глубже спуск, тем темнее асфальт у портала
            for (const d of runs(l, H, (h) => h > -2.4 && h < -1.0)) strip(roads, d.p, RW[cls] - 0.3, 0.176, [RC[cls][0] * 0.62, RC[cls][1] * 0.62, RC[cls][2] * 0.66], false);
            if (cls <= 5) out.lines.push({ cls, fl, p: l, h: H });
            continue;
          }
          const y = ay(cls);
          strip(roads, l, RW[cls], y, RC[cls], cls <= 6, H);
          if (H && (fl & 2)) bridgeDeck(bld, l, H, cls <= 5 ? sideW(cls) : RW[cls] + 1.4, cls === 10);
          if (cls === 9 || cls === 10) railBed(bld, l, H, RW[cls], y);
          if (cls === 9 || cls === 10) { // рельсы и шпалы
            dashes(roads, l, 0, RW[cls] * 0.9, y + 0.01, [96, 80, 66], 0.35, 0.55, H);
            dashes(roads, l, 0.72, 0.14, y + 0.02, [60, 58, 58], 1000, 0, H); dashes(roads, l, -0.72, 0.14, y + 0.02, [60, 58, 58], 1000, 0, H);
            // тупики (станционные пути, депо) — упоры
            const d = RD.get(f), m = l.length;
            for (const [dd, a, b] of [[d[0], 0, 2], [d[1], m - 2, m - 4]]) {
              if (!dd || (H && Math.abs(H[a / 2]) > 0.3)) continue;
              const L2 = Math.hypot(l[a] - l[b], l[a + 1] - l[b + 1]) || 1;
              bufferStop(bld, l[a], l[a + 1], (l[a] - l[b]) / L2, (l[a + 1] - l[b + 1]) / L2);
            }
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
        const BL = [];
        for (let f = 0; f < n; f++) { const h = vr() / 10, mh = vr() / 10, roof = u8(), rh = vr() / 10, wall = u24(), rc = u24(), kind = u8(), fp = pts(); BL.push({ h, mh, roof, rh, wall, rc, kind, fp }); }
        if (msg.skipBld) continue;
        harmonize(BL);
        for (let f = 0; f < n; f++) {
          const { h, mh, roof, rh, wall, rc, kind, fp } = BL[f];
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
      } else if (tag === 8) { // спортплощадки: вид спорта, покрытие, контур
        const n = vr();
        for (let i = 0; i < n; i++) {
          const sp = u8(), sf = u8(), fp = pts(), C = courtColors(sp, sf);
          courts.push(fp);
          if (far) { rA.push([C.key, [fp], 0]); continue; }
          court(ground, bld, fp, sp, C);
        }
      } else break;
    }
    // деревья не растут на спортплощадках
    if (courts.length) {
      const bb = courts.map((fp) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < fp.length; i += 2) { x0 = Math.min(x0, fp[i]); x1 = Math.max(x1, fp[i]); z0 = Math.min(z0, fp[i + 1]); z1 = Math.max(z1, fp[i + 1]); } return [x0 - 1, z0 - 1, x1 + 1, z1 + 1]; });
      // крона до ~4,5 м: дерево у самого края тоже нависало бы над кортом
      const nearEdge = (fp, x, z, r) => { for (let i = 0, j = fp.length - 2; i < fp.length; j = i, i += 2) { const ax = fp[j], az = fp[j + 1], dx = fp[i] - ax, dz = fp[i + 1] - az, q = dx * dx + dz * dz, t = q ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0; if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true; } return false; };
      const inside = (fp, x, z) => { let c = false; for (let i = 0, j = fp.length - 2; i < fp.length; j = i, i += 2) { const xi = fp[i], zi = fp[i + 1], xj = fp[j], zj = fp[j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
      const keep = (tr) => {
        if (!tr) return tr; const o = [];
        for (let i = 0; i < tr.length; i += 3) { const x = tr[i], z = tr[i + 1]; let hit = false; for (let k = 0; k < courts.length && !hit; k++) { const b = bb[k]; if (x > b[0] - 4.5 && x < b[2] + 4.5 && z > b[1] - 4.5 && z < b[3] + 4.5 && (inside(courts[k], x, z) || nearEdge(courts[k], x, z, 4.5))) hit = true; } if (!hit) o.push(tr[i], tr[i + 1], tr[i + 2]); }
        return new Float32Array(o);
      };
      out.trees = keep(out.trees); treesRaw = keep(treesRaw);
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
