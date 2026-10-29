// =====================================================================
//  Детальные модели заметных ЖК и башен (без карточек — это фон города):
//  U-Tower, Modera Towers, Mirabad Avenue, «Казахстан», NRG Oybek,
//  Xon Saroy Sayram, экспериментальный дом «Жемчуг», башня Национального банка (НБУ),
//  аэропорт Ташкента с самолётами Uzbekistan Airways, Piramit Tower, Ассоциация банков, Международный
//  бизнес-центр, Законодательная палата Олий Мажлиса, башни SQB, BoMI, Asaka Bank и Aloqa Bank.
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
})();
