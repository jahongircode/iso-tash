// =====================================================================
//  Детальные модели заметных ЖК и башен (без карточек — это фон города):
//  U-Tower, Modera Towers, Mirabad Avenue, «Казахстан», NRG Oybek,
//  Xon Saroy Sayram, экспериментальный дом «Жемчуг», башня Национального банка (НБУ),
//  аэропорт Ташкента с самолётами Uzbekistan Airways, Piramit Tower, Ассоциация банков, Международный
//  бизнес-центр, Законодательная палата Олий Мажлиса, башни SQB, BoMI, Asaka Bank и Aloqa Bank;
//  ботанический сад им. Русанова: оранжерея и теплица, эстрада с амфитеатром, мостик, вход, клумбы;
//  Центр исламской цивилизации у Хазрати Имама; IT Park Uzbekistan (башни, подиумы, логотипы);
//  ансамбль площади Хамида Алимджана, обе стороны (18-этажки с короной и ночной подсветкой этажей);
//  вантовый пешеходный мост «знак бесконечности» через Анхор у парка «Навруз»;
//  бизнес-парк Trilliant: офисные башни и отель InterContinental на общем подиуме;
//  исторический кирпичный корпус Вестминстерского университета с башней-часами;
//  вокзал «Ташкент» (портал, колоннады, вывески) и скоростной поезд Afrosiyob у перрона;
//  здание «Узбекэнерго» у сквера Амира Темура (солнцезащитная решётка, портал, фонтан);
//  гостиницы City Palace (стеклянная башня, купол, портик) и Hyatt Regency (белый камень, синие ленты);
//  квартал у дворца Романова: БЦ «Пойтахт», Национальная библиотека, Дворец творчества молодёжи, галерея, Монетный двор;
//  Дом печати «Шарк» / УзА с типографией и Государственный музей истории Узбекистана;
//  бывшие Мужская и Женская гимназии на Сайилгох (корпуса Юридического университета);
//  квартал на ул. Бухоро: биржа «Тошкент» с куполом, Beeline, «Узавтосаноат», новые башни;
//  бывший Ташкентский кадетский корпус (ныне Академия вооружённых сил) из красного кирпича с куполом;
//  мемориал «Шахидлар хотираси»: ротонда с бирюзовым куполом, партер, музей памяти жертв репрессий.
//  Сверены с фотографиями; контуры корпусов — из OSM (data/lm.js, поле parts).
// =====================================================================
(function () {
  const MD = TPM.models, M = MD.M, P = MD.P, se = MD.se;
  const k3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const to = (b, list) => b[list].push(b.parts.pop());

  // ---------------- геометрия контуров ----------------
  const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return a / 2; };
  // корпуса комплекса в локальных координатах модели, обход — как у winBox
  function localParts(o) {
    return (o.parts || []).map((pt) => {
      const p = pt.p.map(([x, z]) => o.local(x, z)); if (area(p) < 0) p.reverse();
      const xs = p.map((v) => v[0]), zs = p.map((v) => v[1]);
      return { h: pt.h, mh: pt.mh || 0, p, cx: xs.reduce((a, v) => a + v, 0) / p.length, cz: zs.reduce((a, v) => a + v, 0) / p.length,
        x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), A: Math.abs(area(p)) };
    });
  }
  // сдвиг контура наружу (d > 0) или внутрь (d < 0) с ограничением «усов» на острых углах
  function offset(p, d) {
    const n = p.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], c = p[i], e = p[(i + 1) % n];
      const l1 = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, l2 = Math.hypot(e[0] - c[0], e[1] - c[1]) || 1;
      const n1 = [(c[1] - a[1]) / l1, -(c[0] - a[0]) / l1], n2 = [(e[1] - c[1]) / l2, -(e[0] - c[0]) / l2];
      let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const k = d / Math.max(0.35, mx * n1[0] + mz * n1[1]);
      out.push([c[0] + mx * k, c[1] + mz * k]);
    }
    return out;
  }
  // плоская крыша произвольного (в т.ч. вогнутого) контура
  function cap(b, p, y, col, list = "parts") {
    const tri = THREE.ShapeUtils.triangulateShape(p.map((v) => new THREE.Vector2(v[0], v[1])), []), arr = [];
    for (const t of tri) for (const i of t) arr.push(p[i][0], y, p[i][1]);
    b.raw(arr, col, list);
  }
  // рёбра-пилястры по периметру с шагом step
  function pilasters(b, p, y0, y1, step, w, d, col, list = "parts") {
    for (let i = 0; i < p.length; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 2) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / step));
      for (let k = 0; k <= n; k++) { const t = k / n; b.box(x0 + (x1 - x0) * t + nx * d / 2, y0, z0 + (z1 - z0) * t + nz * d / 2, w, y1 - y0, d, col, ry); if (list !== "parts") to(b, list); }
    }
  }
  const band = (b, p, d, y, h, col, list = "parts") => { const r = offset(p, d); b.loft(r, y, r, y + h, col, list); };

  // ---------------- корпус по контуру OSM ----------------
  // st: wall, frame, trim, base (стекло первого этажа), roof, win (id окон), pil (шаг пилястр),
  //     every (пояс через N этажей), crown: "flat" | "mansard" | "penthouse", led (подсветка рёбер)
  function block(b, p, y0, H, st) {
    const hb = st.baseH || 4.6, crownH = st.crown === "mansard" ? 5.2 : st.crown === "penthouse" ? 6.4 : 0, top = H - crownH;
    b.loft(p, y0, p, y0 + hb, st.base || [0.24, 0.28, 0.32], "glow");                            // витрины первого этажа
    band(b, p, 0.45, y0 + hb, 0.7, st.trim);
    b.winRing(p, y0 + hb + 0.7, top, st.wall, st.win || 9);
    if (st.pil) pilasters(b, p, y0 + hb + 0.7, top, st.pil, st.pilW || 0.7, 0.45, st.frame);
    for (let y = y0 + hb + 0.7 + 3.1 * (st.every || 4); y < top - 2; y += 3.1 * (st.every || 4)) band(b, p, 0.3, y, 0.45, st.trim);
    band(b, p, 0.7, top - 0.2, 1.0, st.trim);                                                     // карниз
    if (st.crown === "mansard") {                                                                  // мансарда со слуховыми окнами
      const inner = offset(p, -3.2);
      b.loft(offset(p, 0.3), top + 0.8, inner, top + crownH, st.roof || [0.28, 0.31, 0.37]);
      cap(b, inner, top + crownH, k3(st.roof || [0.28, 0.31, 0.37], 0.85));
      for (let i = 0; i < p.length; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 6) continue;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.floor(L / 6.5);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t - nx * 1.2, z = z0 + (z1 - z0) * t - nz * 1.2;
          b.box(x, top + 1.2, z, 1.9, 2.6, 1.4, st.trim, ry);
          b.box(x + nx * 0.72, top + 1.6, z + nz * 0.72, 1.1, 1.7, 0.1, [0.3, 0.36, 0.44], ry, true);
        }
      }
    } else if (st.crown === "penthouse") {                                                         // стеклянный пентхаус с колоннадой
      b.loft(p, top + 0.8, p, top + crownH - 0.8, [0.36, 0.42, 0.48], "glow");
      pilasters(b, p, top + 0.8, top + crownH - 0.8, 3.2, 0.6, 0.5, st.trim);
      band(b, p, 0.6, top + crownH - 0.8, 0.8, st.trim);
      cap(b, p, top + crownH, st.roof || [0.6, 0.6, 0.6]);
    } else cap(b, p, top + 0.8, st.roof || [0.6, 0.6, 0.6]);
    if (st.led) pilasters(b, p, y0 + hb, top, 1e9, 0.35, 0.6, [0.82, 0.8, 0.95], "led");          // подсветка углов
    return top + crownH;
  }
  // вентблоки и выходы на кровлю
  function roofKit(b, q, y, col = [0.62, 0.62, 0.64]) {
    const w = q.x1 - q.x0, d = q.z1 - q.z0;
    b.box(q.cx, y, q.cz, Math.min(6, w * 0.25), 2.6, Math.min(5, d * 0.25), col);
    b.box(q.cx + w * 0.22, y, q.cz - d * 0.18, 2.4, 1.6, 2.4, k3(col, 0.9));
  }

  // ---------------- Mirabad Avenue ----------------
  // 14 корпусов вокруг дворов: песочный камень, бронзовые рамы окон, стеклянные витрины с тёплым светом,
  // угловые башни со стеклянными пентхаусами, малые корпуса — со светлым карнизом.
  M.mirabad_avenue = (b, o) => {
    const st = { wall: [0.85, 0.77, 0.63], frame: [0.36, 0.29, 0.22], trim: [0.93, 0.89, 0.8], base: [0.42, 0.36, 0.26], roof: [0.66, 0.64, 0.6], win: 61, pil: 3.4, pilW: 0.55, every: 3 };
    for (const q of localParts(o)) {
      const top = block(b, q.p, 0, q.h, Object.assign({}, st, { crown: q.h > 35 ? "penthouse" : "flat", every: q.h > 35 ? 3 : 2 }));
      roofKit(b, q, top);
    }
  };

  // ---------------- ЖК «Казахстан» ----------------
  // Неоклассика в парижском духе: белый фасад с пилястрами и поясами, арочный цоколь в два этажа,
  // тёмно-сизая мансарда со слуховыми окнами, во дворе — белая беседка.
  M.kazakhstan = (b, o) => {
    for (const q of localParts(o)) {
      block(b, q.p, 0, q.h, { wall: [0.94, 0.93, 0.9], frame: [0.98, 0.98, 0.96], trim: [0.99, 0.98, 0.95], base: [0.36, 0.33, 0.3], roof: [0.25, 0.29, 0.36], win: 72, pil: 4.2, pilW: 0.8, every: 3, baseH: 7.5, crown: "mansard" });
      // арки цоколя
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 5) continue;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.floor(L / 4.2);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t + nx * 0.5, z = z0 + (z1 - z0) * t + nz * 0.5;
          const g = new THREE.TorusGeometry(1.3, 0.22, 4, 10, Math.PI); g.rotateY(ry); b.add(g, [0.99, 0.98, 0.95], x, 5.2, z);
        }
      }
      const g = new THREE.CylinderGeometry(4.2, 4.2, 0.3, 8); g.translate(0, 0.15, 0);
      b.add(g, [0.85, 0.83, 0.8], q.cx, 0, q.cz); b.columns(q.cx, q.cz, 0.3, 3.6, 8, 0.18, 3.2, [0.98, 0.98, 0.96]);
      b.dome(q.cx, 3.5, q.cz, 4.1, [0.3, 0.33, 0.38], { hk: 0.6, seg: 8, tip: false });
    }
  };

  // ---------------- Xon Saroy Sayram ----------------
  // Кремовый фасад с белыми лентами балконов, тёмный цоколь с магазинами, тёмная корона с вывеской,
  // ночью — фиолетовая подсветка углов.
  M.xon_saroy = (b, o) => {
    for (const q of localParts(o)) {
      const top = block(b, q.p, 0, q.h - 3, { wall: [0.95, 0.91, 0.83], frame: [1, 1, 0.98], trim: [1, 0.99, 0.96], base: [0.16, 0.16, 0.18], roof: [0.22, 0.22, 0.26], win: 88, pil: 6.5, every: 1, crown: "mansard", led: true });
      for (let y = 7.4; y < top - 6; y += 3.1) band(b, q.p, 1.2, y, 0.25, [1, 1, 0.98]);                   // ленты балконов
      const w = Math.min(q.x1 - q.x0, 22);
      b.box(q.cx, top, q.z1 - 1.5, w, 3, 1, [0.14, 0.14, 0.16]); b.box(q.cx, top + 0.8, q.z1 - 0.95, w * 0.8, 1.3, 0.1, [1, 0.9, 0.62], 0, true); // вывеска XON SAROY
    }
  };

  // ---------------- NRG Oybek ----------------
  // Светло-бежевые башни с коричнево-серыми вертикальными лопатками, ступенчатый верх главной башни,
  // светящийся логотип NRG.
  M.nrg_oybek = (b, o) => {
    const Q = localParts(o), main = Q.reduce((a, q) => (q.h > a.h ? q : a), Q[0]);
    for (const q of Q) {
      const isMain = q === main;
      const top = block(b, q.p, 0, q.h - (isMain ? 4 : 0), { wall: [0.89, 0.84, 0.75], frame: [0.42, 0.38, 0.34], trim: [0.95, 0.92, 0.86], base: [0.3, 0.3, 0.32], roof: [0.6, 0.58, 0.56], win: 53 + Q.indexOf(q), pil: 3.1, pilW: 0.9, every: 4 });
      if (isMain) {
        const r = offset(q.p, -2.4); b.loft(r, top + 0.8, r, top + 4, [0.89, 0.84, 0.75]); band(b, r, 0.5, top + 4, 0.8, [0.95, 0.92, 0.86]); cap(b, r, top + 4.8, [0.6, 0.58, 0.56]);
        b.box(q.cx, top + 4.8, q.z1 - 3, 10, 3, 0.8, [0.18, 0.2, 0.26]); b.box(q.cx, top + 5.3, q.z1 - 2.5, 8, 2, 0.1, [0.75, 0.88, 1], 0, true); // NRG
      } else roofKit(b, q, top);
    }
  };

  // ---------------- экспериментальный дом «Жемчуг» (1985, О. Айдинова) ----------------
  // Три скруглённых корпуса из белого бетона; через каждые три этажа — открытые дворики-патио на круглых
  // колоннах с терракотовыми стенами квартир; на крыше — «грибы»-навесы с бирюзовыми куполами.
  M.jemchug = (b, o) => {
    const WH = [0.9, 0.89, 0.85], BR = [0.66, 0.36, 0.26], DK = [0.2, 0.19, 0.2];
    const Q = localParts(o), all = Q.flatMap((q) => q.p), cx = all.reduce((a, v) => a + v[0], 0) / all.length, cz = all.reduce((a, v) => a + v[1], 0) / all.length;
    for (const q of Q) {
      if (q.A < 60) { b.loft(q.p, 0, q.p, q.h, WH); cap(b, q.p, q.h, k3(WH, 0.85)); continue; }     // лестнично-лифтовой узел
      const H = q.h, fl = 3.1;
      b.loft(q.p, 0, q.p, 4, [0.3, 0.32, 0.34], "glow");
      for (let y = 4, f = 0; y < H - 1; y += fl, f++) {
        if (f % 4 === 3) {                                                                        // патио: глубокая ниша и колонны
          const r = offset(q.p, -2.2); b.loft(r, y, r, y + fl, BR); cap(b, q.p, y + 0.05, [0.78, 0.76, 0.72]);
          for (let i = 0; i < q.p.length; i += 3) { const [px, pz] = offset(q.p, -0.8)[i]; b.cyl(px, y, pz, 0.45, fl, WH, 8); }
          band(b, q.p, 0.15, y + 0.9, 0.12, DK);                                                  // ограждение
        } else { b.winRing(q.p, y, y + fl, WH, 33); band(b, q.p, 0.35, y + fl - 0.4, 0.4, [0.95, 0.94, 0.91]); }
      }
      cap(b, q.p, H, [0.74, 0.72, 0.68]); band(b, q.p, 0.3, H, 1.1, WH);
    }
    // навесы-«грибы» на крыше
    const H = Math.max(...Q.map((q) => q.h));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, x = cx + Math.cos(a) * 8, z = cz + Math.sin(a) * 8;
      b.cyl(x, H + 1, z, 0.35, 2.6, WH, 8); b.cyl(x, H + 3.6, z, 3.2, 0.35, WH, 14, 1.2);
      b.dome(x, H + 3.95, z, 1.3, [0.2, 0.55, 0.58], { hk: 0.9, seg: 10, tip: false });
    }
  };

  // ---------------- Modera Towers ----------------
  // Две 24-этажные башни-близнецы: тёмное стекло за частыми белыми рёбрами, верх срезан плавной дугой
  // (ночью кромка светится фиолетовым), общий стилобат из синего стекла с белыми поясами.
  M.modera = (b, o) => {
    // ЖК Modera Towers (ул. Шота Руставели, 19/2): две 25-этажные башни (~100 м) на общем стилобате.
    // По фото застройщика: белый каркас с частыми вертикальными рёбрами и тёмным остеклением,
    // у северной башни — скошенная корона (кровля поднимается к одному торцу), у южной — стрельчатая
    // корона из двух «лепестков» с узкой прорезью посередине. Стилобат — 4 этажа: белые пояса и ленты
    // стекла, логотип-ромб и вывеска MODERA. Ночью рёбра углов и кромки корон светятся сиреневым.
    // Башни повёрнуты относительно осей модели, поэтому всё строится в осях каждого корпуса (frame).
    const Q = localParts(o), groups = [];
    for (const q of Q) { let g = groups.find((G) => Math.hypot(G.cx - q.cx, G.cz - q.cz) < 15); if (!g) groups.push(g = { cx: q.cx, cz: q.cz, qs: [] }); g.qs.push(q); }
    const WH = [0.95, 0.95, 0.96], GL = [0.3, 0.36, 0.44], GL2 = [0.34, 0.42, 0.54], GLC = [0.44, 0.52, 0.62], NAVY = [0.16, 0.24, 0.5];
    const big = groups.map((G) => G.qs.reduce((a, v) => (v.A > a.A ? v : a)));
    const F0 = frame(big[0]);
    // ---- стилобат: прямоугольник в осях башен, охватывающий оба корпуса
    let a0 = 1e9, a1 = -1e9, c0 = 1e9, c1 = -1e9;
    for (const q of big) for (const [x, z] of q.p) { const a = (x - F0.cx) * F0.ux + (z - F0.cz) * F0.uz, c = (x - F0.cx) * F0.vx + (z - F0.cz) * F0.vz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
    const PH = 15, pc = [(a0 + a1) / 2, (c0 + c1) / 2], pA = (a1 - a0) / 2 + 2, pB = (c1 - c0) / 2 + 2;
    const prect = (dA, dB) => [FP(F0, pc[0] - dA, pc[1] - dB), FP(F0, pc[0] + dA, pc[1] - dB), FP(F0, pc[0] + dA, pc[1] + dB), FP(F0, pc[0] - dA, pc[1] + dB)];
    const pr = prect(pA, pB);
    b.loft(offset(pr, 0.2), 0, offset(pr, 0.2), 5, [0.3, 0.34, 0.38], "glow");                              // витрины первого этажа
    for (let y = 5; y < PH - 0.5; y += 3.4) { b.loft(pr, y, pr, y + 0.8, WH); b.loft(offset(pr, -0.1), y + 0.8, offset(pr, -0.1), y + 3.4, GL2, "glow"); }
    band(b, pr, 0.3, PH - 0.6, 1.0, WH); cap(b, pr, PH + 0.4, [0.55, 0.6, 0.55]);
    for (const s of [-1, 1]) { // вывеска MODERA и логотип-ромб на длинных фасадах стилобата
      const [mx, mz] = FP(F0, pc[0], pc[1] + s * (pB + 0.5));
      sign(b, "MODERA", mx, PH - 0.4, mz, F0.vx * s, F0.vz * s, 0.32, [0.92, 0.9, 0.86], "glow", 0.12);
      const [lx, lz] = FP(F0, pc[0] + pA * 0.62, pc[1] + s * (pB + 0.4));
      const dm = new THREE.BoxGeometry(2.2, 2.2, 0.2); dm.rotateZ(Math.PI / 4); dm.rotateY(Math.atan2(F0.vx * s, F0.vz * s));
      b.add(dm, NAVY, lx, 9.5, lz, 0, false); to(b, "neon");
    }
    // ---- башни
    groups.forEach((G, gi) => {
      const q = big[gi], f = frame(q), A = f.L / 2, B = f.W / 2, Hmax = Math.max(...G.qs.map((v) => v.h)), H0 = q.h - 4;
      const rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)], r = rect(A, B);
      b.winRing(offset(r, -0.05), PH, H0, GL, 70 + gi);
      pilasters(b, r, PH, H0, 1.8, 0.75, 0.5, WH);                                                    // частые белые рёбра
      for (let y = PH + 3.6; y < H0; y += 3.6) band(b, r, 0.2, y, 0.8, WH);                            // междуэтажные пояса
      for (const [sa, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = FP(f, sa * (A + 0.2), sc * (B + 0.2)); b.box(x, PH, z, 0.9, H0 - PH, 0.9, WH, f.ry); to(b, "led"); } // светящиеся углы
      // корона: срезы вдоль длинной оси с профилем верха top(t), t ∈ [-1, 1]
      const slanted = gi === 0;
      const top = slanted ? (t) => H0 + (Hmax + 6 - H0) * (t + 1) / 2
        : (t) => (Math.abs(t) < 0.06 ? H0 + 2 : H0 + (Hmax + 6 - H0) * Math.sqrt(Math.max(0, 1 - Math.pow((Math.abs(t) - 0.06) / 0.94, 2))) * (1 - 0.25 * Math.abs(t)));
      const N = 14;
      for (let i = 0; i < N; i++) {
        const t0 = -1 + 2 * i / N, t1 = -1 + 2 * (i + 1) / N, tm = (t0 + t1) / 2, y = top(tm); if (y < H0 + 0.5) continue;
        const [x, z] = FP(f, tm * A, 0);
        b.box(x, H0, z, A * 2 / N + 0.02, y - H0, B * 2 - 1.6, GLC, f.ry);                               // остеклённая «парус»-стена короны
        for (const s of [-1, 1]) { const [ex, ez] = FP(f, tm * A, s * (B - 0.3)); b.box(ex, y - 0.6, ez, A * 2 / N + 0.1, 0.6, 0.7, WH, f.ry); to(b, "led"); } // светящаяся кромка
        for (const s of [-1, 1]) { const [ex, ez] = FP(f, tm * A, s * (B - 0.5)); b.box(ex, H0, ez, 0.3, y - H0 - 0.6, 0.4, WH, f.ry); }  // рёбра короны
      }
      cap(b, rect(A - 0.1, B - 0.1), H0 + 0.01, [0.45, 0.47, 0.52]);
    });
  };

  // ориентированный прямоугольник корпуса (по самому выгодному ребру): центр, оси, размеры
  function frame(q) {
    let best = null;
    for (let i = 0; i < q.p.length; i++) {
      const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const [x, z] of q.p) { const a = x * ux + z * uz, c = -x * uz + z * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, c); b1 = Math.max(b1, c); }
      if (!best || (a1 - a0) * (b1 - b0) < best.ar) best = { ar: (a1 - a0) * (b1 - b0), ux, uz, a0, a1, b0, b1 };
    }
    let { ux, uz, a0, a1, b0, b1 } = best;
    if (b1 - b0 > a1 - a0) { const t = ux; ux = -uz; uz = t; [a0, a1, b0, b1] = [b0, b1, -a1, -a0]; }
    const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, ux, uz, vx: -uz, vz: ux, L: a1 - a0, W: b1 - b0, ry: Math.atan2(-uz, ux) };
  }
  // точка в осях корпуса
  const FP = (f, a, c) => [f.cx + f.ux * a + f.vx * c, f.cz + f.uz * a + f.vz * c];
  // контур «стадион» (прямоугольник со скруглёнными торцами) в осях корпуса
  function stadium(f, A, R, n = 10) {
    const pts = [], h = Math.max(0, A - R);
    for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + Math.PI * k / n; pts.push(FP(f, h + Math.cos(t) * R, Math.sin(t) * R)); }
    for (let k = 0; k <= n; k++) { const t = Math.PI / 2 + Math.PI * k / n; pts.push(FP(f, -h + Math.cos(t) * R, Math.sin(t) * R)); }
    return pts;
  }
  const twoSided = (b, r, y0, y1, col, list) => { b.loft(r, y0, r, y1, col, list); const rr = r.slice().reverse(); b.loft(rr, y0, rr, y1, col, list); };

  // ---------------- NRG U-Tower ----------------
  // По фото: тонкая пластина со скруглёнными торцами (около 30 этажей), по всей высоте — тонкие белые
  // ленты балконов с плавной волной и тёмное стекло между ними; верх — неглубокая «U»: торцы выше середины;
  // стилобат опоясан белыми решётчатыми стрельчатыми арками. Ночью ленты балконов светятся разными цветами.
  M.u_tower = (b, o) => {
    const Q = localParts(o), tw = Q.reduce((a, q) => (q.h > a.h ? q : a)), pod = Q.find((q) => q !== tw);
    const W = [0.97, 0.97, 0.98], GL = [0.2, 0.27, 0.36];
    const f = frame(tw), A = f.L / 2, R = Math.min(f.W / 2, 11), y0 = pod ? Math.min(pod.h, 9) : 0, H = Math.max(tw.h, 104), fl = 3.3;
    if (pod) {
      b.loft(pod.p, 0, pod.p, pod.h - 1, [0.28, 0.34, 0.4], "glow"); band(b, pod.p, 0.4, pod.h - 1, 1, W); cap(b, pod.p, pod.h, [0.5, 0.62, 0.42]);
      // стрельчатые решётчатые арки: пересекающиеся дуги вокруг стилобата
      const ring = offset(pod.p, 3.2);
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], Le = Math.hypot(x1 - x0, z1 - z0); if (Le < 6) continue;
        const n = Math.max(1, Math.round(Le / 6)), ry = Math.atan2(-(z1 - z0), x1 - x0);
        for (let k = 0; k <= n; k++) {
          const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          b.cyl(x, 0, z, 0.22, 2.5, W, 6);
          for (const s of [-1, 1]) { // стрельчатая арка из двух дуг
            const g = new THREE.TorusGeometry(Le / n * 0.75, 0.14, 4, 10, Math.PI / 2); g.rotateZ(s > 0 ? 0 : Math.PI / 2); g.translate(-s * Le / n * 0.25, 0, 0);
            g.rotateY(ry); b.add(g, W, x + (x1 - x0) / Le * s * Le / n / 2, 2.5, z + (z1 - z0) / Le * s * Le / n / 2);
          }
        }
      }
    }
    const core = stadium(f, A - 1.2, R - 1.2, 8), floors = Math.floor((H - 4 - y0) / fl), hornH = 3 * fl;
    for (let k = 0; k < floors; k++) {
      const y = y0 + k * fl, top = k >= floors - 3;   // верхние три этажа — только торцы («U»)
      const w = (i, n) => 1 + 0.03 * Math.sin(i / n * Math.PI * 4 + k * 0.45);
      const slab = stadium(f, A, R, 8).map(([x, z], i, arr) => { const k2 = w(i, arr.length); return [f.cx + (x - f.cx) * k2, f.cz + (z - f.cz) * k2]; });
      if (top) {
        for (const s of [-1, 1]) { // торцевая часть: полукруг + немного прямого участка
          const part = stadium(f, A, R, 8).filter(([x, z]) => s * ((x - f.cx) * f.ux + (z - f.cz) * f.uz) > A - R - 4);
          if (part.length > 2) { twoSided(b, part.map(([x, z]) => [f.cx + (x - f.cx) * 0.94, f.cz + (z - f.cz) * 0.94]), y, y + fl, GL, "glow"); b.loft(part, y + fl - 0.35, part, y + fl, W); }
        }
        continue;
      }
      twoSided(b, core, y, y + fl - 0.35, k % 2 ? GL : k3(GL, 1.08), "glow");
      b.loft(slab, y + fl - 0.35, slab, y + fl, W, k % 4 === 0 ? "led" : "parts");
      b.fan(slab.map(([x, z]) => [x - f.cx, z - f.cz]), y + fl, W, "parts", y + fl, f.cx, f.cz);
    }
    b.fan(core.map(([x, z]) => [x - f.cx, z - f.cz]), y0 + (floors - 3) * fl + 0.1, [0.62, 0.64, 0.66], "parts", y0 + (floors - 3) * fl + 0.1, f.cx, f.cz);
    const [ax, az] = FP(f, A - R * 0.6, 0); b.cyl(ax, y0 + floors * fl, az, 0.25, 7, [0.8, 0.8, 0.82], 6);
  };

  // ---------------- Piramit Tower (185 м, 52 этажа) ----------------
  // По фото: стройная башня из синего стекла со скруглёнными углами, по всему фасаду — белая диагональная
  // сетка-«ромбы» (диагрид), верх срезан наклонно; у подножия — торговый центр Piramit Mall.
  // Ночью диагрид светится тёплым белым.
  M.piramit = (b, o) => {
    const Q = localParts(o), tw = Q.reduce((a, q) => (q.A > a.A && q.h > 100 ? q : a), Q[0]), crown = Q.find((q) => q.h > tw.h), mall = Q.find((q) => q.h < 40);
    const GL = [0.2, 0.34, 0.62], WH = [0.95, 0.96, 0.97];
    if (mall) block(b, mall.p, 0, mall.h, { wall: [0.78, 0.8, 0.84], frame: [0.95, 0.95, 0.96], trim: [0.96, 0.96, 0.97], base: [0.22, 0.3, 0.4], roof: [0.58, 0.6, 0.62], win: 90, pil: 4, every: 2 });
    const f = frame(tw), H = tw.h, y0 = mall ? Math.min(mall.h, 20) : 0;
    const ring = stadium(f, f.L / 2, f.W / 2 * 0.55, 6);              // скруглённые углы
    const per = []; let P = 0; for (let i = 0; i < ring.length; i++) { per.push(P); const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; P += Math.hypot(x1 - x0, z1 - z0); }
    const at = (u, out = 0.25) => { u = ((u % P) + P) % P; let i = 0; while (i + 1 < ring.length && per[i + 1] <= u) i++; const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], L = Math.hypot(x1 - x0, z1 - z0) || 1, t = (u - per[i]) / L; return [x0 + (x1 - x0) * t + (z1 - z0) / L * out, z0 + (z1 - z0) * t - (x1 - x0) / L * out]; };
    // наклонный верх: высота по длинной оси от H-10 до H
    const topAt = (x, z) => H - 10 + 10 * (((x - f.cx) * f.ux + (z - f.cz) * f.uz) / f.L + 0.5);
    b.winRing(ring, y0, H - 10, GL, 91);
    const arr = []; for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length, [x0, z0] = ring[i], [x1, z1] = ring[j]; arr.push(x0, H - 10, z0, x1, H - 10, z1, x1, topAt(x1, z1), z1, x0, H - 10, z0, x1, topAt(x1, z1), z1, x0, topAt(x0, z0), z0); }
    b.raw(arr, GL, "glow"); const rev = []; for (let i = 0; i < arr.length; i += 9) rev.push(...arr.slice(i, i + 3), ...arr.slice(i + 6, i + 9), ...arr.slice(i + 3, i + 6)); b.raw(rev, GL, "glow");
    const tri = THREE.ShapeUtils.triangulateShape(ring.map((v) => new THREE.Vector2(v[0], v[1])), []), roof = [];
    for (const t of tri) for (const i of t) roof.push(ring[i][0], topAt(...ring[i]), ring[i][1]);
    b.raw(roof, [0.55, 0.6, 0.68]);
    // диагрид
    const cols = Math.round(P / 9), du = P / cols, rows = Math.round((H - y0) / 13), dy = (H - y0) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const u0 = c * du, ya = y0 + r * dy, yb = ya + dy;
      for (const [ua, ub] of [[u0, u0 + du], [u0 + du, u0]]) {
        const [x0, z0] = at(ua), [x1, z1] = at(ub), y1 = Math.min(yb, topAt(x1, z1)); if (ya >= y1) continue;
        b.beam(x0, ya, z0, x1, y1, z1, 0.45, WH, "glow", 0.3);
      }
    }
    for (let r = 0; r <= rows; r++) { const y = y0 + r * dy; if (y < H - 10) band(b, ring, 0.3, y - 0.25, 0.5, WH, "glow"); }
    sign(b, "PIRAMIT", ...(() => { const [x, z] = FP(f, 0, f.W / 2 * 0.56 + 0.5); return [x, H - 22, z, f.vx, f.vz]; })(), 0.9, [0.95, 0.85, 0.5]);
    if (crown) { const c2 = frame(crown); b.cyl(c2.cx, H, c2.cz, 0.3, 14, [0.85, 0.85, 0.88], 6); }
  };

  // ---------------- Ассоциация банков Узбекистана ----------------
  // По фото: серебристо-синяя стеклянная башня, в центре — круглый стеклянный ствол, поднимающийся выше
  // корпуса и увенчанный «маяком» с металлическим кольцом и шпилем; по бокам ступенчатые стеклянные крылья
  // с белыми рёбрами; у входа — павильон с круглым шатром.
  M.uba = (b, o) => {
    const Q = localParts(o), GL = [0.42, 0.55, 0.66], GL2 = [0.3, 0.42, 0.56], SV = [0.86, 0.88, 0.9], WH = [0.95, 0.95, 0.96];
    const roundish = (q) => q.p.length >= 14 && Math.abs((q.x1 - q.x0) - (q.z1 - q.z0)) < 3;
    for (const q of Q.slice().sort((a, b2) => a.h - b2.h)) {
      if (roundish(q) && q.h >= 60) { // центральный круглый ствол и «маяк»
        const r = (q.x1 - q.x0) / 2, c = [q.cx, q.cz], top = q.h;
        if (q.h < 70) {
          b.winRing(se(r, r, 2, 20).map(([x, z]) => [x + c[0], z + c[1]]), 0, top - 4, GL2, 92);
          for (let y = 4; y < top - 4; y += 6.6) b.cyl(c[0], y, c[1], r + 0.2, 0.5, SV, 20);
          b.cyl(c[0], top - 4, c[1], r + 0.4, 4, SV, 20);
        } else {
          b.cyl(c[0], 60, c[1], r, top - 66, GL2, 16, r, true);
          b.cyl(c[0], top - 6, c[1], r + 1.2, 1.2, SV, 16); b.cyl(c[0], top - 4.8, c[1], r + 0.2, 3.2, [0.5, 0.7, 0.9], 16, r + 0.2, true);
          b.cyl(c[0], top - 1.6, c[1], r + 1.6, 0.8, SV, 16); b.dome(c[0], top - 0.8, c[1], r + 0.4, SV, { hk: 0.5, seg: 16, tip: false });
          b.cyl(c[0], top - 0.8 + (r + 0.4) * 0.5, c[1], 0.35, 12, SV, 6, 0.08);
        }
        continue;
      }
      if (roundish(q)) { // павильон с шатром
        const r = (q.x1 - q.x0) / 2;
        b.cyl(q.cx, 0, q.cz, r, q.h - 3, GL, 16, r, true); b.cyl(q.cx, q.h - 3, q.cz, r + 0.6, 0.6, SV, 16);
        b.cone(q.cx, q.h - 2.4, q.cz, r + 1, 3.2, [0.36, 0.44, 0.56], 16); continue;
      }
      // корпус и крылья: стекло с белыми рёбрами, ступенчатые верха
      b.winRing(q.p, 0, q.h - 1.2, q.h > 30 ? GL : GL2, 93);
      pilasters(b, q.p, 0, q.h - 1.2, 3.6, 0.35, 0.4, SV);
      for (let y = 3.6; y < q.h - 2; y += 3.6 * (q.h > 30 ? 3 : 1)) band(b, q.p, 0.3, y, 0.35, SV);
      band(b, q.p, 0.4, q.h - 1.2, 1.2, WH); cap(b, q.p, q.h, [0.6, 0.62, 0.64]);
      if (q.h > 30) { const r = offset(q.p, -2.5); b.loft(r, q.h, r, q.h + 3, GL, "glow"); cap(b, r, q.h + 3, SV); }
    }
  };

  // ---------------- Международный бизнес-центр (у НБУ) ----------------
  // По фото: изогнутые фасады из синего стекла между светлыми каменными пилонами, по стеклу —
  // ступенчатые тёмные полосы «лесенкой»; узкие корпуса — белые пилоны с прорезями окон.
  M.ibc = (b, o) => {
    const Q = localParts(o), GL = [0.17, 0.33, 0.62], ST = [0.9, 0.88, 0.84], DK = [0.08, 0.12, 0.22];
    for (const q of Q) {
      const thin = Math.min(q.x1 - q.x0, q.z1 - q.z0) < 12;
      if (thin) { b.winRing(q.p, 0, q.h, ST, 94); cap(b, q.p, q.h + 0.01, [0.66, 0.66, 0.66]); band(b, q.p, 0.3, q.h, 1, ST); continue; }
      twoSided(b, offset(q.p, 0.05), 0, q.h - 1.5, GL, "glow");
      for (let y = 3.3; y < q.h - 2; y += 3.3) band(b, q.p, 0.12, y, 0.18, [0.32, 0.48, 0.72]);
      band(b, q.p, 0.25, q.h - 1.5, 1.5, ST); cap(b, q.p, q.h, [0.6, 0.62, 0.66]);
      // ступенчатые тёмные полосы на длинных фасадах
      let A = 0; for (let i = 0; i < q.p.length; i++) { const j = (i + 1) % q.p.length; A += q.p[i][0] * q.p[j][1] - q.p[j][0] * q.p[i][1]; }
      const sg = A > 0 ? 1 : -1;
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], Le = Math.hypot(x1 - x0, z1 - z0); if (Le < 14) continue;
        const nx = sg * (z1 - z0) / Le, nz = -sg * (x1 - x0) / Le, ry = Math.atan2(nx, nz), steps = Math.floor(Le / 5);
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps, x = x0 + (x1 - x0) * t + nx * 0.3, z = z0 + (z1 - z0) * t + nz * 0.3, y = q.h * 0.7 - k * 3.3;
          if (y < 6) break;
          b.box(x, y, z, Le / steps + 0.1, 0.6, 0.2, DK, ry);
        }
      }
    }
  };

  // ---------------- Законодательная палата Олий Мажлиса ----------------
  // По фото: белое квадратное здание с колоннадой из тонких высоких белых колонн с золотыми капителями,
  // за ними — золотисто-коричневое остекление; широкий белый аттик с орнаментом и гербом, в центре крыши —
  // низкий голубой купол на барабане, флаг Узбекистана; перед зданием — фонтан.
  M.oliy_majlis = (b, o) => {
    const Q = localParts(o), core = Q.find((q) => q.mh === 0) || Q[0], slab = Q.find((q) => q.mh > 0 && q.h < 22), dome = Q.find((q) => q.p.length > 10);
    const WH = [0.95, 0.94, 0.91], GOLD = [0.86, 0.68, 0.32], GL = [0.48, 0.38, 0.22], GR = [0.82, 0.8, 0.76];
    const f = frame(slab || core), A = (slab ? f.L : core.x1 - core.x0) / 2, B = (slab ? f.W : core.z1 - core.z0) / 2, H1 = slab ? slab.mh : 16, H2 = slab ? slab.h : 20;
    const rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)];
    // стилобат со ступенями
    for (let k = 0; k < 3; k++) { const r = rect(A + 6 - k * 1.4, B + 6 - k * 1.4); b.loft(r, k * 0.5, r, (k + 1) * 0.5, GR); cap(b, r, (k + 1) * 0.5, k3(GR, 1.05)); }
    // остеклённый объём за колоннадой
    const inner = rect(A - 4, B - 4); twoSided(b, inner, 1.5, H1, GL, "glow"); pilasters(b, inner, 1.5, H1, 2.4, 0.25, 0.25, k3(GL, 0.7));
    // колоннада по периметру
    const ring = rect(A - 0.8, B - 0.8);
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % 4], Le = Math.hypot(x1 - x0, z1 - z0), n = Math.round(Le / 4.6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        b.cyl(x, 1.5, z, 0.42, H1 - 3, WH, 8, 0.5); b.cyl(x, H1 - 1.5, z, 0.9, 1.5, GOLD, 8, 0.45);
      }
    }
    // аттик с орнаментом
    const att = rect(A, B); b.loft(att, H1, att, H2, WH); cap(b, att, H2, [0.7, 0.7, 0.7]);
    band(b, att, 0.15, H1 + (H2 - H1) * 0.45, 0.6, GOLD);
    for (const s of [-1, 1]) { const [x, z] = FP(f, 0, s * (B + 0.2)); b.cyl(x, H1 + 0.6, z, 1.4, 0.2, GOLD, 12); }
    // барабан и купол
    const R = dome ? (dome.x1 - dome.x0) / 2 * 0.62 : 12, [dx, dz] = dome ? [dome.cx, dome.cz] : FP(f, 0, 0);
    b.cyl(dx, H2, dz, R + 3, 1, WH, 24); b.cyl(dx, H2 + 1, dz, R, 3.4, WH, 24);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; b.box(dx + Math.cos(a) * (R + 0.05), H2 + 1.6, dz + Math.sin(a) * (R + 0.05), 1.4, 2, 0.15, [0.3, 0.4, 0.5], -a + Math.PI / 2, true); }
    b.dome(dx, H2 + 4.4, dz, R, [0.45, 0.68, 0.86], { hk: 0.42, seg: 24, ribs: [0.4, 0.62, 0.8], tip: false });
    b.cyl(dx, H2 + 4.4 + R * 0.42, dz, 0.12, 7, [0.85, 0.85, 0.88], 6);
    b.box(dx + 1.1, H2 + 9.8 + R * 0.42, dz, 2.2, 0.5, 0.05, [0.1, 0.55, 0.85]); b.box(dx + 1.1, H2 + 9.3 + R * 0.42, dz, 2.2, 0.5, 0.05, [0.97, 0.97, 0.97]); b.box(dx + 1.1, H2 + 8.8 + R * 0.42, dz, 2.2, 0.5, 0.05, [0.15, 0.65, 0.3]);
    // фонтан перед главным фасадом
    const [fx, fz] = FP(f, 0, B + 24); b.cyl(fx, 0, fz, 9, 0.6, GR, 20); b.cyl(fx, 0.55, fz, 8.4, 0.1, [0.3, 0.5, 0.62], 20); b.cyl(fx, 0.6, fz, 0.4, 3.5, [0.8, 0.9, 1], 6);
  };

  // ---------------- небоскрёбы делового района Tashkent City ----------------
  // SQB — круглая стеклянная башня с белыми вертикальными рёбрами и светящейся короной под куполом;
  // BoMI — тонкая пластина тёмного стекла с открытой рамой-короной; Asaka Bank — тёмно-зелёное стекло
  // с белыми поясами и ступенчатым верхом; Aloqa Bank — светло-голубое стекло с белыми ламелями
  // и уступами наверху. На верхах — логотипы-надписи.
  function tcTower(b, o, kind) {
    const q = localParts(o)[0], f = frame(q), H = q.h, sig = (txt, px, y, side = 1) => { const [x, z] = FP(f, 0, side * (f.W / 2 + 0.6)); sign(b, txt, x, y, z, f.vx * side, f.vz * side, px, [0.95, 0.95, 0.97]); };
    if (kind === "sqb") {
      const R = Math.min(f.L, f.W) / 2, GL = [0.32, 0.46, 0.6];
      b.winRing(se(R - 0.4, R - 0.4, 2, 28).map(([x, z]) => [x + f.cx, z + f.cz]), 0, H - 8, GL, 95);
      for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; b.box(f.cx + Math.cos(a) * R, 6, f.cz + Math.sin(a) * R, 0.5, H - 14, 0.9, [0.92, 0.93, 0.95], -a + Math.PI / 2); }
      for (let y = 6; y < H - 8; y += 13.2) b.cyl(f.cx, y, f.cz, R + 0.3, 0.5, [0.92, 0.93, 0.95], 28);
      b.cyl(f.cx, 0, f.cz, R + 3, 6, [0.24, 0.3, 0.36], 28, R + 3, true); b.cyl(f.cx, 6, f.cz, R + 3.4, 0.8, [0.9, 0.9, 0.92], 28);
      b.cyl(f.cx, H - 8, f.cz, R - 1.5, 6, [0.5, 0.75, 0.95], 28, R - 1, true); b.loft(se(R - 1, R - 1, 2, 28).map(([x, z]) => [x + f.cx, z + f.cz]), H - 8, se(R - 1, R - 1, 2, 28).map(([x, z]) => [x + f.cx, z + f.cz]), H - 2, [0.6, 0.85, 1], "led");
      b.dome(f.cx, H - 2, f.cz, R - 1, [0.86, 0.88, 0.9], { hk: 0.35, seg: 28, tip: false }); b.cyl(f.cx, H - 2 + (R - 1) * 0.35, f.cz, 0.4, 16, [0.85, 0.86, 0.9], 6, 0.1);
      return;
    }
    const A = f.L / 2, B = f.W / 2, rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)];
    const st = { bomi: { gl: [0.12, 0.2, 0.32], fin: [0.55, 0.62, 0.7], top: 14, setb: 0 }, asaka: { gl: [0.12, 0.3, 0.3], fin: [0.9, 0.92, 0.9], top: 10, setb: 2 }, aloqa: { gl: [0.42, 0.6, 0.78], fin: [0.96, 0.97, 0.98], top: 8, setb: 2 } }[kind];
    b.loft(rect(A + 4, B + 4), 0, rect(A + 4, B + 4), 7, [0.24, 0.3, 0.36], "glow"); cap(b, rect(A + 4, B + 4), 7, [0.6, 0.62, 0.64]); band(b, rect(A + 4, B + 4), 0.2, 6.6, 0.8, st.fin);
    let hTop = H - st.top;
    b.winRing(rect(A, B), 7, hTop, st.gl, 96 + kind.length);
    if (kind === "asaka") for (let y = 10.3; y < hTop; y += 3.3) band(b, rect(A, B), 0.15, y, 0.3, st.fin);
    else pilasters(b, rect(A, B), 7, hTop, kind === "aloqa" ? 1.6 : 2.2, 0.3, 0.4, st.fin);
    if (kind === "bomi") { // открытая рама-корона
      for (const [a, c] of [[-A, -B], [A, -B], [A, B], [-A, B]]) { const [x, z] = FP(f, a * 0.98, c * 0.9); b.box(x, hTop, z, 1, st.top, 1, st.fin, f.ry); }
      for (const y of [hTop + st.top * 0.5, H - 0.8]) band(b, rect(A, B * 0.9), 0.1, y, 0.8, st.fin);
      cap(b, rect(A - 0.5, B * 0.85), hTop, [0.5, 0.52, 0.56]);
      for (let k = -2; k <= 2; k++) { const [x, z] = FP(f, k * A / 3, 0); b.box(x, hTop, z, 0.4, st.top * 0.9, f.W * 0.8, [0.75, 0.85, 1], f.ry, true); }
    } else { // уступы
      let a = A, c = B, y = hTop;
      for (let k = 0; k < 2; k++) { a -= st.setb * (k + 1); c -= st.setb * 0.6; const r = rect(a, c); b.winRing(r, y, y + st.top / 2, st.gl, 97 + k); band(b, r, 0.2, y + st.top / 2 - 0.6, 0.6, st.fin); y += st.top / 2; }
      cap(b, rect(a, c), y, [0.55, 0.56, 0.6]);
      for (const s of [-1, 1]) sig(kind === "asaka" ? "ASAKA BANK" : "ALOQA BANK", Math.min(0.6, f.L * 0.8 / 59), hTop - 7, s);
    }
    band(b, rect(A, B), 0.25, hTop, 0.8, st.fin);
  }
  M.tc_sqb = (b, o) => tcTower(b, o, "sqb");
  M.tc_bomi = (b, o) => tcTower(b, o, "bomi");
  M.tc_asaka = (b, o) => tcTower(b, o, "asaka");
  M.tc_aloqa = (b, o) => tcTower(b, o, "aloqa");

  // объёмные буквы вдоль отрезка p0→p1 (центр — середина), лицом по нормали n (наружу)
  function sign(b, txt, cx, y, cz, nx, nz, px, col, list = "glow", d = 0.3) {
    const rx = nz, rz = -nx, cols = txt.length * 6 - 1, ry = Math.atan2(nx, nz);
    for (let ci = 0; ci < txt.length; ci++) {
      const g = MD.FONT[txt[ci]]; if (!g) continue;
      for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 7; gy++) {
        if (g[gy * 5 + gx] !== "1") continue;
        const u = ((ci * 6 + gx) - cols / 2) * px;
        b.box(cx + rx * u, y + (6 - gy) * px, cz + rz * u, px, px, d, col, ry); if (list !== "parts") to(b, list);
      }
    }
  }

  // ---------------- самолёт Uzbekistan Airways (Boeing 767/787) ----------------
  // Белый фюзеляж с голубым верхом и зелёным низом, голубой киль с жёлтым кругом и зелёной
  // эмблемой, голубые мотогондолы, надпись UZBEKISTAN. (X, Z) — центр, a — куда смотрит нос.
  const TRIM = [0.3, 0.3, 0.32], PB = [0.42, 0.68, 0.9], PG = [0.24, 0.62, 0.3], PW = [0.96, 0.96, 0.95], PGR = [0.78, 0.8, 0.83], PNV = [0.12, 0.16, 0.32];
  function plane(b, X, Z, a) {
    const c = Math.cos(a), s = Math.sin(a), T = (px, py, pz) => [X + px * c - pz * s, py, Z + px * s + pz * c];
    const tris = new Map(), tri = (col, ...P) => { let l = tris.get(col); if (!l) tris.set(col, l = []); for (const p of P) l.push(...T(...p)); };
    const quad = (col, A, B2, C2, D) => tri(col, A, B2, C2, A, C2, D);
    // фюзеляж: сечения [x, радиус, высота оси]
    const ST = [[27.6, 0.25, 4.0], [26.6, 1.3, 4.2], [25, 2.15, 4.45], [22.5, 2.6, 4.6], [-14, 2.6, 4.6], [-19, 2.15, 4.9], [-24, 1.25, 5.4], [-27.6, 0.35, 5.9]];
    const N = 12, ring = (st) => Array.from({ length: N }, (_, k) => { const t = k / N * Math.PI * 2; return [st[0], st[2] + st[1] * Math.cos(t), st[1] * Math.sin(t)]; });
    const colAt = (k) => { const t = ((k + 0.5) / N) * 360; const d = Math.min(t, 360 - t); return d < 32 ? PB : d > 128 ? PG : PW; };
    for (let i = 0; i + 1 < ST.length; i++) { const A = ring(ST[i]), B2 = ring(ST[i + 1]); for (let k = 0; k < N; k++) { const j = (k + 1) % N; quad(i === 0 ? PW : colAt(k), A[k], A[j], B2[j], B2[k]); } }
    // крылья (стреловидные, с поперечным V), стабилизаторы, киль
    for (const sd of [-1, 1]) {
      quad(PGR, [7, 3.4, sd * 2.4], [-3.5, 3.4, sd * 2.4], [-13.8, 4.6, sd * 23.8], [-11.3, 4.6, sd * 23.8]);
      quad(PGR, [-20.5, 5.4, sd * 1.2], [-25.2, 5.4, sd * 1.2], [-28.4, 5.9, sd * 9.2], [-26.6, 5.9, sd * 9.2]);
      // мотогондола под крылом
      const g = new THREE.CylinderGeometry(1.45, 1.25, 5.4, 10); g.rotateZ(Math.PI / 2);
      const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const [wx, wy, wz] = T(pos.getX(i) + 4.6, pos.getY(i) + 2.25, pos.getZ(i) + sd * 8.6); pos.setXYZ(i, wx, wy, wz); }
      b.parts.push([g.toNonIndexed(), [0.3, 0.55, 0.88]]);
      quad(PGR, [5.5, 3.1, sd * 8.6], [2.5, 3.1, sd * 8.6], [1.5, 3.7, sd * 8.6], [4.5, 3.7, sd * 8.6]);
      tri(PNV, [7.32, 2.25, sd * 8.6 - 1.2], [7.32, 2.25, sd * 8.6 + 1.2], [7.32, 3.4, sd * 8.6]);
      // шасси
      quad(TRIM, [1, 0, sd * 2.6], [-1.5, 0, sd * 2.6], [-1.5, 2.2, sd * 2.6], [1, 2.2, sd * 2.6]);
    }
    quad(TRIM, [23.2, 0, 0], [22.4, 0, 0], [22.4, 2.2, 0], [23.2, 2.2, 0]);
    const fin = [[-19.5, 7.2], [-26.4, 7.2], [-28.2, 16.2], [-24.8, 16.2]].map(([x, y]) => [x, y, 0]);
    quad(PB, ...fin);
    // эмблема на киле: жёлтый круг, зелёный знак
    for (const sd of [-1, 1]) {
      const C0 = [-24.6, 11.6], R = 2.1, M2 = 14;
      for (let k = 0; k < M2; k++) { const a0 = k / M2 * Math.PI * 2, a1 = (k + 1) / M2 * Math.PI * 2; tri([0.98, 0.8, 0.15], [C0[0], C0[1], sd * 0.12], [C0[0] + Math.cos(a0) * R, C0[1] + Math.sin(a0) * R, sd * 0.12], [C0[0] + Math.cos(a1) * R, C0[1] + Math.sin(a1) * R, sd * 0.12]); }
      quad([0.2, 0.6, 0.3], [-23.4, 11, sd * 0.16], [-25.8, 11, sd * 0.16], [-25.6, 12.2, sd * 0.16], [-23.6, 12.2, sd * 0.16]);
      // кабина пилотов
      quad(PNV, [25.6, 4.9, sd * 1.15], [24.6, 5.25, sd * 1.75], [24.6, 4.75, sd * 2.0], [25.6, 4.45, sd * 1.4]);
    }
    for (const [col, arr] of tris) b.raw(arr, col);
    // надпись UZBEKISTAN на обоих бортах
    for (const sd of [-1, 1]) { const [px, , pz] = T(13, 0, sd * 2.66), n = [-s * sd, c * sd]; sign(b, "UZBEKISTAN", px, 4.1, pz, n[0], n[1], 0.3, PNV, "parts", 0.08); }
  }

  // ---------------- Международный аэропорт Ташкента (терминал 2) ----------------
  // По фото и контурам OSM: со стороны города — изогнутый белый навес на высоких колоннах над
  // стеклянной галереей и надпись TASHKENT INTERNATIONAL AIRPORT; к перрону — белый фасад с синими
  // лентами остекления и порталами-пештаками, на крыше вторая надпись; диспетчерская вышка с
  // расширяющимся кверху стволом и синей кабиной. На перроне — самолёты Uzbekistan Airways.
  M.airport = (b, o) => {
    const Q = localParts(o), WT = [0.92, 0.93, 0.94], WT2 = [0.84, 0.86, 0.88], GL = [0.16, 0.32, 0.62], FR = [0.18, 0.36, 0.78], ROOF = [0.6, 0.62, 0.64], BLUE = [0.1, 0.3, 0.8];
    const sub = o.sub || {}, L = (k) => (sub[k] && o.local ? o.local(...sub[k]) : null);
    const ap = (() => { const p = L("p1"); if (!p) return [-1, 0]; const d = Math.hypot(p[0], p[1]); return [p[0] / d, p[1] / d]; })();  // направление на перрон
    const sgnA = (p) => { let A = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; A += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return A > 0 ? 1 : -1; };
    for (const q of Q) {
      const p = q.p, sg = sgnA(p);
      if (q.mh >= 10) { // навес на колоннах
        const top = offset(p, 0.4);
        b.loft(top, q.mh, top, q.h, WT); cap(b, top, q.h, ROOF); cap(b, top, q.mh, WT2);
        for (let i = 0; i < p.length; i++) {
          const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], Le = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(Le / 12));
          const nx = sg * (z1 - z0) / Le, nz = -sg * (x1 - x0) / Le;
          for (let k = 0; k <= n; k++) { const t = k / n; b.cyl(x0 + (x1 - x0) * t - nx * 2, 0, z0 + (z1 - z0) * t - nz * 2, 0.75, q.mh, WT, 8); }
        }
        continue;
      }
      if (q.h <= 6.5 && Q.some((r) => r !== q && r.mh >= 10 && Math.abs(r.cx - q.cx) < 1 && Math.abs(r.cz - q.cz) < 1)) { // стеклянная галерея под навесом
        const gp = offset(p, -2.5), gr = gp.slice().reverse(); b.loft(gp, 0, gp, q.h, GL, "glow"); b.loft(gr, 0, gr, q.h, GL, "glow"); band(b, offset(p, -2.5), 0.4, q.h - 0.1, 1.1, WT);
        pilasters(b, offset(p, -2.5), 0, q.h, 3, 0.25, 0.3, FR);
        continue;
      }
      if (q.h === 18 && q.A < 120) { // основание вышки — сама вышка ниже
        b.loft(p, 0, p, 8, WT); cap(b, p, 8, ROOF); continue;
      }
      // корпус: белые стены, синие ленты остекления, парапет
      b.loft(p, q.mh, p, q.h, WT); cap(b, p, q.h + 0.01, ROOF); band(b, p, 0.25, q.h, 0.7, WT2);
      if (q.h >= 9) {
        const r = offset(p, 0.12), rr = r.slice().reverse(), glass = (y0, y1) => { b.loft(r, y0, r, y1, GL, "glow"); b.loft(rr, y0, rr, y1, GL, "glow"); };
        glass(Math.max(q.mh, 1) + 0.5, Math.max(q.mh, 1) + 3.6);
        if (q.h >= 12) glass(6.4, Math.min(q.h - 2.6, 10.8));
        pilasters(b, offset(p, 0.15), Math.max(q.mh, 1) + 0.5, Math.min(q.h - 2.6, 10.8), 3.2, 0.22, 0.25, FR);
      }
      // порталы-пештаки на фасадах к перрону
      if (q.h >= 12) for (let i = 0; i < p.length; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], Le = Math.hypot(x1 - x0, z1 - z0); if (Le < 40) continue;
        const nx = sg * (z1 - z0) / Le, nz = -sg * (x1 - x0) / Le; if (nx * ap[0] + nz * ap[1] < 0.5) continue;
        const ry = Math.atan2(nx, nz), n = Math.floor(Le / 42);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, cx = x0 + (x1 - x0) * t + nx * 0.9, cz = z0 + (z1 - z0) * t + nz * 0.9;
          b.box(cx, 0, cz, 11, q.h + 1.2, 1.8, WT, ry);
          const gx = cx + nx * 0.95, gz = cz + nz * 0.95;
          b.box(gx, 0.4, gz, 5.2, q.h - 5, 0.12, GL, ry, true);
          const tri2 = new THREE.CylinderGeometry(0.01, 3.7, 2.6, 4, 1); tri2.rotateY(Math.PI / 4); tri2.scale(1, 1, 0.05); tri2.translate(0, q.h - 4.6 + 1.3, 0);
          b.add(tri2, GL, gx, 0, gz, ry, true);
          for (const sx of [-1, 1]) b.box(gx + nz * sx * 3.6, 0, gz - nx * sx * 3.6, 0.5, q.h - 1.4, 0.12, PNV, ry);
          b.box(gx, q.h - 1.6, gz, 7.7, 0.5, 0.12, PNV, ry);
        }
      }
    }
    // надписи TASHKENT INTERNATIONAL AIRPORT: на самом длинном фасаде к перрону и к городу, ровно по линии
    // фасада и по его центру, на решётчатой раме за кромкой крыши; размер букв подогнан под длину фасада
    const TXT = "TASHKENT INTERNATIONAL AIRPORT", cols = TXT.length * 6 - 1;
    const edges = [];
    for (const q of Q) {
      if (q.h < 12) continue;
      const p = q.p, sg = sgnA(p);
      for (let i = 0; i < p.length; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], Le = Math.hypot(x1 - x0, z1 - z0); if (Le < 40) continue;
        const nx = sg * (z1 - z0) / Le, nz = -sg * (x1 - x0) / Le;
        edges.push({ Le, x: (x0 + x1) / 2, z: (z0 + z1) / 2, nx, nz, y: q.h, d: nx * ap[0] + nz * ap[1] });
      }
    }
    for (const side of [1, -1]) {
      const e = edges.filter((e) => e.d * side > 0.6).reduce((m, e) => (!m || e.Le > m.Le ? e : m), null); if (!e) continue;
      const px = Math.min(0.6, e.Le * 0.8 / cols), cx = e.x - e.nx * 1.4, cz = e.z - e.nz * 1.4, ry = Math.atan2(e.nx, e.nz), y = e.y + 1.2;
      b.box(cx - e.nx * 0.5, e.y, cz - e.nz * 0.5, cols * px + 2, 1.2, 0.3, [0.72, 0.74, 0.78], ry);                       // рама
      for (let k = -4; k <= 4; k++) { const u = k * cols * px / 8; b.box(cx - e.nx * 0.5 + e.nz * u, y, cz - e.nz * 0.5 - e.nx * u, 0.2, 7 * px, 0.2, [0.72, 0.74, 0.78], ry); }
      sign(b, TXT, cx, y, cz, e.nx, e.nz, px, BLUE);
    }
    // диспетчерская вышка
    const tw = L("tower");
    if (tw) {
      const [tx, tz] = tw;
      b.cyl(tx, 8, tz, 3.0, 26, WT, 8, 3.6);
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.box(tx + Math.cos(a) * 3.35, 10, tz + Math.sin(a) * 3.35, 0.45, 22, 0.2, PNV, -a + Math.PI / 2); }
      for (const y of [14, 22]) b.cyl(tx, y, tz, 3.5, 0.6, WT2, 8, 3.7);
      b.cyl(tx, 34, tz, 3.7, 4.5, WT, 8, 5.4);
      b.cyl(tx, 38.5, tz, 5.4, 0.7, WT2, 8);
      b.cyl(tx, 39.2, tz, 5.0, 3.6, [0.2, 0.36, 0.62], 8, 5.6, true);
      b.cyl(tx, 42.8, tz, 6.0, 1.0, [0.12, 0.22, 0.5], 8, 5.6);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.cyl(tx + Math.cos(a) * 3.2, 43.8, tz + Math.sin(a) * 3.2, 0.08, 2.8, [0.85, 0.85, 0.88], 4); }
      b.cyl(tx, 43.8, tz, 0.1, 5.5, [0.85, 0.85, 0.88], 4);
      b.box(tx + 0.9, 48.2, tz, 1.8, 0.4, 0.06, [0.1, 0.55, 0.85]); b.box(tx + 0.9, 47.8, tz, 1.8, 0.4, 0.06, [0.97, 0.97, 0.97]); b.box(tx + 0.9, 47.4, tz, 1.8, 0.4, 0.06, [0.15, 0.65, 0.3]);
    }
    // самолёты на перроне: носом к терминалу
    // самолёты на стоянках вдоль перрона, носом к терминалу (на запад)
    for (let i = 1; i <= 8; i++) {
      const w = sub["p" + i]; if (!w || !o.local) continue;
      const a0 = o.local(w[0], w[1]), a1 = o.local(w[0] - 10, w[1]);
      plane(b, a0[0], a0[1], Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
    }
  };

  // ---------------- башня Национального банка (НБУ, 1997) ----------------
  // План — крест (по контуру OSM): торцы рукавов — синее стекло между белыми кромками, тёмные пояса-уступы,
  // внизу — стеклянный «шеврон» над входом; изломы креста — белый камень с тёмной щелью. Наверху над каждым
  // торцом — стеклянная арка (крестовый свод), золотые буквы NBU, на шпиле — золотая птица Хумо.
  // У подножия — стеклянный стилобат, рядом — низкий стеклянный корпус.
  M.nbu = (b, o) => {
    const Q = localParts(o), body = Q.filter((q) => q.h > 50).reduce((m, q) => (q.A > m.A ? q : m)), annex = Q.find((q) => q.h < 50);
    const WS = [0.91, 0.9, 0.87], GL = [0.17, 0.34, 0.64], GL2 = [0.4, 0.58, 0.8], DK = [0.1, 0.14, 0.22], GOLD = [0.95, 0.74, 0.28];
    // оси креста: по самому длинному ребру контура
    let best = 0, th = 0;
    for (let i = 0; i < body.p.length; i++) { const [x0, z0] = body.p[i], [x1, z1] = body.p[(i + 1) % body.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L > best) { best = L; th = Math.atan2(z1 - z0, x1 - x0); } }
    const c = Math.cos(th), s = Math.sin(th), cx = body.cx, cz = body.cz;
    const U = body.p.map(([x, z]) => [(x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c]);
    const Bh = Math.max(...U.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v)))), Ah = Math.min(Bh * 0.62, Math.max(6, best / 2));
    const tf = (u, v) => [cx + u * c - v * s, cz + u * s + v * c], ry = -th, H = 101, y0 = 7;
    // рукава: d — направление (ось и знак); n(u,v) в мировые локальные координаты модели
    const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const P = (d, along, across) => (d[0] ? tf(d[0] * along, across * d[0]) : tf(-across * d[1], d[1] * along));
    // стилобат
    const pod = []; for (const [u, v] of [[Bh + 4, -Ah - 4], [Bh + 4, Ah + 4], [Ah + 4, Ah + 4], [Ah + 4, Bh + 4], [-Ah - 4, Bh + 4], [-Ah - 4, Ah + 4], [-Bh - 4, Ah + 4], [-Bh - 4, -Ah - 4], [-Ah - 4, -Ah - 4], [-Ah - 4, -Bh - 4], [Ah + 4, -Bh - 4], [Ah + 4, -Ah - 4]]) pod.push(tf(u, v));
    b.loft(pod, 0, pod, y0 - 1, GL, "glow"); band(b, pod, 0.4, y0 - 1, 1, WS); cap(b, pod, y0, [0.6, 0.62, 0.66]);
    for (const d of arms) {
      // торец рукава: стекло с окнами, белые кромки, пояса-уступы, шеврон
      const e0 = P(d, Bh, -Ah + 1.6), e1 = P(d, Bh, Ah - 1.6);
      b.winRing([e0, e1], y0, H, GL, 80); b.loft([e0, e1], H, [e0, e1], H + 0.01, GL);
      for (const y of [24, 42, 60, 78]) { const r0 = P(d, Bh + 0.5, -Ah + 1.6), r1 = P(d, Bh + 0.5, Ah - 1.6); b.raw([r0[0], y, r0[1], r1[0], y, r1[1], r1[0], y + 1.6, r1[1], r0[0], y, r0[1], r1[0], y + 1.6, r1[1], r0[0], y + 1.6, r0[1]], DK); }
      const t0 = P(d, Bh + 0.3, -Ah + 2.2), t1 = P(d, Bh + 0.3, Ah - 2.2), tm = P(d, Bh + 0.3, 0);
      b.raw([t0[0], 22, t0[1], t1[0], 22, t1[1], tm[0], y0 + 2, tm[1]], GL2, "glow");                       // стеклянный шеврон
      for (const sgn of [-1, 1]) { const [px, pz] = P(d, Bh - 0.6, sgn * (Ah - 0.8)); b.box(px, 0, pz, 1.6, H + 1.5, 1.6, WS, ry); }
      // изломы креста: белый камень с тёмной щелью
      for (const sgn of [-1, 1]) {
        const w0 = P(d, Bh, sgn * Ah), w1 = P(d, Ah, sgn * Ah);
        b.raw([w0[0], 0, w0[1], w1[0], 0, w1[1], w1[0], H + 1, w1[1], w0[0], 0, w0[1], w1[0], H + 1, w1[1], w0[0], H + 1, w0[1]], WS);
        const [sx, sz] = P(d, (Bh + Ah) / 2, sgn * (Ah + 0.08)); b.box(sx, y0, sz, 0.5, H - y0 - 6, 0.5, DK, ry);
      }
      // арка короны над торцом (стеклянный фронтон) и свод
      const R = (Ah * Ah + 36) / 12, yc = H + 6 - R, ph = Math.asin(Math.min(1, Ah / R)), N = 10, arc = [];
      for (let k = 0; k <= N; k++) { const t = -ph + 2 * ph * k / N; arc.push([R * Math.sin(t), yc + R * Math.cos(t)]); }
      const gab = []; for (let k = 0; k < N; k++) { const [a0, h0] = arc[k], [a1, h1] = arc[k + 1], q0 = P(d, Bh, a0), q1 = P(d, Bh, a1), qm = P(d, Bh, 0); gab.push(qm[0], H, qm[1], q0[0], h0, q0[1], q1[0], h1, q1[1]); }
      b.raw(gab, GL, "glow");
      const vault = []; for (let k = 0; k < N; k++) { const [a0, h0] = arc[k], [a1, h1] = arc[k + 1], p0 = P(d, Bh, a0), p1 = P(d, Bh, a1), m0 = P(d, 0, a0), m1 = P(d, 0, a1); vault.push(p0[0], h0, p0[1], p1[0], h1, p1[1], m1[0], h1, m1[1], p0[0], h0, p0[1], m1[0], h1, m1[1], m0[0], h0, m0[1]); }
      b.raw(vault, [0.22, 0.4, 0.68]);
      for (let k = 0; k <= N; k += N) { const [a0, h0] = arc[k], [q0x, q0z] = P(d, Bh + 0.2, a0); b.box(q0x, H, q0z, 1.2, h0 - H + 0.6, 1.2, WS, ry); }
      // золотые буквы NBU под аркой
      const txt = "NBU", px = 0.75, cols = txt.length * 6 - 1;
      for (let ci = 0; ci < 3; ci++) { const g = MD.FONT[txt[ci]]; for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 7; gy++) {
        if (g[gy * 5 + gx] !== "1") continue;
        const [lx, lz] = P(d, Bh + 0.6, -((ci * 6 + gx) - cols / 2) * px);                       // слева направо для смотрящего снаружи
        b.box(lx, H - 7 + (6 - gy) * px, lz, px, px, 0.3, GOLD, ry + (d[0] ? Math.PI / 2 : 0), true);
      } }
    }
    // перекрытие под сводами и шпиль с золотой птицей Хумо
    const roof = [[Bh, -Ah], [Bh, Ah], [Ah, Ah], [Ah, Bh], [-Ah, Bh], [-Ah, Ah], [-Bh, Ah], [-Bh, -Ah], [-Ah, -Ah], [-Ah, -Bh], [Ah, -Bh], [Ah, -Ah]].map(([u, v]) => tf(u, v));
    cap(b, roof, H + 1, [0.55, 0.56, 0.6]);
    b.cyl(cx, H + 6, cz, 0.35, 9, GOLD, 8); b.sphere(cx, H + 15, cz, 0.8, GOLD, 8);
    const bird = new THREE.ConeGeometry(0.9, 4, 6); bird.rotateZ(Math.PI / 2); b.add(bird, GOLD, cx, H + 16.5, cz, ry);
    for (const sgn of [-1, 1]) { const w = new THREE.BoxGeometry(1.6, 0.25, 5); w.rotateX(sgn * 0.5); w.translate(0, 0, sgn * 2.3); b.add(w, GOLD, cx, H + 17.2, cz, ry); }
    // соседний низкий стеклянный корпус
    if (annex) { b.winRing(annex.p, 0, annex.h - 1.2, GL, 81); band(b, annex.p, 0.4, annex.h - 1.2, 1.2, WS); cap(b, annex.p, annex.h, [0.6, 0.62, 0.66]); }
  };

  // ---------------- Ботанический сад им. Русанова ----------------
  // Главный вход с запада — портал с надписью BOTANIKA BOG'I и цветниками, рядом клумба «Луковица»;
  // на севере — оранжерея (стеклянный корпус в белом каркасе, сводчатые крылья, купол над центром)
  // и блочная теплица из параллельных двускатных секций; в центре — летняя эстрада-«ракушка»
  // с амфитеатром, пруд с горбатым мостиком и беседкой; окаменелое дерево на постаменте.
  const GHG = [0.6, 0.78, 0.76], WF = [0.95, 0.96, 0.95], STONE = [0.86, 0.8, 0.66];
  const both = (b, arr, col, list) => { const r = []; for (let i = 0; i < arr.length; i += 9) r.push(arr[i], arr[i + 1], arr[i + 2], arr[i + 6], arr[i + 7], arr[i + 8], arr[i + 3], arr[i + 4], arr[i + 5]); b.raw(arr, col, list); b.raw(r, col, list); };
  // стеклянный свод вдоль оси корпуса f от a0 до a1, полуширина c, основание y, подъём hv; рёбра каркаса через ~3 м
  function vault(b, f, a0, a1, c, y, hv, N = 8) {
    const prof = []; for (let k = 0; k <= N; k++) { const t = -1 + 2 * k / N; prof.push([t * c, y + hv * Math.sqrt(Math.max(0, 1 - t * t))]); }
    const sh = [], gab = [];
    for (let k = 0; k < N; k++) {
      const [c0, y0] = prof[k], [c1, y1] = prof[k + 1], p00 = FP(f, a0, c0), p01 = FP(f, a0, c1), p10 = FP(f, a1, c0), p11 = FP(f, a1, c1);
      sh.push(p00[0], y0, p00[1], p10[0], y0, p10[1], p11[0], y1, p11[1], p00[0], y0, p00[1], p11[0], y1, p11[1], p01[0], y1, p01[1]);
      for (const a of [a0, a1]) { const m = FP(f, a, 0), q0 = FP(f, a, c0), q1 = FP(f, a, c1); gab.push(m[0], y, m[1], q0[0], y0, q0[1], q1[0], y1, q1[1]); }
    }
    both(b, sh, GHG, "glow"); both(b, gab, GHG, "glow");
    const n = Math.max(1, Math.round((a1 - a0) / 3));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      for (let k = 0; k < N; k++) { const [c0, y0] = prof[k], [c1, y1] = prof[k + 1], p = FP(f, a, c0), q = FP(f, a, c1); b.beam(p[0], y0 + 0.05, p[1], q[0], y1 + 0.05, q[1], 0.18, WF); }
    }
    const r0 = FP(f, a0, 0), r1 = FP(f, a1, 0); b.beam(r0[0], y + hv + 0.08, r0[1], r1[0], y + hv + 0.08, r1[1], 0.3, WF);
  }
  M.botanic_gh = (b, o) => {
    const Q = localParts(o), or = Q.reduce((a, q) => (q.h > a.h ? q : a)), gh = Q.find((q) => q !== or);
    // оранжерея: цоколь, стеклянные стены в белом каркасе, сводчатые крылья и купольный павильон
    const f = frame(or), A = f.L / 2, B = f.W / 2;
    b.loft(or.p, 0, or.p, 0.9, [0.8, 0.78, 0.72]); cap(b, or.p, 0.9, [0.7, 0.68, 0.62]);
    twoSided(b, or.p, 0.9, 5.4, GHG, "glow"); pilasters(b, or.p, 0.9, 5.4, 2.2, 0.2, 0.22, WF); band(b, or.p, 0.12, 5.4, 0.5, WF); band(b, or.p, 0.12, 2.8, 0.18, WF);
    cap(b, offset(or.p, -0.4), 5.85, [0.82, 0.84, 0.82]);
    const cB = Math.min(B - 1.6, 8);
    vault(b, f, -A + 1.5, -7.5, cB, 5.9, 4.2); vault(b, f, 7.5, A - 1.5, cB, 5.9, 4.2);
    b.cyl(f.cx, 5.9, f.cz, 7.6, 0.5, WF, 16);
    b.cyl(f.cx, 6.4, f.cz, 7, 3.4, GHG, 16, 7, true); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; b.box(f.cx + Math.cos(a) * 7.05, 6.4, f.cz + Math.sin(a) * 7.05, 0.22, 3.4, 0.22, WF, -a); }
    b.cyl(f.cx, 9.8, f.cz, 7.4, 0.4, WF, 16);
    b.dome(f.cx, 10.2, f.cz, 7, GHG, { hk: 0.62, seg: 16, ribs: WF, tip: false }); b.glow.push(b.parts.pop());
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.beam(f.cx + Math.cos(a) * 7, 10.2, f.cz + Math.sin(a) * 7, f.cx + Math.cos(a) * 3.2, 14, f.cz + Math.sin(a) * 3.2, 0.2, WF); }
    b.cyl(f.cx, 14.1, f.cz, 1.3, 1.4, WF, 8); b.cone(f.cx, 15.5, f.cz, 1.6, 1.6, [0.3, 0.55, 0.45], 8); b.cyl(f.cx, 17, f.cz, 0.08, 1.6, [0.85, 0.7, 0.3], 4);
    // пальмы у входа в оранжерею
    for (const s of [-1, 1]) {
      const [px, pz] = FP(f, s * 5, B + 3.5);
      b.cyl(px, 0, pz, 0.28, 5.5, [0.5, 0.4, 0.3], 6, 0.2);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; b.beam(px, 5.5, pz, px + Math.cos(a) * 2.6, 4.6, pz + Math.sin(a) * 2.6, 0.5, [0.32, 0.52, 0.26], "parts", 0.12); }
    }
    if (!gh) return;
    // блочная теплица: параллельные двускатные стеклянные секции
    const g = frame(gh), GA = g.L / 2, GB = g.W / 2, n = Math.max(3, Math.round(g.W / 8.5)), bw = g.W / n, Hs = 3.4, Hr = Hs + bw * 0.38;
    const rect = [FP(g, -GA, -GB), FP(g, GA, -GB), FP(g, GA, GB), FP(g, -GA, GB)];
    b.loft(rect, 0, rect, 0.5, [0.78, 0.76, 0.7]); twoSided(b, rect, 0.5, Hs, GHG, "glow"); pilasters(b, rect, 0.5, Hs, 2.4, 0.16, 0.18, WF);
    for (let i = 0; i < n; i++) {
      const c0 = -GB + i * bw, cm = c0 + bw / 2, c1 = c0 + bw, s = [];
      const P0 = (a, c, y) => { const [x, z] = FP(g, a, c); return [x, y, z]; };
      for (const [ca, cb] of [[c0, cm], [cm, c1]]) {
        const ya = ca === cm ? Hr : Hs, yb = cb === cm ? Hr : Hs;
        s.push(...P0(-GA, ca, ya), ...P0(GA, ca, ya), ...P0(GA, cb, yb), ...P0(-GA, ca, ya), ...P0(GA, cb, yb), ...P0(-GA, cb, yb));
      }
      for (const a of [-GA, GA]) s.push(...P0(a, c0, Hs), ...P0(a, cm, Hr), ...P0(a, c1, Hs));
      both(b, s, GHG, "glow");
      const r0 = FP(g, -GA, cm), r1 = FP(g, GA, cm); b.beam(r0[0], Hr, r0[1], r1[0], Hr, r1[1], 0.25, WF);
      const e0 = FP(g, -GA, c1), e1 = FP(g, GA, c1); b.beam(e0[0], Hs, e0[1], e1[0], Hs, e1[1], 0.3, [0.7, 0.72, 0.72]);
      for (let a = -GA; a <= GA + 0.01; a += 3) { const p = FP(g, a, c0), q = FP(g, a, cm), r = FP(g, a, c1); b.beam(p[0], Hs, p[1], q[0], Hr, q[1], 0.12, WF); b.beam(q[0], Hr, q[1], r[0], Hs, r[1], 0.12, WF); }
    }
    const [kx, kz] = FP(g, GA + 4, -GB + 3); b.box(kx, 0, kz, 5, 3.2, 4, [0.86, 0.84, 0.78], g.ry); b.box(kx, 3.2, kz, 5.4, 0.3, 4.4, [0.5, 0.5, 0.52], g.ry); b.cyl(kx + 1.5, 3.2, kz, 0.35, 6, [0.62, 0.58, 0.55], 8);
  };

  // летняя эстрада: сцена с белой «ракушкой», амфитеатр полукругом; пруд с мостиком и беседкой
  M.botanic_stage = (b, o) => {
    const [st, sd] = localParts(o), dx0 = sd.cx - st.cx, dz0 = sd.cz - st.cz, dl = Math.hypot(dx0, dz0), ux = dx0 / dl, uz = dz0 / dl, vx = -uz, vz = ux;
    // центр полукруга — передний край сцены
    let ext = 0; for (const [x, z] of st.p) ext = Math.max(ext, (x - st.cx) * ux + (z - st.cz) * uz);
    const C = [st.cx + ux * ext * 0.6, st.cz + uz * ext * 0.6];
    let r0 = 1e9, r1 = 0, a0 = 1e9, a1 = -1e9;
    for (const [x, z] of sd.p) { const px = x - C[0], pz = z - C[1], r = Math.hypot(px, pz), a = Math.atan2(px * vx + pz * vz, px * ux + pz * uz); r0 = Math.min(r0, r); r1 = Math.max(r1, r); a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
    r0 = Math.max(5, r0 - 1); const rows = 11, NS = 18, at = (r, a) => [C[0] + (ux * Math.cos(a) + vx * Math.sin(a)) * r, C[1] + (uz * Math.cos(a) + vz * Math.sin(a)) * r];
    const arcP = (r) => { const p = []; for (let k = 0; k <= NS; k++) p.push(at(r, a0 + (a1 - a0) * k / NS)); return p; };
    const strip = (A2, yA, B2, yB, col) => { const arr = []; for (let k = 0; k < NS; k++) arr.push(A2[k][0], yA, A2[k][1], A2[k + 1][0], yA, A2[k + 1][1], B2[k + 1][0], yB, B2[k + 1][1], A2[k][0], yA, A2[k][1], B2[k + 1][0], yB, B2[k + 1][1], B2[k][0], yB, B2[k][1]); both(b, arr, col); };
    for (let t = 0; t < rows; t++) {
      const ra = r0 + (r1 - r0) * t / rows, rb = r0 + (r1 - r0) * (t + 1) / rows, y = 0.15 + t * 0.48;
      strip(arcP(ra), y, arcP(ra), y + 0.48, [0.62, 0.6, 0.56]);
      strip(arcP(ra), y + 0.48, arcP(rb), y + 0.48, t % 2 ? [0.74, 0.56, 0.38] : [0.8, 0.78, 0.74]);
    }
    const top = 0.15 + rows * 0.48; strip(arcP(r1), 0, arcP(r1), top + 1, [0.86, 0.82, 0.74]);
    for (const a of [a0, a1]) { const p = at(r0, a), q = at(r1, a); b.beam(p[0], 0, p[1], q[0], 0, q[1], 1.2, [0.82, 0.78, 0.7], "parts", 0.6); }
    for (let k = 1; k < 4; k++) { const a = a0 + (a1 - a0) * k / 4, p = at(r0, a), q = at(r1, a); b.beam(p[0], 0.2, p[1], q[0], top, q[1], 1.1, [0.9, 0.88, 0.84], "parts", 0.12); } // проходы
    // сцена и «ракушка»
    b.loft(st.p, 0, st.p, 1.2, [0.72, 0.7, 0.66]); cap(b, st.p, 1.2, [0.62, 0.48, 0.34]);
    const Bk = [st.cx - ux * ext * 0.25, st.cz - uz * ext * 0.25], Rs = Math.min(11, Math.max(6, dl * 0.4)), NA = 14, NE = 6, sh = [];
    const SP = (ph, ps) => { const h = Math.cos(ps) * Rs, dx = -ux * Math.cos(ph) + vx * Math.sin(ph), dz = -uz * Math.cos(ph) + vz * Math.sin(ph); return [Bk[0] + dx * h, 1.2 + Math.sin(ps) * Rs * 0.9, Bk[1] + dz * h]; };
    for (let i = 0; i < NA; i++) for (let j = 0; j < NE; j++) {
      const p0 = -Math.PI / 2 + Math.PI * i / NA, p1 = -Math.PI / 2 + Math.PI * (i + 1) / NA, e0 = Math.PI / 2 * j / NE, e1 = Math.PI / 2 * (j + 1) / NE;
      sh.push(...SP(p0, e0), ...SP(p1, e0), ...SP(p1, e1), ...SP(p0, e0), ...SP(p1, e1), ...SP(p0, e1));
    }
    both(b, sh, [0.96, 0.96, 0.95]);
    for (let j = 0; j < NE; j++) for (const s of [-1, 1]) { const p = SP(s * Math.PI / 2, Math.PI / 2 * j / NE), q = SP(s * Math.PI / 2, Math.PI / 2 * (j + 1) / NE); b.beam(p[0], p[1], p[2], q[0], q[1], q[2], 0.5, [0.86, 0.84, 0.8]); }
    for (let i = 0; i <= 6; i++) { const ph = -Math.PI / 2 + Math.PI * i / 6, p = SP(ph, 0.02); b.cyl(p[0], 1.2, p[2], 0.12, 2.6, [1, 0.85, 0.55], 6, 0.12, true); } // софиты
    // мостик через пруд: горбатый настил с перилами
    const sb = o.sub || {};
    if (sb.b0 && sb.b1) {
      const [x0, z0] = o.local(...sb.b0), [x1, z1] = o.local(...sb.b1), L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L, N = 12;
      const Y = (t) => 0.4 + Math.sin(t * Math.PI) * 1.8, W2 = [0.56, 0.38, 0.24];
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N, xa = x0 + (x1 - x0) * t0, za = z0 + (z1 - z0) * t0, xb = x0 + (x1 - x0) * t1, zb = z0 + (z1 - z0) * t1;
        b.beam(xa, Y(t0), za, xb, Y(t1), zb, 2.6, W2, "parts", 0.25);
        for (const s of [-1, 1]) b.beam(xa + nx * s * 1.25, Y(t0) + 1, za + nz * s * 1.25, xb + nx * s * 1.25, Y(t1) + 1, zb + nz * s * 1.25, 0.12, [0.9, 0.3, 0.2]);
        for (const s of [-1, 1]) b.box(xa + nx * s * 1.25, Y(t0), za + nz * s * 1.25, 0.14, 1, 0.14, [0.9, 0.3, 0.2], ry);
      }
    }
    // беседка: шестигранная, на колоннах, с шатровой крышей
    if (sb.gz) {
      const [gx, gz] = o.local(...sb.gz);
      b.cyl(gx, 0, gz, 3.6, 0.45, [0.8, 0.76, 0.68], 6);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.cyl(gx + Math.cos(a) * 3, 0.45, gz + Math.sin(a) * 3, 0.16, 2.8, [0.95, 0.94, 0.9], 6); }
      b.cyl(gx, 3.2, gz, 3.9, 0.35, [0.62, 0.42, 0.26], 6); b.cone(gx, 3.55, gz, 4.2, 2.4, [0.24, 0.5, 0.46], 6); b.cyl(gx, 5.9, gz, 0.1, 0.9, [0.85, 0.7, 0.3], 4);
    }
  };

  // главный вход: портал на дорожке, ограда, цветники; клумба-«Луковица»
  M.botanic_gate = (b, o) => {
    const sb = o.sub || {}, bulb = localParts(o)[0];
    if (bulb) { // цветы концентрическими полосами от центра луковицы, перья листьев — зелёные
      const p = bulb.p, inside = (x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
      let mx = 0, mz = 0, n = 0;
      for (let x = bulb.x0; x < bulb.x1; x += 1) for (let z = bulb.z0; z < bulb.z1; z += 1) if (inside(x, z)) {
        let near = 1e9; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const ax = p[j][0], az = p[j][1], ex = p[i][0] - ax, ez = p[i][1] - az, q = ex * ex + ez * ez, t = q ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / q)) : 0; near = Math.min(near, Math.hypot(x - ax - ex * t, z - az - ez * t)); }
        if (near > 5) { mx += x; mz += z; n++; }
      }
      mx /= n || 1; mz /= n || 1;
      const FL = [[0.96, 0.82, 0.2], [0.88, 0.2, 0.18], [0.62, 0.3, 0.7], [0.96, 0.62, 0.74], [0.97, 0.96, 0.92]];
      b.loft(p, 0, p, 0.35, [0.22, 0.42, 0.2]);
      for (let x = bulb.x0 + 0.5; x < bulb.x1; x += 1) for (let z = bulb.z0 + 0.5; z < bulb.z1; z += 1) {
        if (!inside(x, z)) continue;
        const d = Math.hypot(x - mx, z - mz), leaf = d > 14, col = leaf ? [0.3, 0.56, 0.24] : FL[Math.floor(d / 2.8) % FL.length], h = leaf ? 0.45 : 0.3 + ((x * 7 + z * 13) % 3) * 0.05;
        b.box(x, 0, z, 1, h, 1, col);
      }
    }
    if (!sb.gate) return;
    const [gx, gz] = o.local(...sb.gate), [g2x, g2z] = sb.gate2 ? o.local(...sb.gate2) : [gx + 1, gz], tl = Math.hypot(g2x - gx, g2z - gz), tx = (g2x - gx) / tl, tz = (g2z - gz) / tl, nx = -tz, nz = tx;
    const ry = Math.atan2(-nz, nx), Pt = (t, n) => [gx + tx * t + nx * n, gz + tz * t + nz * n], TILE = [0.16, 0.46, 0.72], GRN = [0.24, 0.5, 0.42];
    // пилоны и арка
    for (const s of [-1, 1]) {
      const [x, z] = Pt(0, s * 5.2); b.box(x, 0, z, 2.2, 7.2, 2.2, STONE, ry); b.box(x, 7.2, z, 2.6, 0.5, 2.6, TILE, ry); b.box(x, 7.7, z, 1.8, 0.9, 1.8, STONE, ry); b.cone(x, 8.6, z, 1.1, 1.6, GRN, 8);
      for (const t of [-1.12, 1.12]) { const [px, pz] = Pt(t, s * 5.2); b.box(px, 1, pz, 1.2, 4.5, 0.12, TILE, ry); }
      const [y1x, y1z] = Pt(0, s * 10.5); b.box(y1x, 0, y1z, 1.6, 4.6, 1.6, STONE, ry); b.box(y1x, 4.6, y1z, 1.9, 0.4, 1.9, TILE, ry); b.cone(y1x, 5, y1z, 0.8, 1.1, GRN, 8);
      for (let k = 0; k < 9; k++) { const [fx, fz] = Pt(0, s * (12 + k * 2.4)); b.box(fx, 0, fz, 0.35, 2.2, 0.35, [0.25, 0.3, 0.28], ry); }
      const [f0x, f0z] = Pt(0, s * 11.3), [f1x, f1z] = Pt(0, s * 33); for (const y of [0.4, 1.3, 2.05]) b.beam(f0x, y, f0z, f1x, y, f1z, 0.08, [0.25, 0.3, 0.28]);
    }
    const [lx, lz] = Pt(0, 0); b.box(lx, 6, lz, 12.6, 1.6, 1.4, STONE, ry); b.box(lx, 7.6, lz, 13, 0.35, 1.8, TILE, ry);
    for (let k = 0; k < 10; k++) { const a = Math.PI * k / 9, [ax, az] = Pt(0, Math.cos(a) * 4.1); b.box(ax, 3.9 + Math.sin(a) * 2.1, az, 0.9, 0.5, 1.3, STONE, ry); }
    for (const s of [-1, 1]) { const [sx, sz] = Pt(s * 0.75, 0); sign(b, "BOTANIKA BOG'I", sx, 6.25, sz, tx * s, tz * s, 0.14, [0.98, 0.86, 0.4]); }
    // касса у входа
    const [kx, kz] = Pt(-1.5, 8.8); b.box(kx, 0, kz, 3, 2.8, 5.4, [0.94, 0.92, 0.86], ry); b.box(kx, 2.8, kz, 3.6, 0.3, 6, GRN, ry);
    // цветники вдоль дорожки за воротами
    const FC = [[0.9, 0.22, 0.2], [0.96, 0.8, 0.22], [0.66, 0.32, 0.72], [0.96, 0.96, 0.94]];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const [cx, cz] = Pt(12 + i * 13, s * 6.5);
      b.cyl(cx, 0, cz, 3.4, 0.35, [0.62, 0.6, 0.56], 16);
      for (let r = 0; r < 4; r++) b.cyl(cx, 0.35, cz, 3 - r * 0.75, 0.22 + r * 0.06, FC[(r + i) % 4], 16);
    }
  };

  // окаменелое дерево (70 млн лет) на каменном постаменте
  M.botanic_relic = (b) => {
    b.box(0, 0, 0, 8, 0.5, 3, [0.7, 0.68, 0.64]); b.box(0, 0.5, 0, 7.4, 0.25, 2.5, [0.62, 0.6, 0.56]);
    const seg = [[-2.6, 0.75, 0.8, 2.4, [0.5, 0.42, 0.36]], [0.1, 0.7, 0.7, 2.6, [0.56, 0.48, 0.4]], [2.6, 0.62, 0.58, 2, [0.48, 0.4, 0.34]]];
    for (const [x, r, rr, len, col] of seg) { const g = new THREE.CylinderGeometry(rr, r, len, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.75 + r, 0); b.add(g, col, x, 0, 0, 0.08 * x); }
    b.box(4.6, 0, 1.6, 0.12, 1.1, 0.12, [0.3, 0.3, 0.3]); b.box(4.6, 1.1, 1.6, 1.2, 0.8, 0.08, [0.2, 0.36, 0.3]);
  };

  // ---------------- мемориал «Шахидлар хотираси» у телебашни ----------------
  // По фото: ротонда ~27 м — круглый гранитный подиум со ступенями, восемь пучковых мраморных колонн,
  // кольцевой антаблемент со сталактитовым карнизом, барабан и бирюзовый ребристый купол-«дыня»
  // с золотым навершием; под куполом — памятный камень. Вокруг — партер: кольца стриженой
  // изгороди, шары самшита, узорные клумбы, фонари. Музей памяти жертв репрессий — кремовый корпус,
  // обнесённый резной деревянной галереей-айваном, охристый портал с аркой и два бирюзовых купола.
  M.shahidlar = (b, o) => {
    const Q = localParts(o), rot = Q.find((q) => q.h > 20), dm = Q.filter((q) => q.h === 10), mus = Q.find((q) => q.h === 6);
    const MARBLE = [0.9, 0.9, 0.88], GRAN = [0.62, 0.6, 0.58], TQ = [0.36, 0.66, 0.84], TQ2 = [0.28, 0.56, 0.76], GOLD = [0.9, 0.72, 0.32];
    const HEDGE = [0.2, 0.42, 0.2], BOX = [0.26, 0.5, 0.24];
    if (rot) {
      const cx = rot.cx, cz = rot.cz, R = 6.2;
      // подиум со ступенями
      for (let k = 0; k < 4; k++) b.cyl(cx, k * 0.35, cz, R + 3.6 - k * 0.9, 0.35, k % 2 ? GRAN : [0.7, 0.68, 0.66], 32);
      // пучковые колонны: четыре тонких ствола вокруг ядра, база и капитель
      const H0 = 1.4, HC = 13.5;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        b.box(x, H0, z, 1.5, 1.2, 1.5, MARBLE, -a);
        b.cyl(x, H0 + 1.2, z, 0.38, HC - 2.4, MARBLE, 8);
        for (let k = 0; k < 4; k++) { const t = k / 4 * Math.PI * 2 + a; b.cyl(x + Math.cos(t) * 0.42, H0 + 1.2, z + Math.sin(t) * 0.42, 0.2, HC - 2.4, [0.86, 0.86, 0.84], 6); }
        b.box(x, H0 + HC - 1.2, z, 1.4, 1.2, 1.4, [0.84, 0.84, 0.82], -a);
      }
      // антаблемент и сталактитовый карниз (зубцы-«мукарнас» в два яруса)
      const yE = H0 + HC;
      b.cyl(cx, yE, cz, R + 1.3, 1.5, MARBLE, 32);
      for (let t = 0; t < 2; t++) for (let i = 0; i < 32; i++) {
        const a = (i + t * 0.5) / 32 * Math.PI * 2, rr = R + 1.45 + t * 0.35, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const g = new THREE.ConeGeometry(0.55, 1.1, 4); g.rotateX(Math.PI); g.translate(0, 0.55, 0); b.add(g, t ? [0.8, 0.8, 0.78] : MARBLE, x, yE + 1.5 + t * 0.9, z, -a);
      }
      b.cyl(cx, yE + 1.5, cz, R + 1.9, 1.8, [0.94, 0.94, 0.92], 32, R + 1.3);
      b.cyl(cx, yE + 3.3, cz, R + 1.9, 0.3, [0.84, 0.84, 0.82], 32);
      // барабан, ребристый купол, навершие
      b.cyl(cx, yE + 3.65, cz, R - 1.4, 1.6, [0.94, 0.94, 0.92], 24);
      b.dome(cx, yE + 5.25, cz, R - 1.2, TQ, { hk: 1.18, seg: 28, ribs: TQ2, tip: false });
      const top = yE + 5.25 + (R - 1.2) * 1.18;
      b.cyl(cx, top - 0.2, cz, 0.18, 1.6, GOLD, 6); b.sphere(cx, top + 1.5, cz, 0.45, GOLD, 8); b.cyl(cx, top + 1.9, cz, 0.08, 1.2, GOLD, 4);
      // памятный камень под куполом
      b.box(cx, H0, cz, 1.8, 1.1, 1.1, [0.3, 0.28, 0.28]); b.box(cx, H0 + 1.1, cz, 1.4, 0.25, 0.8, GOLD);
      // партер: кольца изгороди, шары самшита, клумбы, фонари
      for (const [r0, w] of [[13, 0.9], [19, 0.8]]) for (let i = 0; i < 36; i++) {
        const a0 = i / 36 * Math.PI * 2, a1 = (i + 1) / 36 * Math.PI * 2;
        if (i % 9 === 4) continue; // проходы на четыре стороны
        b.beam(cx + Math.cos(a0) * r0, 0.05, cz + Math.sin(a0) * r0, cx + Math.cos(a1) * r0, 0.05, cz + Math.sin(a1) * r0, w, HEDGE, "parts", 0.7);
      }
      for (let i = 0; i < 24; i++) { const a = (i + 0.5) / 24 * Math.PI * 2; b.sphere(cx + Math.cos(a) * 16, 0.75, cz + Math.sin(a) * 16, 0.95, BOX, 8); }
      const FL = [[0.88, 0.2, 0.22], [0.96, 0.82, 0.24], [0.96, 0.96, 0.94], [0.66, 0.3, 0.72]];
      for (let i = 0; i < 16; i++) {
        const a = (i + 0.5) / 16 * Math.PI * 2;
        for (let k = 0; k < 3; k++) { const rr = 21 + k * 1.3; b.cyl(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr, 0.75, 0.35, FL[(i + k) % 4], 8); }
      }
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, x = cx + Math.cos(a) * 11.2, z = cz + Math.sin(a) * 11.2;
        b.cyl(x, 0, z, 0.1, 3.8, [0.2, 0.2, 0.22], 6); b.sphere(x, 4, z, 0.35, [1, 0.92, 0.7], 6); to(b, "glow");
      }
    }
    if (mus) {
      // корпус, айван с резными колоннами, плоская кровля
      const f = frame(mus), A = f.L / 2, B = f.W / 2, rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)];
      const SAND = [0.88, 0.8, 0.64], WOOD = [0.46, 0.29, 0.16], OCHRE = [0.76, 0.56, 0.32];
      const core = rect(A - 3, B - 3); b.loft(rect(A + 0.5, B + 0.5), 0, rect(A + 0.5, B + 0.5), 0.6, GRAN); cap(b, rect(A + 0.5, B + 0.5), 0.6, [0.72, 0.7, 0.66]);
      b.winRing(core, 0.6, 6.4, SAND, 57); cap(b, core, 6.4, [0.8, 0.74, 0.62]);
      const gal = rect(A - 0.6, B - 0.6);
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = gal[i], [x1, z1] = gal[(i + 1) % 4], Le = Math.hypot(x1 - x0, z1 - z0), n = Math.round(Le / 2.8);
        for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; b.cyl(x, 0.6, z, 0.2, 4.2, WOOD, 8, 0.16); b.box(x, 4.6, z, 0.7, 0.5, 0.7, OCHRE, f.ry); }
      }
      const eave = rect(A, B); b.loft(eave, 5.1, eave, 6.2, WOOD); band(b, eave, 0.05, 5.45, 0.35, OCHRE); cap(b, eave, 6.2, [0.74, 0.66, 0.54]);
      // охристый портал с арочной нишей на стороне ротонды
      const side = rot && ((rot.cx - f.cx) * f.vx + (rot.cz - f.cz) * f.vz) < 0 ? -1 : 1;
      const [px, pz] = FP(f, 0, side * (B + 0.4)), ry = f.ry + (side > 0 ? 0 : Math.PI);
      b.box(px, 0.6, pz, 12, 9.4, 2, OCHRE, ry);
      const [nx, nz] = FP(f, 0, side * (B + 1.45)); b.box(nx, 0.6, nz, 5.4, 6.4, 0.2, [0.32, 0.22, 0.14], ry);
      const [fx, fz] = FP(f, 0, side * (B + 1.5)); b.box(fx, 8.2, fz, 11.4, 0.8, 0.2, TQ2, ry);
      for (const s of [-1, 1]) { const [qx, qz] = FP(f, s * 5.2, side * (B + 1.45)); b.box(qx, 0.6, qz, 0.6, 8.2, 0.2, [0.62, 0.44, 0.24], ry); }
      // два купола на барабанах с узорным поясом
      for (const d of dm) {
        const r = Math.sqrt(d.A / Math.PI);
        b.cyl(d.cx, 6.2, d.cz, r + 0.6, 0.6, [0.86, 0.8, 0.66], 20);
        b.cyl(d.cx, 6.8, d.cz, r, 2.6, SAND, 20); b.cyl(d.cx, 7.9, d.cz, r + 0.05, 0.7, TQ2, 20);
        b.dome(d.cx, 9.4, d.cz, r * 1.02, [0.4, 0.72, 0.78], { hk: 0.88, seg: 24, ribs: [0.34, 0.64, 0.72], tip: false });
        const tp = 9.4 + r * 0.9; b.cyl(d.cx, tp - 0.2, d.cz, 0.15, 1.8, GOLD, 6); b.sphere(d.cx, tp + 1.7, d.cz, 0.35, GOLD, 6);
      }
    }
  };

  // ---------------- Центр исламской цивилизации у Хазрати Имама (2024) ----------------
  // По фото и макету: корпус 161×119 м в три высоких этажа — кольцо и крест флигелей вокруг четырёх
  // озеленённых дворов; светлый мрамор, аркады стрельчатых окон в два яруса, зубчатый парапет.
  // На каждой стороне — портал-пештак ~34 м с глубокой арочной нишей в синей мозаике, по бокам —
  // минареты-гульдасты и малые голубые купола; северный «Портал Улугбека» (37,7 м) — к площади
  // Хазрати Имама. В центре — восьмигранный зал, барабан с окнами и бирюзовый ребристый купол 65 м.
  M.islamic_center = (b, o) => {
    const Q = localParts(o), big = Q.reduce((a, q) => (q.A > a.A ? q : a)), oct = Q.find((q) => q.h === 33), drum = Q.find((q) => q.h === 45);
    const MAR = [0.94, 0.92, 0.87], MAR2 = [0.84, 0.82, 0.77], TILE = [0.15, 0.38, 0.68], TQ = [0.3, 0.66, 0.84], TQ2 = [0.22, 0.54, 0.76];
    const GL = [0.22, 0.3, 0.4], NICHE = [0.12, 0.2, 0.33], GOLD = [0.9, 0.72, 0.32], LAWN = [0.36, 0.56, 0.26], PAVE = [0.82, 0.78, 0.7];
    const f = frame(big), A = f.L / 2, B = f.W / 2, RW = 18, CW = 22, HW = 19;
    const R4 = (a0, a1, c0, c1) => [FP(f, a0, c0), FP(f, a1, c0), FP(f, a1, c1), FP(f, a0, c1)];
    // стрельчатые окна на стене от p0 до p1 (наружу — n): два яруса с пилястрами между пролётами
    const bays = (p0, p1, nx, nz, y0, y1) => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L, ry = Math.atan2(-uz, ux), n = Math.floor(L / 7);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * L / n, x = p0[0] + ux * t + nx * 0.15, z = p0[1] + uz * t + nz * 0.15;
        for (const [ya, hh] of [[y0 + 1.8, 6.6], [y0 + 10.4, 4.6]]) {
          b.box(x, ya, z, 3.2, hh, 0.3, GL, ry, true);
          b.box(x, ya + hh, z, 2.2, 0.8, 0.3, GL, ry, true); b.box(x, ya + hh + 0.8, z, 1.1, 0.7, 0.3, GL, ry, true); // стрельчатый верх
        }
        const px = p0[0] + ux * (k * L / n) + nx * 0.25, pz = p0[1] + uz * (k * L / n) + nz * 0.25;
        b.box(px, y0, pz, 0.9, y1 - y0, 0.5, MAR2, ry);
      }
    };
    const block = (a0, a1, c0, c1, H, out) => {
      const r = R4(a0, a1, c0, c1); b.loft(r, 0, r, H, MAR); cap(b, r, H, [0.86, 0.85, 0.82]);
      band(b, r, 0.25, H - 1.2, 1.2, MAR2);
      for (let i = 0; i < 4; i++) { if (!out[i]) continue; const p0 = r[i], p1 = r[(i + 1) % 4], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); bays(p0, p1, (p1[1] - p0[1]) / L, -(p1[0] - p0[0]) / L, 0, H - 1.2); }
    };
    // зубчатый парапет по внешнему периметру
    const crest = (r, H) => { for (let i = 0; i < 4; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % 4], L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 2.2), ry = Math.atan2(-(z1 - z0), x1 - x0); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; b.box(x0 + (x1 - x0) * t, H, z0 + (z1 - z0) * t, 1.1, 1.3, 0.6, MAR2, ry); } } };
    // кольцо корпусов (наружные и дворовые стены с окнами) и крест флигелей
    block(-A, A, B - RW, B, HW, [1, 1, 1, 1]); block(-A, A, -B, -B + RW, HW, [1, 1, 1, 1]);
    block(A - RW, A, -B + RW, B - RW, HW, [0, 1, 0, 1]); block(-A, -A + RW, -B + RW, B - RW, HW, [0, 1, 0, 1]);
    block(-A + RW, A - RW, -CW / 2, CW / 2, HW, [1, 0, 1, 0]); block(-CW / 2, CW / 2, -B + RW, B - RW, HW, [0, 1, 0, 1]);
    crest(R4(-A, A, -B, B), HW);
    // угловые павильоны с малыми куполами
    for (const sa of [-1, 1]) for (const sc of [-1, 1]) {
      const [x, z] = FP(f, sa * (A - 11), sc * (B - 11)), r = R4(sa * A - (sa > 0 ? 22 : 0), sa * A + (sa > 0 ? 0 : 22), sc * B - (sc > 0 ? 22 : 0), sc * B + (sc > 0 ? 0 : 22));
      b.loft(r, HW, r, HW + 5, MAR); cap(b, r, HW + 5, [0.86, 0.85, 0.82]); band(b, r, 0.2, HW + 3.6, 1, TILE);
      b.cyl(x, HW + 5, z, 5.4, 2.4, MAR, 16); b.cyl(x, HW + 6.6, z, 5.45, 0.5, TILE, 16); b.dome(x, HW + 7.4, z, 5.2, TQ, { hk: 1.05, seg: 16, ribs: TQ2, tip: false }); b.cyl(x, HW + 12.8, z, 0.12, 1.8, GOLD, 4);
    }
    // дворы: газон, дорожки крестом, фонтан
    for (const sa of [-1, 1]) for (const sc of [-1, 1]) {
      const a0 = sa * CW / 2, a1 = sa * (A - RW), c0 = sc * CW / 2, c1 = sc * (B - RW), ma = (a0 + a1) / 2, mc = (c0 + c1) / 2;
      cap(b, R4(Math.min(a0, a1), Math.max(a0, a1), Math.min(c0, c1), Math.max(c0, c1)), 0.15, LAWN);
      cap(b, R4(Math.min(a0, a1), Math.max(a0, a1), mc - 1.5, mc + 1.5), 0.2, PAVE); cap(b, R4(ma - 1.5, ma + 1.5, Math.min(c0, c1), Math.max(c0, c1)), 0.2, PAVE);
      const [fx, fz] = FP(f, ma, mc); b.cyl(fx, 0, fz, 4, 0.6, MAR2, 16); b.cyl(fx, 0.55, fz, 3.5, 0.1, [0.3, 0.55, 0.72], 16); b.cyl(fx, 0.6, fz, 0.35, 2.2, [0.85, 0.92, 1], 6);
      for (const [da, dc] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) { const [tx, tz] = FP(f, a0 + (a1 - a0) * da, c0 + (c1 - c0) * dc); b.cyl(tx, 0, tz, 0.2, 2.2, [0.42, 0.32, 0.22], 5); b.sphere(tx, 3.4, tz, 1.8, [0.3, 0.5, 0.24], 7); }
    }
    // центральный зал: восьмигранник, барабан с окнами, бирюзовый ребристый купол
    if (oct) {
      b.loft(oct.p, HW, oct.p, 33, MAR); cap(b, oct.p, 33, [0.86, 0.85, 0.82]); band(b, oct.p, 0.3, 31.4, 1.6, TILE);
      for (let i = 0; i < oct.p.length; i++) { // аркады на гранях зала
        const p0 = oct.p[i], p1 = oct.p[(i + 1) % oct.p.length], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (L < 8) continue;
        let nx = (p1[1] - p0[1]) / L, nz = -(p1[0] - p0[0]) / L;
        if (((p0[0] + p1[0]) / 2 - oct.cx) * nx + ((p0[1] + p1[1]) / 2 - oct.cz) * nz < 0) { nx = -nx; nz = -nz; }
        bays(p0, p1, nx, nz, HW - 1.8, 31.4);
      }
    }
    const dc = drum ? [drum.cx, drum.cz] : FP(f, 0, 0), Rd = drum ? Math.sqrt(drum.A / Math.PI) : 15;
    b.cyl(dc[0], 33, dc[1], Rd + 1, 1, MAR2, 32);
    b.cyl(dc[0], 34, dc[1], Rd, 10, MAR, 32);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = dc[0] + Math.cos(a) * (Rd + 0.05), z = dc[1] + Math.sin(a) * (Rd + 0.05); b.box(x, 35.6, z, 2.4, 5.2, 0.3, GL, -a + Math.PI / 2, true); b.box(x, 40.8, z, 1.3, 0.9, 0.3, GL, -a + Math.PI / 2, true); }
    b.cyl(dc[0], 42.6, dc[1], Rd + 0.3, 1.6, TILE, 32);
    b.dome(dc[0], 44.2, dc[1], Rd * 1.04, TQ, { hk: 1.2, seg: 32, ribs: TQ2, tip: false });
    const top = 44.2 + Rd * 1.04 * 1.2;
    b.cyl(dc[0], top - 0.4, dc[1], 1.2, 1, GOLD, 8); b.cyl(dc[0], top + 0.5, dc[1], 0.18, 2.6, GOLD, 6); b.sphere(dc[0], top + 3.2, dc[1], 0.6, GOLD, 8);
    // порталы-пештаки по осям сторон; ближайший к Хазрати Имаму — главный, выше остальных
    const [hx, hz] = o.x2 !== undefined ? o.local(o.x2, o.z2) : FP(f, 0, -B * 3);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([sa, sc]) => { const [x, z] = FP(f, sa * A, sc * B); return { sa, sc, x, z, d: Math.hypot(hx - x, hz - z) }; });
    const mainSide = sides.reduce((a, s) => (s.d < a.d ? s : a));
    for (const s of sides) {
      const isMain = s === mainSide, PH = isMain ? 37.7 : 34, PW = isMain ? 33.7 : 30;
      const nx = s.sa ? f.ux * s.sa : f.vx * s.sc, nz = s.sa ? f.uz * s.sa : f.vz * s.sc, tx = -nz, tz = nx, ry = Math.atan2(-tz, tx);
      const P = (t, n) => [s.x + tx * t + nx * n, s.z + tz * t + nz * n];
      const [cx, cz] = P(0, 1); b.box(cx, 0, cz, PW, PH, 12, MAR, ry);                                   // массив портала
      const [fx, fz] = P(0, 7.1);
      b.box(fx, 0, fz, PW * 0.56, PH * 0.7, 0.4, NICHE, ry);                                             // глубокая ниша-айван
      for (let k = 0; k < 3; k++) b.box(fx, PH * 0.7 + k * 1.3, fz, PW * 0.56 * (0.75 - k * 0.22), 1.3, 0.4, NICHE, ry); // стрельчатая арка
      for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) { const [mx, mz] = P(c * PW * 0.07, 7.35); b.box(mx, PH * 0.42 + r * 1.6, mz, 1.1, 1.1, 0.2, (r + c) % 2 ? TQ : [0.85, 0.9, 0.95], ry); } // мукарнас
      const [gx, gz] = P(0, 7.4); b.box(gx, 1.2, gz, 3.4, 5.4, 0.3, [0.42, 0.3, 0.18], ry);                // резные двери
      for (const sg of [-1, 1]) { const [vx, vz] = P(sg * PW * 0.32, 7.2); b.box(vx, 0, vz, 2.2, PH * 0.86, 0.5, TILE, ry); }  // изразцовая рамка
      const [bx, bz] = P(0, 7.2); b.box(bx, PH * 0.86, bz, PW * 0.66, 2.2, 0.5, TILE, ry); b.box(bx, PH * 0.865, bz, PW * 0.6, 1.2, 0.6, [0.96, 0.96, 0.94], ry); // надпись
      b.box(bx, PH - 1.2, bz, PW + 0.6, 1.2, 0.4, MAR2, ry);
      // гульдасты по углам портала и малые купола рядом на крыше
      for (const sg of [-1, 1]) {
        const [qx, qz] = P(sg * (PW / 2 - 1.2), 6.8); b.cyl(qx, 0, qz, 1.3, PH + 3, MAR, 12); b.cyl(qx, PH + 3, qz, 1.5, 0.6, TILE, 12); b.dome(qx, PH + 3.6, qz, 1.4, TQ, { hk: 1.4, seg: 10, tip: false });
        const [kx, kz] = P(sg * (PW / 2 + 8), -6); b.cyl(kx, HW, kz, 3.4, 2, MAR, 14); b.cyl(kx, HW + 2, kz, 3.45, 0.4, TILE, 14); b.dome(kx, HW + 2.4, kz, 3.3, TQ, { hk: 1.1, seg: 14, ribs: TQ2, tip: false });
      }
      // широкая лестница перед главным входом
      if (isMain) for (let k = 0; k < 4; k++) { const [lx, lz] = P(0, 13 + (3 - k) * 2.2); b.box(lx, 0, lz, PW + 26 - k * 4, 0.45 * (k + 1), 2.4 + (3 - k) * 0.2, k % 2 ? PAVE : [0.76, 0.72, 0.66], ry); }
    }
  };
  // ---------------- IT Park Uzbekistan (ул. Муминова) ----------------
  // По фото: две пары башен ~94 м из тёмного сине-зелёного зеркального стекла со срезанными углами
  // и белыми вертикальными рёбрами, каждая пара стоит на плавном стеклянном подиуме с белыми лентами;
  // над входами — белые наклонные козырьки с надписями IT PARK и UZBEKISTAN и зелёным логотипом,
  // между парами — площадь с рядом белых флагов. Вторая очередь — башни ~72 м из светлого стекла,
  // корпуса по 28 м и круглый конгресс-холл. Ночью логотипы и рёбра башен светятся.
  M.it_park = (b, o) => {
    const Q = localParts(o), WH = [0.93, 0.94, 0.95], GL1 = [0.16, 0.26, 0.3], GL2 = [0.34, 0.46, 0.54], GRN = [0.36, 0.72, 0.24], INK = [0.16, 0.18, 0.2];
    const T1 = Q.filter((q) => q.h > 90), T2 = Q.filter((q) => q.h > 70 && q.h < 80), POD = Q.filter((q) => q.h < 14 && q.A > 2000), REST = Q.filter((q) => !T1.includes(q) && !T2.includes(q) && !POD.includes(q));
    const outward = (q, p0, p1) => { const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); let nx = (p1[1] - p0[1]) / L, nz = -(p1[0] - p0[0]) / L; if (((p0[0] + p1[0]) / 2 - q.cx) * nx + ((p0[1] + p1[1]) / 2 - q.cz) * nz < 0) { nx = -nx; nz = -nz; } return [nx, nz, L]; };
    // центр площади — середина между подиумами пар
    const pc = POD.length ? [POD.reduce((a, q) => a + q.cx, 0) / POD.length, POD.reduce((a, q) => a + q.cz, 0) / POD.length] : [0, 0];
    // башня: стекло с окнами, белые рёбра на углах, белая корона, техэтаж
    const tower = (q, y0, GL, id) => {
      b.winRing(q.p, y0, q.h - 2.5, GL, id);
      for (const [x, z] of q.p) b.box(x, y0, z, 0.9, q.h - y0, 0.9, WH);
      band(b, q.p, 0.25, q.h - 2.5, 2.5, WH); cap(b, q.p, q.h, [0.5, 0.54, 0.58]);
      const inner = offset(q.p, -4); b.loft(inner, q.h, inner, q.h + 3, [0.62, 0.64, 0.66]); cap(b, inner, q.h + 3, [0.55, 0.57, 0.6]);
      pilasters(b, q.p, q.h - 2.5, q.h, 1e9, 0.5, 0.6, [0.75, 0.95, 0.7], "led");                           // светящиеся рёбра короны
    };
    for (const q of T1) tower(q, POD.some((pd) => Math.hypot(pd.cx - q.cx, pd.cz - q.cz) < 45) ? 9.9 : 0, GL1, 71);
    for (const q of T2) tower(q, POD.some((pd) => Math.hypot(pd.cx - q.cx, pd.cz - q.cz) < 45) ? 13 : 0, GL2, 72);
    // логотип IT PARK на верхних этажах высоких башен — со стороны, обращённой от площади
    for (const q of T1) {
      let best = null;
      for (let i = 0; i < q.p.length; i++) { const p0 = q.p[i], p1 = q.p[(i + 1) % q.p.length], [nx, nz, L] = outward(q, p0, p1); if (L < 12) continue; const d = ((p0[0] + p1[0]) / 2 - pc[0]) * nx + ((p0[1] + p1[1]) / 2 - pc[1]) * nz; if (!best || d > best.d) best = { d, p0, p1, nx, nz, L }; }
      if (!best) continue;
      const mx = (best.p0[0] + best.p1[0]) / 2 + best.nx * 0.6, mz = (best.p0[1] + best.p1[1]) / 2 + best.nz * 0.6, px = Math.min(0.42, best.L * 0.62 / 41);
      sign(b, "IT PARK", mx + best.nz * px * 5, q.h - 9, mz - best.nx * px * 5, best.nx, best.nz, px, [0.95, 0.97, 0.95]);
      const lx = mx - best.nz * (px * 23), lz = mz + best.nx * (px * 23), ry = Math.atan2(best.nx, best.nz);
      b.box(lx, q.h - 9.6, lz, px * 9, px * 9, 0.4, GRN, ry, true); b.box(lx + best.nx * 0.25, q.h - 9.6 + px * 2.5, lz + best.nz * 0.25, px * 3.6, px * 4.4, 0.2, [0.97, 0.98, 0.97], ry, true);
    }
    // подиумы: стекло, белые ленты, белый наклонный козырёк над входом с надписью и логотипом
    POD.forEach((q, k) => {
      b.winRing(q.p, 0, q.h - 1.6, [0.3, 0.38, 0.44], 73); band(b, q.p, 0.35, 3.8, 0.7, WH); band(b, q.p, 0.4, q.h - 1.6, 1.6, WH); cap(b, q.p, q.h, [0.7, 0.72, 0.74]);
      if (q.h > 12) return; // подиум второй очереди — без козырька
      let best = null;
      for (let i = 0; i < q.p.length; i++) { const p0 = q.p[i], p1 = q.p[(i + 1) % q.p.length], [nx, nz, L] = outward(q, p0, p1); if (L < 10) continue; const d = Math.hypot((p0[0] + p1[0]) / 2 - pc[0], (p0[1] + p1[1]) / 2 - pc[1]) - L * 0.3; if (!best || d < best.d) best = { d, p0, p1, nx, nz, L }; }
      if (!best) return;
      const { p0, p1, nx, nz, L } = best, ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L, N = 10;
      // козырёк: белая лента, поднимающаяся к краю у площади (клин)
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, h0 = q.h + 1 + t0 * 6, h1 = q.h + 1 + t1 * 6;
        const a = [p0[0] + ux * L * t0 + nx * 3, p0[1] + uz * L * t0 + nz * 3], c = [p0[0] + ux * L * t1 + nx * 3, p0[1] + uz * L * t1 + nz * 3];
        b.raw([a[0], q.h - 2, a[1], c[0], q.h - 2, c[1], c[0], h1, c[1], a[0], q.h - 2, a[1], c[0], h1, c[1], a[0], h0, a[1]], WH);
        b.raw([c[0], q.h - 2, c[1], a[0], q.h - 2, a[1], a[0], h0, a[1], c[0], q.h - 2, c[1], a[0], h0, a[1], c[0], h1, c[1]], WH);
        const ia = [p0[0] + ux * L * t0, p0[1] + uz * L * t0], ic = [p0[0] + ux * L * t1, p0[1] + uz * L * t1];
        b.raw([ia[0], h0, ia[1], ic[0], h1, ic[1], c[0], h1, c[1], ia[0], h0, ia[1], c[0], h1, c[1], a[0], h0, a[1]], [0.86, 0.87, 0.88]);
      }
      const txt = k % 2 ? "UZBEKISTAN" : "IT PARK", px = Math.min(0.55, L * 0.7 / (txt.length * 6));
      const sx = p0[0] + ux * L * 0.55 + nx * 3.35, sz = p0[1] + uz * L * 0.55 + nz * 3.35;
      sign(b, txt, sx, q.h + 1.5, sz, nx, nz, px, INK, "parts", 0.2);
      if (!(k % 2)) { const gx = p0[0] + ux * L * 0.12 + nx * 3.4, gz = p0[1] + uz * L * 0.12 + nz * 3.4, ry = Math.atan2(nx, nz); b.box(gx, q.h + 0.8, gz, 3.6, 3.6, 0.4, GRN, ry, true); b.box(gx + nx * 0.25, q.h + 1.8, gz + nz * 0.25, 1.4, 1.8, 0.2, [0.97, 0.98, 0.97], ry, true); }
    });
    // площадь между парами: светлое мощение и ряд флагов
    if (POD.length >= 2) {
      const [a, c] = POD, dx = c.cx - a.cx, dz = c.cz - a.cz, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
      cap(b, se(16, 16, 2, 24).map(([x, z]) => [x + pc[0], z + pc[1]]), 0.12, [0.84, 0.82, 0.78]);
      for (let k = -5; k <= 5; k++) {
        const x = pc[0] + nx * k * 4.2, z = pc[1] + nz * k * 4.2;
        b.box(x, 0, z, 0.9, 0.9, 0.9, [0.92, 0.92, 0.9]); b.cyl(x, 0.9, z, 0.08, 11, [0.85, 0.86, 0.88], 6);
        b.box(x + dx / L * 1.1, 10, z + dz / L * 1.1, 2.2, 1.3, 0.05, [0.97, 0.97, 0.97], Math.atan2(-dz, dx));
      }
    }
    // корпуса второй очереди и круглый конгресс-холл
    for (const q of REST) {
      const round = q.p.length > 16;
      b.winRing(q.p, 0, q.h - 1.2, round ? [0.28, 0.4, 0.5] : [0.4, 0.46, 0.5], round ? 74 : 75);
      if (round) for (let y = 4; y < q.h - 2; y += 6) band(b, q.p, 0.2, y, 0.6, WH);
      band(b, q.p, 0.3, q.h - 1.2, 1.2, WH); cap(b, q.p, q.h, [0.66, 0.68, 0.7]);
    }
  };
  // ---------------- площадь Хамида Алимджана, восточная сторона ----------------
  // Четыре 18-этажки 1980-х (после реконструкции): светлые фасады с вертикальными полосами лоджий
  // между белыми пилонами, междуэтажные пояса и белая кружевная корона из стрельчатых зубцов;
  // перед ними — изогнутый трёхэтажный бизнес-комплекс с тёмным стеклянным медиафасадом, белой
  // аркадой и карнизом. Ночью (по фото): по каждому этажу башен — световые линии, цвет плавно бежит
  // по спектру; зубцы короны светятся тёплым; медиафасад подиума переливается синим, по кромке — неон.
  M.hamid_olimjon = (b, o) => {
    const Q = localParts(o), TW = Q.filter((q) => q.h > 40), pod = Q.find((q) => q.h < 20);
    const WHT = [0.92, 0.92, 0.9], PAN = [0.8, 0.81, 0.82], CROWN = [0.97, 0.97, 0.96];
    for (const q of TW) {
      const f = frame(q), A = f.L / 2, B = f.W / 2, H = q.h, rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)], r = rect(A, B);
      b.loft(rect(A + 0.3, B + 0.3), 0, rect(A + 0.3, B + 0.3), 4.2, [0.24, 0.3, 0.36], "glow");                       // витрины первого этажа
      b.winRing(r, 4.2, H, PAN, 58);
      pilasters(b, r, 4.2, H, 4.2, 0.9, 0.7, WHT);                                                                     // пилоны между лоджиями
      for (let y = 4.2; y < H - 1; y += 3.1) band(b, r, 0.42, y, 0.45, [0.9, 0.92, 0.94], "hue"); // междуэтажный пояс — ночью световая линия
      // корона: белый пояс и стрельчатые зубцы по периметру (ночью светятся тёплым)
      band(b, r, 0.3, H, 1.3, CROWN); cap(b, rect(A - 0.2, B - 0.2), H + 0.6, [0.6, 0.6, 0.62]);
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % 4], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(3, Math.round(L / 2.4));
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; b.cone(x0 + (x1 - x0) * t, H + 1.3, z0 + (z1 - z0) * t, 0.95, 2.6, CROWN, 4); to(b, "glow"); }
      }
      const inner = rect(A * 0.4, B * 0.4); b.loft(inner, H + 0.6, inner, H + 3.4, [0.7, 0.7, 0.7]); cap(b, inner, H + 3.4, [0.55, 0.55, 0.57]); // машинное отделение
    }
    if (pod) {
      b.winRing(pod.p, 0, 8.2, [0.16, 0.22, 0.32], 59);
      band(b, pod.p, 0.28, 2.6, 4.6, [0.16, 0.26, 0.5], "led");                                                         // медиафасад
      pilasters(b, pod.p, 0, 8.2, 4, 0.7, 0.6, WHT);                                                                   // белая аркада
      band(b, pod.p, 0.5, 8.2, 1.7, WHT); band(b, pod.p, 0.56, 9.7, 0.22, [0.95, 0.35, 0.35], "hue");                // карниз и неоновая кромка
      cap(b, pod.p, 9.9, [0.62, 0.64, 0.68]);
    }
  };
  M.hamid_olimjon_w = M.hamid_olimjon; // западная сторона площади — тот же проект-близнец

  // ---------------- пешеходный мост через Анхор у парка «Навруз» ----------------
  // Первый вантовый пешеходный мост Узбекистана (Гипростроймост, 2019), «знак бесконечности»:
  // прямой верхний настил над каналом и две петли-пандуса, спускающиеся к набережным и проходящие
  // низко над водой под верхним настилом. Белый А-образный пилон стоит в канале между пандусами,
  // от его головы веером расходятся ванты. Настилы — белые, с «килем» снизу, перила из нержавейки
  // с горизонтальными прутьями. Ночью (по фото): по кромкам настилов — холодно-белые светодиодные
  // ленты, ванты — в сине-фиолетовых бусинах огней, голова пилона подсвечена прожектором.
  // parts: [0] — верхний настил (запад → восток), [1], [2] — пандусы (от земли к настилу).
  M.navruz_bridge = (b, o) => {
    const c0 = Math.cos(o.ang), s0 = Math.sin(o.ang), h0 = TPM.terrain.hAt(o.x, o.z);
    const W2L = ([x, z]) => o.local(x, z), L2W = (x, z) => [x * c0 - z * s0 + o.x, x * s0 + z * c0 + o.z];
    const gH = (x, z) => { const [wx, wz] = L2W(x, z); return TPM.terrain.hAt(wx, wz) - h0; };
    // берега Анхора у моста (контур воды OSM): над водой опоры уходят к зеркалу, на 2,6 м ниже берега
    const WATER = [[-837, -1528], [-829, -1551], [-820, -1566], [-811, -1578], [-798, -1569], [-813, -1548], [-809, -1544], [-821, -1506], [-826, -1502]];
    const wet = (x, z) => { const [px, pz] = L2W(x, z); let c = false; for (let i = 0, j = WATER.length - 1; i < WATER.length; j = i++) { const [xi, zi] = WATER[i], [xj, zj] = WATER[j]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c; } return c; };
    const base = (x, z) => gH(x, z) - (wet(x, z) ? 2.6 : 0);
    const WHT = [0.94, 0.94, 0.93], SOFF = [0.84, 0.85, 0.85], WALK = [0.7, 0.68, 0.64], STEEL = [0.66, 0.68, 0.72], CAB = [0.86, 0.87, 0.9];
    const TOPY = 6.0;
    // сглаживание петель (Чайкин) и шаг ~1,5 м
    const chaikin = (p, n) => { for (let k = 0; k < n; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1]; q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); } q.push(p[p.length - 1]); p = q; } return p; };
    const resample = (p, step) => {
      const out = [[p[0][0], p[0][1], 0]]; let acc = 0;
      for (let i = 1; i < p.length; i++) {
        const [ax, az] = p[i - 1], [bx, bz] = p[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
        for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, acc + L * k / n]);
        acc += L;
      }
      return out;
    };
    const Pt = o.parts.map((q) => q.p.map(W2L));
    const U = resample([Pt[0][0], Pt[0][1]], 1.5), UL = U[U.length - 1][2];
    U.forEach((q) => { q[3] = TOPY + 0.55 * Math.sin(Math.PI * q[2] / UL); });     // лёгкий выгиб верхнего настила
    const ramps = [Pt[1], Pt[2]].map((p) => {
      const r = resample(chaikin(p, 3), 1.5), S = r[r.length - 1][2], g0 = gH(r[0][0], r[0][1]) + 0.12;
      r.forEach((q) => { const t = q[2] / S; q[3] = g0 + (TOPY - g0) * (t < 0.92 ? t / 0.92 : 1); });  // у стыка — горизонтальная площадка
      return r;
    });
    // ---- настил по оси с отметками: верх, торцы, низ с «килем», светодиодные ленты, перила
    const deck = (A, w, th, keel) => {
      const n = A.length, N = A.map((q, i) => {
        const a = A[Math.max(0, i - 1)], c = A[Math.min(n - 1, i + 1)], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1;
        return [-dz / L, dx / L];
      });
      const top = [], side = [], bot = [], led = [], rail = [], rod = [];
      const E = (i, s, d = 0) => [A[i][0] + N[i][0] * (w / 2 + d) * s, A[i][1] + N[i][1] * (w / 2 + d) * s];
      const quad = (arr, p0, y0, p1, y1, p2, y2, p3, y3) => arr.push(p0[0], y0, p0[1], p1[0], y1, p1[1], p2[0], y2, p2[1], p0[0], y0, p0[1], p2[0], y2, p2[1], p3[0], y3, p3[1]);
      for (let i = 0; i < n - 1; i++) {
        const y0 = A[i][3], y1 = A[i + 1][3], L0 = E(i, -1), R0 = E(i, 1), L1 = E(i + 1, -1), R1 = E(i + 1, 1);
        quad(top, L0, y0, R0, y0, R1, y1, L1, y1);
        for (const s of [-1, 1]) {
          const a = E(i, s), c = E(i + 1, s), ao = E(i, s, 0.03), co = E(i + 1, s, 0.03);
          quad(side, a, y0 - th, c, y1 - th, c, y1, a, y0);
          quad(led, ao, y0 - th * 0.75, co, y1 - th * 0.75, co, y1 - th * 0.12, ao, y0 - th * 0.12);
          const ai = E(i, s, -0.08), ci = E(i + 1, s, -0.08);
          quad(rail, ai, y0 + 1.04, ci, y1 + 1.04, ci, y1 + 1.14, ai, y0 + 1.14);                  // поручень
          for (const hh of [0.3, 0.55, 0.8]) quad(rod, ai, y0 + hh, ci, y1 + hh, ci, y1 + hh + 0.035, ai, y0 + hh + 0.035); // прутья
        }
        if (keel) { // низ треугольником: от кромок к «килю» по оси
          const C0 = [A[i][0], A[i][1]], C1 = [A[i + 1][0], A[i + 1][1]];
          quad(bot, L0, y0 - th, L1, y1 - th, C1, y1 - th - keel, C0, y0 - th - keel);
          quad(bot, C0, y0 - th - keel, C1, y1 - th - keel, R1, y1 - th, R0, y0 - th);
        } else quad(bot, L0, y0 - th, L1, y1 - th, R1, y1 - th, R0, y0 - th);
      }
      b.raw(top, WALK); b.raw(side, WHT); b.raw(bot, SOFF); b.raw(led, [0.9, 0.92, 0.94], "cool"); b.raw(rail, STEEL); b.raw(rod, STEEL);
      for (let i = 0; i < n; i += 2) for (const s of [-1, 1]) { const [px, pz] = E(i, s, -0.08); b.box(px, A[i][3], pz, 0.07, 1.12, 0.07, STEEL); } // стойки перил
    };
    deck(U, 4.6, 0.7, 0.75);
    ramps.forEach((r) => deck(r, 3.2, 0.5, 0.25));
    // ---- круглые белые опоры пандусов (каждые ~10 м, где настил заметно над землёй)
    ramps.forEach((r) => {
      for (let i = 4; i < r.length - 2; i += 7) {
        const [x, z, , y] = r[i], g = base(x, z); if (y - 0.5 - g < 1.0) continue;
        b.cyl(x, g, z, 0.38, y - 0.5 - g, WHT, 10);
        if (g < gH(x, z) - 1) b.cyl(x, g - 0.3, z, 0.8, 0.9, [0.72, 0.72, 0.7], 10);            // ростверк в воде
      }
    });
    for (const q of [U[0], U[U.length - 1]]) { const g = base(q[0], q[1]); b.cyl(q[0], g, q[1], 0.6, q[3] - 0.9 - g, WHT, 12); } // опоры стыков
    // ---- пилон: две белые ноги из воды сходятся над настилом в одну голову
    const ti = Math.round((U.length - 1) * 0.55), [px, pz, , py] = U[ti];
    const ux = U[ti + 1][0] - U[ti - 1][0], uz = U[ti + 1][1] - U[ti - 1][1], ul = Math.hypot(ux, uz), dX = ux / ul, dZ = uz / ul, vX = -dZ, vZ = dX;
    const ry = Math.atan2(-dZ, dX), gW = base(px, pz), HT = 27, HH = 34;
    const legAt = (s, y) => { const t = (y - gW) / (HT - gW), off = 4.0 + (0.55 - 4.0) * t; return [px + vX * off * s, pz + vZ * off * s]; };
    for (const s of [-1, 1]) {
      const [bx, bz] = legAt(s, gW), [tx, tz] = legAt(s, HT);
      b.box(bx, gW - 0.4, bz, 2.4, 1.0, 2.4, [0.74, 0.74, 0.72], ry);                                 // ростверк
      b.beam(bx, gW, bz, tx, HT, tz, 1.0, WHT, "lit", 1.4);
    }
    const bar = (y, w) => { const [ax, az] = legAt(-1, y), [cx, cz] = legAt(1, y); b.beam(ax, y, az, cx, y, cz, w, WHT, "lit", w); };
    bar(py - 1.6, 0.9); bar(19.5, 0.7);                                                           // ригель под настилом и верхняя распорка
    b.box(px, HT - 0.3, pz, 1.8, HH - HT + 0.3, 1.6, WHT, ry); to(b, "lit");                                  // голова пилона
    for (const s of [-1, 1]) b.box(px + dX * 0.92 * s, HT + 1.5, pz + dZ * 0.92 * s, 0.12, HH - HT - 3, 0.7, [0.42, 0.44, 0.48], ry); // пазы под ванты
    b.box(px, HH, pz, 1.4, 0.25, 1.2, [0.95, 0.9, 0.75], ry); to(b, "glow");                        // прожектор на голове
    for (const s of [-1, 1]) { b.box(px + vX * 1.2 * s, py + 0.2, pz + vZ * 1.2 * s, 0.5, 0.5, 0.5, [0.95, 0.9, 0.75], ry); to(b, "glow"); } // светильники у ног
    // ---- ванты: по 6 в каждую сторону с каждой кромки (24), дальние крепятся выше
    const atS = (d) => { // точка оси верхнего настила на расстоянии d от пилона
      const S = U[ti][2] + d; let k = 1; while (k < U.length - 1 && U[k][2] < S) k++;
      const a = U[k - 1], c = U[k], t = Math.max(0, Math.min(1, (S - a[2]) / (c[2] - a[2] || 1)));
      return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[3] + (c[3] - a[3]) * t];
    };
    for (const dir of [-1, 1]) for (let k = 0; k < 6; k++) {
      const d = 4.5 + k * (dir > 0 ? 4.1 : 4.6), [qx, qz, qy] = atS(d * dir), ay = HT + 0.8 + k * 1.05;
      for (const s of [-1, 1]) b.beam(px + vX * 0.5 * s + dX * 0.5 * dir, ay, pz + vZ * 0.5 * s + dZ * 0.5 * dir, qx + vX * 2.2 * s, qy + 0.05, qz + vZ * 2.2 * s, 0.2, CAB, "stay");
    }
  };
  // ---------------- бизнес-парк Trilliant (ул. Шахрисабз, 2) ----------------
  // DP Architects (Сингапур), 2022: три башни на общем подиуме у сквера Амира Темура. Каждая башня —
  // два сдвинутых объёма разной высоты (ступень на крыше). Запад — офисная башня в голубовато-серой
  // стеклянной «шкуре» со скруглёнными углами и тонкими шампань-импостами, стеклянный парапет-корона;
  // восток — офисная башня с частыми шампань-ламелями, поднятыми над крышей; север — отель
  // InterContinental (17 этажей): сетка золотистых ламелей и поясов, вывеска к площади. Подиум —
  // витрины, бронзовые ламели, вывеска TRILLIANT. Ночью (по описанию светодизайна): в ламелях отеля —
  // скрытые тёплые линии 3000K, у офисов — холодные кромки короны и углов, подиум светится витринами.
  M.trilliant = (b, o) => {
    const Q = localParts(o), sq = o.local(4, -8);
    const wc = (i) => { const p = o.parts[i].p; return [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length]; };
    Q.forEach((q, i) => { const [x, z] = wc(i); q.tw = q.h < 20 ? "pod" : x < 200 ? "W" : z > -485 ? "N" : "E"; });
    const CH = [0.86, 0.79, 0.64], GOLD = [0.84, 0.72, 0.5], BRZ = [0.5, 0.39, 0.28], LOBBY = [0.22, 0.26, 0.3];
    // ребро контура, лучше всего смотрящее на точку (для вывесок): середина и внешняя нормаль
    const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const faceTo = (p, tx, tz, minL = 12) => {
      let best = null;
      for (let i = 0; i < p.length; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < minL) continue;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, dl = Math.hypot(tx - mx, tz - mz);
        if (Q.some((o2) => o2.p !== p && o2.h > 20 && inPoly(o2.p, mx + nx * 1.5, mz + nz * 1.5))) continue; // общая стена с соседним объёмом
        const k = (nx * (tx - mx) + nz * (tz - mz)) / dl;
        if (!best || k > best.k) best = { k, mx, mz, nx, nz, L };
      }
      return best;
    };
    for (const q of Q) {
      const p = q.p, H = q.h;
      if (q.tw === "pod") {
        b.loft(offset(p, 0.15), 0, offset(p, 0.15), 5.5, [0.3, 0.33, 0.34], "glow");                       // витрины и лобби
        band(b, p, 0.35, 5.5, 0.6, CH);
        b.winRing(p, 6.1, H - 1, [0.24, 0.26, 0.28], 104);
        pilasters(b, p, 6.1, H - 1, 0.9, 0.16, 0.45, BRZ);                                                    // бронзовые ламели
        band(b, p, 0.4, H - 1, 1.2, CH); cap(b, p, H + 0.2, [0.5, 0.56, 0.46]);                              // карниз и зелёная кровля-терраса
        const e = faceTo(p, sq[0], sq[1], 14);
        if (e) sign(b, "TRILLIANT", e.mx + e.nx * 0.5, H - 0.95, e.mz + e.nz * 0.5, e.nx, e.nz, 0.17, [0.95, 0.85, 0.55], "glow", 0.12);
        continue;
      }
      b.loft(offset(p, 0.2), 0, offset(p, 0.2), 6, LOBBY, "glow");                                           // остеклённый вестибюль в два света
      if (q.tw === "W") { // голубое стекло, тонкие импосты, пояс на каждом этаже, стеклянная корона
        b.winRing(p, 6, H - 3, [0.42, 0.52, 0.6], 101);
        pilasters(b, p, 6, H - 3, 1.6, 0.12, 0.22, [0.8, 0.78, 0.72]);
        for (let y = 6 + 4.4; y < H - 4; y += 4.4) band(b, p, 0.12, y, 0.32, [0.58, 0.64, 0.7]);
        band(b, p, 0.05, H - 3, 5.2, [0.62, 0.72, 0.8]); cap(b, p, H - 0.4, [0.5, 0.52, 0.55]);             // парапет-корона
        band(b, p, 0.14, H + 1.8, 0.4, [0.92, 0.94, 0.96], "cool");                                          // ночью — светящаяся кромка
        band(b, p, 0.14, 5.7, 0.3, [0.92, 0.94, 0.96], "cool");
      } else if (q.tw === "E") { // частые шампань-ламели, выше крыши; пояса через этаж
        b.winRing(p, 6, H, [0.48, 0.55, 0.6], 102);
        pilasters(b, p, 6, H + 3, 1.35, 0.22, 0.6, CH);
        for (let y = 6 + 8.8; y < H - 2; y += 8.8) band(b, p, 0.3, y, 0.5, CH);
        cap(b, p, H, [0.55, 0.56, 0.57]); band(b, p, 0.35, H + 2.6, 0.4, CH);
        band(b, p, 0.62, H + 2.5, 0.18, [0.92, 0.94, 0.96], "cool");
        // угловые световые рёбра: ночью углы ярче
        for (let i = 0; i < p.length; i++) {
          const a = p[(i + p.length - 1) % p.length], c = p[i], e = p[(i + 1) % p.length];
          const t = Math.abs(Math.atan2(e[1] - c[1], e[0] - c[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]));
          if (Math.min(t, Math.PI * 2 - t) > 0.9) { b.box(c[0], 6, c[1], 0.35, H - 6 + 3, 0.35, [0.9, 0.9, 0.88]); to(b, "cool"); }
        }
      } else { // отель: золотистая сетка, ламели с тёплыми линиями внутри
        b.winRing(p, 6, H - 2, [0.44, 0.47, 0.48], 103);
        pilasters(b, p, 6, H - 2, 2.2, 0.3, 0.5, GOLD, "warm");
        for (let y = 6 + 3.9; y < H - 3; y += 3.9) band(b, p, 0.25, y, 0.28, CH);
        band(b, p, 0.3, H - 2, 2.6, CH); cap(b, p, H + 0.6, [0.58, 0.56, 0.52]);
        b.box(q.cx, H + 0.6, q.cz, Math.min(10, (q.x1 - q.x0) * 0.4), 3.2, Math.min(8, (q.z1 - q.z0) * 0.4), [0.7, 0.68, 0.64]); // машинное отделение
      }
    }
    // вывеска InterContinental — на верхней части отеля, со стороны площади
    const hotel = Q.filter((q) => q.tw === "N").sort((a, c) => c.h - a.h);
    for (const hq of hotel) for (let i = 0; i < hq.p.length; i++) { // на каждом длинном внешнем фасаде
      const [x0, z0] = hq.p[i], [x1, z1] = hq.p[(i + 1) % hq.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 12) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Q.some((o2) => o2.p !== hq.p && o2.h >= hq.h - 0.5 && inPoly(o2.p, mx + nx * 1.5, mz + nz * 1.5))) continue;
      { const px = Math.min(0.42, L * 0.9 / 95); sign(b, "INTERCONTINENTAL", mx + nx * 0.45, hq.h + 0.5 - 7 * px, mz + nz * 0.45, nx, nz, px, [0.97, 0.97, 0.95], "glow", 0.15); }
    }
  };
  // ---------------- Вестминстерский университет в Ташкенте (ул. Истикбол, 12) ----------------
  // Исторический корпус из жёлто-розового жжёного кирпича в «кирпичном стиле» начала XX века:
  // цоколь из красного гранита, три высоких этажа, лопатки-пилястры с кирпичными «сухариками»,
  // межэтажные пояса с крестовым узором, арочные окна первого этажа, прямоугольные окна выше под
  // кирпичными перемычками, рамы коричневые. Ступенчатый карниз, над ним кирпичные столбики
  // с кованой оградой между ними. На углу двух уличных крыльев — башня с часами и ступенчатым
  // завершением, на длинном крыле — выступающий входной портал с большой аркой (по фото).
  // Ночью фасады залиты тёплым светом прожекторов, часть окон светится.
  M.wiut = (b, o) => {
    const q = localParts(o)[0], p = q.p, n = p.length;
    const BR = [0.78, 0.64, 0.51], BR2 = [0.7, 0.57, 0.45], BRL = [0.84, 0.72, 0.59], GRAN = [0.5, 0.31, 0.28];
    const FR = [0.42, 0.26, 0.19], GL = [0.2, 0.22, 0.25], ROOF = [0.44, 0.46, 0.49], RAIL = [0.24, 0.24, 0.26];
    const F1 = 6.2, F2 = 11.0, F3 = 15.6, H = 16.6;
    const hash = (a, c) => { const s = Math.sin(a * 12.9898 + c * 78.233) * 43758.5453; return s - Math.floor(s); };
    // стены, цоколь, пояса и карниз (стены — в «show»: ночью их заливает тёплый свет прожекторов)
    b.loft(offset(p, 0.25), 0, offset(p, 0.25), 1.3, GRAN);
    b.loft(p, 1.3, p, H, BR, "show");
    for (const y of [F1, F2]) { band(b, p, 0.2, y - 0.45, 0.8, BRL, "show"); band(b, p, 0.3, y - 0.55, 0.12, BR2); band(b, p, 0.3, y + 0.35, 0.12, BR2); }
    band(b, p, 0.3, F3 - 0.2, 0.45, BR2, "show"); band(b, p, 0.5, F3 + 0.25, 0.4, BRL, "show"); band(b, p, 0.65, F3 + 0.65, 0.35, BR2, "show"); // ступенчатый карниз
    cap(b, p, H + 0.02, ROOF);
    band(b, p, 0.05, H + 1.15, 0.08, RAIL); band(b, p, 0.05, H + 0.35, 0.06, RAIL);                       // кованая ограда по крыше
    const win = (x, z, nx, nz, ry, y0, h, w, arch, k) => {
      const lit = hash(x + y0, z) < 0.42;
      b.box(x + nx * 0.06, y0 - 0.08, z + nz * 0.06, w + 0.24, h + 0.16, 0.12, FR, ry);                  // рама
      b.box(x + nx * 0.1, y0, z + nz * 0.1, w, h, 0.12, GL, ry); if (lit) to(b, "glow");                  // стекло
      if (arch) { // полуциркульное завершение лесенкой
        b.box(x + nx * 0.06, y0 + h, z + nz * 0.06, w * 0.8 + 0.2, 0.4, 0.12, FR, ry);
        b.box(x + nx * 0.1, y0 + h, z + nz * 0.1, w * 0.8, 0.32, 0.12, GL, ry); if (lit) to(b, "glow");
        b.box(x + nx * 0.1, y0 + h + 0.32, z + nz * 0.1, w * 0.45, 0.28, 0.12, GL, ry); if (lit) to(b, "glow");
        b.box(x + nx * 0.18, y0 + h + 0.55, z + nz * 0.18, w + 0.9, 0.35, 0.3, BRL, ry); to(b, "show");     // кирпичная архивольта
      } else {
        b.box(x + nx * 0.16, y0 + h + 0.12, z + nz * 0.16, w + 0.8, 0.4, 0.26, BRL, ry); to(b, "show");     // перемычка
        b.box(x + nx * 0.18, y0 + h + 0.52, z + nz * 0.18, w * 0.5, 0.28, 0.3, BRL, ry); to(b, "show");     // замок-«сухарик»
      }
      b.box(x + nx * 0.2, y0 - 0.25, z + nz * 0.2, w + 0.6, 0.16, 0.36, BR2, ry);                          // подоконник
    };
    let bay = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0); if (L < 2.4) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), nb = Math.max(1, Math.floor(L / 3.9));
      for (let k = 0; k <= nb; k++) { // лопатки с кирпичными «сухариками» и столбики парапета
        const t = k / nb, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        b.box(x + nx * 0.18, 1.3, z + nz * 0.18, 0.75, F3 - 1.3, 0.36, BR2, ry); to(b, "show");
        for (const y of [F1 - 1.3, F2 - 1.3, F3 - 1.1]) { b.box(x + nx * 0.3, y, z + nz * 0.3, 0.95, 0.35, 0.3, BRL, ry); to(b, "show"); }
        if (k % 2 === 0 || k === nb) { b.box(x + nx * 0.2, H, z + nz * 0.2, 0.85, 1.55, 0.85, BR2, ry); b.box(x + nx * 0.2, H + 1.55, z + nz * 0.2, 1.05, 0.25, 1.05, BRL, ry); }
      }
      for (let k = 0; k < nb; k++, bay++) {
        const t = (k + 0.5) / nb, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        win(x, z, nx, nz, ry, 2.0, 2.9, 1.5, true, bay);
        win(x, z, nx, nz, ry, F1 + 0.9, 3.0, 1.45, false, bay);
        win(x, z, nx, nz, ry, F2 + 0.9, 2.7, 1.35, false, bay);
        // крестовый узор в поясе под окнами 2-го этажа
        for (const s of [-0.45, 0, 0.45]) { b.box(x + nz * 0 + (x1 - x0) / L * s + nx * 0.32, F1 - 0.3, z + (z1 - z0) / L * s + nz * 0.32, 0.18, 0.5, 0.1, BR2, ry); }
      }
    }
    // угловая башня с часами
    const near = (wx, wz) => { const [lx, lz] = o.local(wx, wz); let bi = 0, bd = 1e9; p.forEach(([x, z], i) => { const d = Math.hypot(x - lx, z - lz); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const ci = near(283.1, 401.8), [cx, cz] = p[ci], pa = p[(ci + n - 1) % n], pb = p[(ci + 1) % n];
    const e1 = [cx - pa[0], cz - pa[1]], e2 = [pb[0] - cx, pb[1] - cz], l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2], tr = Math.atan2(-e1[1], e1[0]);
    const tx = cx - e1[0] / l1 * 2.4 + e2[0] / l2 * 2.4, tz = cz - e1[1] / l1 * 2.4 + e2[1] / l2 * 2.4;   // центр башни — внутри угла
    const TW = 6.2, TH = 21.5;
    b.box(tx + (n1[0] + n2[0]) * 0.5, 0, tz + (n1[1] + n2[1]) * 0.5, TW, 1.3, TW, GRAN, tr);
    b.box(tx + (n1[0] + n2[0]) * 0.5, 1.3, tz + (n1[1] + n2[1]) * 0.5, TW - 0.3, TH - 1.3, TW - 0.3, BR, tr); to(b, "show");
    const T0 = [tx + (n1[0] + n2[0]) * 0.5, tz + (n1[1] + n2[1]) * 0.5];
    b.box(T0[0], TH, T0[1], TW + 0.4, 0.5, TW + 0.4, BRL, tr); to(b, "show");
    b.box(T0[0], TH + 0.5, T0[1], TW - 1.6, 1.4, TW - 1.6, BR, tr); to(b, "show");                       // ступенчатое завершение
    b.box(T0[0], TH + 1.9, T0[1], TW - 3.2, 1.2, TW - 3.2, BR2, tr); to(b, "show");
    b.box(T0[0], TH + 3.1, T0[1], 0.9, 0.9, 0.9, BRL, tr);
    for (const [sa, sb] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { // угловые столбики-пинакли
      const u = [Math.cos(tr), -Math.sin(tr)], v = [Math.sin(tr), Math.cos(tr)];
      const px = T0[0] + (u[0] * sa + v[0] * sb) * (TW / 2), pz = T0[1] + (u[1] * sa + v[1] * sb) * (TW / 2);
      b.box(px, TH, pz, 0.8, 2.2, 0.8, BR2, tr); b.box(px, TH + 2.2, pz, 1.0, 0.25, 1.0, BRL, tr);
    }
    for (const nn of [n1, n2]) { // циферблаты и узкие окна башни на уличных гранях
      const fx = T0[0] + nn[0] * (TW / 2 - 0.1), fz = T0[1] + nn[1] * (TW / 2 - 0.1), fr = Math.atan2(nn[0], nn[1]);
      const disc = new THREE.CylinderGeometry(1.15, 1.15, 0.2, 18); disc.rotateX(Math.PI / 2); disc.rotateY(fr);
      b.add(disc.clone(), [0.95, 0.93, 0.86], fx + nn[0] * 0.15, TH - 3.2, fz + nn[1] * 0.15, 0, true);
      const ring = new THREE.CylinderGeometry(1.4, 1.4, 0.16, 18); ring.rotateX(Math.PI / 2); ring.rotateY(fr);
      b.add(ring, BRL, fx + nn[0] * 0.05, TH - 3.2, fz + nn[1] * 0.05);
      b.beam(fx + nn[0] * 0.3, TH - 3.2, fz + nn[1] * 0.3, fx + nn[0] * 0.3, TH - 2.45, fz + nn[1] * 0.3, 0.1, [0.15, 0.15, 0.15]);
      b.beam(fx + nn[0] * 0.3, TH - 3.2, fz + nn[1] * 0.3, fx + nn[0] * 0.3 + nn[1] * 0.55, TH - 3.2, fz + nn[1] * 0.3 - nn[0] * 0.55, 0.1, [0.15, 0.15, 0.15]);
      for (const y of [3.0, 8.0, 12.6]) { b.box(fx + nn[0] * 0.08, y, fz + nn[1] * 0.08, 0.9, 2.6, 0.12, GL, fr); if (hash(fx, y) < 0.5) to(b, "glow"); }
    }
    // входной портал на длинном крыле
    const [ax, az] = o.local(315.8, 444.0), [bx, bz] = o.local(327.4, 459.6), el = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / el, uz = (bz - az) / el, pnx = uz, pnz = -ux, mx = (ax + bx) / 2 + pnx * 1.7, mz = (az + bz) / 2 + pnz * 1.7, pr = Math.atan2(-uz, ux);
    b.box(mx, 0, mz, 7.6, 1.0, 3.6, GRAN, pr);
    b.box(mx, 1.0, mz, 7.2, 7.6, 3.2, BR, pr); to(b, "show");
    b.box(mx + pnx * 1.62, 1.0, mz + pnz * 1.62, 3.2, 4.4, 0.1, [0.16, 0.12, 0.1], pr);                    // проём арки
    b.box(mx + pnx * 1.62, 5.4, mz + pnz * 1.62, 2.4, 0.5, 0.1, [0.16, 0.12, 0.1], pr);
    b.box(mx + pnx * 1.7, 5.9, mz + pnz * 1.7, 4.4, 0.45, 0.2, BRL, pr); to(b, "show");                     // архивольта
    b.box(mx, 8.6, mz, 7.8, 0.5, 3.8, BRL, pr); to(b, "show");
    for (const s of [-1, 1]) { b.box(mx + ux * 3.3 * s, 8.6, mz + uz * 3.3 * s, 0.9, 1.8, 0.9, BR2, pr); b.box(mx + ux * 3.3 * s + pnx * 1.75, 5.2, mz + uz * 3.3 * s + pnz * 1.75, 0.35, 0.5, 0.35, [1, 0.85, 0.55], pr); to(b, "glow"); } // столбики и фонари
    for (const s of [-1.1, 0, 1.1]) b.box(mx + pnx * (1.6 + 0.35 * (s + 1.1)) , 0, mz + pnz * (1.6 + 0.35 * (s + 1.1)), 4.2, 0.18 * (2 - (s + 1.1) / 1.1), 0.4, GRAN, pr); // ступени
  };
  // ---------------- вокзал «Ташкент» (Северный) и скоростной поезд Afrosiyob ----------------
  // Фасад к привокзальной площади (локальная +z), по фото: в центре — портал-пештак с огромной
  // стрельчатой аркой в белой мраморной раме, тёмно-синие вертикальные вставки, резные панели с
  // гирихом над аркой и вывеска VOKZAL с флагом; по бокам — блоки со стрельчатыми окнами в синих
  // нишах; длинные крылья — колоннада из парных белых колонн, между ними высокие синие витражи,
  // аттик с квадратными окошками и вывески TOSHKENT на крыше; по торцам — павильоны со стрельчатыми
  // окнами. Сзади — перрон с навесом, у него стоит Talgo 250 «Afrosiyob»: два головных вагона
  // с длинным «клювом» и 11 низких вагонов (183 м), серебристо-белый, с голубой кабиной и бирюзовой
  // полосой. Ночью: фасад подсвечен белым, витражи светятся, вывески горят синим, у поезда — окна и фары.
  M.station = (b, o) => {
    const L = o.L || 300, Wd = o.W || 60, zf = Wd / 2, X = L / 2;
    const WH = [0.93, 0.92, 0.87], WH2 = [0.86, 0.85, 0.8], NAVY = [0.1, 0.14, 0.38], GLS = [0.2, 0.34, 0.62], ORN = [0.6, 0.63, 0.68];
    const BLUE = [0.14, 0.42, 0.9], ROOF = [0.62, 0.63, 0.64];
    const c0 = Math.cos(o.ang), s0 = Math.sin(o.ang), h0 = TPM.terrain.hAt(o.x, o.z);
    const gH = (x, z) => TPM.terrain.hAt(x * c0 - z * s0 + o.x, x * s0 + z * c0 + o.z) - h0;
    const sgn = (txt, x, y, z, px) => sign(b, txt, x, y, z, 0, 1, px, BLUE, "neon", 0.3);
    // объём: корпус, кровля, задний фасад
    b.box(0, 0, 0, L, 15.4, Wd, WH2);
    b.box(0, 15.4, 0, L - 1, 0.6, Wd - 1, ROOF);
    b.box(0, 3, -zf - 0.05, L - 10, 9, 0.3, GLS); to(b, "glow");
    for (let x = -X + 6; x < X - 4; x += 6) b.box(x, 3, -zf - 0.25, 0.9, 9.5, 0.5, WH);
    // стрельчатое окно/арка: рама, синяя ниша, стекло лесенкой к острию
    const arch = (x, z, w, h, y0, frame = WH, list = "glow") => {
      b.box(x, y0 - 0.6, z + 0.2, w + 2.2, h + w * 0.55 + 1.4, 0.4, frame); to(b, "lit");
      b.box(x, y0, z + 0.4, w, h, 0.3, GLS); to(b, list);
      for (let k = 1; k <= 4; k++) { b.box(x, y0 + h + (k - 1) * w * 0.14, z + 0.4, w * (1 - k * 0.2), w * 0.14, 0.3, GLS); to(b, list); }
      for (let k = 1; k < 4; k++) b.box(x - w / 2 + k * w / 4, y0, z + 0.58, 0.12, h, 0.08, NAVY);              // переплёт
    };
    // ---- центральный портал
    const PZ = zf + 2.2;
    b.box(0, 0, 1.1, 32, 26, Wd + 2.2, WH); to(b, "lit");
    b.box(0, 26, 1.1, 34, 0.9, Wd + 3.4, WH); b.box(0, 26.9, 1.1, 30, 0.9, Wd + 1.4, WH2);
    for (const s of [-1, 1]) { b.box(s * 13.6, 0, PZ + 0.1, 1.8, 25.6, 0.4, NAVY); b.box(s * 15.6, 0, PZ + 0.15, 0.9, 25.6, 0.4, WH); }
    b.box(0, 0, PZ + 0.15, 23, 18.5, 0.3, WH); to(b, "lit");                                             // мраморная рама
    b.box(0, 0, PZ + 0.35, 14, 12.5, 0.3, NAVY);                                                          // глубокая синяя арка
    for (let k = 1; k <= 5; k++) b.box(0, 12.5 + (k - 1) * 1.05, PZ + 0.35, 14 * (1 - k * 0.17), 1.05, 0.3, NAVY);
    b.box(0, 0.2, PZ + 0.5, 10, 9.5, 0.2, GLS); to(b, "glow");                                            // витраж входа
    const disc = new THREE.CylinderGeometry(1.3, 1.3, 0.2, 18); disc.rotateX(Math.PI / 2);
    b.add(disc, [0.85, 0.72, 0.4], 0, 11.2, PZ + 0.62, 0, true);                                          // часы над входом
    b.box(-5.2, 2, PZ + 0.62, 3.2, 1.8, 0.1, [0.15, 0.55, 0.3], 0, true);                                // табло-экран
    for (const [y, h] of [[18.9, 3.4], [22.6, 2.8]]) {                                                    // резные панели с гирихом
      b.box(0, y, PZ + 0.35, 21, h, 0.3, ORN);
      for (let x = -9.5; x <= 9.6; x += 1.9) for (let yy = y + 0.5; yy < y + h - 0.4; yy += 1.1) b.box(x + ((yy * 10) % 2 ? 0.95 : 0), yy, PZ + 0.52, 0.55, 0.55, 0.08, NAVY);
    }
    sgn("VOKZAL", 0, 28.0, PZ - 0.6, 0.62);
    b.cyl(0, 27.8, 0, 0.12, 8, [0.8, 0.8, 0.82], 6); b.box(0.9 + 0.05, 33.6, 0, 1.8, 1.2, 0.05, [0.12, 0.55, 0.85]); b.box(0.95, 33.2, 0, 1.8, 0.4, 0.05, WH); b.box(0.95, 32.6, 0, 1.8, 0.6, 0.05, [0.1, 0.6, 0.3]); // флаг
    // ---- боковые блоки у портала
    for (const s of [-1, 1]) {
      const cx = s * 23, z1 = zf + 1;
      b.box(cx, 0, 0.5, 14, 20, Wd + 1, WH); to(b, "lit");
      b.box(cx, 20, 0.5, 15, 0.8, Wd + 2, WH2); b.box(cx, 20.8, 0.5, 13, 0.7, Wd + 0.6, WH);
      b.box(cx, 0.5, z1 + 0.1, 10.5, 18.5, 0.3, NAVY);                                                    // синяя ниша
      arch(cx, z1 + 0.1, 5.4, 10.5, 1.5, WH);
      for (let k = -2; k <= 2; k++) b.box(cx + k * 2, 17.7, z1 + 0.5, 1.1, 1.1, 0.1, WH);                   // «зубцы» над нишей
    }
    // ---- крылья с колоннадой
    const wingEnd = X - 22;
    for (const s of [-1, 1]) {
      const x0 = 30, x1 = wingEnd, n = Math.max(3, Math.round((x1 - x0) / 11)), bw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const cx = s * (x0 + bw * (k + 0.5));
        b.box(cx, 1.0, zf + 0.15, bw - 3.2, 11.6, 0.3, GLS); to(b, "glow");                              // синий витраж
        for (let m = 1; m < 4; m++) b.box(cx - (bw - 3.2) / 2 + m * (bw - 3.2) / 4, 1.0, zf + 0.33, 0.12, 11.6, 0.08, NAVY);
        b.box(cx, 5.2, zf + 0.33, bw - 3.2, 0.12, 0.08, NAVY); b.box(cx, 9.4, zf + 0.33, bw - 3.2, 0.12, 0.08, NAVY);
        for (let m = 0; m < 4; m++) b.box(cx - bw * 0.3 + m * bw * 0.2, 13.6, zf + 0.12, 1.0, 1.0, 0.1, GLS); // окошки аттика
      }
      for (let k = 0; k <= n; k++) { // парные колонны с капителью-кронштейном
        const cx = s * (x0 + bw * k);
        for (const d of [-0.75, 0.75]) b.cyl(cx + d, 0.6, zf + 1.4, 0.42, 11.6, WH, 10);
        b.box(cx, 12.2, zf + 1.2, 3.4, 0.8, 2.6, WH); b.box(cx, 0, zf + 1.3, 3.4, 0.6, 2.8, WH2);
        b.box(cx, 13.0, zf + 0.6, 2.2, 1.2, 1.4, WH);
      }
      b.box(s * (x0 + x1) / 2, 12.6, zf + 0.2, x1 - x0, 0.5, 0.6, WH); to(b, "lit");
      b.box(s * (x0 + x1) / 2, 15.2, zf + 0.6, x1 - x0, 0.8, 1.6, WH);                                       // карниз
      sgn("TOSHKENT", s * (x0 + x1) / 2, 16.2, zf - 1.2, 0.5);
      // торцевой павильон
      const ex = s * (X - 11);
      b.box(ex, 0, 0.5, 22, 17.6, Wd + 1, WH); to(b, "lit");
      b.box(ex, 17.6, 0.5, 23, 0.8, Wd + 2, WH2);
      for (const d of [-5.5, 5.5]) arch(ex + d, zf + 1, 3.6, 9, 1.4, WH);
      for (const d of [-10.6, 10.6]) b.box(ex + d, 0, zf + 1.2, 1.2, 17.2, 0.8, WH);
    }
    // ---- перрон с навесом и поезд
    const RZ = -43.4, PL = Math.min(L * 0.92, 240);
    b.box(0, 0, (-zf + RZ + 1.8) / 2 - 0.4, PL, 1.0, Math.abs(RZ + 1.8 + zf) + 0.8, [0.5, 0.48, 0.46]);   // высокая платформа
    b.box(0, 1.0, RZ + 2.4, PL, 0.06, 0.35, [0.95, 0.85, 0.2]);                                             // жёлтая линия
    for (let x = -PL / 2 + 6; x <= PL / 2 - 6; x += 12) b.cyl(x, 1.0, (-zf + RZ + 2.6) / 2, 0.25, 4.6, [0.85, 0.86, 0.88], 8);
    b.box(0, 5.6, (-zf + RZ + 2.6) / 2, PL, 0.35, Math.abs(RZ + 2.6 + zf) + 0.4, [0.8, 0.82, 0.85]);              // навес
    b.box(0, 5.25, (-zf + RZ + 2.6) / 2, PL, 0.12, 0.6, [0.95, 0.95, 0.9]); to(b, "cool");                    // светильники под навесом
    // Talgo 250 «Afrosiyob»
    const SIL = [0.88, 0.9, 0.92], TEAL = [0.08, 0.45, 0.55], SKY = [0.45, 0.72, 0.92], WIN = [0.14, 0.18, 0.24], DARK = [0.2, 0.2, 0.22];
    const TX0 = -6, Y0 = 0.42;                                                                             // начало состава и верх балласта
    let x = TX0;
    const car = (len, power, dir) => {
      const cx = x + len / 2, y = Y0 + gH(cx, RZ) + 0.62, Hc = power ? 3.85 : 3.3, w = 2.94;
      b.box(cx, Y0 + gH(cx, RZ), RZ, len - 1.2, 0.62, 2.2, DARK);                                         // тележки
      if (!power) {
        b.box(cx, y, RZ, len - 0.5, Hc - 0.5, w, SIL);
        b.box(cx, y + Hc - 0.5, RZ, len - 0.5, 0.5, w - 0.6, [0.82, 0.84, 0.86]);                          // скруглённая крыша
        for (const s of [-1, 1]) {
          b.box(cx, y + 0.95, RZ + s * (w / 2 + 0.01), len - 1.4, 0.22, 0.04, TEAL);
          b.box(cx, y + 1.35, RZ + s * (w / 2 + 0.02), len - 2.2, 0.75, 0.04, WIN); to(b, "glow");
        }
        b.box(x + len - 0.15, y + 0.2, RZ, 0.4, Hc - 1.0, w - 0.5, DARK);                                  // переход
      } else { // головной: кузов + длинный «клюв»
        const body = len - 6.5, bx = dir > 0 ? x + body / 2 : x + 6.5 + body / 2, nx0 = dir > 0 ? x + body : x + 6.5;
        b.box(bx, y, RZ, body, Hc - 0.7, w, SIL);
        b.box(bx, y + Hc - 0.7, RZ, body, 0.7, w - 0.4, SKY);                                              // голубой верх
        for (const s of [-1, 1]) b.box(bx, y + 0.95, RZ + s * (w / 2 + 0.01), body - 0.6, 0.22, 0.04, TEAL);
        b.box(bx, y + Hc, RZ, 4, 0.25, 1.2, DARK); b.beam(bx - 1, y + Hc + 0.25, RZ, bx + 1, y + Hc + 1.4, RZ, 0.08, DARK); // пантограф
        for (let k = 0; k < 6; k++) { // нос: ступенями к острию
          const t0 = k / 6, sl = 6.5 / 6, sx = dir > 0 ? nx0 + sl * (k + 0.5) : nx0 - sl * (k + 0.5);
          const hh = (Hc - 0.7) * (1 - t0 * 0.72), ww = w * (1 - t0 * 0.35);
          b.box(sx, y, RZ, sl + 0.02, hh, ww, k < 3 ? SIL : [0.92, 0.92, 0.88]);
          if (k < 4) b.box(sx, y + hh, RZ, sl + 0.02, Math.max(0.25, 0.7 - k * 0.12), ww - 0.3, k < 2 ? SKY : WIN);  // кабина: голубой верх → лобовое стекло
        }
        const tip = dir > 0 ? x + len : x;
        for (const s of [-1, 1]) { b.box(tip - dir * 0.9, y + 0.55, RZ + s * 0.7, 0.4, 0.22, 0.35, [1, 0.97, 0.85]); to(b, "glow"); } // фары
      }
      x += len;
    };
    car(20, true, -1); for (let i = 0; i < 11; i++) car(13.14, false, 0); car(20, true, 1);
  };
  // ---------------- здание «Узбекэнерго» (Минэнерго, ул. Истиклол, 6) ----------------
  // Советский модернизм 1970-х рядом с музеем Темуридов: светлый «гребень» с внутренними дворами,
  // пять этажей за солнцезащитной решёткой — глубокие горизонтальные полки на каждом этаже и частые
  // тонкие вертикальные рёбра, крупные лопатки через 6 м; глухой парапет с синей вывеской
  // «O'ZBEKENERGO» AJ, утопленный остеклённый первый этаж, синий портал входа с козырьком,
  // перед ним — круглый фонтан. Ночью светятся окна, вестибюль, вывеска и струи фонтана.
  M.uzbekenergo = (b, o) => {
    const q = localParts(o)[0], p = q.p, n = p.length;
    const WH = [0.9, 0.9, 0.88], WH2 = [0.82, 0.83, 0.82], BLUE = [0.12, 0.35, 0.78], ROOF = [0.5, 0.5, 0.5];
    const G0 = 4.2, FL = 3.3, TOP = 17.4, H = 19.5;
    b.loft(offset(p, -0.8), 0, offset(p, -0.8), G0, [0.24, 0.28, 0.32], "glow");                         // утопленный стеклянный первый этаж
    b.loft(p, G0, p, G0 + 0.5, WH);
    b.winRing(offset(p, -0.3), G0 + 0.5, TOP, [0.78, 0.8, 0.8], 105);
    b.loft(p, TOP, p, H, WH); cap(b, p, H, ROOF); band(b, p, 0.15, H, 0.3, WH2);                           // глухой парапет
    for (let y = G0 + FL; y < TOP - 0.2; y += FL) band(b, p, 0.7, y - 0.12, 0.24, WH);                     // солнцезащитные полки
    band(b, p, 0.75, G0 + 0.3, 0.3, WH);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0); if (L < 3) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), nf = Math.round(L / 1.5);
      for (let k = 1; k < nf; k++) {
        const t = k / nf, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, big = k % 4 === 0;
        b.box(x + nx * (big ? 0.45 : 0.35), G0 + 0.5, z + nz * (big ? 0.45 : 0.35), big ? 0.5 : 0.14, TOP - G0 - 0.5, big ? 0.9 : 0.7, big ? WH : WH2, ry);
      }
      for (const t of [0, 1]) { const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; b.box(x, 0, z, 0.8, TOP, 0.8, WH, ry); } // угловые столбы до земли
    }
    // главный фасад — к фонтану
    const [fx, fz] = o.local(95, -190);
    let best = null;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0); if (L < 40) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L, t = Math.max(0, Math.min(L, (fx - x0) * ux + (fz - z0) * uz));
      const d = Math.hypot(fx - x0 - ux * t, fz - z0 - uz * t);                                      // расстояние от фонтана до стены
      let nx = uz, nz = -ux; if (nx * (fx - x0) + nz * (fz - z0) < 0) { nx = -nx; nz = -nz; }        // нормаль — к фонтану
      if (!best || d < best.k) best = { k: d, mx: (x0 + x1) / 2, mz: (z0 + z1) / 2, nx, nz, L, ux, uz, ry: Math.atan2(-uz, ux) };
    }
    if (best) {
      const { nx, nz, ux, uz, ry } = best;
      // точка входа — проекция фонтана на фасад
      let s = (fx - best.mx) * ux + (fz - best.mz) * uz; s = Math.max(-best.L / 2 + 12, Math.min(best.L / 2 - 12, s));
      const ex = best.mx + ux * s, ez = best.mz + uz * s, at = (a, d, y = 0) => [ex + ux * a + nx * d, ez + uz * a + nz * d];
      for (const sd of [-1, 1]) { const [px, pz] = at(sd * 5.6, 2.2); b.box(px, 0, pz, 1.6, 9.5, 4.4, BLUE, ry); }  // синий портал
      { const [px, pz] = at(0, 2.2); b.box(px, 8.3, pz, 12.8, 1.4, 4.4, BLUE, ry); }
      { const [px, pz] = at(0, 4.3); b.box(px, 0.1, pz, 9.6, 7.6, 0.2, [0.3, 0.32, 0.3], ry); to(b, "glow"); }   // витраж и двери
      { const [px, pz] = at(-12, 3.0); b.box(px, 4.0, pz, 13, 0.5, 6, WH, ry); b.box(px, 4.5, pz + 0, 12, 0.9, 0.1, [0.15, 0.3, 0.7], ry); }
      { const [px, pz] = at(12, 3.0); b.box(px, 4.0, pz, 13, 0.5, 6, WH, ry); }                           // козырёк с баннером
      for (const a of [-17, -7, 7, 17]) { const [px, pz] = at(a, 5.6); b.cyl(px, 0, pz, 0.2, 4.0, WH, 6); }
      { const [px, pz] = at(0, 0.5); b.box(px, 0, pz, 22, 0.35, 8, [0.62, 0.6, 0.56], ry); }                // ступени и площадка
      // вывеска на парапете
      const [sx, sz] = at(0, 0.25); sign(b, "O'ZBEKENERGO AJ", sx, TOP + 0.2, sz, nx, nz, 0.26, BLUE, "neon", 0.2);
    }
    // фонтан: каменная чаша, бортик, струи
    { const R = 7.5; // бассейн — водоём OSM, здесь только струи
      b.cyl(fx, -0.6, fz, 0.6, 4.6, [0.92, 0.95, 1], 8); to(b, "cool");
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.beam(fx + Math.cos(a) * (R - 0.8), -0.6, fz + Math.sin(a) * (R - 0.8), fx + Math.cos(a) * (R - 2.6), 2.4, fz + Math.sin(a) * (R - 2.6), 0.18, [0.9, 0.94, 1]); to(b, "cool"); } }
  };
  // ---------------- гостиница City Palace (Амира Темура, 15) ----------------
  // 17-этажная башня (60 м) из бирюзово-зелёного стекла с «пилообразным» планом: на каждом
  // выступе — белое вертикальное ребро, наверху — более светлая стеклянная корона с белым парапетом.
  // У входа — портик на белых колоннах с изогнутой зелёной кровлей и вывеской CITY PALACE,
  // рядом — ресторан «Кристал Гарден» под стеклянным куполом. Ночью рёбра горят белыми линиями.
  M.city_palace = (b, o) => {
    const Q = localParts(o), tw = Q.reduce((a, v) => (v.h > a.h ? v : a)), low = Q.filter((q) => q !== tw);
    const GL = [0.36, 0.62, 0.6], GLL = [0.56, 0.78, 0.76], WH = [0.94, 0.95, 0.95], GRN = [0.3, 0.55, 0.42];
    const p = tw.p, H = tw.h, n = p.length;
    b.loft(offset(p, -0.4), 0, offset(p, -0.4), 6, [0.24, 0.3, 0.3], "glow");
    band(b, p, 0.2, 6, 0.8, WH);
    b.winRing(p, 6.8, H - 5, GL, 106);
    b.loft(p, H - 5, p, H, GLL); band(b, p, 0.15, H, 1.4, WH); cap(b, p, H + 1.4, [0.55, 0.58, 0.6]);
    for (let y = 6.8 + 3.1 * 3; y < H - 5; y += 3.1 * 4) band(b, p, 0.12, y, 0.25, [0.82, 0.9, 0.9]);
    for (let i = 0; i < n; i++) { // белые рёбра на выпуклых углах
      const a = p[(i + n - 1) % n], c = p[i], e = p[(i + 1) % n];
      const cr = (c[0] - a[0]) * (e[1] - c[1]) - (c[1] - a[1]) * (e[0] - c[0]);
      if (cr <= 0) continue;
      b.box(c[0], 6.8, c[1], 0.6, H + 1.2 - 6.8, 0.6, WH, 0); to(b, "cool");
    }
    // пристройки: стеклянный купол ресторана и подиум с портиком
    const sq = o.local(4, -8);
    for (const q of low) {
      const round = q.p.length >= 13 && q.A < 600;
      b.winRing(q.p, 0, 5.5, [0.4, 0.5, 0.52], 107); band(b, q.p, 0.25, 5.5, 0.8, WH); cap(b, q.p, 6.3, [0.6, 0.62, 0.6]);
      if (round) { const r = Math.sqrt(q.A / Math.PI) * 0.8; b.dome(q.cx, 6.3, q.cz, r, [0.5, 0.75, 0.8], { hk: 0.75, seg: 18, tip: false }); to(b, "glow"); continue; }
      // портик к площади
      let best = null;
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 8) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        let nx = uz, nz = -ux; if (nx * (q.cx - mx) + nz * (q.cz - mz) > 0) { nx = -nx; nz = -nz; }
        const k = (nx * (sq[0] - mx) + nz * (sq[1] - mz)) / Math.hypot(sq[0] - mx, sq[1] - mz);
        if (!best || k > best.k) best = { k, mx, mz, nx, nz, ux, uz, L };
      }
      if (best) {
        const { mx, mz, nx, nz, ux, uz } = best, W = Math.min(16, best.L - 2), ry = Math.atan2(-uz, ux);
        for (const s of [-1, 1]) for (const d of [3.5, 7]) b.cyl(mx + ux * s * W / 2 + nx * d, 0, mz + uz * s * W / 2 + nz * d, 0.35, 5.6, WH, 10);
        for (let k = 0; k < 8; k++) { // изогнутая зелёная кровля навеса
          const t0 = k / 8, t1 = (k + 1) / 8, y0 = 5.6 + Math.sin(t0 * Math.PI) * 1.4, y1 = 5.6 + Math.sin(t1 * Math.PI) * 1.4;
          const a0 = [mx + nx * (t0 * 8.5), mz + nz * (t0 * 8.5)], a1 = [mx + nx * (t1 * 8.5), mz + nz * (t1 * 8.5)], hw = W / 2 + 1;
          b.raw([a0[0] - ux * hw, y0, a0[1] - uz * hw, a1[0] - ux * hw, y1, a1[1] - uz * hw, a1[0] + ux * hw, y1, a1[1] + uz * hw,
                 a0[0] - ux * hw, y0, a0[1] - uz * hw, a1[0] + ux * hw, y1, a1[1] + uz * hw, a0[0] + ux * hw, y0, a0[1] + uz * hw], GRN);
        }
        b.box(mx + nx * 8.5, 5.0, mz + nz * 8.5, W + 2, 0.7, 0.3, WH, ry);
        sign(b, "CITY PALACE", mx + nx * 8.7, 5.05, mz + nz * 8.7, nx, nz, 0.11, [0.95, 0.85, 0.5], "glow", 0.08);
      }
    }
  };

  // ---------------- Hyatt Regency Tashkent (Навои, 1А) ----------------
  // Белый камень и вертикальные ленты синего стекла: широкие светлые простенки чередуются с
  // остеклёнными «колоннами» во всю высоту; плинтус из красного гранита, стеклянный первый этаж,
  // карниз и парапет. Глухие белые угловые пилоны выше основного объёма с синим логотипом-кругом
  // и надписью HYATT. Низкое банкетное крыло — с белой колоннадой. Ночью — подсвеченные
  // прожекторами белые стены, светящиеся окна и логотипы.
  M.hyatt = (b, o) => {
    const Q = localParts(o), main = Q.reduce((a, v) => (v.h > a.h ? v : a)), wing = Q.filter((q) => q !== main);
    const WH = [0.95, 0.94, 0.91], BLUE = [0.16, 0.3, 0.62], GRAN = [0.5, 0.32, 0.28], LOGO = [0.12, 0.3, 0.75];
    const p = main.p, n = p.length, H = main.h;
    b.loft(offset(p, 0.3), 0, offset(p, 0.3), 1.0, GRAN);
    b.loft(offset(p, -0.3), 1.0, offset(p, -0.3), 5.0, [0.26, 0.3, 0.36], "glow");
    b.winRing(p, 5.0, H - 2, BLUE, 108);
    band(b, p, 0.4, 5.0, 0.7, WH); band(b, p, 0.5, H - 2, 1.4, WH, "lit"); band(b, p, 0.2, H - 0.6, 1.8, WH); cap(b, p, H + 1.2, [0.62, 0.62, 0.6]);
    for (let i = 0; i < n; i++) { // широкие белые простенки — между ними синие ленты остекления
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0); if (L < 4) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), nb = Math.max(1, Math.round(L / 8));
      for (let k = 0; k <= nb; k++) {
        const t = k / nb, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, w = k === 0 || k === nb ? 2.4 : 4.2;
        b.box(x + nx * 0.25, 5.7, z + nz * 0.25, w, H - 7.7, 0.5, WH, ry); to(b, "lit");
        for (let y = 8.4; y < H - 3; y += 3.4) b.box(x + nx * 0.52, y, z + nz * 0.52, w * 0.36, 1.5, 0.06, [0.24, 0.32, 0.46], ry); // окна в простенках
      }
    }
    // угловые пилоны: самые длинные рёбра — по их концам
    const edges = [];
    for (let i = 0; i < n; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n]; edges.push({ i, L: Math.hypot(x1 - x0, z1 - z0) }); }
    edges.sort((a, c) => c.L - a.L);
    for (const e of edges.slice(0, 3)) {
      const [x0, z0] = p[e.i], [x1, z1] = p[(e.i + 1) % n], L = e.L, ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = uz, nz = -ux, ry = Math.atan2(-uz, ux);
      for (const t of [5, L - 5]) {
        const x = x0 + ux * t - nx * 4.2, z = z0 + uz * t - nz * 4.2;
        b.box(x, 0, z, 10, H + 4.5, 9, WH, ry); to(b, "lit");
        b.box(x, H + 4.5, z, 10.6, 0.6, 9.6, WH, ry);
        const lx = x + nx * 4.56, lz = z + nz * 4.56, disc = new THREE.CylinderGeometry(1.5, 1.5, 0.12, 18); disc.rotateX(Math.PI / 2); disc.rotateY(Math.atan2(nx, nz));
        b.add(disc, LOGO, lx, H + 1.0, lz); to(b, "neon");
        sign(b, "HYATT", lx, H - 1.6, lz, nx, nz, 0.26, LOGO, "neon", 0.08);
      }
    }
    // банкетное крыло с колоннадой
    for (const q of wing) {
      b.winRing(offset(q.p, -1.6), 0, q.h - 1.6, [0.3, 0.38, 0.5], 109); b.loft(q.p, q.h - 1.6, q.p, q.h, WH, "lit"); cap(b, q.p, q.h, [0.62, 0.62, 0.6]);
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0), m = Math.floor(L / 3.6);
        for (let k = 0; k <= m; k++) { const t = m ? k / m : 0; b.cyl(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.38, q.h - 1.6, WH, 8); }
      }
    }
  };
  // ---------------- квартал у дворца Романова (между сквером Амира Темура и площадью Мустакиллик) ----------------
  // общий фасад: стены, ритм белых лопаток и витражей; li — список для лопаток (ночью подсвечены)
  const ribbed = (b, p, y0, y1, step, w, d, glass, wall, id, li = "lit") => {
    b.winRing(p, y0, y1, glass, id);
    pilasters(b, p, y0, y1, step, w, d, wall, li);
  };
  // БЦ «Пойтахт» (Навои, 2): белые башни 65–75 м со скруглёнными торцами и вертикальными лентами
  // синего стекла, ступенчатые объёмы, центральный корпус выше остальных, корона-парапет.
  M.poytaxt = (b, o) => {
    const WH = [0.95, 0.95, 0.94], BL = [0.2, 0.36, 0.66];
    for (const q of localParts(o)) {
      const p = q.p, H = q.h, slab = p.length <= 4;
      b.loft(offset(p, 0.3), 0, offset(p, 0.3), 1.2, [0.5, 0.36, 0.3]);
      b.loft(offset(p, -0.4), 1.2, offset(p, -0.4), 6, [0.26, 0.32, 0.4], "glow");
      if (slab) { b.loft(p, 6, p, H, WH, "lit"); cap(b, p, H, [0.7, 0.7, 0.7]); continue; }      // глухие белые торцы-пилоны
      ribbed(b, p, 6, H - 3, 3.4, 1.5, 0.6, BL, WH, 110 + p.length);
      band(b, p, 0.4, 6, 0.8, WH); band(b, p, 0.5, H - 3, 3, WH, "lit"); cap(b, p, H, [0.62, 0.62, 0.62]);
      band(b, p, 0.25, H + 0.6, 0.18, [0.9, 0.95, 1], "cool");                                  // ночная кромка короны
    }
  };
  // Национальная библиотека им. Навои (2012): белый мрамор, высокие синие витражи со стрельчатыми
  // завершениями между лопатками, скруглённые углы, двойной карниз и бирюзовый стеклянный купол.
  M.nat_library = (b, o) => {
    const q = localParts(o)[0], p = q.p, H = q.h, WH = [0.96, 0.96, 0.94], BL = [0.18, 0.32, 0.6];
    b.loft(offset(p, 1.2), 0, offset(p, 1.2), 1.4, [0.82, 0.8, 0.76]); cap(b, offset(p, 1.2), 1.4, [0.82, 0.8, 0.76]); // стилобат
    ribbed(b, p, 1.4, H - 4, 4.6, 1.8, 0.9, BL, WH, 114);
    for (let i = 0; i < p.length; i++) { // стрельчатые верхушки витражей
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 4.6)), ry = Math.atan2(-(z1 - z0), x1 - x0);
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t + nx * 0.25, z = z0 + (z1 - z0) * t + nz * 0.25;
        b.box(x, H - 7.5, z, 1.6, 1.4, 0.3, WH, ry); b.box(x, H - 6.1, z, 0.9, 1.0, 0.3, WH, ry); }
    }
    band(b, p, 0.6, H - 4, 1.0, WH, "lit"); band(b, p, 0.3, H - 3, 3, WH); band(b, p, 0.8, H, 0.6, WH); cap(b, p, H + 0.6, [0.66, 0.66, 0.64]);
    const r = Math.sqrt(q.A / Math.PI) * 0.36;
    b.cyl(q.cx, H + 0.6, q.cz, r + 0.6, 2.4, WH, 24); b.dome(q.cx, H + 3, q.cz, r, [0.45, 0.78, 0.8], { hk: 0.7, seg: 24, tip: false }); to(b, "glow");
  };
  // Дворец творчества молодёжи: белый корпус, на скруглённом углу — входная ротонда из высоких
  // колонн с синим витражом и изогнутым аттиком с надписью; ночью витражи и надпись светятся.
  M.youth_palace = (b, o) => {
    const Q = localParts(o), q = Q.reduce((a, v) => (v.A > a.A ? v : a)), p = q.p, H = q.h, WH = [0.96, 0.96, 0.95], BL = [0.2, 0.34, 0.6];
    b.loft(offset(p, -1.4), 0, offset(p, -1.4), 9.5, BL, "glow");
    for (let i = 0; i < p.length; i++) { // колоннада по периметру
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 4.2));
      for (let k = 0; k < n; k++) { const t = k / n; b.cyl(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.45, 9.5, WH, 10); }
    }
    b.loft(p, 9.5, p, H, WH, "lit"); band(b, p, 0.3, 9.5, 0.6, WH); band(b, p, 0.4, H, 0.7, WH); cap(b, p, H + 0.7, [0.7, 0.7, 0.68]);
    for (const r of Q.filter((v) => v !== q)) { ribbed(b, r.p, 0, r.h, 3, 0.8, 0.4, BL, WH, 115); cap(b, r.p, r.h, [0.7, 0.7, 0.68]); }
    // надпись на изогнутом аттике входной ротонды (самая «круглая» часть контура — короткие рёбра подряд)
    let bi = 0, bs = 1e9; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < bs && L > 1) { bs = L; bi = i; } }
    const [mx, mz] = p[bi]; let nx = mx - q.cx, nz = mz - q.cz; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    sign(b, "YOSHLAR IJODIYOTI SAROYI", mx + nx * 0.6, H - 4.5, mz + nz * 0.6, nx, nz, 0.14, [0.75, 0.62, 0.32], "glow", 0.1);
  };
  // Галерея изобразительного искусства Узбекистана: круглый павильон — белые лопатки, ленты синего
  // стекла, карниз и рёбристый синий купол; ночью купол подсвечен.
  M.art_gallery = (b, o) => {
    const q = localParts(o)[0], p = q.p, R = Math.sqrt(q.A / Math.PI), WH = [0.95, 0.94, 0.9], BL = [0.2, 0.34, 0.62];
    b.cyl(q.cx, 0, q.cz, R + 2, 0.8, [0.78, 0.76, 0.72], 28);
    ribbed(b, p, 0.8, 12, 2.2, 0.8, 0.5, BL, WH, 116);
    band(b, p, 0.5, 12, 1.2, WH, "lit"); cap(b, p, 13.2, [0.7, 0.7, 0.68]);
    b.cyl(q.cx, 13.2, q.cz, R * 0.8, 1.6, WH, 24);
    b.dome(q.cx, 14.8, q.cz, R * 0.78, [0.16, 0.42, 0.78], { hk: 0.85, seg: 20, ribs: [0.3, 0.6, 0.9], tip: false }); to(b, "lit");
    b.cyl(q.cx, 14.8 + R * 0.66, q.cz, 0.8, 1.6, [0.95, 0.85, 0.5], 10);
  };
  // Монетный двор Центрального банка: строгий четырёхэтажный корпус из светлого песчаника,
  // гранитный цоколь, лопатки и ряды окон, тяжёлый карниз.
  M.mint = (b, o) => {
    const q = localParts(o)[0], p = q.p, H = q.h, ST = [0.86, 0.8, 0.68];
    b.loft(offset(p, 0.3), 0, offset(p, 0.3), 1.4, [0.46, 0.32, 0.3]);
    b.winRing(p, 1.4, H - 1.2, ST, 117);
    pilasters(b, p, 1.4, H - 1.2, 3.6, 0.7, 0.35, [0.9, 0.85, 0.74], "lit");
    band(b, p, 0.4, H - 1.2, 1.2, [0.92, 0.88, 0.78]); cap(b, p, H, [0.58, 0.56, 0.54]);
  };
  // ---------------- Дом печати «Шарк» и УзА (Буюк Турон, 41) ----------------
  // 20-этажная башня 1970-х: белые бетонные рёбра и ленты синего стекла, наверху — ступенчатый аттик
  // с рёбрами; у торца — узкая белая башенка-шахта с балконами и часами. Вокруг — типографские корпуса:
  // светлый травертин с решёткой солнцезащитных рамок, глухой коричневый цех и белый входной павильон
  // с вывеской «SHARQ». Ночью — окна, часы и вывеска.
  M.sharq = (b, o) => {
    const Q = localParts(o), tw = Q.reduce((a, v) => (v.h > a.h ? v : a)), WH = [0.93, 0.93, 0.9], BL = [0.22, 0.36, 0.62];
    const TRV = [0.86, 0.8, 0.68], BRN = [0.42, 0.3, 0.24];
    { // башня
      const p = tw.p, H = tw.h;
      b.loft(offset(p, -0.5), 0, offset(p, -0.5), 5, [0.28, 0.32, 0.36], "glow");
      b.winRing(p, 5, H - 6, BL, 118);
      pilasters(b, p, 5, H - 6, 2.6, 0.9, 0.7, WH, "lit");
      for (let y = 5; y < H - 6; y += 3.2) band(b, p, 0.25, y, 0.3, WH);
      band(b, p, 0.3, H - 6, 1.2, WH);
      b.winRing(offset(p, -1.2), H - 4.8, H, [0.85, 0.86, 0.85], 119); pilasters(b, offset(p, -1.2), H - 4.8, H, 1.4, 0.4, 0.4, WH);
      cap(b, offset(p, -1.2), H, [0.6, 0.6, 0.6]);
      // башенка-шахта у дальнего торца (самое длинное ребро → его конец)
      const f = frame(tw), [sx, sz] = FP(f, f.L / 2 + 2.8, 0);
      b.box(sx, 0, sz, 4.2, H + 9, 4.2, WH, f.ry); to(b, "lit");
      for (let y = 8; y < H; y += 6.4) b.box(sx, y, sz, 5.4, 0.35, 5.4, WH, f.ry);              // балконы-полки
      for (const s of [-1, 1]) { const [cx, cz] = FP(f, f.L / 2 + 2.8, s * 2.15), disc = new THREE.CylinderGeometry(1.4, 1.4, 0.15, 18); disc.rotateX(Math.PI / 2); disc.rotateY(Math.atan2(f.vx * s, f.vz * s)); b.add(disc, [0.96, 0.94, 0.86], cx, H + 5, cz, 0, true); }
      b.cyl(sx, H + 9, sz, 0.12, 5, [0.8, 0.8, 0.82], 6);
    }
    // корпуса типографии
    const sq = o.local(-860, -50); let ent = null;
    for (const q of Q) {
      if (q === tw) continue;
      const p = q.p, H = q.h, blind = q.h >= 28;
      if (blind) { b.loft(p, 0, p, H, BRN); band(b, p, 0.2, H - 1.6, 1.6, [0.5, 0.38, 0.3]); cap(b, p, H, [0.42, 0.4, 0.38]); continue; } // глухой цех
      b.loft(offset(p, 0.25), 0, offset(p, 0.25), 1.0, [0.5, 0.36, 0.3]);
      b.winRing(p, 1.0, H - 1, TRV, 120);
      for (let y = 1.0 + 3.2; y < H - 1.2; y += 3.2) band(b, p, 0.55, y, 0.18, [0.92, 0.9, 0.84]);
      pilasters(b, p, 1.0, H - 1, 1.6, 0.14, 0.55, [0.92, 0.9, 0.84]);                             // решётка солнцезащитных рамок
      band(b, p, 0.3, H - 1, 1, TRV); cap(b, p, H, [0.56, 0.56, 0.55]);
      const d = Math.hypot(q.cx - sq[0], q.cz - sq[1]); if (!ent || d < ent.d) ent = { q, d };
    }
    if (ent) { // белый входной павильон с вывеской, к стороне музея/улицы
      const q = ent.q; let best = null;
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 14) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; let nx = uz, nz = -ux; if (nx * (q.cx - mx) + nz * (q.cz - mz) > 0) { nx = -nx; nz = -nz; }
        if (Q.some((o2) => o2 !== q && o2.h > 5 && Math.hypot(o2.cx - mx - nx * 8, o2.cz - mz - nz * 8) < Math.sqrt(o2.A) / 2)) continue;
        const k = -Math.hypot(sq[0] - mx, sq[1] - mz); if (!best || k > best.k) best = { k, mx, mz, nx, nz, ux, uz };
      }
      if (best) {
        const { mx, mz, nx, nz, ux, uz } = best, ry = Math.atan2(-uz, ux), px = mx + nx * 3.5, pz = mz + nz * 3.5;
        b.box(px, 0, pz, 16, 6.2, 7, WH, ry); to(b, "lit");
        b.box(px + nx * 3.55, 0.3, pz + nz * 3.55, 4, 3, 0.1, [0.3, 0.32, 0.3], ry); to(b, "glow");
        sign(b, "SHARQ", px + nx * 3.6, 4.0, pz + nz * 3.6, nx, nz, 0.22, [0.3, 0.26, 0.2], "glow", 0.08);
      }
    }
  };

  // ---------------- Государственный музей истории Узбекистана (бывший музей Ленина, 1970) ----------------
  // Белый мраморный куб на стилобате: глухие стены, частые узкие вертикальные рёбра-лопатки с щелями
  // синеватого стекла, выступающий карниз; в центре — приподнятый световой фонарь над атриумом.
  // Широкая парадная лестница — ступени из тайла. Ночью рёбра подсвечены снизу.
  M.history_museum = (b, o) => {
    const Q = localParts(o), q = Q.reduce((a, v) => (v.A > a.A ? v : a)), core = Q.find((v) => v !== q), p = q.p, H = q.h, WH = [0.95, 0.95, 0.93];
    b.loft(offset(p, 3), 0, offset(p, 3), 4, [0.78, 0.77, 0.74]); cap(b, offset(p, 3), 4, [0.72, 0.7, 0.68]);   // стилобат
    b.loft(offset(p, -0.6), 4, offset(p, -0.6), 7, [0.24, 0.28, 0.34], "glow");                                 // остеклённый пояс входа
    b.winRing(p, 7, H - 2.4, [0.5, 0.58, 0.68], 121);
    pilasters(b, p, 7, H - 2.4, 1.5, 1.0, 0.5, WH, "lit");
    band(b, p, 0.9, H - 2.4, 2.4, WH, "lit"); cap(b, p, H, [0.66, 0.66, 0.64]);
    if (core) { b.winRing(core.p, H, core.h, [0.42, 0.54, 0.66], 122); band(b, core.p, 0.3, core.h, 0.6, WH); cap(b, core.p, core.h + 0.6, [0.6, 0.62, 0.64]); }
  };
  // ---------------- Мужская и Женская гимназии (Сайилгох, 35), начало XX века ----------------
  // Ныне учебные корпуса Юридического университета. Два длинных двухэтажных корпуса из жёлто-
  // песочного кирпича: рустованный первый этаж с лучковыми окнами, второй — высокие арочные окна
  // с архивольтами, лопатки, межэтажный пояс, карниз с сухариками, зелёная вальмовая кровля.
  // Посередине уличного фасада — ризалит с аттиком и входом. Ночью фасады подсвечены тёплым светом.
  M.gymnasia = (b, o) => {
    const SAND = [0.82, 0.71, 0.53], LT = [0.9, 0.82, 0.66], DK = [0.66, 0.55, 0.4], GL = [0.2, 0.22, 0.25], FR = [0.92, 0.9, 0.84];
    const ROOF = [0.37, 0.54, 0.36], H = 10, F1 = 4.6;
    const hash = (a, c) => { const s = Math.sin(a * 12.9898 + c * 78.233) * 43758.5453; return s - Math.floor(s); };
    for (const q of localParts(o)) {
      const f = frame(q), A = f.L / 2, B = f.W / 2, ry = f.ry;
      const rect = (a, c) => [FP(f, -a, -c), FP(f, a, -c), FP(f, a, c), FP(f, -a, c)], r = rect(A, B);
      b.loft(offset(r, 0.25), 0, offset(r, 0.25), 0.9, DK);                                          // цоколь
      b.loft(r, 0.9, r, H, SAND, "show");
      for (let y = 1.4; y < F1 - 0.2; y += 0.55) band(b, r, 0.08, y, 0.12, LT, "show");                 // руст первого этажа
      band(b, r, 0.25, F1 - 0.2, 0.6, LT, "show"); band(b, r, 0.35, H - 0.9, 0.5, LT, "show"); band(b, r, 0.6, H - 0.4, 0.4, LT); // пояс и карниз
      b.hip(f.cx, H, f.cz, f.L + 1.4, f.W + 1.4, 4.2, ROOF, ry);
      // окна по длинным и коротким фасадам
      for (const [a0, a1, cc, nx, nz] of [[-A, A, -B, -f.vx, -f.vz], [-A, A, B, f.vx, f.vz]]) {
        const n = Math.round((a1 - a0) / 3.4);
        for (let k = 0; k < n; k++) {
          const a = a0 + (a1 - a0) * (k + 0.5) / n, mid = Math.abs(a) < 7;
          const [x, z] = FP(f, a, cc), px = (d) => [x + nx * d, z + nz * d], lit = hash(a, cc) < 0.45 ? "glow" : null;
          { const [wx, wz] = px(0.06); b.box(wx, 1.6, wz, 1.3, 2.2, 0.1, GL, ry); if (lit) to(b, lit); }
          { const [wx, wz] = px(0.12); b.box(wx, 3.8, wz, 1.7, 0.35, 0.16, LT, ry); to(b, "show"); }       // лучковая перемычка
          { const [wx, wz] = px(0.06); b.box(wx, 5.3, wz, 1.3, 2.6, 0.1, GL, ry); if (lit) to(b, lit);
            b.box(wx, 7.9, wz, 0.9, 0.35, 0.1, GL, ry); if (lit) to(b, lit); }                              // арочное окно
          { const [wx, wz] = px(0.14); b.box(wx, 7.9, wz, 1.9, 0.6, 0.2, LT, ry); to(b, "show"); b.box(wx, 5.1, wz, 1.8, 0.18, 0.3, LT, ry); }
          if (k % 2 === 0 && !mid) { const [lx, lz] = FP(f, a + (a1 - a0) / n / 2, cc); b.box(lx + nx * 0.12, 0.9, lz + nz * 0.12, 0.6, H - 1.4, 0.24, LT, ry); to(b, "show"); } // лопатки
        }
        // центральный ризалит с аттиком и входом
        const [rx, rz] = FP(f, 0, cc);
        b.box(rx + nx * 0.6, 0, rz + nz * 0.6, 12, H + 0.6, 1.2, SAND, ry); to(b, "show");
        b.box(rx + nx * 0.9, H + 0.6, rz + nz * 0.9, 9, 1.8, 0.6, LT, ry); to(b, "show");
        b.box(rx + nx * 0.9, H + 2.4, rz + nz * 0.9, 4, 0.8, 0.6, LT, ry);
        b.box(rx + nx * 1.25, 0.9, rz + nz * 1.25, 2.2, 3.0, 0.1, [0.32, 0.22, 0.16], ry);                 // дверь
        b.box(rx + nx * 1.9, 3.2, rz + nz * 1.9, 4.2, 0.25, 1.6, FR, ry);                                 // козырёк
        b.box(rx + nx * 2.2, 0, rz + nz * 2.2, 5, 0.45, 2.2, DK, ry);
      }
      for (const s of [-1, 1]) { // торцы: по два окна в этаж
        const [x, z] = FP(f, s * A, 0), nx = f.ux * s, nz = f.uz * s, rr = ry + Math.PI / 2;
        for (const c of [-B * 0.45, B * 0.45]) { const wx = x + nx * 0.06 + f.vx * c, wz = z + nz * 0.06 + f.vz * c;
          b.box(wx, 1.6, wz, 1.3, 2.2, 0.1, GL, rr); b.box(wx, 5.3, wz, 1.3, 2.9, 0.1, GL, rr); }
      }
    }
  };
  // ---------------- квартал на ул. Бухоро к югу от сквера Амира Темура ----------------
  // Республиканская фондовая биржа «Тошкент» (Бухоро, 10): бежевый камень, огромный стрельчатый
  // портал с витражом между коричневыми резными панелями, бирюзовый рёбристый купол с фонарём.
  // Офис Beeline (Бухоро, 1): ленты тёмного стекла, белые пояса, жёлтая полоса и вывеска.
  // «Узавтосаноат» (Амира Темура, 13): синий стеклянный фасад в белой раме, вывеска.
  // Новые 18–20-этажные башни: светлый камень, остеклённые эркеры, балконные пояса, корона.
  // Остальные — административные корпуса 1970-х: травертин, лопатки, ленточные окна, карниз.
  M.buxoro = (b, o) => {
    const Q = localParts(o), at = (wx, wz) => { const [x, z] = o.local(wx, wz); return Q.reduce((a, q) => (Math.hypot(q.cx - x, q.cz - z) < Math.hypot(a.cx - x, a.cz - z) ? q : a)); };
    const domeB = at(-204, 227), lant = Q.find((q) => q !== domeB && Math.hypot(q.cx - domeB.cx, q.cz - domeB.cz) < 4);
    const beel = at(-162, 316), avto = at(-140, 562), towers = [at(-350, 196), at(-291, 215), at(-264, 191), at(-311, 173), at(-263, 215)];
    const STONE = [0.86, 0.8, 0.68], TRV = [0.88, 0.84, 0.74], WH = [0.95, 0.95, 0.93];
    const front = (q, wx, wz) => { // ребро контура, обращённое к точке (для вывесок)
      const [tx, tz] = o.local(wx, wz); let best = null;
      for (let i = 0; i < q.p.length; i++) {
        const [x0, z0] = q.p[i], [x1, z1] = q.p[(i + 1) % q.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 8) continue;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; let nx = (z1 - z0) / L, nz = -(x1 - x0) / L; if (nx * (q.cx - mx) + nz * (q.cz - mz) > 0) { nx = -nx; nz = -nz; }
        const k = (nx * (tx - mx) + nz * (tz - mz)) / (Math.hypot(tx - mx, tz - mz) || 1); if (!best || k > best.k) best = { k, mx, mz, nx, nz, L, ux: (x1 - x0) / L, uz: (z1 - z0) / L };
      }
      return best;
    };
    for (const q of Q) {
      if (q === lant) continue;
      const p = q.p, H = q.h;
      if (q === domeB) { // биржа: квадратный корпус вокруг купола
        const R = Math.sqrt(q.A / Math.PI), [tx0, tz0] = o.local(-206, 290), dl = Math.hypot(tx0 - q.cx, tz0 - q.cz), e = { nx: (tx0 - q.cx) / dl, nz: (tz0 - q.cz) / dl }; e.ux = -e.nz; e.uz = e.nx; const ry = Math.atan2(-e.uz, e.ux), S = R + 6;
        const sq = [[q.cx - S, q.cz - S], [q.cx + S, q.cz - S], [q.cx + S, q.cz + S], [q.cx - S, q.cz + S]].map(([x, z]) => { const dx = x - q.cx, dz = z - q.cz, c = Math.cos(-ry), s = Math.sin(-ry); return [q.cx + dx * c - dz * s, q.cz + dx * s + dz * c]; });
        b.winRing(sq, 0, 11, STONE, 123); pilasters(b, sq, 0, 11, 4.4, 1.0, 0.4, [0.9, 0.85, 0.74]);
        band(b, sq, 0.4, 11, 1.4, [0.9, 0.85, 0.74], "lit"); cap(b, sq, 12.4, [0.6, 0.58, 0.55]);
        const fx = q.cx + e.nx * (S + 1.2), fz = q.cz + e.nz * (S + 1.2);
        b.box(fx, 0, fz, 16, 14.5, 2.4, STONE, ry); to(b, "lit");                                                    // портал-пештак
        b.box(fx + e.nx * 1.25, 0.4, fz + e.nz * 1.25, 7, 8.5, 0.1, [0.22, 0.3, 0.36], ry); to(b, "glow");
        for (let k = 1; k <= 4; k++) { b.box(fx + e.nx * 1.25, 8.9 + (k - 1) * 0.8, fz + e.nz * 1.25, 7 * (1 - k * 0.2), 0.8, 0.1, [0.22, 0.3, 0.36], ry); to(b, "glow"); }
        for (const s of [-1, 1]) b.box(fx + e.ux * s * 5.6 + e.nx * 1.25, 1.5, fz + e.uz * s * 5.6 + e.nz * 1.25, 3, 10, 0.12, [0.5, 0.34, 0.22], ry); // резные панели
        sign(b, "TOSHKENT", fx + e.nx * 1.3, 12.3, fz + e.nz * 1.3, e.nx, e.nz, 0.2, [0.95, 0.78, 0.35], "glow", 0.1);
        b.cyl(q.cx, 12.4, q.cz, R * 0.62, 2.2, STONE, 24);
        b.dome(q.cx, 14.6, q.cz, R * 0.6, [0.3, 0.72, 0.8], { hk: 0.7, seg: 24, ribs: [0.22, 0.6, 0.7], tip: false }); to(b, "lit");
        b.cyl(q.cx, 14.6 + R * 0.42, q.cz, 1.6, 2.6, [0.4, 0.75, 0.82], 12); b.cyl(q.cx, 17.2 + R * 0.42, q.cz, 0.3, 2.2, [0.9, 0.75, 0.35], 6);
        continue;
      }
      if (q === beel) {
        b.winRing(p, 0, H - 1, [0.24, 0.28, 0.32], 124);
        for (let y = 4; y < H - 1; y += 3.4) band(b, p, 0.2, y, 0.7, WH);
        band(b, p, 0.25, H - 1, 1.2, WH); cap(b, p, H + 0.2, [0.55, 0.55, 0.55]);
        band(b, p, 0.3, 3.2, 0.6, [1, 0.8, 0.1], "neon");                                                           // жёлтая полоса
        const e = front(q, -170, 260); sign(b, "BEELINE", e.mx + e.nx * 0.4, H - 0.8, e.mz + e.nz * 0.4, e.nx, e.nz, 0.3, [1, 0.82, 0.1], "neon", 0.1);
        continue;
      }
      if (q === avto) {
        b.loft(offset(p, -0.4), 0, offset(p, -0.4), 4.5, [0.26, 0.3, 0.36], "glow");
        b.winRing(p, 4.5, H - 1.5, [0.3, 0.45, 0.66], 125); pilasters(b, p, 4.5, H - 1.5, 6, 0.6, 0.4, WH);
        band(b, p, 0.3, 4.5, 0.6, WH); band(b, p, 0.35, H - 1.5, 1.5, WH, "lit"); cap(b, p, H, [0.55, 0.56, 0.58]);
        const e = front(q, -60, 540); sign(b, "UZAVTOSANOAT", e.mx + e.nx * 0.4, H - 1.3, e.mz + e.nz * 0.4, e.nx, e.nz, 0.16, [0.2, 0.35, 0.7], "neon", 0.08);
        continue;
      }
      if (towers.includes(q)) {
        const tall = H > 30;
        b.loft(offset(p, -0.4), 0, offset(p, -0.4), 5, [0.28, 0.32, 0.34], "glow");
        b.winRing(p, 5, H - (tall ? 3 : 1), [0.82, 0.78, 0.7], 126 + Math.round(H));
        pilasters(b, p, 5, H - (tall ? 3 : 1), 7.5, 2.6, 0.9, [0.4, 0.5, 0.58]);                                    // остеклённые эркеры
        for (let y = 5 + 3.1; y < H - 3; y += 3.1) band(b, p, 0.5, y, 0.25, WH);                                       // балконные пояса
        band(b, p, 0.3, H - (tall ? 3 : 1), tall ? 3 : 1, WH, "lit"); cap(b, p, H, [0.6, 0.6, 0.6]);
        if (tall) band(b, p, 0.2, H + 0.2, 0.25, [0.9, 0.95, 1], "cool");
        continue;
      }
      // административные корпуса 1970-х
      b.loft(offset(p, 0.25), 0, offset(p, 0.25), 1.0, [0.5, 0.42, 0.38]);
      b.winRing(p, 1.0, H - 1.3, TRV, 127);
      pilasters(b, p, 1.0, H - 1.3, 3.3, 0.5, 0.45, [0.92, 0.89, 0.8]);
      for (let y = 1.0 + 3.3; y < H - 1.5; y += 3.3) band(b, p, 0.3, y - 0.2, 0.3, [0.92, 0.89, 0.8]);
      band(b, p, 0.45, H - 1.3, 1.3, [0.92, 0.89, 0.8], "lit"); cap(b, p, H, [0.56, 0.56, 0.55]);
    }
  };
  // ---------------- бывший Ташкентский кадетский корпус (1902–1904), ныне Академия вооружённых сил ----------------
  // Двухэтажное здание из красного жжёного кирпича в «кирпичном стиле»: цоколь из серого камня,
  // лопатки, высокие окна с лучковыми перемычками, фигурный карниз с поясом кирпичных сухариков,
  // зубчатый парапет и тёмная железная кровля. На середине главного (самого длинного) фасада —
  // ризалит с восьмериком и зелёным куполом (без креста — здание военной академии).
  M.cadet_corps = (b, o) => {
    const q = localParts(o)[0], p = q.p, n = p.length, H = q.h;
    const BRK = [0.62, 0.3, 0.24], BRK2 = [0.52, 0.24, 0.19], LT = [0.74, 0.4, 0.32], STN = [0.56, 0.55, 0.52], ROOF = [0.34, 0.36, 0.36];
    b.loft(offset(p, 0.25), 0, offset(p, 0.25), 1.2, STN);
    b.winRing(p, 1.2, H - 1.6, BRK, 128);
    pilasters(b, p, 1.2, H - 1.6, 4.2, 0.6, 0.3, BRK2, "show");
    band(b, p, 0.2, 5.4, 0.35, LT, "show");                                                          // межэтажный пояс
    band(b, p, 0.3, H - 1.6, 0.5, LT, "show"); band(b, p, 0.45, H - 1.1, 0.35, BRK2); band(b, p, 0.6, H - 0.75, 0.4, LT, "show"); // карниз
    b.loft(p, H - 0.35, p, H + 0.6, BRK); cap(b, offset(p, -0.3), H + 0.1, ROOF);
    for (let i = 0; i < n; i++) { // зубцы парапета на углах
      const [x, z] = p[i]; b.box(x, H - 0.3, z, 1.0, 1.9, 1.0, BRK2); b.box(x, H + 1.6, z, 1.2, 0.25, 1.2, LT);
    }
    // ризалит с церковью — по середине самого длинного ребра
    const [sx, sz] = o.local(2494, -828); let bi = 0, bl = 0, bk = -1e9;   // главный фасад — к плацу
    for (let i = 0; i < n; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0); if (L < 30) continue;
      const k = -Math.hypot(sx - (x0 + x1) / 2, sz - (z0 + z1) / 2); if (k > bk) { bk = k; bl = L; bi = i; } }
    const [x0, z0] = p[bi], [x1, z1] = p[(bi + 1) % n], ux = (x1 - x0) / bl, uz = (z1 - z0) / bl;
    let nx = uz, nz = -ux; if (nx * (q.cx - (x0 + x1) / 2) + nz * (q.cz - (z0 + z1) / 2) > 0) { nx = -nx; nz = -nz; }
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, ry = Math.atan2(-uz, ux);
    b.box(mx + nx * 0.9, 0, mz + nz * 0.9, 16, H + 2.6, 2.2, BRK, ry); to(b, "show");
    b.box(mx + nx * 1.9, H + 2.6, mz + nz * 1.9, 8, 2.4, 0.4, BRK, ry);                           // фронтон-аттик
    b.box(mx + nx * 2.05, 0.4, mz + nz * 2.05, 3.2, 4.2, 0.1, [0.3, 0.2, 0.16], ry);                // вход
    for (const s of [-1, 1]) b.box(mx + ux * s * 7 + nx * 2.1, 0, mz + uz * s * 7 + nz * 2.1, 1.2, H + 3.2, 1.2, BRK2, ry); // угловые лопатки
    const cx = mx - nx * 6, cz = mz - nz * 6;
    b.cyl(cx, H, cz, 4.6, 5.0, BRK, 8); b.cyl(cx, H + 5, cz, 4.9, 0.5, LT, 8);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.box(cx + Math.cos(a) * 4.62, H + 1.4, cz + Math.sin(a) * 4.62, 0.9, 2.6, 0.1, [0.26, 0.28, 0.3], -a + Math.PI / 2); to(b, "glow"); }
    b.dome(cx, H + 5.5, cz, 4.3, [0.3, 0.5, 0.4], { hk: 1.1, seg: 16, tip: false }); to(b, "lit");
    b.cyl(cx, H + 10, cz, 0.7, 1.6, [0.3, 0.5, 0.4], 8);                                              // фонарик-главка без креста
  };
})();
