// =====================================================================
//  Город: время суток (солнце, тени, ночные огни), качество, цикл кадра.
// =====================================================================
(function () {
  const C = TPM.config, S = TPM.scene, T = TPM.tiles;
  const City = TPM.city = { Q: C.quality.mid, qName: "mid", timeMode: "auto", night: 0, hour: 12, animOn: true, simTime: 0, selected: null, hover: null };
  const col = (h) => new THREE.Color(h);
  const PAL = {
    day:   { sun: col(0xfff0d8), sky: col(0xdde6f5), gnd: col(0x6c6652), bg: col(0x8f8a72) },
    dusk:  { sun: col(0xffb070), sky: col(0xc8a8a0), gnd: col(0x5a4a40), bg: col(0x6e5a52) },
    night: { sun: col(0x8796d0), sky: col(0x4a5a90), gnd: col(0x2a2a36), bg: col(0x1c2030) },
  };
  const tmpC = new THREE.Color();
  S.sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  const month = new Date().getMonth();
  City.season = month <= 1 || month === 11 ? "winter" : month <= 3 ? "spring" : month <= 8 ? "summer" : "autumn";

  function sunTimes() {
    const now = new Date(), doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const c = Math.cos(2 * Math.PI * (doy - 172) / 365);
    return { rise: 6.35 - 1.45 * c, set: 18.45 + 1.5 * c, maxE: 48 + 24 * c };
  }
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function mix(k, dusk, night) { return tmpC.copy(PAL.day[k]).lerp(PAL.dusk[k], Math.min(1, dusk) * (1 - night)).lerp(PAL.night[k], night).clone(); }
  function dayNight() {
    let h; const st = sunTimes();
    if (City.timeMode === "auto") { const d = new Date(); h = (d.getUTCHours() + 5 + d.getUTCMinutes() / 60) % 24; }
    else if (City.timeMode === "day") h = 13.5;
    else if (City.timeMode === "night") h = 23;
    else h = (City.simTime / C.cycleSeconds * 24 + 9) % 24;
    City.hour = h;
    const night = h < 12 ? 1 - sm(st.rise - 0.4, st.rise + 0.7, h) : sm(st.set - 0.5, st.set + 0.8, h);
    const dusk = Math.max(0, 1 - Math.abs(h - st.set) / 1.2) + Math.max(0, 1 - Math.abs(h - st.rise) / 1.0) * 0.7;
    City.night = night;
    // солнце: восход на востоке (+x), полдень на юге (+z), закат на западе
    let t = (h - st.rise) / (st.set - st.rise);
    if (night > 0.5) t = 0.35; // ночью — «луна»
    t = Math.min(0.97, Math.max(0.03, t));
    const phi = Math.PI * t, E = Math.max(12, st.maxE * Math.sin(Math.PI * t)) * Math.PI / 180;
    S.sunDir.set(Math.cos(phi) * Math.cos(E), Math.sin(E), Math.sin(phi) * Math.cos(E));
    S.sun.color.copy(mix("sun", dusk, night)); S.sun.intensity = 0.95 * (1 - night) + 0.3 * night;
    S.hemi.color.copy(mix("sky", dusk, night)); S.hemi.groundColor.copy(mix("gnd", dusk, night)); S.hemi.intensity = 0.62 * (1 - night) + 0.52 * night;
    S.scene.background = mix("bg", dusk, night);
    T.uNight.value = night;
    if (T.M) { // издалека фонари мельче и тусклее, иначе улицы превращаются в белый пунктир
      const far = Math.min(1, Math.max(0, (S.mpp - 1.6) / 2.4));
      T.M.lamp.opacity = Math.min(1, night * 1.4) * (1 - far * 0.55); T.M.halo.opacity = Math.min(0.22, night * 0.3) * (1 - far * 0.6);
      T.M.lamp.size = S.mpp > 2.2 ? 1 : S.px >= 3 ? 1.5 : 2; T.M.halo.size = Math.min(48, Math.max(3, 14 / S.mpp));
    }
  }

  City.frame = function (dt) {
    const sim = City.animOn ? dt : 0;
    City.simTime += sim;
    dayNight();
    T.update();
    // тени — только вблизи (на дальнем плане тени нарисованы в текстуре)
    const shOn = City.Q.shadows > 0 && S.mpp < (City.Q.shadowMpp || 0) && T.lod === 0;
    if (S.sun.castShadow !== shOn) S.sun.castShadow = shOn;
    T.uTime.value = City.simTime;
    T.uWin.value = Math.min(1, Math.max(0, (1.7 - S.mpp) / 0.9));
    TPM.traffic.update(sim, City.simTime, City.Q);
    TPM.models.update(City.simTime, City.night);
  };
  City.setQuality = function (q, name) {
    City.Q = q; City.qName = name;
    S.fps = q.fps; S.setPixel(q.px); S.setShadows(q.shadows);
  };
})();
