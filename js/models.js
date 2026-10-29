// =====================================================================
//  3D-модели достопримечательностей (собраны из примитивов three.js).
//  Каждая модель «садится» на реальный контур здания из OSM: центр,
//  разворот и размеры берутся из data/lm.js (см. tools/bake).
//  Геометрия каждой модели склеена в 1–3 меша (мало вызовов отрисовки).
// =====================================================================
(function () {
  const S = TPM.scene, T = TPM.tiles;
  const MD = TPM.models = { list: [], anim: [], decor: [] };
  let LMG = {};
  window.TPM_LM = (g) => { LMG = g; };

  // ---------------- палитра ----------------
  const P = {
    turq: [0.17, 0.62, 0.70], turq2: [0.11, 0.48, 0.58], cobalt: [0.16, 0.32, 0.64], sky: [0.42, 0.66, 0.86],
    sand: [0.80, 0.66, 0.46], sand2: [0.72, 0.57, 0.39], brick: [0.66, 0.40, 0.28], marble: [0.93, 0.92, 0.89], white: [0.88, 0.87, 0.84],
    conc: [0.76, 0.74, 0.70], grey: [0.56, 0.56, 0.56], dark: [0.16, 0.15, 0.16], niche: [0.22, 0.2, 0.24], gold: [0.90, 0.71, 0.28],
    bronze: [0.40, 0.30, 0.21], red: [0.78, 0.21, 0.17], green: [0.38, 0.56, 0.27], water: [0.25, 0.46, 0.60], wood: [0.45, 0.30, 0.18],
    glass: [0.35, 0.50, 0.62], yellow: [0.95, 0.74, 0.18], ochre: [0.84, 0.70, 0.50], roof: [0.42, 0.42, 0.44], pink: [0.88, 0.62, 0.66],
  };

  // ---------------- сборщик ----------------
  // суперэллипс: |x/a|^e + |z/b|^e = 1 (e=2 — эллипс, больше — «скруглённый прямоугольник»)
  function se(a, b, e, n, ph = 0) {
    const r = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + ph, c = Math.cos(t), s = Math.sin(t);
      r.push([a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)]);
    }
    return r;
  }
  const lerpR = (A, B, t) => A.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t]);
  class MB {
    constructor() { this.parts = []; this.glow = []; this.led = []; this.win = []; this.flag = []; this.show = []; }
    // балка между двумя точками (опоры, растяжки)
    beam(x0, y0, z0, x1, y1, z1, w, col, list = "parts", d = w) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
      const g = new THREE.BoxGeometry(w, L, d); g.translate(0, L / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)));
      g.translate(x0, y0, z0); this[list].push([g.index ? g.toNonIndexed() : g, col]); return this;
    }
    // вальмовая крыша над прямоугольником L×W (по оси x — конёк)
    hip(x, y, z, L, W, h, col, ry = 0) {
      const k = Math.max(0, (L - W) / 2), a = L / 2, b = W / 2;
      const v = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-k, h, 0], [k, h, 0]];
      const T = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [1, 2, 5], [3, 0, 4]], arr = [];
      const c = Math.cos(ry), s2 = Math.sin(ry);
      for (const t of T) for (const i of t) { const [px, py, pz] = v[i]; arr.push(x + px * c + pz * s2, y + py, z - px * s2 + pz * c); }
      return this.raw(arr, col);
    }
    // стены с «настоящими» окнами (как у городских домов: сетка окон, ночью часть светится)
    winRing(pts, y0, y1, col, id = 7) {
      let u = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], L = Math.hypot(x1 - x0, z1 - z0);
        this.win.push({ p: [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0], u: [u, 0, u + L, 0, u + L, y1 - y0, u, 0, u + L, y1 - y0, u, y1 - y0], col, id });
        u += L;
      }
      return this;
    }
    winBox(x, y, z, sx, sy, sz, col, ry = 0, id = 7, roofCol) {
      const c = Math.cos(ry), s2 = Math.sin(ry), P2 = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]].map(([a, b2]) => [x + a * c + b2 * s2, z - a * s2 + b2 * c]);
      this.winRing(P2, y, y + sy, col, id);
      return this.fan(P2.map(([px, pz]) => [px - x, pz - z]).map(([px, pz]) => [px, pz]), y + sy, roofCol || [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], "parts", y + sy, x, z);
    }
    raw(arr, col, list = "parts") { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); this[list].push([g, col]); return this; }
    // лента между двумя замкнутыми контурами (одинаковое число точек)
    loft(A, yA, B, yB, col, list, every = 1, col2) {
      const n = A.length;
      for (let k = 0; k < (col2 ? 2 : 1); k++) {
        const arr = [];
        for (let i = 0; i < n; i++) {
          if (col2 && (Math.floor(i / every) % 2) !== k) continue;
          const j = (i + 1) % n;
          arr.push(A[i][0], yA, A[i][1], A[j][0], yA, A[j][1], B[j][0], yB, B[j][1], A[i][0], yA, A[i][1], B[j][0], yB, B[j][1], B[i][0], yB, B[i][1]);
        }
        if (arr.length) this.raw(arr, k ? col2 : col, list);
      }
      return this;
    }
    fan(A, y, col, list, cy = y, ox = 0, oz = 0) { const arr = []; for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; arr.push(ox, cy, oz, A[i][0] + ox, y, A[i][1] + oz, A[j][0] + ox, y, A[j][1] + oz); } return this.raw(arr, col, list); }
    // ступенчатые трибуны от внешнего контура (Ao, yo) к внутреннему (Ai, yi)
    stands(Ao, yo, Ai, yi, rows, colOf) {
      for (let t = 0; t < rows; t++) {
        const a = lerpR(Ao, Ai, t / rows), b = lerpR(Ao, Ai, (t + 1) / rows), ya = yo + (yi - yo) * t / rows, yb = yo + (yi - yo) * (t + 1) / rows;
        const c = colOf(t, rows);
        this.loft(a, ya, b, ya, c); this.loft(b, ya, b, yb, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
      }
      return this;
    }
    add(geo, col, x, y, z, ry = 0, glow = false) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.rotateY(ry); g.translate(x, y, z);
      (glow ? this.glow : this.parts).push([g, col]);
      return this;
    }
    box(x, y, z, sx, sy, sz, col, ry = 0, glow) { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(0, sy / 2, 0); return this.add(g, col, x, y, z, ry, glow); }
    cyl(x, y, z, r, h, col, seg = 12, r2, glow) { const g = new THREE.CylinderGeometry(r2 ?? r, r, h, seg); g.translate(0, h / 2, 0); return this.add(g, col, x, y, z, 0, glow); }
    cone(x, y, z, r, h, col, seg = 10) { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return this.add(g, col, x, y, z); }
    sphere(x, y, z, r, col, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2)), col, x, y, z); }
    // купол: hk — вытянутость, onion — луковица, ribs — рёбра (чередование оттенков)
    dome(x, y, z, r, col, o = {}) {
      const hk = o.hk || 1, pts = [], N = 9;
      for (let i = 0; i <= N; i++) {
        const t = i / N * Math.PI / 2;
        let rr = Math.cos(t) * r, yy = Math.sin(t) * r * hk;
        if (o.onion) rr *= 1 + 0.28 * Math.sin(t * 2.0) - 0.15 * t;
        pts.push(new THREE.Vector2(Math.max(0.001, rr), yy));
      }
      const seg = o.seg || 20;
      const g = new THREE.LatheGeometry(pts, seg).toNonIndexed();
      g.translate(x, y, z);
      if (o.ribs) { // окраска рёбер по сегментам
        const c2 = o.ribs, pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i += 3) {
          const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 - x, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 - z;
          const k = Math.floor((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2) * seg) % 2 ? c2 : col;
          for (let j = 0; j < 3; j++) cols.set(k, (i + j) * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
        this.parts.push([g, null]);
      } else this.parts.push([g, col]);
      if (o.tip !== false) { this.cyl(x, y + r * hk * (o.onion ? 1.05 : 1) - 0.2, z, 0.25, r * 0.28 + 1.2, P.gold, 6); this.sphere(x, y + r * hk + r * 0.28 + 1.1, z, 0.55, P.gold, 6); }
      return this;
    }
    columns(cx, cz, y, R, n, r, h, col, a0 = 0, a1 = Math.PI * 2) {
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / n; this.cyl(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R, r, h, col, 6); }
      return this;
    }
    // портал-пештак, смотрит по оси +z локально (после поворота ry)
    pishtaq(x, z, w, d, h, col, tile, ry = 0) {
      const g = new MB();
      g.box(0, 0, 0, w, h, d, col);
      g.box(0, 0, d / 2 + 0.05, w * 0.56, h * 0.74, 0.3, P.niche);                // глубокая ниша
      g.box(0, h * 0.74, d / 2 + 0.05, w * 0.56, h * 0.08, 0.3, tile);             // стрельчатая «шапка» ниши
      g.box(0, h * 0.9, d / 2 + 0.06, w * 0.96, h * 0.08, 0.32, tile);              // изразцовый фриз
      g.box(-w * 0.43, 0, d / 2 + 0.06, w * 0.07, h * 0.9, 0.32, tile); g.box(w * 0.43, 0, d / 2 + 0.06, w * 0.07, h * 0.9, 0.32, tile);
      g.box(0, h * 0.3, d / 2 + 0.06, w * 0.3, h * 0.36, 0.34, P.cobalt);           // решётка-панджара
      for (const [geo, c] of g.parts) { geo.rotateY(ry); geo.translate(x, 0, z); this.parts.push([geo, c]); }
      return this;
    }
    minaret(x, z, r, h, col, tile, top = "dome") {
      this.cyl(x, 0, z, r * 1.25, 2.5, col, 12);
      this.cyl(x, 2.5, z, r * 0.8, h - 2.5, col, 12, r);
      for (const f of [0.3, 0.55, 0.8]) this.cyl(x, h * f, z, r * (1 - f * 0.2) + 0.08, 1.4, tile, 12);
      this.cyl(x, h, z, r * 1.25, 1.6, col, 12); this.cyl(x, h + 1.6, z, r * 0.75, 3.5, tile, 12);
      if (top === "dome") this.dome(x, h + 5.1, z, r * 0.85, P.turq, { hk: 1.2, seg: 12 }); else this.cone(x, h + 5.1, z, r * 0.9, r * 2.5, tile, 10);
      return this;
    }
    // ряд арочных ниш вдоль грани (локальная ось x, грань z = zf)
    niches(x0, x1, zf, y, h, step, w, ry = 0, col = P.niche) {
      for (let x = x0 + step / 2; x < x1; x += step) this.box(x, y, zf, w, h, 0.25, col, 0);
      return this;
    }
    build(name) {
      const mk = (list, mat) => {
        if (!list.length) return null;
        let n = 0; for (const [g] of list) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
        for (const [g, c] of list) {
          pos.set(g.attributes.position.array, o * 3);
          if (c) for (let i = 0; i < g.attributes.position.count; i++) col.set(c.length === 3 ? c : [c[0], c[1], c[2]], (o + i) * 3);
          else col.set(g.attributes.color.array, o * 3);
          o += g.attributes.position.count;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
        const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.name = name;
        return m;
      };
      let win = null;
      if (this.win.length) {
        let n = 0; for (const w of this.win) n += w.p.length / 3;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), uv = new Float32Array(n * 2); let o = 0;
        for (const w of this.win) {
          pos.set(w.p, o * 3);
          for (let i = 0; i < w.p.length / 3; i++) { col.set([w.col[0], w.col[1], w.col[2], (w.id % 250) / 255], (o + i) * 4); uv[(o + i) * 2] = w.u[i * 2] * 4; uv[(o + i) * 2 + 1] = w.u[i * 2 + 1] * 10; }
          o += w.p.length / 3;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 4)); geo.setAttribute("wuv", new THREE.BufferAttribute(uv, 2));
        geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
        win = new THREE.Mesh(geo, T.M.bld); win.castShadow = true; win.receiveShadow = true; win.name = name;
      }
      const body = mk(this.parts, MD.mat) || new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)]), MD.mat);
      if (win) { body.geometry.computeBoundingBox(); const bb = body.geometry.boundingBox.union(win.geometry.boundingBox); body.geometry.boundingBox = bb; body.geometry.boundingSphere = bb.getBoundingSphere(new THREE.Sphere()); }
      return { body, glow: mk(this.glow, MD.glowMat), led: mk(this.led, MD.ledMat), win,
        flag: mk(this.flag, MD.flagMat), show: mk(this.show, MD.showMat) };
    }
  }

  // ---------------- модели ----------------
  const M = {};
  M.chorsu = (b, o) => {
    const R = Math.min(o.L, o.W) * 0.43 || 38;
    b.cyl(0, 0, 0, R + 6, 1.2, P.conc, 32);
    b.cyl(0, 1.2, 0, R + 1, 8.5, P.sand, 32);
    b.cyl(0, 6.2, 0, R + 1.15, 1.6, P.cobalt, 32);
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; b.box(Math.cos(a) * (R + 1.05), 1.6, Math.sin(a) * (R + 1.05), 3.2, 4.2, 0.4, P.niche, -a + Math.PI / 2); }
    b.cyl(0, 9.7, 0, R - 1, 1.2, P.white, 32);
    b.dome(0, 10.9, 0, R - 1.5, P.turq, { hk: 0.42, seg: 32, ribs: P.turq2, tip: false });
    b.cyl(0, 10.9 + (R - 1.5) * 0.42 - 0.5, 0, 6, 3.5, P.white, 16); b.dome(0, 10.9 + (R - 1.5) * 0.42 + 3, 0, 5.2, P.turq, { hk: 0.8, seg: 16 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.3, rr = R + 14; b.cyl(Math.cos(a) * rr, 0, Math.sin(a) * rr, 6.5, 5, P.sand, 12); b.dome(Math.cos(a) * rr, 5, Math.sin(a) * rr, 5.6, P.turq, { hk: 0.6, seg: 12, tip: false }); }
    // торговые ряды с навесами
    const cols = [P.red, P.cobalt, P.yellow, P.green, P.white];
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, rr = R + 26; b.box(Math.cos(a) * rr, 0, Math.sin(a) * rr, 7, 3, 4, cols[i % 5], -a); }
  };
  M.kukeldash = (b, o) => {
    const L = o.L || 80, Wd = o.W || 56;
    b.box(0, 0, 0, L + 6, 1, Wd + 6, P.conc);
    b.box(0, 1, 0, L, 10, Wd, P.sand);
    b.box(0, 11, 0, L - 2, 0.8, Wd - 2, P.sand2);
    b.box(0, 11, 0, L - 22, 0.9, Wd - 22, P.green); // двор с деревьями (вид сверху)
    b.niches(-L / 2, L / 2, Wd / 2 + 0.05, 3, 5.5, 6, 3.4); b.niches(-L / 2, L / 2, -Wd / 2 - 0.05, 3, 5.5, 6, 3.4);
    b.pishtaq(0, Wd / 2 + 2, 22, 6, 23, P.sand2, P.turq);
    for (const s of [-1, 1]) { b.minaret(s * 12.5, Wd / 2 + 2, 2.1, 22, P.sand2, P.turq); }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { b.cyl(sx * (L / 2 - 1), 0, sz * (Wd / 2 - 1), 3.2, 14, P.sand2, 12); b.dome(sx * (L / 2 - 1), 14, sz * (Wd / 2 - 1), 3, P.turq, { hk: 0.9, seg: 12 }); }
    for (const s of [-1, 1]) { b.cyl(s * L * 0.28, 11.8, -Wd * 0.25, 5, 2, P.sand, 14); b.dome(s * L * 0.28, 13.8, -Wd * 0.25, 4.6, P.turq, { hk: 0.75, seg: 14 }); }
  };
  M.hazrati_imam = (b, o) => {
    const L = o.L || 77, Wd = o.W || 57;
    b.box(0, 0, 0, L + 30, 0.6, Wd + 30, [0.82, 0.78, 0.7]);
    b.box(0, 0.6, 0, L * 0.82, 14, Wd * 0.8, P.sand);
    b.box(0, 14.6, 0, L * 0.82, 0.9, Wd * 0.8, P.turq2);
    b.niches(-L * 0.41, L * 0.41, Wd * 0.4 + 0.05, 3, 7, 5, 3); b.niches(-L * 0.41, L * 0.41, -Wd * 0.4 - 0.05, 3, 7, 5, 3);
    // айван с деревянными колоннами вдоль фасада
    for (let x = -L * 0.38; x <= L * 0.38; x += 4.2) b.cyl(x, 0.6, Wd * 0.4 + 4, 0.45, 9, P.wood, 6);
    b.box(0, 9.6, Wd * 0.4 + 2, L * 0.8, 0.8, 5, P.wood);
    for (const s of [-1, 1]) { b.cyl(s * L * 0.18, 15.5, 0, 10.5, 4, P.sand, 20); b.dome(s * L * 0.18, 19.5, 0, 10, P.turq, { hk: 1.05, seg: 20, ribs: P.turq2 }); }
    b.pishtaq(0, Wd * 0.4 + 3, 20, 7, 28, P.sand2, P.turq);
    for (const s of [-1, 1]) b.minaret(s * 16, Wd * 0.4 + 6, 3.2, 50, P.sand, P.turq);
  };
  // ---------- гостиница «Узбекистан» (1974): тонкая пластина, изогнутая дугой (вогнутый фасад к скверу),
  //            сплошная кремовая решётка-панджара из глубоких ячеек, розово-красный пояс под верхним этажом,
  //            глухие торцы с вертикальными швами, стеклянный вестибюль с белым фризом, круглый козырёк входа,
  //            на крыше — объёмные золотые буквы HOTEL UZBEKISTAN ----------
  const FONT = { H: "10001100011000111111100011000110001", O: "01110100011000110001100011000101110", T: "11111001000010000100001000010000100",
    E: "11111100001000011110100001000011111", L: "10000100001000010000100001000011111", U: "10001100011000110001100011000101110",
    Z: "11111000010001000100010001000011111", B: "11110100011000111110100011000111110", K: "10001100101010011000101001001010001",
    I: "01110001000010000100001000010001110", S: "01111100001000001110000010000111110", A: "01110100011000111111100011000110001",
    N: "10001110011010110011100011000110001", R: "11110100011000111110101001001010001", P: "11110100011000111110100001000010000", " ": "00000000000000000000000000000000000" };
  MD.FONT = FONT;
  M.hotel_uz = (b, o) => {
    const L = o.L || 90, D = 17, H = o.h || 71.5, R = 115, CR = [0.93, 0.89, 0.8], BG = [0.58, 0.52, 0.45];
    const rf = R - D / 2, rb = R + D / 2, phi = Math.asin(L / 2 / rb), N = 28;
    const at = (r, a) => [r * Math.sin(a), R - r * Math.cos(a)];                                   // центр дуги — перед фасадом (+z)
    const arc = (r) => { const p = []; for (let i = 0; i <= N; i++) p.push(at(r, -phi + 2 * phi * i / N)); return p; };
    const rib = (A, yA, B2, yB, col, list = "parts") => {                                             // лента между двумя открытыми линиями
      const arr = [];
      for (let i = 0; i + 1 < A.length; i++) arr.push(A[i][0], yA, A[i][1], A[i + 1][0], yA, A[i + 1][1], B2[i + 1][0], yB, B2[i + 1][1], A[i][0], yA, A[i][1], B2[i + 1][0], yB, B2[i + 1][1], B2[i][0], yB, B2[i][1]);
      b.raw(arr, col, list);
    };
    const F = arc(rf), Bk = arc(rb), ring = F.concat(Bk.slice().reverse()), y0 = 8, yS = H - 7.2, yT = H - 1.4;
    // стилобат, лестница и вестибюль
    b.box(0, 0, 2, L + 18, 1.2, D + 26, [0.72, 0.66, 0.6]);
    for (let k = 0; k < 4; k++) b.box(0, 0, D / 2 + 13 + k * 0.9, 34, 1.2 - k * 0.3, 0.9, [0.78, 0.74, 0.7]);
    rib(arc(rf + 2.5), 1.2, arc(rf + 2.5), 6.6, [0.3, 0.38, 0.44], "glow"); rib(arc(rb - 2.5), 1.2, arc(rb - 2.5), 6.6, [0.3, 0.38, 0.44], "glow");
    rib(arc(rf - 0.3), 6.4, arc(rf - 0.3), y0, P.white); rib(arc(rb + 0.3), 6.4, arc(rb + 0.3), y0, P.white);
    for (let i = 2; i < N - 1; i += 3) { const [x, z] = at(rf + 1, -phi + 2 * phi * i / N); b.box(x, 1.2, z, 0.9, 5.4, 0.9, CR); }
    // корпус: стена с окнами за решёткой
    b.winRing(ring, y0, yT, BG, 74);
    // решётка-панджара: полочки на каждом этаже и частые рёбра (спереди и сзади)
    for (const [r, s] of [[rf, -1], [rb, 1]]) {
      const out = arc(r + s * 1.1), inn = arc(r);
      for (let y = y0, k = 0; y <= yS + 0.1; y += 1.825, k++) { rib(inn, y, out, y, CR); rib(out, y, out, y + (k % 2 ? 0.45 : 0.85), CR); }
      const len = 2 * phi * r, n = Math.round(len / 1.9);
      for (let k = 0; k <= n; k++) {
        const a = -phi + 2 * phi * k / n, [x, z] = at(r + s * 0.55, a);
        b.box(x, y0, z, k % 2 ? 0.3 : 0.45, yS - y0, 1.1, CR, -a);
      }
      rib(arc(r + s * 1.15), yS, arc(r + s * 1.15), yS + 1.3, [0.86, 0.43, 0.42]);                   // розово-красный пояс
      rib(arc(r + s * 0.4), yT, arc(r + s * 0.4), H, P.white);                                        // карниз
    }
    // глухие торцы с вертикальными швами
    for (const s of [-1, 1]) {
      const a = s * phi, [fx, fz] = at(rf, a), [bx, bz] = at(rb, a), tx = Math.cos(a) * s * 0.2, tz = Math.sin(a) * s * 0.2;
      b.raw([fx + tx, y0 - 1.6, fz + tz, bx + tx, y0 - 1.6, bz + tz, bx + tx, H, bz + tz, fx + tx, y0 - 1.6, fz + tz, bx + tx, H, bz + tz, fx + tx, H, fz + tz], [0.86, 0.8, 0.7]);
      for (let k = 1; k < 6; k++) { const t = k / 6, x = fx + (bx - fx) * t + tx * 1.6, z = fz + (bz - fz) * t + tz * 1.6; b.box(x, y0, z, 0.25, H - y0 - 1, 0.25, [0.72, 0.66, 0.58], -a); }
    }
    // кровля
    const tri = THREE.ShapeUtils.triangulateShape(ring.map((v) => new THREE.Vector2(v[0], v[1])), []), arr = [];
    for (const t of tri) for (const i of t) arr.push(ring[i][0], H, ring[i][1]);
    b.raw(arr, [0.62, 0.62, 0.62]);
    b.box(0, H, 0, 14, 3, 7, [0.7, 0.7, 0.7]);
    // круглый козырёк главного входа
    const [ex, ez] = at(rf - 9, 0);
    b.cyl(ex, 5.6, ez, 9.5, 0.9, P.white, 24); b.cyl(ex, 5.4, ez, 9.8, 0.3, [0.85, 0.8, 0.7], 24);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.6; b.cyl(ex + Math.cos(a) * 5.5, 1.2, ez + Math.sin(a) * 5.5, 0.35, 4.4, P.white, 8); }
    // золотые буквы HOTEL UZBEKISTAN на крыше по дуге фасада (ночью подсвечены)
    const txt = "HOTEL UZBEKISTAN", px = 0.85, rs = rf + 1.8, cols = txt.length * 6 - 1, GOLD = [0.95, 0.74, 0.28];
    for (let ci = 0; ci < txt.length; ci++) {
      const g = FONT[txt[ci]];
      for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 7; gy++) {
        if (g[gy * 5 + gx] !== "1") continue;
        const a = ((ci * 6 + gx) - cols / 2) * px / rs, [x, z] = at(rs, a);
        b.box(x, H + 1.6 + (6 - gy) * px, z, px, px, 0.35, GOLD, -a, true);
      }
    }
    for (let k = -4; k <= 4; k++) { const a = k * cols * px / 8 / rs, [x, z] = at(rs + 0.6, a); b.box(x, H, z, 0.3, 1.6 + 7 * px, 0.3, [0.4, 0.4, 0.42], -a); }
  };
  M.courage = (b) => {
    b.box(0, 0, 0, 34, 0.4, 34, [0.7, 0.68, 0.64]);
    b.box(-1.7, 0.4, 0, 3, 6, 6, [0.24, 0.22, 0.22]); b.box(1.7, 0.4, 0, 3, 6, 6, [0.24, 0.22, 0.22], 0.08); // треснувший куб
    b.box(0, 3, 3.05, 1.8, 1.8, 0.2, P.white); b.box(0, 3.8, 3.17, 0.15, 0.7, 0.1, P.dark); b.box(0.25, 3.8, 3.17, 0.5, 0.15, 0.1, P.dark);
    b.box(-9, 0.4, 6, 6, 1.6, 4, P.grey);
    b.box(-9, 2, 6, 1.6, 5, 1.2, [0.33, 0.31, 0.3]); b.sphere(-9, 7.6, 6, 0.75, [0.33, 0.31, 0.3], 8);
    b.box(-10.6, 2, 6.4, 1.1, 3.6, 0.9, [0.33, 0.31, 0.3]); b.box(-7.6, 3.4, 6, 1.6, 0.6, 0.6, [0.33, 0.31, 0.3]);
    b.box(9, 0.4, -6, 3, 14, 1.2, [0.62, 0.58, 0.52]);
  };
  // ---------- стадион «Пахтакор»: открытая чаша, синие кресла с жёлтыми полосами, голубая дорожка,
  //            4 решётчатые мачты освещения, резной павильон у западного входа ----------
  const BLUE = [0.17, 0.33, 0.68], YEL = [0.94, 0.77, 0.16];
  function pitch(b, L, W, y) { // поле 105×68: полосы покоса, разметка
    for (let i = 0; i < 10; i++) b.box(-L / 2 + L / 20 + i * L / 10, y, 0, L / 10, 0.05, W, i % 2 ? [0.30, 0.56, 0.24] : [0.36, 0.62, 0.28]);
    const ln = (x, z, sx, sz) => b.box(x, y + 0.05, z, sx, 0.03, sz, [0.93, 0.94, 0.92]);
    ln(0, -W / 2, L, 0.25); ln(0, W / 2, L, 0.25); ln(-L / 2, 0, 0.25, W); ln(L / 2, 0, 0.25, W); ln(0, 0, 0.25, W);
    for (const s of [-1, 1]) { ln(s * (L / 2 - 16.5), 0, 0.25, 40); ln(s * (L / 2 - 8.25), -20, 16.5, 0.25); ln(s * (L / 2 - 8.25), 20, 16.5, 0.25); b.box(s * (L / 2 + 0.6), y, 0, 1.2, 2.4, 7.3, [0.95, 0.95, 0.95]); }
    const ring = se(9.15, 9.15, 2, 20), ring2 = se(8.85, 8.85, 2, 20); b.loft(ring, y + 0.08, ring2, y + 0.08, [0.93, 0.94, 0.92]);
  }
  function mast(b, x, z, h, face) { // решётчатая мачта: 4 стойки + распорки + наклонный щит прожекторов
    const g = new MB(), w0 = 2.4, w1 = 1.1;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const geo = new THREE.CylinderGeometry(0.16, 0.22, h, 4); geo.translate(0, h / 2, 0);
      const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const k = pos.getY(i) / h, w = w0 + (w1 - w0) * k; pos.setX(i, pos.getX(i) + sx * w / 2); pos.setZ(i, pos.getZ(i) + sz * w / 2); }
      g.add(geo, [0.80, 0.81, 0.83], 0, 0, 0);
    }
    for (let y = 3; y < h - 2; y += 4.2) { const w = w0 + (w1 - w0) * y / h; g.box(0, y, w / 2, w, 0.22, 0.22, [0.7, 0.71, 0.74]); g.box(0, y, -w / 2, w, 0.22, 0.22, [0.7, 0.71, 0.74]); g.box(w / 2, y, 0, 0.22, 0.22, w, [0.7, 0.71, 0.74]); g.box(-w / 2, y, 0, 0.22, 0.22, w, [0.7, 0.71, 0.74]); }
    const panel = new THREE.BoxGeometry(10, 7.5, 0.8); panel.rotateX(-0.5); panel.translate(0, h + 3.2, 0.8);
    g.add(panel, [0.62, 0.64, 0.68], 0, 0, 0);
    const lamps = new THREE.BoxGeometry(9, 6.5, 0.3); lamps.rotateX(-0.5); lamps.translate(0, h + 3.2, 1.35);
    g.add(lamps, [1, 0.98, 0.9], 0, 0, 0, 0, true);
    for (const [geo, c] of g.parts) { geo.rotateY(face); geo.translate(x, 0, z); b.parts.push([geo, c]); }
    for (const [geo, c] of g.glow) { geo.rotateY(face); geo.translate(x, 0, z); b.glow.push([geo, c]); }
  }
  function pavilion(b, x, z, ry, sc = 1) { // резной павильон главного входа (кремовый камень, арки)
    const g = new MB(), C1 = [0.90, 0.85, 0.74], C2 = [0.82, 0.76, 0.64], GL = [0.30, 0.46, 0.44];
    g.box(0, 0, 0, 62, 9, 16, C1); g.box(0, 9, 0, 63.5, 1.2, 17, C2);
    g.box(0, 0, 1.5, 18, 14, 15, C1); g.box(0, 14, 1.5, 19.5, 1.4, 16.2, C2);
    g.box(0, 0, 9.1, 8.5, 10.5, 0.4, [0.36, 0.28, 0.22]); g.box(0, 10.5, 9.1, 9.5, 1.4, 0.4, C2); // арочный портал
    for (const sx of [-1, 1]) { g.box(sx * 9.3, 0, 9.2, 1.6, 14, 1.6, C2); for (let k = 0; k < 6; k++) { g.box(sx * (14 + k * 2.9), 1.2, 8.05, 1.7, 5.4, 0.25, GL, 0, true); g.box(sx * (14 + k * 2.9), 6.6, 8.05, 2.2, 0.6, 0.3, C2); } g.box(sx * 31, 0, 0, 2.4, 10.5, 17, C2); }
    for (const [geo, c] of g.parts) { geo.scale(sc, 1, 1); geo.rotateY(ry); geo.translate(x, 0, z); b.parts.push([geo, c]); }
    for (const [geo, c] of g.glow) { geo.scale(sc, 1, 1); geo.rotateY(ry); geo.translate(x, 0, z); b.glow.push([geo, c]); }
  }
  M.pakhtakor = (b, o) => {
    const L = o.L || 253, W = o.W || 192, N = 72;
    b.fan(se(L / 2, W / 2, 2.3, N), 0.12, [0.74, 0.71, 0.66]);                               // площадь вокруг
    const inner = se(78, 50, 3.0, N), top = se(L / 2 - 22, W / 2 - 18, 2.5, N), lip = se(L / 2 - 18, W / 2 - 14.5, 2.5, N), foot = se(L / 2 - 6, W / 2 - 4, 2.4, N);
    b.fan(inner, 0.22, [0.47, 0.70, 0.86]);                                                  // голубая беговая дорожка
    b.loft(se(74, 46.5, 3.0, N), 0.26, se(73.6, 46.1, 3.0, N), 0.26, [0.92, 0.94, 0.96]);
    b.box(0, 0.24, 0, 109, 0.04, 72, [0.34, 0.6, 0.27]);
    pitch(b, 105, 68, 0.28);
    // трибуны: синие ряды, жёлтые пояса
    b.stands(top, 13, inner, 1.4, 16, (t, R) => (t === 2 || t === 3 || t === 9 || t === 15) ? YEL : t % 2 ? [BLUE[0] * 0.9, BLUE[1] * 0.9, BLUE[2] * 0.9] : BLUE);
    b.loft(inner, 1.4, inner, 0, [0.88, 0.88, 0.9]);                                           // бортик и ограждение у дорожки
    b.loft(se(78.6, 50.6, 3.0, N), 2.6, se(78.6, 50.6, 3.0, N), 1.4, [0.55, 0.6, 0.66]);
    b.loft(top, 13, lip, 13, [0.78, 0.76, 0.72]);                                               // верхний обходной променад
    b.loft(lip, 13, foot, 0, [0.42, 0.56, 0.30]);                                               // зелёная насыпь: чаша «утоплена» в землю
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, p = se(L / 2 - 17.6, W / 2 - 14.1, 2.5, 1, a)[0]; b.box(p[0], 13, p[1], 0.4, 1.1, 0.4, [0.3, 0.3, 0.32]); }
    // мачты освещения по диагоналям
    for (const a of [0.62, Math.PI - 0.62, Math.PI + 0.62, -0.62]) { const p = se(L / 2 - 12, W / 2 - 9, 2.4, 1, a)[0]; mast(b, p[0], p[1], 52, Math.atan2(-p[0], -p[1])); }
    // табло за северными воротами и ложа прессы на западной трибуне
    const sb = se(L / 2 - 20, W / 2 - 16, 2.5, 1, Math.PI)[0];
    b.box(sb[0] - 1, 13, sb[1], 1.2, 6, 1.2, [0.3, 0.3, 0.32]); b.box(sb[0] - 1, 13, sb[1] + 10, 1.2, 6, 1.2, [0.3, 0.3, 0.32]);
    b.box(sb[0] - 1, 18.5, sb[1] + 5, 2, 8, 17, [0.16, 0.36, 0.72]); b.box(sb[0] + 0.05, 19.3, sb[1] + 5, 0.3, 6.4, 15.4, [0.12, 0.14, 0.18], 0, true);
    // павильон у входа (точка входа из OSM), фасадом наружу
    if (o.local && o.ex !== undefined) {
      const [ex, ez] = o.local(o.ex, o.ez), sideW = ez > 0 ? 1 : -1;
      b.box(0, 13, sideW * (W / 2 - 22), 60, 4.2, 6, [0.22, 0.26, 0.32], 0, true); b.box(0, 17.2, sideW * (W / 2 - 22), 62, 0.8, 7.5, [0.22, 0.38, 0.7]);
      pavilion(b, ex, ez, Math.atan2(ex, ez), 0.62);
    }
  };

  // ---------- Humo Arena: овальный «барабан», расширяющийся кверху медиафасад (ночью светится),
  //            стеклянный нижний ярус, гранитный стилобат с лестницами и дорожки-«крылья» птицы Хумо ----------
  M.humo_arena = (b, o) => {
    const L = o.L || 198, W = o.W || 118, N = 64, A = L / 2, B = W / 2;
    // «крылья»: веер дорожек и газонов по длинным сторонам
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const ang = s * (0.35 + i * 0.16), len = 58 - i * 6, x0 = -A * 0.15 + i * 9, z0 = s * (B * 0.9);
      const g = new THREE.BoxGeometry(len, 0.1, 5); g.translate(len / 2, 0.06, 0); g.rotateY(-ang - (s > 0 ? 0 : Math.PI)); b.add(g, i % 2 ? [0.84, 0.81, 0.74] : [0.46, 0.62, 0.32], x0, 0, z0);
    }
    b.fan(se(A + 14, B + 12, 2.6, N), 0.1, [0.72, 0.71, 0.70]);
    const pod = se(A, B, 2.8, N), glass = se(A - 9, B - 7, 2.7, N), bot = se(A - 10, B - 8, 2.7, N), topR = se(A - 1, B - 0.5, 2.7, N), cap = se(A - 3, B - 2.5, 2.7, N);
    b.loft(pod, 0, pod, 5, [0.56, 0.56, 0.58]); b.loft(pod, 5, glass, 5, [0.74, 0.73, 0.72]); // стилобат и терраса
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(s * (A + 2 + k * 1.6), 0, 0, 1.6, 5 - k * 0.85, 34, [0.66, 0.65, 0.64]); // лестницы
    b.loft(glass, 5, glass, 11, [0.20, 0.27, 0.36], "glow");                                   // стеклянный ярус фойе
    b.loft(se(A - 8.5, B - 6.5, 2.7, N), 11, se(A - 8.5, B - 6.5, 2.7, N), 12, [0.86, 0.87, 0.89]);
    // медиафасад: 11 горизонтальных лент, расширяется кверху
    const Hb = 12, Ht = 34, R = 11;
    for (let i = 0; i < R; i++) {
      const t0 = i / R, t1 = (i + 1) / R, r0 = lerpR(bot, topR, Math.pow(t0, 0.7)), r1 = lerpR(bot, topR, Math.pow(t1, 0.7));
      b.loft(r0, Hb + (Ht - Hb) * t0, r1, Hb + (Ht - Hb) * t1, i % 2 ? [0.80, 0.84, 0.90] : [0.86, 0.89, 0.94], "led");
    }
    b.loft(topR, Ht, se(A - 1.6, B - 1.1, 2.7, N), Ht + 1.4, [0.92, 0.92, 0.94]);              // скруглённый верхний край
    b.loft(se(A - 1.6, B - 1.1, 2.7, N), Ht + 1.4, cap, Ht + 1.6, [0.9, 0.9, 0.92]);
    // пологий купол крыши с рёбрами
    let prev = cap, py = Ht + 1.6;
    for (let k = 1; k <= 5; k++) {
      const ph = k / 5 * Math.PI / 2, sc = Math.cos(ph) * 0.97 + 0.03, r = cap.map((p) => [p[0] * sc, p[1] * sc]), y = Ht + 1.6 + Math.sin(ph) * 7;
      if (k < 5) b.loft(prev, py, r, y, [0.80, 0.81, 0.83], "parts", 2, [0.77, 0.78, 0.81]); else b.fan(prev, py, [0.80, 0.81, 0.83], "parts", y);
      prev = r; py = y;
    }
    b.box(-A * 0.3, Ht + 7.5, 0, 14, 1.6, 8, [0.62, 0.63, 0.66]); b.box(A * 0.3, Ht + 7.5, 0, 14, 1.6, 8, [0.62, 0.63, 0.66]);
  };

  // ---------- стадион «Миллий» (Бунёдкор): по периметру белые мембранные «лепестки» с остриями
  //            на тонких опорах, зелёные двухъярусные трибуны, кольцевая белая крыша ----------
  M.milliy = (b, o) => {
    const L = Math.max(o.L || 236, 200), W = Math.max(o.W || 196, 160), A = L / 2 - 6, B = W / 2 - 6, N = 48, GR = [0.20, 0.52, 0.32];
    b.fan(se(L / 2 + 12, W / 2 + 12, 3.2, N), 0.1, [0.76, 0.64, 0.54]);                       // плитка площади
    const base = se(A, B, 3.6, N), fac = se(A - 5, B - 5, 3.6, N), roofO = se(A - 1, B - 1, 3.6, N), roofI = se(66, 48, 3.2, N);
    b.loft(base, 0, base, 2.5, [0.70, 0.70, 0.72]); b.loft(base, 2.5, fac, 2.5, [0.78, 0.76, 0.74]);
    b.loft(fac, 2.5, fac, 17, [0.24, 0.32, 0.40], "glow");                                    // остеклённый фасад
    b.loft(fac, 17, roofO, 24, [0.70, 0.72, 0.76]);
    // трибуны и поле
    const in1 = se(60, 42, 3.4, N), mid = se(84, 64, 3.4, N), mid2 = se(88, 68, 3.4, N), up = se(A - 8, B - 8, 3.5, N);
    b.box(0, 0.12, 0, 124, 0.06, 88, [0.22, 0.44, 0.24]);
    pitch(b, 105, 68, 0.2);
    const seat = (t) => (t % 5 === 4 ? [0.88, 0.9, 0.9] : t % 2 ? [GR[0] * 0.9, GR[1] * 0.9, GR[2] * 0.9] : GR);
    b.stands(mid, 10, in1, 1.2, 10, seat); b.loft(in1, 1.2, in1, 0, [0.82, 0.82, 0.84]);
    b.loft(mid, 10, mid2, 10, [0.6, 0.6, 0.62]); b.loft(mid2, 10, mid2, 13, [0.26, 0.28, 0.32]);
    b.stands(up, 25, mid2, 13, 12, seat);
    // белая кольцевая крыша с рёбрами
    b.loft(roofO, 26, roofI, 29.5, [0.95, 0.95, 0.97], "parts", 1, [0.86, 0.87, 0.9]);
    b.loft(roofI, 29.5, roofI, 28.3, [0.7, 0.72, 0.76]);
    b.loft(roofO, 24, roofO, 26, [0.9, 0.9, 0.92]);
    // «лепестки»: воронка-мембрана на опоре + острый пик над крышей
    const P = se(A, B, 3.6, N);
    for (let i = 0; i < N; i++) {
      const [x, z] = P[i], [x2, z2] = P[(i + 1) % N], w = Math.hypot(x2 - x, z2 - z), mx = (x + x2) / 2, mz = (z + z2) / 2;
      const ang = Math.atan2(x2 - x, z2 - z);
      const fun = new THREE.CylinderGeometry(w * 0.52, 0.55, 18, 6, 1, true); fun.translate(0, 8 + 9, 0); b.add(fun, [0.96, 0.96, 0.98], mx, 0, mz, ang, false); b.led.push(b.parts.pop());
      b.cyl(mx, 0, mz, 0.5, 8.2, [0.92, 0.92, 0.94], 6);
      const pk = new THREE.ConeGeometry(w * 0.5, 9, 4, 1, true); pk.rotateY(Math.PI / 4); pk.translate(0, 26 + 4.5, 0); b.add(pk, [0.97, 0.97, 0.99], mx, 0, mz, ang);
    }
  };
  M.navoi_park = (b) => {
    b.cyl(0, 0, 0, 16, 1.8, P.marble, 28); b.cyl(0, 1.8, 0, 12.5, 0.6, P.marble, 28);
    b.columns(0, 0, 2.4, 10, 12, 0.75, 11, P.white);
    b.cyl(0, 13.4, 0, 11, 1.6, P.marble, 28); b.dome(0, 15, 0, 10.2, P.cobalt, { hk: 0.85, seg: 24, ribs: [0.25, 0.44, 0.76] });
    b.box(0, 2.4, 0, 2.4, 1.8, 2.4, P.grey); b.cyl(0, 4.2, 0, 0.9, 3.2, P.bronze, 8); b.sphere(0, 8, 0, 0.7, P.bronze, 6);
  };
  M.station = (b, o) => {
    const L = o.L || 160, Wd = o.W || 30;
    b.box(0, 0, 0, L, 15, Wd, [0.92, 0.89, 0.82]);
    b.box(0, 3, Wd / 2 + 0.05, L - 8, 8, 0.3, [0.5, 0.62, 0.72], 0, true); b.box(0, 3, -Wd / 2 - 0.05, L - 8, 8, 0.3, [0.5, 0.62, 0.72], 0, true);
    for (let x = -L / 2 + 6; x < L / 2 - 4; x += 6) { b.box(x, 3, Wd / 2 + 0.2, 0.8, 8, 0.4, P.white); b.box(x, 3, -Wd / 2 - 0.2, 0.8, 8, 0.4, P.white); }
    b.box(0, 0, 0, L * 0.22, 24, Wd + 4, [0.95, 0.93, 0.87]);
    b.cyl(0, 17, Wd / 2 + 2.1, 2.6, 0.4, P.white, 16); b.box(0, 17, Wd / 2 + 2.4, 0.2, 1.8, 0.2, P.dark);
    b.box(0, 15, 0, L, 1, Wd, P.roof);
    b.box(0, 0, -Wd / 2 - 9, L * 0.9, 0.2, 14, [0.42, 0.4, 0.38]); // перрон
    for (let x = -L * 0.42; x <= L * 0.42; x += 12) b.box(x, 0.2, -Wd / 2 - 9, 0.4, 4, 0.4, P.grey);
    b.box(0, 4.2, -Wd / 2 - 9, L * 0.9, 0.4, 10, [0.54, 0.58, 0.6]);
  };
  M.japanese = (b) => {
    b.box(-14, 0, 6, 26, 0.15, 18, P.water);
    for (let i = 0; i < 10; i++) b.box(-14 + (i - 4.5) * 1.6, 0.3 + Math.sin(i / 9 * Math.PI) * 1.4, 6, 1.7, 0.3, 2.2, P.red);
    let y = 0;
    for (const [w, h] of [[9, 4], [7.6, 3.4], [6.4, 3], [5.2, 2.6]]) { b.box(14, y, -6, w * 0.7, h, w * 0.7, [0.86, 0.78, 0.62]); b.box(14, y + h, -6, w + 1.6, 0.7, w + 1.6, [0.24, 0.22, 0.24]); y += h + 0.7; }
    b.cyl(14, y, -6, 0.3, 4, P.gold, 6);
    b.box(-3, 0, -18, 0.7, 6, 0.7, P.red); b.box(4, 0, -18, 0.7, 6, 0.7, P.red); b.box(0.5, 5.6, -18, 10, 0.7, 0.9, P.red); b.box(0.5, 4.4, -18, 8.6, 0.4, 0.6, P.red);
  };
  M.new_tashkent = (b) => {
    b.box(0, 0, 0, 360, 0.12, 300, [0.62, 0.52, 0.38]);
    b.box(0, 0.12, 0, 360, 0.1, 18, [0.36, 0.36, 0.37]); b.box(0, 0.12, 0, 18, 0.1, 300, [0.36, 0.36, 0.37]);
    // готовые башни
    [[-120, -100, 18, 70], [-90, -110, 16, 52], [-130, -60, 14, 40], [110, 90, 20, 34]].forEach(([x, z, s, h]) => {
      b.box(x, 0, z, s, h, s, [0.4, 0.55, 0.66]);
      for (let y = 3; y < h - 2; y += 3.2) b.box(x, y, z, s + 0.3, 0.8, s + 0.3, [0.76, 0.84, 0.88]);
      b.box(x, h * 0.2, z, s * 0.9, h * 0.7, s * 0.9, [1, 0.85, 0.55], 0, true);
    });
    // каркасы (строятся)
    [[60, -100, 30, 22, 7], [100, -40, 24, 24, 5], [-60, 90, 34, 20, 9], [-110, 120, 22, 22, 4]].forEach(([x, z, w, d, fl]) => {
      for (let f = 0; f <= fl; f++) b.box(x, f * 3.6, z, w, 0.5, d, [0.72, 0.71, 0.68]);
      for (let ix = 0; ix <= 3; ix++) for (let iz = 0; iz <= 2; iz++) b.box(x - w / 2 + ix * w / 3, 0, z - d / 2 + iz * d / 2, 0.7, fl * 3.6, 0.7, [0.62, 0.61, 0.58]);
    });
    // парк и озеро
    b.box(110, 0.14, 120, 80, 0.1, 60, P.green); b.box(110, 0.25, 120, 40, 0.1, 28, P.water);
    // экскаватор и самосвал
    b.box(30, 0, 40, 6, 2.5, 3.2, P.yellow); b.box(30, 2.5, 40, 3, 2, 2.6, P.dark); b.box(-40, 0, -30, 8, 3, 3, P.red); b.box(-35, 0, -30, 3, 3.5, 3, P.grey);
  };
  MD.M = M; MD.MB = MB; MD.P = P; MD.se = se; MD.lerpR = lerpR;
  // поворотные краны и колесо обозрения — отдельные анимируемые меши
  function craneParts(x, z, h) {
    const m = new MB();
    m.box(0, 0, 0, 1.6, h, 1.6, P.yellow); m.box(0, h, 0, 3, 3, 3, P.red);
    const r = new MB();
    r.box(14, 0, 0, 40, 1.2, 1.2, P.yellow); r.box(-9, -0.5, 0, 8, 2.2, 2.4, P.grey); r.box(22, -14, 0, 0.2, 14, 0.2, P.dark); r.box(22, -15.5, 0, 2.6, 1.5, 2.6, P.conc);
    return [m, r];
  }

  // куда обращён главный фасад (портал)
  const FACE = MD.FACE = Object.assign({ kukeldash: [41.32678, 69.23516], hazrati_imam: [41.33696, 69.239], minor: [41.3354, 69.2700], hotel_uz: [41.31117, 69.27975] }, MD.FACE || {});
  // ---------------- размещение ----------------
  MD.init = function () {
    MD.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // медиафасады и подсвеченные мембраны: днём — свой цвет, ночью — бегущая сине-фиолетовая подсветка
    MD.ledMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    MD.ledMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = T.uNight; sh.uniforms.uTime = T.uTime;
      sh.vertexShader = "varying vec3 vWP2;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = "uniform float uNight; uniform float uTime; varying vec3 vWP2;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float wv = 0.5 + 0.5 * sin((vWP2.x + vWP2.z) * 0.045 - uTime * 0.8);
         vec3 led = mix(vec3(0.32, 0.36, 1.0), vec3(0.78, 0.36, 0.95), wv);
         totalEmissiveRadiance += led * uNight * (0.55 + 0.35 * step(0.5, fract(vWP2.y / 2.6)));`);
    };
    MD.ledMat.customProgramCacheKey = () => "led";
    // цвета флага Узбекистана: перелив по кругу (синий → красный → белый → красный → зелёный)
    const FLAG = `
      vec3 flagC(float i) { i = mod(i, 5.0); return i < 1.0 ? vec3(0.0, 0.62, 0.95) : i < 2.0 ? vec3(1.0, 0.08, 0.12) : i < 3.0 ? vec3(1.0) : i < 4.0 ? vec3(1.0, 0.08, 0.12) : vec3(0.1, 0.85, 0.25); }
      vec3 flagSeq(float s) { float x = fract(s) * 5.0, i = floor(x); return mix(flagC(i), flagC(i + 1.0), smoothstep(0.55, 1.0, fract(x))); }`;
    // ночная подсветка в локальных координатах модели (vLP)
    const nightFx = (key, body) => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = T.uNight; sh.uniforms.uTime = T.uTime;
        sh.vertexShader = "varying vec3 vLP;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vLP = transformed;");
        sh.fragmentShader = "uniform float uNight; uniform float uTime; varying vec3 vLP;\n" + FLAG + "\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + body);
      };
      m.customProgramCacheKey = () => key;
      return m;
    };
    // неоновые ленты (Hilton, Tashkent City Mall…): цвета флага бегут по контуру и вверх
    MD.flagMat = nightFx("flag", `
      float fs = (vLP.x + vLP.z) * 0.005 + vLP.y * 0.007 - uTime * 0.11;
      totalEmissiveRadiance += flagSeq(fs) * uNight * 1.15;`);
    // телебашня ночью (по видео): вся залита тёплым золотом прожекторов (снизу ярче, светлые элементы ярче
    // синих), по стволу и капсулам случайно мигают холодно-белые огоньки
    MD.showMat = nightFx("show", `
      float ang = atan(vLP.z, vLP.x), lum = dot(vColor.rgb, vec3(0.333));
      vec3 gold = vec3(1.0, 0.54, 0.12) * (0.18 + 0.95 * lum * lum) * (0.75 + 0.25 * exp(-vLP.y / 120.0)) * (0.94 + 0.06 * sin(uTime * 1.7 + vLP.y * 0.04));
      vec2 cell = floor(vec2(ang * 7.0, vLP.y / 2.4));
      float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float spark = step(0.55, h) * step(0.88, fract(uTime * (0.35 + h * 0.5) + h * 17.0)) * step(86.0, vLP.y) * step(vLP.y, 300.0);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.38, 0.22), uNight);
      totalEmissiveRadiance += uNight * (gold * 0.95 + vec3(0.8, 0.9, 1.0) * spark * 1.6);`);
    MD.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    MD.glowMat.onBeforeCompile = (sh) => { // днём — цвет стекла, ночью — тёплый свет окон
      sh.uniforms.uNight = T.uNight;
      sh.fragmentShader = "uniform float uNight;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, vec3(1.0, 0.82, 0.5) * (0.75 + 0.25 * diffuseColor.r), uNight);");
    };
    // модель на контуре g: группа в мировых координатах, повёрнутая по длинной оси контура
    const place = (id, g) => {
      // перевод мировой точки (метры) в локальные координаты модели (ось x — длинная ось контура)
      g.local = (wx, wz) => {
        const dx = wx - g.x, dz = wz - g.z, c = Math.cos(g.ang), s2 = Math.sin(g.ang);
        return [dx * c + dz * s2, -dx * s2 + dz * c];
      };
      const b = new MB(); M[id](b, g);
      const parts = b.build(id);
      const grp = new THREE.Group();
      grp.position.set(g.x, 0, g.z); grp.rotation.y = -g.ang;
      // повернуть фасадом (локальная +z) к заданной точке
      if (FACE[id]) {
        const [fx, fz] = T.ll2m(FACE[id][0], FACE[id][1]);
        const nx = -Math.sin(g.ang), nz = Math.cos(g.ang); // куда смотрит локальная +z
        if ((fx - g.x) * nx + (fz - g.z) * nz < 0) grp.rotation.y += Math.PI;
      }
      for (const m of [parts.body, parts.glow, parts.led, parts.win, parts.flag, parts.show]) if (m) grp.add(m);
      S.scene.add(grp);
      return { grp, parts };
    };
    for (const l of TPM.landmarks) {
      const g = LMG[l.id]; if (!g) continue;
      l.mx = g.x; l.mz = g.z;
      const ll = T.m2ll(g.x, g.z); l.lat = +ll[0].toFixed(6); l.lng = +ll[1].toFixed(6);
      if (!M[l.id]) { l.top = 40; continue; }
      const { grp, parts } = place(l.id, g);
      l.obj = grp; l.top = parts.body.geometry.boundingBox.max.y; l.radius = parts.body.geometry.boundingSphere.radius;
      MD.list.push({ l, grp, r: parts.body.geometry.boundingSphere.radius });
      if (l.id === "mustaqillik" && g.x2 !== undefined) {
        const b2 = new MB(); M.mustaqillik_mon(b2); const p2 = b2.build("mon");
        p2.body.position.set(g.x2, 0, g.z2); S.scene.add(p2.body);
      }
      if (l.id === "new_tashkent") {
        [[-40, -40, 58], [70, 20, 48], [-80, 60, 44]].forEach(([x, z, h], i) => {
          const [m, r] = craneParts(0, 0, h);
          const mast = m.build("crane").body, jib = r.build("jib").body;
          mast.position.set(x, 0, z); jib.position.set(x, h + 1.5, z); grp.add(mast, jib);
          MD.anim.push((t) => { jib.rotation.y = Math.sin(t * 0.12 + i * 2) * 1.4 + i; });
        });
      }
      if (l.id === "magic_city") { // колесо обозрения
        const wheel = new MB();
        const ring = new THREE.TorusGeometry(16, 0.45, 6, 36); wheel.add(ring, [0.9, 0.9, 0.95], 0, 0, 0);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const sp = new THREE.BoxGeometry(0.3, 16, 0.3); sp.translate(0, 8, 0); sp.rotateZ(a); wheel.add(sp, [0.75, 0.75, 0.8], 0, 0, 0); wheel.box(Math.cos(a) * 16, Math.sin(a) * 16 - 1.6, 0, 1.8, 1.8, 1.8, [P.red, P.yellow, P.cobalt][i % 3]); }
        const wm = wheel.build("wheel").body; wm.position.set(-(g.L || 72) * 0.55 - 20, 19, 12); grp.add(wm);
        const leg = new MB(); for (const s of [-1, 1]) { const lg = new THREE.BoxGeometry(0.8, 21, 0.8); lg.translate(0, -10.5, 0); lg.rotateZ(s * 0.3); leg.add(lg, P.grey, 0, 0, s * 1.2); }
        const lm = leg.build("legs").body; lm.position.copy(wm.position); grp.add(lm);
        MD.anim.push((t) => { wm.rotation.z = t * 0.12; });
      }
      if (l.id === "friendship" && g.sub && g.sub.flag) { // флаг Узбекистана на флагштоке площади
        const [fx, fz] = g.local(...g.sub.flag), Lf = 22, Hf = 11, NC = 28;
        // строки сетки — по границам полос (сверху вниз: синий, красная кайма, белый, красная кайма, зелёный)
        const T2 = [0, 0.16, 0.318, 0.322, 0.343, 0.347, 0.5, 0.653, 0.657, 0.678, 0.682, 0.84, 1];
        const band = (t) => (t < 0.32 ? [0.0, 0.6, 0.85] : t < 0.345 ? [0.85, 0.08, 0.12] : t < 0.655 ? [0.97, 0.97, 0.97] : t < 0.68 ? [0.85, 0.08, 0.12] : [0.1, 0.66, 0.24]);
        const pos = [], col = [], idx = [], U = [];
        T2.forEach((t, r) => {
          for (let i = 0; i <= NC; i++) {
            const u = i / NC, star = r === 1 && i >= 2 && i <= 8;                              // полумесяц и звёзды у древка — светлые точки
            pos.push(u * Lf, -t * Hf, 0); col.push(...(star && i % 2 ? [0.95, 0.97, 1] : band(t))); U.push(u);
          }
          if (r) for (let i = 0; i < NC; i++) { const a = (r - 1) * (NC + 1) + i, b2 = a + NC + 1; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
        });
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
        const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        flag.position.set(fx, 62.5, fz + 0.9); flag.rotation.y = -Math.PI / 2; flag.castShadow = true; grp.add(flag);
        const P0 = Float32Array.from(pos), pa = geo.attributes.position;
        MD.anim.push((t) => {
          for (let k = 0; k < U.length; k++) {
            const u = U[k], y0 = P0[k * 3 + 1];
            pa.array[k * 3 + 2] = Math.sin(u * 7 - t * 3.4 + y0 * 0.12) * 1.3 * u + Math.sin(u * 13 - t * 5.1) * 0.25 * u;
            pa.array[k * 3] = u * Lf * (0.97 + 0.03 * Math.cos(u * 7 - t * 3.4));
            pa.array[k * 3 + 1] = y0 - u * u * 0.8;
          }
          pa.needsUpdate = true; geo.computeVertexNormals();
        });
      }
      if (l.id === "tv_tower") { // мигающий огонь на шпиле
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
        lamp.position.set(0, 378, 0); grp.add(lamp);
        MD.anim.push((t) => { lamp.visible = Math.floor(t * 1.2) % 2 === 0; });
      }
    }
    // фоновые модели (ЖК, башни) — без карточки и пункта в списке мест
    const isLm = new Set(TPM.landmarks.map((l) => l.id));
    for (const id in LMG) {
      if (isLm.has(id) || !M[id]) continue;
      const { grp, parts } = place(id, LMG[id]);
      MD.decor.push({ grp, r: parts.body.geometry.boundingSphere.radius });
    }
  };
  // миниатюры для списка и карточки: каждая модель рендерится отдельно в пиксель-арт
  MD.thumbs = {};
  MD.makeThumbs = function () {
    const r = S.renderer, W = 136, H = 112;
    const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3c4a2e);
    sc.add(new THREE.HemisphereLight(0xe8eeff, 0x6a6450, 0.75)); const dl = new THREE.DirectionalLight(0xfff0d8, 0.85); dl.position.set(-0.5, 0.8, 0.45); sc.add(dl);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
    const px = new Uint8Array(W * H * 4), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d"), id = cx.createImageData(W, H);
    for (const it of MD.list) {
      const g = it.grp, parent = g.parent, pos = g.position.clone();
      sc.add(g); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const ext = Math.max(sz.x, sz.z, sz.y * 0.9) * 0.62;
      cam.left = -ext * W / H; cam.right = ext * W / H; cam.top = ext; cam.bottom = -ext; cam.updateProjectionMatrix();
      const a = Math.PI * 0.75, el = 0.6;
      cam.position.set(c.x + Math.cos(a) * Math.cos(el) * 1000, c.y + Math.sin(el) * 1000, c.z + Math.sin(a) * Math.cos(el) * 1000); cam.lookAt(c);
      r.setRenderTarget(rt); r.render(sc, cam); r.readRenderTargetPixels(rt, 0, 0, W, H, px); r.setRenderTarget(null);
      for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      cx.putImageData(id, 0, 0);
      MD.thumbs[it.l.id] = cv.toDataURL();
      sc.remove(g); parent.add(g); g.position.copy(pos); g.updateMatrixWorld(true);
    }
    rt.dispose();
  };
  MD.update = function (t, night) {
    for (const f of MD.anim) f(t);

  };
  // попадание курсора в модель
  MD.pick = function (sx, sy) {
    S.setNdc(sx, sy);
    const rc = S.raycaster(); let best = null;
    for (const it of MD.list) {
      const hit = rc.intersectObject(it.grp, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, l: it.l };
    }
    return best && best.l;
  };
  MD.near = function (x, z, extra) {
    for (const it of MD.list.concat(MD.decor)) if (Math.hypot(it.grp.position.x - x, it.grp.position.z - z) < it.r * 0.6 + extra) return true;
    return false;
  };
})();
