// =====================================================================
//  Земля из векторных тайлов: кварталы, парки, вода, дороги, ж/д.
//  На дальнем зуме жилые кварталы заполняются процедурной «пиксельной
//  застройкой» (крошечные изометрические домики и деревья), промзоны —
//  ангарами, центр — серыми высотками. Ночью — россыпь огней города.
//  Плюс «поток машин» по магистралям на дальнем зуме.
// =====================================================================
(function () {
  const C = TPM.config, geo = TPM.geo, E = TPM.engine, W = TPM.world;
  const MPU = geo.MPU, DETAIL_Z = C.detailZoom;

  const ORDER = [0, 1, 2, 10, 7, 9, 13, 12, 5, 6, 11, 3, 4, 8];
  const COL = {
    0: "#9a9179", 1: "#9b958b", 2: "#8a857a", 10: "#a29a82", 7: "#77885a", 9: "#5f9446", 13: "#8f9179",
    12: "#7c7b78", 5: "#959a5c", 6: "#bfae80", 11: "#6a8a6a", 3: "#6c8a42", 4: "#4e6c33", 8: "#3f6788",
  };
  const BG = "#8d8a6c";
  // [обводка, заливка, ширина м, мин. ширина px, пунктир]
  const RS = {
    0: ["#3b3a3d", "#5d5b5e", 26, 1.6], 1: ["#3b3a3d", "#5d5b5e", 22, 1.4], 2: ["#3f3e40", "#646160", 17, 1.2],
    3: ["#46443f", "#6b6763", 13, 1.0], 4: ["#4c4a45", "#736e68", 11, 0.8], 5: ["#55524c", "#7d786f", 7.5, 0],
    6: [null, "#867f75", 4.5, 0], 7: [null, "#8a7f66", 3, 0, [6, 5]], 8: [null, "#b4a78a", 2, 0, [3, 3]],
    9: [null, "#5b4c44", 3.4, 0.8], 10: [null, "#5e5d5f", 45, 1.5], 11: [null, "#6a696b", 22, 0.8],
  };
  const WWS = { 0: 24, 1: 9, 2: 3 };
  const DRAW_ROADS = [11, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  // ---------------- процедурные текстуры застройки ----------------
  function makePattern(kind, big) {
    const P = big ? 64 : 40;
    const c = document.createElement("canvas"); c.width = P; c.height = P;
    const x = c.getContext("2d");
    let s = (kind * 7919 + (big ? 13 : 0)) >>> 0 || 1;
    const r = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296);
    const base = { 0: "#9a9179", 1: "#9b958b", 2: "#8a857a", 3: "#6c8a42", 4: "#4e6c33" }[kind];
    x.fillStyle = base; x.fillRect(0, 0, P, P);
    const tree = (tx, ty, sz, col) => {
      x.fillStyle = "rgba(20,26,18,0.35)"; x.fillRect(tx, ty + 1, sz + 1, 1);
      x.fillStyle = col; x.fillRect(tx, ty - sz + 1, sz, sz);
      x.fillStyle = "rgba(255,255,220,0.18)"; x.fillRect(tx, ty - sz + 1, Math.ceil(sz / 2), 1);
    };
    const greens = ["#5f7f3a", "#6e8f44", "#4f6e34", "#7a8f46"];
    const autumn = new Date().getMonth() >= 9 && new Date().getMonth() <= 10;
    const leaf = () => (autumn && r() < 0.35 ? (r() < 0.5 ? "#b9853c" : "#a9752f") : greens[(r() * 4) | 0]);
    const roofs = ["#a5694b", "#b08a5c", "#8e7f72", "#c2a77a", "#9a5a40", "#b7b0a2"];
    const n = big ? 18 : 16;
    if (kind === 0) { // частный сектор и махалли: плотные домики + деревья во дворах
      for (let i = 0; i < n; i++) {
        const bx = (r() * P) | 0, by = (r() * P) | 0;
        const w = big ? 3 + (r() * 3 | 0) : 2 + (r() * 2 | 0), h = big ? 2 + (r() * 2 | 0) : 1 + (r() * 2 | 0);
        const roof = roofs[(r() * roofs.length) | 0];
        drawBlock(x, bx, by, w, w - 1, h, roof);
        if (r() < 0.85) tree((r() * P) | 0, (r() * P) | 0, big ? 2 + (r() * 2 | 0) : 1 + (r() * 2 | 0), leaf());
      }
      for (let i = 0; i < n * 0.6; i++) tree((r() * P) | 0, (r() * P) | 0, big ? 2 : 1, leaf());
    } else if (kind === 1) { // центр: серые многоэтажки
      for (let i = 0; i < n * 0.55; i++) {
        const bx = (r() * P) | 0, by = (r() * P) | 0;
        drawBlock(x, bx, by, big ? 5 + (r() * 3 | 0) : 3 + (r() * 2 | 0), big ? 4 : 3, big ? 5 + (r() * 8 | 0) : 3 + (r() * 5 | 0), ["#b9b5ac", "#a8b4bd", "#c9c2b2", "#8f9aa4"][(r() * 4) | 0]);
      }
      for (let i = 0; i < 5; i++) tree((r() * P) | 0, (r() * P) | 0, big ? 2 : 1, leaf());
    } else if (kind === 2) { // промзона: широкие плоские ангары
      for (let i = 0; i < n * 0.35; i++) {
        const bx = (r() * P) | 0, by = (r() * P) | 0;
        drawBlock(x, bx, by, big ? 9 + (r() * 6 | 0) : 6 + (r() * 4 | 0), big ? 6 : 4, big ? 2 + (r() * 2 | 0) : 1 + (r() * 2 | 0), ["#a3a09a", "#8f8b84", "#b0aaa0", "#7f8a8c"][(r() * 4) | 0]);
      }
    } else { // парк / лес: кроны
      const cnt = kind === 4 ? (big ? 70 : 48) : (big ? 42 : 30);
      for (let i = 0; i < cnt; i++) tree((r() * P) | 0, (r() * P) | 0, big ? 2 + (r() * 3 | 0) : 1 + (r() * 2 | 0), leaf());
    }
    return c;
  }
  // изометрический блок в пикселях: стены + крыша-параллелограмм
  function drawBlock(x, bx, by, w, d, h, roof) {
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };
    // левая стена (запад): идёт вниз-вправо
    x.fillStyle = shade(roof, 0.72);
    for (let i = 0; i < w; i++) x.fillRect(bx + i, by + (i >> 1), 1, h);
    // правая стена (юг): идёт вверх-вправо
    x.fillStyle = shade(roof, 0.56);
    for (let i = 0; i < d; i++) x.fillRect(bx + w + i, by + (w >> 1) - (i >> 1), 1, h);
    // крыша
    x.fillStyle = roof;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) x.fillRect(bx + i + j, by - 1 + (i >> 1) - (j >> 1) - 0, 1, 1);
    x.fillStyle = shade(roof, 1.15);
    for (let j = 0; j < d; j++) x.fillRect(bx + j, by - 1 - (j >> 1), 1, 1);
  }
  const pat = {};
  function pattern(ctx, kind, big) {
    const k = kind + (big ? 100 : 0);
    let p = pat[k];
    if (!p) { p = pat[k] = { canvas: makePattern(kind, big) }; }
    if (!p.p || p.ctx !== ctx) { p.p = ctx.createPattern(p.canvas, "repeat"); p.ctx = ctx; }
    return p;
  }
  // ночные огни для дальнего зума
  let lightPat = null;
  function lightsPattern(ctx, kind) {
    if (!lightPat) {
      lightPat = {};
      for (const kd of [0, 1, 2]) {
        const P = 32, c = document.createElement("canvas"); c.width = P; c.height = P;
        const x = c.getContext("2d");
        let s = 91 + kd; const r = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296);
        const n = kd === 1 ? 26 : kd === 0 ? 14 : 6;
        for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.75 ? "#ffd27a" : "#fff0c8"; x.fillRect((r() * P) | 0, (r() * P) | 0, 1, 1); }
        lightPat[kd] = { canvas: c };
      }
    }
    const p = lightPat[kind];
    if (!p.p || p.ctx !== ctx) { p.p = ctx.createPattern(p.canvas, "repeat"); p.ctx = ctx; }
    return p;
  }

  // ---------------- отрисовка одного тайла ----------------
  function tileXform(ctx, t, v) {
    const dx = t.ox - v.x, dy = t.oy - v.y, k = v.k, A = k * t.f;
    const X0 = k * (dx + dy) + v.W / 2, Y0 = k * 0.5 * (dy - dx) + v.H / 2;
    ctx.setTransform(A, -A / 2, A, A / 2, X0, Y0);
    return A;
  }
  function setPattern(ctx, p, v) {
    // привязываем текстуру к миру (а не к экрану), чтобы при перерисовке не «плыла»
    const k = v.k, P = p.canvas.width;
    const X = -k * (v.x + v.y) + v.W / 2, Y = k * 0.5 * (v.x - v.y) + v.H / 2;
    const ax = ((X % P) + P) % P, ay = ((Y % P) + P) % P;
    try {
      const m = ctx.getTransform().inverse().multiply(new DOMMatrix().translate(ax, ay));
      p.p.setTransform(m);
    } catch (e) {}
    ctx.fillStyle = p.p;
  }

  function drawTile(ctx, t, v, opts) {
    const A = tileXform(ctx, t, v);
    const mPerU = t.f * MPU;
    if (opts.clip) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, t.ext, t.ext); ctx.clip(); }
    const far = opts.patterns;
    const big = v.z >= 14.1;
    for (const cls of ORDER) {
      const p = t.ground[cls]; if (!p) continue;
      ctx.fillStyle = COL[cls]; ctx.fill(p);
      if (far && cls <= 4) { setPattern(ctx, pattern(ctx, cls, big), v); ctx.fill(p); }
    }
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // реки и каналы
    for (const c in t.ww) {
      const w = Math.max(WWS[c] / mPerU, (c === "2" ? 0 : 0.9) / A);
      if (w * A < 0.35) continue;
      ctx.strokeStyle = COL[8]; ctx.lineWidth = w; ctx.stroke(t.ww[c]);
    }
    // дороги: сначала обводки, потом заливки (от мелких к крупным)
    const widths = {};
    for (const c of DRAW_ROADS) {
      const st = RS[c], p = t.lines[c]; if (!p) continue;
      const w = Math.max(st[2] / mPerU, st[3] / A);
      if (w * A < 0.45) continue;
      if (c === 8 && v.z < 17) continue;
      widths[c] = w;
      if (st[0]) { ctx.strokeStyle = st[0]; ctx.lineWidth = w + 1.6 / A; ctx.stroke(p); }
    }
    for (const c of DRAW_ROADS) {
      const st = RS[c], p = t.lines[c], w = widths[c]; if (!p || !w) continue;
      ctx.strokeStyle = st[1]; ctx.lineWidth = w;
      if (st[4]) ctx.setLineDash(st[4].map((d) => d / mPerU));
      ctx.stroke(p);
      if (st[4]) ctx.setLineDash([]);
      if (c === 9 && w * A > 1.5) { // шпалы
        ctx.strokeStyle = "#8a7a6a"; ctx.lineWidth = w * 0.45; ctx.setLineDash([1.2 / mPerU, 1.8 / mPerU]); ctx.stroke(p); ctx.setLineDash([]);
      }
      if (c <= 2 && w * A > 6) { // разметка на магистралях
        ctx.strokeStyle = "rgba(230,222,190,0.55)"; ctx.lineWidth = 0.35 / mPerU * 1.5; ctx.setLineDash([3 / mPerU, 6 / mPerU]); ctx.stroke(p); ctx.setLineDash([]);
      }
    }
    if (opts.clip) ctx.restore();
  }

  // ---------------- слой земли ----------------
  TPM.ground = {
    render(ctx, v) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, v.W, v.H);
      const gz = W.groundZoom(v.z);
      const need = W.cover(v, gz);
      const parents = new Map(), kids = [];
      for (const c of need) {
        const t = W.get(c.z, c.x, c.y);
        if (t) { kids.push(t); continue; }
        // временная подмена: родительский тайл
        for (const pz of gz > 12 ? [12, 10] : [10]) {
          const s = gz - pz, pt = W.get(pz, c.x >> s, c.y >> s);
          if (pt) { parents.set(pt.key, pt); break; }
        }
      }
      for (const t of parents.values()) drawTile(ctx, t, v, { patterns: true, clip: false });
      for (const t of kids) drawTile(ctx, t, v, { patterns: gz <= 12, clip: parents.size > 0 });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    // ночные огни кварталов на дальнем зуме
    renderLights(ctx, v) {
      if (v.z >= DETAIL_Z + 0.2) return;
      for (const c of W.cover(v, 12)) {
        const t = W.get(12, c.x, c.y); if (!t) continue;
        tileXform(ctx, t, v);
        for (const kind of [0, 1, 2]) {
          const p = t.ground[kind]; if (!p) continue;
          setPattern(ctx, lightsPattern(ctx, kind), v); ctx.fill(p);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    // поток машин по магистралям (дальний зум)
    drawFlow(ctx, lctx, t, night, q) {
      const v = { x: E.cam.x, y: E.cam.y, k: E.k, W: E.W, H: E.H, z: E.cam.z };
      const zf = Math.min(6, Math.max(1, Math.pow(2, 14.6 - v.z))) * (q === "low" ? 2 : 1);
      const SP = [55, 65, 85, 120];
      const dayCols = ["#efece4", "#d9d6cf", "#2f3034", "#f2f0ea", "#9ea3a8", "#efece4"];
      for (const c of W.cover(v, 12)) {
        const tl = W.get(12, c.x, c.y); if (!tl) continue;
        const k = v.k, A = k * tl.f, dx = tl.ox - v.x, dy = tl.oy - v.y;
        const X0 = k * (dx + dy) + v.W / 2, Y0 = k * 0.5 * (dy - dx) + v.H / 2;
        const mPerU = tl.f * MPU, off = 3.6 / mPerU;
        for (const L of tl.flow) {
          const sp = SP[L.cls] * zf / mPerU;
          const ph = ((t * 13) / mPerU) % sp;
          for (let pass = 0; pass < (L.ow ? 1 : 2); pass++) {
            const start = pass === 0 ? ph : ((L.len - ph) % sp + sp) % sp;
            const side = pass === 0 ? 1 : -1;
            let seg = 0, s = start, n = 0;
            const xs = L.xs, cum = L.cum, last = cum.length - 1;
            while (s < L.len) {
              while (seg < last - 1 && cum[seg + 1] < s) seg++;
              const sl = cum[seg + 1] - cum[seg] || 1, tt = (s - cum[seg]) / sl;
              const ax = xs[seg * 2], ay = xs[seg * 2 + 1], bx = xs[seg * 2 + 2], by = xs[seg * 2 + 3];
              const ux = (bx - ax) / sl, uy = (by - ay) / sl;
              const px = ax + (bx - ax) * tt - uy * off * side, py = ay + (by - ay) * tt + ux * off * side;
              const X = A * (px + py) + X0, Y = A * 0.5 * (py - px) + Y0;
              if (X >= 0 && X < v.W && Y >= 0 && Y < v.H) {
                if (night) {
                  lctx.fillStyle = pass === 0 ? "#fff1c2" : "#ff4a36";
                  lctx.fillRect(X | 0, Y | 0, 1, 1);
                } else {
                  ctx.fillStyle = dayCols[(n + pass) % dayCols.length];
                  ctx.fillRect(X | 0, Y | 0, 1, 1);
                }
              }
              s += sp; n++;
            }
          }
        }
      }
    },
    COL, BG, RS,
  };
})();
