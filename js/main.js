// =====================================================================
//  Запуск
// =====================================================================
(function () {
  const S = TPM.scene, UI = TPM.ui, T = TPM.tiles;
  async function boot() {
    if (!window.THREE) { document.body.innerHTML = "<p class='nojs'>Не удалось загрузить three.js</p>"; return; }
    const canvas = document.getElementById("world");
    try { S.init(canvas); } catch (e) { document.getElementById("nogl").hidden = false; return; }
    T.init(); TPM.traffic.init(); TPM.models.init();
    UI.init(); UI.applyQuality();
    TPM.minimap.init(document.getElementById("mm"));
    S.hooks.frame = TPM.city.frame; S.hooks.after = UI.frame;
    S.target.set(TPM.config.start.x, 0, TPM.config.start.z);
    S.start();
    try { TPM.models.makeThumbs(); } catch (e) { console.warn(e); }
    UI.renderList();
    document.body.classList.add("ready");
    UI.fromHash();
    TPM.DB.open();
    UI.status("Загружаю кварталы…", true);
    const iv = setInterval(() => { if (!T.isBusy()) { UI.status(""); clearInterval(iv); } }, 400);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
