// =====================================================================
//  Детальные модели заметных ЖК и башен (без карточек — это фон города):
//  U-Tower, Modera Towers, Mirabad Avenue, «Казахстан», NRG Oybek,
//  Xon Saroy Sayram, экспериментальный дом «Жемчуг», башня Национального банка (НБУ).
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
    const Q = localParts(o), groups = [];
    for (const q of Q) { let g = groups.find((G) => Math.hypot(G.cx - q.cx, G.cz - q.cz) < 15); if (!g) groups.push(g = { cx: q.cx, cz: q.cz, qs: [] }); g.qs.push(q); }
    const all = Q.flatMap((q) => q.p), X0 = Math.min(...all.map((v) => v[0])), X1 = Math.max(...all.map((v) => v[0])), Z0 = Math.min(...all.map((v) => v[1])), Z1 = Math.max(...all.map((v) => v[1]));
    // стилобат
    const PH = 15;
    for (let y = 0; y < PH; y += 3.75) { b.box((X0 + X1) / 2, y, (Z0 + Z1) / 2, X1 - X0 + 4, 3, Z1 - Z0 + 4, [0.18, 0.36, 0.62], 0, true); b.box((X0 + X1) / 2, y + 3, (Z0 + Z1) / 2, X1 - X0 + 4.4, 0.75, Z1 - Z0 + 4.4, [0.93, 0.94, 0.95]); }
    b.box((X0 + X1) / 2, PH, (Z0 + Z1) / 2, X1 - X0 + 3, 0.4, Z1 - Z0 + 3, [0.55, 0.6, 0.55]);
    groups.forEach((G, gi) => {
      const q = G.qs.reduce((a, v) => (v.A > a.A ? v : a)), H = Math.max(...G.qs.map((v) => v.h)), H0 = q.h - 6;
      const A = (q.x1 - q.x0) / 2, B = (q.z1 - q.z0) / 2, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      const ring = [[cx - A, cz - B], [cx + A, cz - B], [cx + A, cz + B], [cx - A, cz + B]];
      b.loft(ring, PH, ring, H0, [0.16, 0.2, 0.28]);
      b.winRing(offset(ring, -0.05), PH, H0, [0.2, 0.24, 0.3], 70 + gi);
      const side = Math.sign(cx - (X0 + X1) / 2) || 1;                                             // дуга поднимается наружу
      const arc = (x) => H0 + (H - H0) * (1 - Math.cos(Math.max(0, Math.min(1, (side * (x - cx) + A) / (2 * A))) * Math.PI / 2));
      for (const [zf, dz] of [[cz - B, -1], [cz + B, 1]]) for (let x = cx - A; x <= cx + A + 0.01; x += 2.2) {
        const t = arc(x); b.box(x, PH, zf + dz * 0.35, 0.5, t - PH, 0.7, [0.95, 0.95, 0.96]);
        b.box(x, t - 0.6, zf + dz * 0.6, 2.3, 0.6, 0.3, [0.85, 0.75, 1]); to(b, "led");
      }
      for (const [xf, dx] of [[cx - A, -1], [cx + A, 1]]) for (let z = cz - B; z <= cz + B + 0.01; z += 2.2) b.box(xf + dx * 0.35, PH, z, 0.7, arc(xf) - PH, 0.5, [0.95, 0.95, 0.96]);
      // скошенная кровля по дуге
      const n = 10;
      for (let i = 0; i < n; i++) { const xa = cx - A + 2 * A * i / n, xb = cx - A + 2 * A * (i + 1) / n; b.raw([xa, arc(xa), cz - B, xb, arc(xb), cz - B, xb, arc(xb), cz + B, xa, arc(xa), cz - B, xb, arc(xb), cz + B, xa, arc(xa), cz + B], [0.42, 0.44, 0.5]); }
    });
    b.box((X0 + X1) / 2, PH + 0.4, Z1 + 1.5, 16, 1.4, 0.2, [1, 0.95, 0.85], 0, true);               // вывеска MODERA TOWERS
  };

  // ---------------- NRG U-Tower ----------------
  // 30 этажей: скруглённая в плане башня с белыми волнистыми лентами балконов и тёмным остеклением,
  // наверху — U-образный вырез (два «рога»), у подножия — белые решётчатые арки-своды;
  // ночью ленты подсвечены.
  M.u_tower = (b, o) => {
    const Q = localParts(o), tw = Q.reduce((a, q) => (q.h > a.h ? q : a)), pod = Q.find((q) => q !== tw);
    const W = [0.96, 0.96, 0.97];
    if (pod) {                                                                                    // стилобат и арки
      b.loft(pod.p, 0, pod.p, pod.h - 1, [0.3, 0.36, 0.42], "glow"); band(b, pod.p, 0.4, pod.h - 1, 1, W); cap(b, pod.p, pod.h, [0.5, 0.62, 0.42]);
      for (let i = 0; i < pod.p.length; i++) {
        const [x0, z0] = pod.p[i], [x1, z1] = pod.p[(i + 1) % pod.p.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 8) continue;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.floor(L / 7);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t + nx * 3.5, z = z0 + (z1 - z0) * t + nz * 3.5;
          for (const s of [-0.5, 0, 0.5]) { const g = new THREE.TorusGeometry(3.3, 0.16, 4, 12, Math.PI); g.rotateY(ry + s); b.add(g, W, x, pod.h - 3.3, z); }
        }
      }
    }
    const A = (tw.x1 - tw.x0) / 2, B = (tw.z1 - tw.z0) / 2, cx = (tw.x0 + tw.x1) / 2, cz = (tw.z0 + tw.z1) / 2, N = 40;
    const y0 = pod ? pod.h : 0, H = Math.max(tw.h, 104), floors = Math.floor((H - 8 - y0) / 3.3);
    const core = se(A - 1.4, B - 1.4, 3.2, N).map(([x, z]) => [x + cx, z + cz]);
    for (let k = 0; k < floors; k++) {
      const y = y0 + k * 3.3;
      b.loft(core, y, core, y + 3.3, k % 2 ? [0.2, 0.26, 0.34] : [0.22, 0.29, 0.38], "glow");
      const slab = se(A, B, 3.2, N, 0).map(([x, z], i) => { const w = 1 + 0.035 * Math.sin(i / N * Math.PI * 6 + k * 0.5); return [x * w + cx, z * w + cz]; });
      b.loft(slab, y + 2.9, slab, y + 3.3, W); b.fan(slab.map(([x, z]) => [x - cx, z - cz]), y + 3.3, W, "parts", y + 3.3, cx, cz);
      if (k % 3 === 0) b.loft(slab, y + 2.75, slab, y + 2.9, [0.6, 1, 0.8], "led");
    }
    // «U»: средняя часть ниже, края-«рога» выше
    const yt = y0 + floors * 3.3;
    b.loft(core, yt, core, yt + 2, W); b.fan(core.map(([x, z]) => [x - cx, z - cz]), yt + 2, [0.55, 0.56, 0.6], "parts", yt + 2, cx, cz);
    for (const s of [-1, 1]) {
      b.box(cx + s * (A - 5), yt, cz, 10, H - yt + 4, B * 2 - 2, W);
      b.box(cx + s * (A - 5), yt + 2, cz + B - 0.9, 8, H - yt, 0.2, [0.3, 0.36, 0.44], 0, true);
    }
    b.cyl(cx + A - 5, H + 4, cz, 0.3, 8, [0.8, 0.8, 0.82], 6);
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
})();
