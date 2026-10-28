// =====================================================================
//  Транспорт: граф улиц (собирается из загруженных тайлов), машины,
//  светофоры (реальные из OSM либо на крупных перекрёстках).
// =====================================================================
(function () {
  const C = TPM.config, S = TPM.scene, T = TPM.tiles;
  const TR = TPM.traffic = { nodes: new Map(), sig: new Set(), cars: [] };
  const LANE = 3.3, Q = 1.6;
  const RW = { 0: 24, 1: 22, 2: 18, 3: 14, 4: 11, 5: 7.5 };
  const VMAX = [22, 18, 15, 13, 11, 8];
  let rnd = (() => { let s = 99; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296); })();

  function nodeAt(x, z) {
    const kx = Math.round(x / Q), kz = Math.round(z / Q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const n = TR.nodes.get((kx + a) + "," + (kz + b));
      if (n && Math.hypot(n.x - x, n.z - z) < Q * 1.6) return n;
    }
    const n = { x, z, adj: [], inl: [], key: kx + "," + kz, ctrl: null, poles: null };
    TR.nodes.set(n.key, n); return n;
  }
  // ---------- добавление дорог тайла ----------
  function addTile(rec) {
    rec.edges = [];
    const nearLm = (x, z) => TPM.models && TPM.models.near(x, z, 10);
    // перекрёстки: одинаковые вершины у разных линий (внутри тайла) — режем там
    const cnt = new Map(), key = (x, z) => Math.round(x * 4) + "," + Math.round(z * 4);
    for (const L of rec.lines) for (let i = 0; i < L.p.length; i += 2) { const k = key(L.p[i], L.p[i + 1]); cnt.set(k, (cnt.get(k) || 0) + ((i === 0 || i === L.p.length - 2) ? 2 : 1)); }
    for (const L of rec.lines) {
      if (L.cls > 5) continue;
      let cur = [L.p[0], L.p[1]];
      const flush = () => { if (cur.length >= 4) addEdge(rec, cur, L.cls, !!(L.fl & 1), !!(L.fl & 2), nearLm); };
      for (let i = 2; i < L.p.length; i += 2) {
        cur.push(L.p[i], L.p[i + 1]);
        if (i < L.p.length - 2 && (cnt.get(key(L.p[i], L.p[i + 1])) || 0) >= 2) { flush(); cur = [L.p[i], L.p[i + 1]]; }
      }
      flush();
    }
    let acc = 0; rec.edgeW = new Float64Array(rec.edges.length);
    rec.edges.forEach((e, i) => { acc += e.len * (e.cls <= 2 ? 3 : e.cls <= 4 ? 2 : 0.5) * e.lanes; rec.edgeW[i] = acc; });
    rec.edgeWT = acc;
    // светофоры
    if (rec.signals && rec.signals.length) {
      rec.sigW = [];
      for (let i = 0; i < rec.signals.length; i += 2) rec.sigW.push(rec.signals[i] + rec.ox, rec.signals[i + 1] + rec.oz);
    }
    const touched = new Set(); for (const e of rec.edges) { touched.add(e.a); touched.add(e.b); }
    for (const n of touched) evalSignal(n, rec);
  }
  function addEdge(rec, p, cls, oneway, bridge, nearLm) {
    const n = p.length / 2, xs = new Float64Array(n), zs = new Float64Array(n), cum = new Float64Array(n), ux = new Float64Array(n), uz = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = p[i * 2] + rec.ox; zs[i] = p[i * 2 + 1] + rec.oz; }
    for (let i = 1; i < n; i++) { const dx = xs[i] - xs[i - 1], dz = zs[i] - zs[i - 1], L = Math.hypot(dx, dz) || 1e-9; cum[i] = cum[i - 1] + L; ux[i - 1] = dx / L; uz[i - 1] = dz / L; }
    ux[n - 1] = ux[n - 2]; uz[n - 1] = uz[n - 2];
    if (cum[n - 1] < 2) return;
    const lanes = cls <= 1 ? (oneway ? 3 : 2) : cls <= 3 ? 2 : 1;
    const e = { xs, zs, cum, ux, uz, n, len: cum[n - 1], cls, oneway, lanes, alive: true, y: bridge ? 1.3 : 0,
      half: oneway ? RW[cls] / 2 : RW[cls] / 2, a: nodeAt(xs[0], zs[0]), b: nodeAt(xs[n - 1], zs[n - 1]), hid: nearLm((xs[0] + xs[n - 1]) / 2, (zs[0] + zs[n - 1]) / 2) };
    e.a.adj.push({ e, dir: 1 }); e.b.inl.push({ e, dir: 1 });
    if (!oneway) { e.b.adj.push({ e, dir: -1 }); e.a.inl.push({ e, dir: -1 }); }
    rec.edges.push(e);
  }
  function removeTile(rec) {
    if (!rec.edges) return;
    const touched = new Set();
    for (const e of rec.edges) {
      e.alive = false;
      for (const n of [e.a, e.b]) { n.adj = n.adj.filter((o) => o.e !== e); n.inl = n.inl.filter((o) => o.e !== e); n.poles = null; touched.add(n); }
    }
    for (const n of touched) if (!n.adj.length && !n.inl.length) { TR.nodes.delete(n.key); TR.sig.delete(n); }
    rec.edges = null;
  }
  // ---------- светофоры ----------
  const ctrls = new Map();
  function ctrlFor(n) {
    const cx = Math.floor(n.x / 45), cz = Math.floor(n.z / 45);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = ctrls.get((cx + a) + "," + (cz + b)); if (l) for (const c of l) if (Math.hypot(c.x - n.x, c.z - n.z) < 45) return c; }
    const c = { x: n.x, z: n.z, off: rnd() * 60, axis: null }, k = cx + "," + cz;
    if (!ctrls.has(k)) ctrls.set(k, []); ctrls.get(k).push(c); return c;
  }
  function evalSignal(n, rec) {
    n.poles = null;
    const es = new Set(); for (const o of n.adj) es.add(o.e); for (const o of n.inl) es.add(o.e);
    let on = false;
    if (es.size >= 3) {
      const s = rec && rec.sigW;
      if (s && s.length) { for (let i = 0; i < s.length; i += 2) if (Math.hypot(s[i] - n.x, s[i + 1] - n.z) < 26) { on = true; break; } }
      else if (!TPM.hasSignals) { let maj = 0; for (const e of es) if (e.cls <= 3) maj++; on = maj >= 3; }
    }
    if (on) { n.ctrl = n.ctrl || ctrlFor(n); TR.sig.add(n); } else { n.ctrl = null; TR.sig.delete(n); }
  }
  const SG = C.signal, CYC = 2 * (SG.green + SG.yellow + SG.allRed);
  function sigState(c, ph, t) { let l = (t + c.off) % CYC; if (ph) l = (l + CYC / 2) % CYC; return l < SG.green ? 0 : l < SG.green + SG.yellow ? 1 : 2; }
  function phaseFor(c, hx, hz) { const a = Math.atan2(hz, hx); if (c.axis === null) c.axis = a; return Math.abs(Math.cos(a - c.axis)) >= 0.7071 ? 0 : 1; }
  const endH = (e, dir) => { const i = dir > 0 ? e.n - 2 : 0; return [e.ux[i] * dir, e.uz[i] * dir]; };

  // ---------- машины ----------
  const COLORS = [[0.95, 0.94, 0.92, 30], [0.85, 0.86, 0.87, 12], [0.6, 0.62, 0.64, 8], [0.16, 0.17, 0.19, 10], [0.22, 0.3, 0.46, 5], [0.55, 0.18, 0.16, 5], [0.18, 0.36, 0.27, 3], [0.8, 0.7, 0.52, 4], [0.92, 0.75, 0.22, 4]];
  const pickColor = () => { let r = rnd() * 81; for (const c of COLORS) { r -= c[3]; if (r <= 0) return c; } return COLORS[0]; };
  function randomEdge(offscreen) {
    const recs = [...T.loaded.values()].filter((r) => r.state === "ok" && r.edges && r.edgeWT > 0 && T.wanted && T.wanted.has(r.k));
    let tot = 0; for (const r of recs) tot += r.edgeWT;
    if (!tot) return null;
    for (let tries = 0; tries < 6; tries++) {
      let x = rnd() * tot, rec = recs[0];
      for (const r of recs) { x -= r.edgeWT; if (x <= 0) { rec = r; break; } }
      const w = rec.edgeW, v = rnd() * rec.edgeWT; let lo = 0, hi = w.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (w[m] < v) lo = m + 1; else hi = m; }
      const e = rec.edges[lo];
      if (!offscreen || tries === 5) return e;
      const p = S.project((e.xs[0] + e.xs[e.n - 1]) / 2, 0, (e.zs[0] + e.zs[e.n - 1]) / 2);
      if (p[0] < -20 || p[0] > S.W + 20 || p[1] < -20 || p[1] > S.H + 20) return e;
    }
    return null;
  }
  function place(c, off) {
    const e = randomEdge(off); if (!e) return false;
    c.e = e; c.dir = e.oneway ? 1 : (rnd() < 0.5 ? 1 : -1); c.s = rnd() * e.len; c.lane = (rnd() * e.lanes) | 0; c.far = 0; c.ph = -1;
    c.vmax = VMAX[e.cls] * c.vk; c.v = c.vmax * 0.5; c.seg = 0; return true;
  }
  function nextEdge(e, dir) {
    const node = dir > 0 ? e.b : e.a, [hx, hz] = endH(e, dir); let tot = 0; const opts = [];
    for (const o of node.adj) {
      if (o.e === e || !o.e.alive) continue;
      const ox = o.dir > 0 ? o.e.ux[0] : -o.e.ux[o.e.n - 2], oz = o.dir > 0 ? o.e.uz[0] : -o.e.uz[o.e.n - 2];
      const w = 0.25 + Math.max(0, hx * ox + hz * oz) * 2.5 + (o.e.cls <= 2 ? 1 : o.e.cls <= 4 ? 0.6 : 0.15);
      opts.push(o, w); tot += w;
    }
    if (!opts.length) return e.oneway ? null : { e, dir: -dir };
    let r = rnd() * tot; for (let i = 0; i < opts.length; i += 2) { r -= opts[i + 1]; if (r <= 0) return opts[i]; } return opts[0];
  }

  let bodyMesh, roofMesh, poleMesh, headMesh, lightPts, cap = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  function ensureMeshes(n) {
    if (bodyMesh && cap >= n) return;
    for (const m of [bodyMesh, roofMesh]) if (m) { S.scene.remove(m); m.dispose(); }
    cap = n;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    bodyMesh = new THREE.InstancedMesh(box, mat, n); roofMesh = new THREE.InstancedMesh(box, mat, n);
    for (const m of [bodyMesh, roofMesh]) { m.frustumCulled = false; m.castShadow = true; m.count = 0; S.scene.add(m); }
    for (let i = 0; i < n; i++) { bodyMesh.setColorAt(i, col.setRGB(1, 1, 1)); roofMesh.setColorAt(i, col.setRGB(0.2, 0.25, 0.3)); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    if (lightPts) S.scene.remove(lightPts);
    lightPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lightPts.frustumCulled = false; S.scene.add(lightPts);
  }
  function ensureSignals(n) {
    if (poleMesh && poleMesh.userData.cap >= n) return;
    for (const m of [poleMesh, headMesh]) if (m) { S.scene.remove(m); m.dispose(); }
    const pole = new THREE.BoxGeometry(0.18, 4.2, 0.18); pole.translate(0, 2.1, 0);
    const head = new THREE.BoxGeometry(0.45, 1.1, 0.45); head.translate(0, 4.6, 0);
    poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x2b2b30 }), n);
    headMesh = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    for (const m of [poleMesh, headMesh]) { m.frustumCulled = false; m.count = 0; m.userData.cap = n; S.scene.add(m); }
    for (let i = 0; i < n; i++) headMesh.setColorAt(i, col.setRGB(1, 0, 0));
  }
  const SIGC = [[0.2, 1, 0.42], [1, 0.82, 0.2], [1, 0.2, 0.15]];

  TR.update = function (dt, t, Q) {
    const active = S.mpp < C.carMpp;
    if (bodyMesh) { bodyMesh.visible = roofMesh.visible = active; lightPts.visible = active; }
    if (poleMesh) poleMesh.visible = headMesh.visible = S.mpp < C.signalMpp;
    if (!active) return;
    ensureMeshes(Q.cars);
    while (TR.cars.length < Q.cars) TR.cars.push({ e: null, vk: 0.8 + rnd() * 0.35, len: 4.4, wid: 1.8, col: pickColor(), far: 0 });
    TR.cars.length = Q.cars;
    // появление/перестановка
    let placed = 0;
    for (const c of TR.cars) {
      if (placed > 30) break;
      if (!c.e || !c.e.alive || c.far > 2.5) { if (place(c, !!c.e)) placed++; }
    }
    // движение (по рёбрам; лидер — ближайшая машина впереди в той же полосе)
    const buckets = new Map();
    for (const c of TR.cars) { if (!c.e) continue; let b = buckets.get(c.e); if (!b) buckets.set(c.e, b = []); b.push(c); }
    for (const [e, list] of buckets) {
      if (list.length > 1) list.sort((a, z) => (a.dir - z.dir) || (a.lane - z.lane) || (z.s - a.s));
      let lead = null;
      for (const c of list) {
        if (lead && (lead.dir !== c.dir || lead.lane !== c.lane)) lead = null;
        let gap = lead ? lead.s - lead.len - c.s - 2 : 1e9;
        const node = c.dir > 0 ? e.b : e.a, toEnd = e.len - c.s;
        if (node.ctrl && toEnd < 60) {
          if (c.ph < 0) { const [hx, hz] = endH(e, c.dir); c.ph = phaseFor(node.ctrl, hx, hz); }
          const st = sigState(node.ctrl, c.ph, t), d = toEnd - 7;
          if (d > -1 && (st === 2 || (st === 1 && d > c.v * 1.2 + 2))) gap = Math.min(gap, d);
        }
        let vt = c.vmax;
        if (toEnd < 18) vt = Math.min(vt, 7 + toEnd * 0.35);
        if (gap < 1e8) vt = Math.min(vt, Math.sqrt(2 * 4.5 * Math.max(0, gap)));
        c.v = c.v < vt ? Math.min(vt, c.v + 2.6 * dt) : Math.max(vt, c.v - 9 * dt);
        c.brake = c.v < vt - 0.1 || vt < c.vmax * 0.5;
        c.s += c.v * dt;
        if (c.s >= e.len) {
          const nx = nextEdge(e, c.dir);
          if (!nx) { place(c, true); continue; }
          c.s -= e.len; c.e = nx.e; c.dir = nx.dir; c.ph = -1; c.seg = 0; c.vmax = VMAX[c.e.cls] * c.vk; if (c.lane >= c.e.lanes) c.lane = 0;
          if (c.s > c.e.len) c.s = 0;
        }
        lead = c;
      }
    }
    // отрисовка
    const night = TPM.city.night > 0.1;
    const lp = lightPts.geometry.attributes.position.array, lc = lightPts.geometry.attributes.color.array;
    let k = 0, li = 0;
    const ext = Math.max(S.w, S.h) * S.mpp * 0.8;
    for (const c of TR.cars) {
      const e = c.e; if (!e) continue;
      const sAbs = c.dir > 0 ? c.s : e.len - c.s;
      let i = c.seg; while (i > 0 && e.cum[i] > sAbs) i--; while (i < e.n - 2 && e.cum[i + 1] < sAbs) i++; c.seg = i;
      const tt = sAbs - e.cum[i], tx = e.ux[i] * c.dir, tz = e.uz[i] * c.dir;
      const off = e.oneway ? (c.lane - (e.lanes - 1) / 2) * LANE : (c.lane + 0.5) * LANE;
      const x = e.xs[i] + e.ux[i] * tt - tz * off, z = e.zs[i] + e.uz[i] * tt + tx * off;
      const dx = x - S.target.x, dz = z - S.target.z;
      if (Math.abs(dx) > ext || Math.abs(dz) > ext) { c.far += dt; continue; }
      c.far = 0;
      const yaw = Math.atan2(-tz, tx);
      q4.setFromAxisAngle(up, yaw);
      p3.set(x, 0.22 + e.y, z); s3.set(c.len, 1.15, c.wid); m4.compose(p3, q4, s3); bodyMesh.setMatrixAt(k, m4);
      p3.set(x - tx * 0.3, 1.37 + e.y, z - tz * 0.3); s3.set(c.len * 0.52, 0.55, c.wid * 0.9); m4.compose(p3, q4, s3); roofMesh.setMatrixAt(k, m4);
      bodyMesh.setColorAt(k, col.setRGB(c.col[0], c.col[1], c.col[2]));
      if (night || c.brake) {
        const fx = x + tx * c.len / 2, fz = z + tz * c.len / 2, bx = x - tx * c.len / 2, bz = z - tz * c.len / 2;
        if (night) { lp.set([fx, 0.9 + e.y, fz], li * 3); lc.set([1, 0.95, 0.75], li * 3); li++; }
        lp.set([bx, 0.9 + e.y, bz], li * 3); lc.set(c.brake ? [1, 0.18, 0.1] : [0.6, 0.1, 0.08], li * 3); li++;
      }
      k++;
    }
    bodyMesh.count = roofMesh.count = k;
    bodyMesh.instanceMatrix.needsUpdate = roofMesh.instanceMatrix.needsUpdate = true; if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    lightPts.geometry.setDrawRange(0, li); lightPts.geometry.attributes.position.needsUpdate = true; lightPts.geometry.attributes.color.needsUpdate = true;
    // светофоры
    if (S.mpp < C.signalMpp) {
      const list = [];
      for (const n of TR.sig) {
        if (Math.abs(n.x - S.target.x) > ext || Math.abs(n.z - S.target.z) > ext) continue;
        if (!n.poles) {
          n.poles = [];
          for (const o of n.inl) { const e = o.e, [hx, hz] = endH(e, o.dir); n.poles.push({ x: n.x - hx * 7 - hz * (e.half + 1.4), z: n.z - hz * 7 + hx * (e.half + 1.4), ph: phaseFor(n.ctrl, hx, hz), y: e.y }); }
        }
        for (const p of n.poles) list.push(n, p);
      }
      ensureSignals(Math.max(64, list.length / 2 + 32));
      let j = 0;
      for (let i = 0; i < list.length; i += 2) {
        const n = list[i], p = list[i + 1];
        p3.set(p.x, p.y, p.z); s3.set(1, 1, 1); q4.identity(); m4.compose(p3, q4, s3);
        poleMesh.setMatrixAt(j, m4); headMesh.setMatrixAt(j, m4);
        const st = sigState(n.ctrl, p.ph, t), c = SIGC[st];
        headMesh.setColorAt(j, col.setRGB(c[0], c[1], c[2]));
        j++;
      }
      poleMesh.count = headMesh.count = j;
      poleMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = true; if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    }
  };
  TR.init = function () {
    T.onLoad.push(addTile);
    T.onUnload = T.onUnload || []; T.onUnload.push(removeTile);
  };
})();
