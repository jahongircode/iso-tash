// =====================================================================
//  Рельеф города (data/terrain.js, tools/bake/terrain.py): сетка высот 50 м.
//  Высота точки = тренд (общий уклон города, как есть) + детали × E (долины
//  каналов, холмы и террасы усилены, иначе на плоском Ташкенте их не видно).
//  Ноль — уровень сквера Амира Темура. Внутри узлов сетки — кусочно-линейная
//  поверхность (каждая клетка — два треугольника по диагонали (1,0)–(0,1)):
//  ровно так же нарезана земля в воркере, поэтому всё совпадает без щелей.
// =====================================================================
(function () {
  const TR = TPM.terrain = { ok: false, E: 3, grid: null };
  window.TPM_TERRAIN = function (meta, b64) { TR.meta = meta; TR.b64 = b64; };

  TR.init = async function () {
    const m = TR.meta; if (!m || !TR.b64) return;
    try {
      const bin = atob(TR.b64), raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      const B = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
      const W = m.w, H = m.h, Hn = new Float32Array(W * H);
      let p = 0;
      const vr = () => { let r = 0, s = 0, c; do { c = B[p++]; r += (c & 0x7f) * Math.pow(2, s); s += 7; } while (c >= 0x80); return r; };
      const tr = m.trend, k = m.step / m.tstep;
      const trend = (i, j) => { // билинейно по сетке тренда
        const u = Math.min(m.tw - 1.001, i * k), v = Math.min(m.th - 1.001, j * k), a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b;
        const t00 = tr[b * m.tw + a], t10 = tr[b * m.tw + a + 1], t01 = tr[(b + 1) * m.tw + a], t11 = tr[(b + 1) * m.tw + a + 1];
        return (t00 * (1 - fu) + t10 * fu) * (1 - fv) + (t01 * (1 - fu) + t11 * fu) * fv;
      };
      for (let j = 0; j < H; j++) {
        let d = 0;
        for (let i = 0; i < W; i++) { const n = vr(); d += n % 2 ? -(n + 1) / 2 : n / 2; Hn[j * W + i] = trend(i, j) + TR.E * d / 10; }
      }
      TR.grid = { x0: m.x0, z0: m.z0, s: m.step, W, H, Hn };
      const ref = TR.hAt(0, 0);
      for (let i = 0; i < Hn.length; i++) Hn[i] -= ref;
      TR.ok = true;
    } catch (e) { console.warn("terrain", e); TR.grid = null; }
  };

  // высота в мировой точке (кусочно-линейно, как сетка земли в воркере)
  TR.hAt = function (x, z) {
    const g = TR.grid; if (!g) return 0;
    let u = (x - g.x0) / g.s, v = (z - g.z0) / g.s;
    u = Math.max(0, Math.min(g.W - 1.0001, u)); v = Math.max(0, Math.min(g.H - 1.0001, v));
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j, H = g.Hn, W = g.W;
    const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
})();
