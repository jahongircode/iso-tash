// =====================================================================
//  Интерфейс: список мест, карточка с фото, кнопки, подписи, «где я»,
//  часы, экскурсия.
// =====================================================================
(function () {
  const S = TPM.scene, City = TPM.city, C = TPM.config, T = TPM.tiles;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tpm3-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("tpm3-" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const UI = TPM.ui = { store };
  let labels = new Map(), activeCat = "all", query = "", tour = null;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function thumb(l, w, h) {
    const src = TPM.models.thumbs[l.id];
    const d = el("div", "thumb-img");
    d.style.width = w + "px"; d.style.height = h + "px";
    if (src) d.style.backgroundImage = `url(${src})`;
    return d;
  }

  UI.init = function () {
    const cats = $("#cats");
    const mk = (id, name, color) => {
      const b = el("button", "chip" + (id === "all" ? " on" : ""), name);
      if (color) b.style.setProperty("--c", color);
      b.onclick = () => { activeCat = id; cats.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b)); renderList(); };
      cats.appendChild(b);
    };
    mk("all", "Все");
    for (const id in TPM.categories) mk(id, TPM.categories[id].name, TPM.categories[id].color);
    $("#search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
    $("#btn-places").onclick = () => togglePanel();
    $("#places-close").onclick = () => togglePanel(false);
    $("#btn-tour").onclick = () => toggleTour();
    const lay = $("#labels");
    for (const l of TPM.landmarks) {
      const d = el("div", "lbl", `<i style="--c:${TPM.categories[l.cat].color}"></i>${esc(l.name)}`);
      d.onclick = () => UI.select(l);
      lay.appendChild(d); labels.set(l.id, d);
    }
    $("#card-close").onclick = () => UI.deselect();
    $("#card-prev").onclick = () => step(-1);
    $("#card-next").onclick = () => step(1);
    $("#zin").onclick = () => S.zoomBy(0.6);
    $("#zout").onclick = () => S.zoomBy(1.6);
    $("#rotl").onclick = () => S.rotate(-1);
    $("#rotr").onclick = () => S.rotate(1);

    const timeModes = ["auto", "day", "night", "cycle"], tName = { auto: "Авто", day: "День", night: "Ночь", cycle: "Цикл" };
    const tBtn = $("#btn-time");
    const setTime = (m) => { City.timeMode = m; store.set("time", m); tBtn.querySelector("b").textContent = tName[m]; };
    tBtn.onclick = () => setTime(timeModes[(timeModes.indexOf(City.timeMode) + 1) % 4]);
    setTime(store.get("time", "auto"));
    const qBtn = $("#btn-q"), qs = ["auto", "low", "mid", "high"];
    const setQ = (q) => {
      store.set("q", q);
      const real = q === "auto" ? UI.autoQuality() : q;
      City.setQuality(C.quality[real], real);
      qBtn.querySelector("b").textContent = q === "auto" ? "Авто·" + C.quality[real].label : C.quality[real].label;
    };
    qBtn.onclick = () => setQ(qs[(qs.indexOf(store.get("q", "auto")) + 1) % 4]);
    UI.applyQuality = () => setQ(store.get("q", "auto"));
    const aBtn = $("#btn-anim");
    const setAnim = (on) => { City.animOn = on; store.set("anim", on); aBtn.classList.toggle("off", !on); aBtn.querySelector("b").textContent = on ? "Вкл" : "Пауза"; };
    aBtn.onclick = () => setAnim(!City.animOn);
    setAnim(store.get("anim", !window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    $("#btn-settings").onclick = () => $("#tools").classList.toggle("open");

    S.hooks.tap = (x, y) => { const l = TPM.models.pick(x, y); if (l) UI.select(l); else if (City.selected) UI.deselect(); };
    let hv = 0;
    S.hooks.hover = (x, y) => {
      const now = performance.now(); if (now - hv < 80) return; hv = now;
      const l = TPM.models.pick(x, y);
      if (l !== City.hover) { City.hover = l; S.renderer.domElement.style.cursor = l ? "pointer" : ""; }
    };
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") { UI.deselect(); togglePanel(false); } });
    window.addEventListener("hashchange", fromHash);
  };
  UI.renderList = renderList;
  UI.autoQuality = function () {
    const mem = navigator.deviceMemory || 4, cpu = navigator.hardwareConcurrency || 4;
    const save = navigator.connection && navigator.connection.saveData;
    if (save || mem <= 2 || cpu <= 2 || /Android|iPhone/.test(navigator.userAgent) && mem <= 4) return "low";
    if (mem >= 8 && cpu >= 8 && window.innerWidth > 900) return "high";
    return "mid";
  };
  function togglePanel(force) { const p = $("#places"); p.classList.toggle("open", force ?? !p.classList.contains("open")); }
  function renderList() {
    const list = $("#list"); list.innerHTML = "";
    const items = TPM.landmarks.filter((l) => (activeCat === "all" || l.cat === activeCat) && (!query || (l.name + " " + l.uz + " " + l.desc).toLowerCase().includes(query)));
    if (!items.length) list.appendChild(el("div", "empty", "Ничего не найдено"));
    for (const l of items) {
      const row = el("button", "place");
      const th = el("div", "thumb"); th.appendChild(thumb(l, 72, 60)); row.appendChild(th);
      row.appendChild(el("div", "pl-txt", `<b>${esc(l.name)}</b><span>${esc(l.uz)}</span><em style="--c:${TPM.categories[l.cat].color}">${TPM.categories[l.cat].name}</em>`));
      row.onclick = () => { UI.select(l); if (window.innerWidth < 760) togglePanel(false); };
      list.appendChild(row);
    }
  }

  // ---------- выбор места ----------
  UI.select = function (l, opts = {}) {
    if (l.mx === undefined) return;
    City.selected = l;
    const r = l.radius || 60, mobile = window.innerWidth < 760;
    const avail = mobile ? Math.min(S.w, S.h * 0.5) : Math.min(S.w - 420 / S.px, S.h);
    const mpp = Math.max(0.16, Math.min(1.6, (r * 2.3) / Math.max(120, avail)));
    // сдвигаем цель, чтобы место было левее карточки (или выше нижней шторки)
    const R = new THREE.Vector3().setFromMatrixColumn(S.camera.matrixWorld, 0); R.y = 0; R.normalize();
    const F = new THREE.Vector3().setFromMatrixColumn(S.camera.matrixWorld, 1); F.y = 0; F.normalize();
    const sh = mobile ? 0 : 210 * mpp / S.px, sv = mobile ? S.H * 0.2 * mpp / S.px / Math.sin(S.el) : 0;
    const top = (l.top || 20) * 0.35;
    const x = l.mx + R.x * sh - F.x * (sv - top), z = l.mz + R.z * sh - F.z * (sv - top);
    S.flyTo(x, z, mpp);
    showCard(l);
    if (!opts.noHash) { try { history.replaceState(null, "", "#" + l.id); } catch (e) {} }
  };
  UI.deselect = function () {
    City.selected = null; $("#card").classList.remove("open");
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (tour) toggleTour(false);
  };
  function step(d) { const a = TPM.landmarks, i = a.indexOf(City.selected); UI.select(a[(i + d + a.length) % a.length]); }
  function showCard(l) {
    const cat = TPM.categories[l.cat];
    $("#card-art").innerHTML = ""; $("#card-art").appendChild(thumb(l, 340, 186));
    $("#card-icon").innerHTML = ""; $("#card-icon").appendChild(thumb(l, 62, 54));
    showPhoto(l);
    $("#card-cat").textContent = cat.name; $("#card-cat").style.setProperty("--c", cat.color);
    $("#card-title").textContent = l.name; $("#card-uz").textContent = l.uz; $("#card-desc").textContent = l.desc;
    const f = $("#card-facts"); f.innerHTML = "";
    for (const k in l.facts) f.appendChild(el("div", "fact", `<span>${esc(k)}</span><b>${esc(l.facts[k])}</b>`));
    $("#card-tip").textContent = l.tip;
    $("#card-gmaps").href = `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
    $("#card-route").href = `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;
    $("#card").classList.add("open"); $("#card").scrollTop = 0; $("#tools").classList.remove("open");
  }
  function showPhoto(l) {
    const fig = $("#card-photo"), art = $("#card-art");
    fig.hidden = true; art.hidden = false;
    TPM.photos.get(l).then((p) => {
      if (City.selected !== l || !p || p.none) return;
      const img = $("#card-photo img");
      img.onload = () => { if (City.selected === l) { fig.hidden = false; art.hidden = true; } };
      img.onerror = () => { fig.hidden = true; art.hidden = false; };
      img.alt = l.name; img.src = p.src;
      const lic = p.licenseUrl ? `<a href="${p.licenseUrl}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license);
      $("#card-photo figcaption").innerHTML = `Фото: ${esc(p.artist)} · ${lic} · <a href="${p.page}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    });
  }
  function fromHash() {
    const id = decodeURIComponent(location.hash.slice(1)), l = TPM.landmarks.find((x) => x.id === id);
    if (l && l !== City.selected) UI.select(l, { noHash: true });
  }
  UI.fromHash = fromHash;
  function toggleTour(force) {
    const on = force ?? !tour, b = $("#btn-tour");
    if (!on) { clearInterval(tour); tour = null; b.classList.remove("on"); b.textContent = "▶ Экскурсия"; return; }
    let i = Math.max(0, TPM.landmarks.indexOf(City.selected));
    const go = () => { const l = TPM.landmarks[i++ % TPM.landmarks.length]; UI.select(l, { noHash: true }); };
    go(); tour = setInterval(go, 9000);
    b.classList.add("on"); b.textContent = "■ Стоп";
    if (window.innerWidth < 760) togglePanel(false);
  }

  // ---------- каждый кадр ----------
  let lastKey = "", lastClock = 0, lastWhere = 0, lastWhereKey = "";
  const pp = [0, 0];
  UI.frame = function () {
    const key = S.camera.matrixWorld.elements.slice(12, 15).map((v) => v.toFixed(2)).join() + S.mpp.toFixed(4) + S.az + S.W + (City.selected && City.selected.id) + (City.hover && City.hover.id);
    if (key !== lastKey) {
      lastKey = key;
      const show = S.mpp < 2.4;
      const order = TPM.landmarks.filter((l) => l.mx !== undefined).map((l) => { S.project(l.mx, (l.top || 20) + 6, l.mz, pp); return { l, x: pp[0], y: pp[1] }; });
      order.sort((a, b) => (b.l === City.selected) - (a.l === City.selected) || (b.l === City.hover) - (a.l === City.hover) || b.y - a.y);
      const placed = [];
      for (const o of order) {
        const d = labels.get(o.l.id); if (!d) continue;
        let on = (show || o.l === City.selected || o.l === City.hover) && o.x > -100 && o.x < S.W + 100 && o.y > -40 && o.y < S.H + 40;
        if (on) {
          const w = d._w || (d._w = d.offsetWidth || o.l.name.length * 8 + 24), r = [o.x - w / 2, o.y - 24, o.x + w / 2, o.y];
          if (placed.some((q) => r[0] < q[2] + 4 && r[2] > q[0] - 4 && r[1] < q[3] + 2 && r[3] > q[1] - 2) && o.l !== City.selected) on = false; else placed.push(r);
        }
        d.style.display = on ? "" : "none";
        if (on) { d.style.transform = `translate(${o.x | 0}px,${(o.y - 24) | 0}px) translateX(-50%)`; d.classList.toggle("sel", o.l === City.selected); }
      }
      $("#compass svg").style.transform = `rotate(${-S.az * 180 / Math.PI}deg)`;
    }
    const now = performance.now();
    if (now - lastWhere > 350) {
      lastWhere = now;
      const w = TPM.areas.where(S.target.x, S.target.z);
      const top = w.place || w.district, sub = w.place ? w.district : "";
      const k2 = top + "|" + sub + "|" + w.city;
      if (k2 !== lastWhereKey) { lastWhereKey = k2; $("#where-name").textContent = top; $("#where-district").textContent = sub; $("#where-city").textContent = w.city; }
    }
    TPM.minimap.frame();
    if (now - lastClock > 1000) {
      lastClock = now;
      const h = City.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const season = { winter: "зима", spring: "весна", summer: "лето", autumn: "осень" }[City.season];
      $("#clock").textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · Ташкент · ${season}`;
      let b = 0; for (const r of T.loaded.values()) if (r.state === "ok" && T.wanted && T.wanted.has(r.k)) b += r.bcount || 0;
      $("#stats").textContent = `домов в кадре ~${b.toLocaleString("ru")} · машин ${S.mpp < C.carMpp ? TPM.traffic.cars.filter((c) => c.e).length : 0}`;
    }
  };
  let tt = 0;
  UI.status = (text, busy) => { const s = $("#status"); s.textContent = text || ""; s.classList.toggle("busy", !!busy); s.style.display = text ? "" : "none"; };
  UI.toast = (text, ms = 5000) => { const t = $("#toast"); t.textContent = text; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), ms); };
})();
