// =====================================================================
//  «Где я»: район (туман) по границам OSM и квартал/махалля по ближайшему
//  названию места. Границы запекаются в data/areas.js.
// =====================================================================
(function () {
  const T = TPM.tiles;
  const A = TPM.areas = { data: null };
  window.TPM_AREAS = (d) => {
    for (const it of [d.city, ...(d.districts || [])]) if (it) it.bb = it.rings.map((r) => { let a = 1e9, b = 1e9, c = -1e9, e = -1e9; for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); c = Math.max(c, r[i]); b = Math.min(b, r[i + 1]); e = Math.max(e, r[i + 1]); } return [a, b, c, e]; });
    A.data = d;
  };
  const FALLBACK = [["Чиланзарский район", 41.280, 69.205], ["Учтепинский район", 41.300, 69.165], ["Алмазарский район", 41.352, 69.215],
    ["Шайхантахурский район", 41.325, 69.245], ["Юнусабадский район", 41.370, 69.290], ["Мирзо-Улугбекский район", 41.335, 69.340],
    ["Яшнабадский район", 41.290, 69.340], ["Мирабадский район", 41.295, 69.280], ["Яккасарайский район", 41.285, 69.250],
    ["Сергелийский район", 41.225, 69.230], ["Янгихаётский район", 41.205, 69.185], ["Бектемирский район", 41.225, 69.335], ["Новый Ташкент", 41.292, 69.442]];
  let fb = null;
  function pip(r, x, z) { let ins = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const zi = r[i + 1], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < (r[j] - r[i]) * (z - zi) / (zj - zi) + r[i]) ins = !ins; } return ins; }
  function inside(it, x, z) { for (let k = 0; k < it.rings.length; k++) { const b = it.bb[k]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (pip(it.rings[k], x, z)) return true; } return false; }
  function nearestPlace(x, z) {
    const W = { 1: 1, 2: 1, 3: 1.6, 4: 1, 5: 1.3, 6: 2.5 };
    let best = null, bd = Infinity;
    for (const r of T.loaded.values()) {
      if (r.state !== "ok" || !r.places) continue;
      for (const p of r.places) { const w = W[p.c]; if (!w) continue; const d = Math.hypot(p.x - x, p.z - z) / w; if (d < bd) { bd = d; best = p; } }
    }
    return bd < 1500 ? best : null;
  }
  A.where = function (x, z) {
    let district = null, inCity = true;
    const d = A.data;
    if (d && d.districts && d.districts.length) {
      for (const it of d.districts) if (inside(it, x, z)) { district = it.name; break; }
      if (d.city && !inside(d.city, x, z)) inCity = false;
    }
    if (!district) {
      if (!fb) fb = FALLBACK.map(([n, la, lo]) => { const [mx, mz] = T.ll2m(la, lo); return { n, x: mx, z: mz }; });
      let best = null, bd = Infinity; for (const f of fb) { const dd = Math.hypot(f.x - x, f.z - z); if (dd < bd) { bd = dd; best = f; } }
      if (best && bd < 7000) district = best.n;
    }
    const p = nearestPlace(x, z), nt = district && /Нов|Yangi/i.test(district);
    return { place: p ? p.n : null, district: district || (inCity ? "Ташкент" : "Ташкентская область"),
      city: nt ? "Новый Ташкент · строится" : inCity ? "Ташкент" : "Ташкентская область" };
  };
})();
