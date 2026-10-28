// =====================================================================
//  Мини-карта всего города (север вверху). Рамка — то, что видно сейчас;
//  клик — перелёт, перетаскивание — быстрое перемещение.
// =====================================================================
(function () {
  const S = TPM.scene;
  const M = TPM.minimap = {};
  let meta = null, img = null, cv, ctx, lastKey = "";
  window.TPM_MINIMAP = (m) => { meta = m; };
  M.init = function (canvas) {
    cv = canvas; ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    if (meta) { img = new Image(); img.onload = () => { lastKey = ""; }; img.src = "data/minimap.png"; }
    let drag = false;
    const go = (e, fly) => {
      if (!meta) return;
      const r = cv.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      const x = meta.x0 + u * (meta.x1 - meta.x0), z = meta.z0 + v * (meta.z1 - meta.z0);
      if (fly) S.flyTo(x, z, Math.max(S.mpp, 1.2), 1.2); else { S.target.x = x; S.target.z = z; S.lastMove = performance.now(); S.moving = true; }
    };
    cv.addEventListener("pointerdown", (e) => { drag = true; cv.setPointerCapture(e.pointerId); go(e, true); });
    cv.addEventListener("pointermove", (e) => { if (drag && e.buttons) go(e, false); });
    cv.addEventListener("pointerup", () => { drag = false; });
  };
  M.frame = function () {
    if (!cv || !meta) return;
    const q = S.viewQuad(0);
    const key = q.map((p) => p ? p.x.toFixed(0) + "," + p.z.toFixed(0) : "x").join("|") + (img && img.complete);
    if (key === lastKey) return; lastKey = key;
    const W = cv.width, H = cv.height;
    ctx.fillStyle = "#17130f"; ctx.fillRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, W, H);
    const mx = (x) => (x - meta.x0) / (meta.x1 - meta.x0) * W, mz = (z) => (z - meta.z0) / (meta.z1 - meta.z0) * H;
    // места
    for (const l of TPM.landmarks) if (l.mx !== undefined) { ctx.fillStyle = "#1a1512"; ctx.fillRect((mx(l.mx) | 0) - 1, (mz(l.mz) | 0) - 1, 3, 3); ctx.fillStyle = TPM.categories[l.cat].color; ctx.fillRect(mx(l.mx) | 0, mz(l.mz) | 0, 1, 1); }
    if (q.some((p) => !p)) return;
    ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(mx(p.x), mz(p.z)) : ctx.moveTo(mx(p.x), mz(p.z)))); ctx.closePath();
    ctx.lineWidth = 3; ctx.strokeStyle = "#1a1512"; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  };
})();
