// =====================================================================
//  Тайлы города (1,8 × 1,8 км): загрузка, 3D-меши, выгрузка дальних.
// =====================================================================
(function () {
  const C = TPM.config, S = TPM.scene;
  const T = TPM.tiles = { index: null, loaded: new Map(), uNight: { value: 0 }, uTime: { value: 0 }, uWin: { value: 1 }, onLoad: [] };
  const Z = 14, SIZE = 256 / Math.pow(2, Z);
  const gx = (lng) => (lng + 180) / 360 * 256;
  const gy = (lat) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256; };
  let MPU, WX0, WY0, TILE_M;

  // ---------- координаты ----------
  T.ll2m = (lat, lng) => [(gx(lng) - WX0) * MPU, (gy(lat) - WY0) * MPU];
  T.m2ll = (x, z) => { const wx = x / MPU + WX0, wy = z / MPU + WY0; const n = Math.PI - 2 * Math.PI * wy / 256; return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), wx / 256 * 360 - 180]; };
  const tileOrigin = (x, y) => [(x * SIZE - WX0) * MPU, (y * SIZE - WY0) * MPU];
  T.tileAt = (mx, mz) => [Math.floor((mx / MPU + WX0) / SIZE), Math.floor((mz / MPU + WY0) / SIZE)];

  window.TPM_INDEX = function (idx) {
    T.index = idx; MPU = idx.mpu; TILE_M = idx.tileM;
    WX0 = gx(idx.origin[1]); WY0 = gy(idx.origin[0]);
    T.have = new Set(idx.tiles.map((t) => t[0] + "_" + t[1]));
    T.MPU = MPU; T.TILE_M = TILE_M;
  };
  const waiting = new Map();
  window.TPM_TILE = function (x, y, b64) { const k = x + "_" + y, w = waiting.get(k); if (w) { waiting.delete(k); w(b64); } };
  function loadScript(k) {
    return new Promise((res, rej) => {
      waiting.set(k, res);
      const s = document.createElement("script");
      s.src = "data/t/" + k + ".js"; s.async = true;
      s.onload = () => s.remove(); s.onerror = () => { waiting.delete(k); s.remove(); rej(new Error("load " + k)); };
      document.head.appendChild(s);
    });
  }

  // ---------- воркеры ----------
  let workers = [], wi = 0, nid = 1; const cbs = new Map();
  function makeWorkers() {
    const src = window.EARCUT_SRC + "\n;(" + window.TPM_GEO_WORKER.toString() + ")();";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) { const w = new Worker(url); w.onmessage = (e) => { const cb = cbs.get(e.data.id); cbs.delete(e.data.id); cb && cb(e.data); }; workers.push(w); }
  }
  const build = (b64, o) => new Promise((res) => { const id = nid++; cbs.set(id, res); workers[wi++ % workers.length].postMessage({ id, b64, tileM: TILE_M, skipBld: false, ...o }); });

  // ---------- материалы ----------
  const M = {};
  function makeMaterials() {
    M.ground = new THREE.MeshLambertMaterial({ vertexColors: true });
    M.roads = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    // мелкая фактура: шум по мировой сетке 1,2 м (трава, асфальт, плитка)
    const grain = (mat, amt) => {
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;");
        sh.fragmentShader = "varying vec3 vWP;\n" + sh.fragmentShader.replace("#include <color_fragment>",
          `#include <color_fragment>
           vec2 cell = floor(vWP.xz / 1.2);
           float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
           float n2 = fract(sin(dot(floor(vWP.xz / 4.0), vec2(39.3468, 11.1352))) * 24634.6345);
           diffuseColor.rgb *= 1.0 + (n - 0.5) * ${amt} + (n2 - 0.5) * ${amt * 0.6};`);
      };
    };
    grain(M.ground, 0.11); grain(M.roads, 0.07);
    M.ground.customProgramCacheKey = () => "grain-g"; M.roads.customProgramCacheKey = () => "grain-r";
    M.water = new THREE.MeshLambertMaterial({ vertexColors: true });
    M.water.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.uTime;
      sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = "uniform float uTime; varying vec3 vWP;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        `#include <color_fragment>
         float wv = sin(vWP.x * 0.21 + uTime * 1.3) * sin(vWP.z * 0.17 - uTime * 0.9) + sin((vWP.x + vWP.z) * 0.07 + uTime * 0.6);
         diffuseColor.rgb *= 0.92 + 0.1 * step(1.15, wv) + 0.06 * step(0.6, wv);`);
    };
    M.bld = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    M.bld.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = T.uNight; sh.uniforms.uWin = T.uWin;
      sh.vertexShader = "attribute vec2 wuv; varying vec2 vWuv;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWuv = wuv;");
      sh.fragmentShader = "uniform float uNight; uniform float uWin; varying vec2 vWuv;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `
          float winLit = 0.0;
          float wid = vColor.a;
          diffuseColor.rgb *= vColor.rgb;
          if (vWuv.y >= 0.0 && wid < 0.99) {
            float u = vWuv.x / 4.0, v = vWuv.y / 10.0;
            float fv = fract(v / 3.1), fu = fract(u / 3.0);
            if (fv > 0.34 && fv < 0.8 && fu > 0.22 && fu < 0.72 && v > 0.9) {
              float h = fract(sin(dot(vec3(floor(v / 3.1), floor(u / 3.0), wid * 997.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
              vec3 glass = mix(vec3(0.22, 0.27, 0.33), vec3(0.45, 0.55, 0.62), step(0.72, h));
              diffuseColor.rgb = mix(diffuseColor.rgb, glass, 0.8 * uWin * (1.0 - uNight * 0.6));
              winLit = step(h, 0.4);
            }
          }`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += winLit * uNight * vec3(1.0, 0.76, 0.42) * 0.95;");
    };
    M.tree = new THREE.MeshLambertMaterial({ vertexColors: true });
    M.lamp = new THREE.PointsMaterial({ color: 0xfff0c0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const hc = document.createElement("canvas"); hc.width = hc.height = 32;
    const hx = hc.getContext("2d"), gr = hx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    hx.fillStyle = gr; hx.fillRect(0, 0, 32, 32);
    M.halo = new THREE.PointsMaterial({ color: 0xffb860, size: 12, map: new THREE.CanvasTexture(hc), sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    T.M = M;
  }

  // ---------- деревья ----------
  let treeGeo, coneGeo, treeLo, coneLo;
  function treeGeometries() {
    const canopy = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
    canopy.scale(1, 0.95, 1); canopy.translate(0, 1.55, 0);
    const trunk = new THREE.CylinderGeometry(0.11, 0.15, 1.0, 5, 1, true).toNonIndexed(); trunk.translate(0, 0.5, 0);
    treeGeo = merge([[canopy, [1, 1, 1]], [trunk, [0.42, 0.33, 0.25]]]);
    const cone = new THREE.ConeGeometry(0.75, 2.2, 6).toNonIndexed(); cone.translate(0, 1.6, 0);
    const tr2 = trunk.clone();
    coneGeo = merge([[cone, [1, 1, 1]], [tr2, [0.42, 0.33, 0.25]]]);
    // упрощённые кроны для среднего плана: 8 и 4 треугольника вместо ~40
    const lo = new THREE.OctahedronGeometry(1, 0).toNonIndexed(); lo.scale(1, 0.95, 1); lo.translate(0, 1.55, 0);
    treeLo = merge([[lo, [1, 1, 1]]]);
    const cl = new THREE.ConeGeometry(0.75, 2.4, 4, 1, true).toNonIndexed(); cl.translate(0, 1.5, 0);
    coneLo = merge([[cl, [1, 1, 1]]]);
  }
  function merge(list) {
    let n = 0; for (const [g] of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const [g, c] of list) {
      g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < g.attributes.position.count; i++) col.set(c, (o + i) * 3);
      o += g.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }
  const month = new Date().getMonth();
  T.season = month <= 1 || month === 11 ? "winter" : month <= 3 ? "spring" : month <= 8 ? "summer" : "autumn";
  const SEASON = {
    summer: [[0.36, 0.52, 0.24], [0.42, 0.58, 0.27], [0.31, 0.47, 0.22], [0.46, 0.6, 0.3]],
    autumn: [[0.36, 0.52, 0.24], [0.72, 0.52, 0.2], [0.82, 0.62, 0.22], [0.62, 0.36, 0.18], [0.42, 0.55, 0.26], [0.78, 0.7, 0.3]],
    winter: [[0.42, 0.37, 0.33], [0.38, 0.34, 0.31], [0.47, 0.42, 0.37]],
    spring: [[0.46, 0.62, 0.3], [0.52, 0.66, 0.32], [0.9, 0.76, 0.8], [0.95, 0.9, 0.88]],
  }[T.season];
  const CONIFER = [0.2, 0.38, 0.24];
  function makeTrees(tr, ox, oz) {
    const n = tr.length / 3;
    let nb = 0, nc = 0;
    const kinds = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const r = tr[i * 3 + 2]; const c = r < 1 && ((r * 7919) % 1) < 0.1 ? 1 : 0; kinds[i] = c; c ? nc++ : nb++; }
    const mb = new THREE.InstancedMesh(treeGeo, M.tree, nb), mc = new THREE.InstancedMesh(coneGeo, M.tree, Math.max(1, nc));
    mc.count = nc;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let ib = 0, ic = 0;
    const winter = T.season === "winter";
    for (let i = 0; i < n; i++) {
      const r = tr[i * 3 + 2], f = r % 1, poplar = r >= 2;
      const hgt = poplar ? 13 + f * 8 : 6 + f * 7.5;
      p.set(tr[i * 3], 0.1, tr[i * 3 + 1]);
      q.setFromAxisAngle(up, f * 6.28);
      if (kinds[i]) {
        s.set(hgt / 3.4, hgt / 2.7, hgt / 3.4);
        m.compose(p, q, s); mc.setMatrixAt(ic, m); c.setRGB(CONIFER[0] * (0.9 + f * 0.2), CONIFER[1] * (0.9 + f * 0.2), CONIFER[2]); mc.setColorAt(ic++, c);
      } else {
        const w = poplar ? 1.5 + f * 0.8 : hgt * (0.3 + ((f * 7) % 1) * 0.1) * (winter ? 0.75 : 1);
        s.set(w, poplar ? hgt / 2.55 : hgt / 2.55, w);
        m.compose(p, q, s); mb.setMatrixAt(ib, m);
        const sc = SEASON[Math.floor(f * 997) % SEASON.length]; const k = 0.9 + ((f * 131) % 1) * 0.2;
        c.setRGB(sc[0] * k, sc[1] * k, sc[2] * k); mb.setColorAt(ib++, c);
      }
    }
    for (const mm of [mb, mc]) { mm.position.set(ox, 0, oz); mm.castShadow = true; mm.receiveShadow = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; mm.instanceMatrix.needsUpdate = true; }
    // те же экземпляры, но простая геометрия и без теней — для среднего плана
    const lb = new THREE.InstancedMesh(treeLo, M.tree, nb), lc = new THREE.InstancedMesh(coneLo, M.tree, Math.max(1, nc));
    lb.instanceMatrix = mb.instanceMatrix; lb.instanceColor = mb.instanceColor; lc.instanceMatrix = mc.instanceMatrix; lc.instanceColor = mc.instanceColor; lc.count = nc;
    for (const mm of [lb, lc]) { mm.position.set(ox, 0, oz); mm.castShadow = false; mm.receiveShadow = true; }
    for (const mm of [mb, mc, lb, lc]) mm.frustumCulled = false; // в r149 у InstancedMesh общий bounding sphere — отсекаем тайлами
    return [mb, mc, lb, lc];
  }

  function mesh(g, mat, ox, oz, opts = {}) {
    if (!g.i.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(g.p, 3));
    geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(g.n, 4), 3, 0, true));
    geo.setAttribute("color", new THREE.BufferAttribute(g.c, 4, true));
    if (g.e) geo.setAttribute("wuv", new THREE.BufferAttribute(g.e, 2, false));
    geo.setIndex(new THREE.BufferAttribute(g.i, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(ox, 0, oz);
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.receiveShadow = true; m.castShadow = !!opts.cast;
    return m;
  }

  // ---------- загрузка и уровни детализации (LOD) ----------
  // Каждый тайл может иметь два представления:
  //   LOD 0 — полный 3D (земля, дороги с разметкой, все дома, деревья, фонари);
  //   LOD 2 — «дальний план»: вся земля, дороги, кроны и низкие дома запечены
  //           в одну текстуру с нарисованными тенями (1 квадрат = 2 треугольника),
  //           3D остаются только высокие здания. Так делают в играх (impostor).
  // Уровень выбирается по масштабу с гистерезисом; пока новый уровень строится,
  // виден старый — дыр при переключении нет.
  let inflight = 0;
  const queue = [], applyQ = [];
  T.lod = 0;
  const lodFor = () => {
    if (T.noFar) return 0;
    const fm = C.farMpp;
    if (T.lod === 2) return S.mpp < fm * 0.86 ? 0 : 2;
    return S.mpp > fm ? 2 : 0;
  };
  function newRec(k) {
    const [x, y] = k.split("_").map(Number);
    const [ox, oz] = tileOrigin(x, y);
    const rec = { k, x, y, ox, oz, state: "new", used: performance.now(), b64: null, lods: {}, busy: {}, shown: -1 };
    T.loaded.set(k, rec);
    return rec;
  }
  const treePalCss = () => SEASON.map((c) => "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")");
  async function buildLod(rec, lod) {
    rec.busy[lod] = true; inflight++;
    let queued = false;
    try {
      if (!rec.b64) {
        const t0 = performance.now();
        rec.b64 = await loadScript(rec.k);
        rec.timing = [Math.round(performance.now() - t0)];
      }
      if (rec.state === "dead") return;
      const Q = TPM.city.Q;
      const t1 = performance.now();
      const r = await build(rec.b64, { lod, res: Q.farRes || 512, tallH: Q.tallH || 11, treePal: treePalCss() });
      if (rec.timing) { rec.timing[1] = Math.round(performance.now() - t1); rec.prof = r.prof; }
      if (r.noRaster) { T.noFar = true; return; }
      if (r.error) throw new Error(r.error);
      if (rec.state === "dead") return;
      applyQ.push([rec, lod, r]); queued = true; // busy снимется при создании мешей (иначе тайл заказали бы повторно)
    } catch (e) {
      console.warn("tile", rec.k, e); if (rec.state === "new") rec.state = "fail";
    } finally { if (!queued) rec.busy[lod] = false; inflight--; pump(); }
  }
  // создание мешей — в кадре, с бюджетом по времени (без подвисаний при массовой подгрузке)
  T.applyPending = function () {
    const t0 = performance.now();
    while (applyQ.length && (performance.now() - t0 < 6 || !T.loaded.size)) {
      const [rec, lod, r] = applyQ.shift();
      rec.busy[lod] = false;
      if (rec.state === "dead" || rec.lods[lod]) continue;
      const L = { objs: [], used: performance.now() };
      const add = (o) => { if (o) { o.visible = false; S.scene.add(o); L.objs.push(o); } };
      const { ox, oz } = rec;
      if (lod === 2) {
        const R = Math.sqrt(r.tex.length / 4);
        const tex = new THREE.DataTexture(r.tex, R, R, THREE.RGBAFormat);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; tex.anisotropy = 4; tex.generateMipmaps = true; tex.needsUpdate = true;
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        mat.onBeforeCompile = farShader; mat.customProgramCacheKey = () => "far";
        const g = new THREE.BufferGeometry(), Tm = TILE_M;
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, Tm, 0, 0, Tm, 0, Tm, 0, 0, Tm]), 3));
        g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
        g.setIndex([0, 2, 1, 0, 3, 2]); g.computeBoundingSphere();
        const q = new THREE.Mesh(g, mat); q.position.set(ox, 0, oz); q.matrixAutoUpdate = false; q.updateMatrix(); q.receiveShadow = true;
        L.tex = tex; L.mat = mat; add(q);
        add(mesh(r.bld, M.bld, ox, oz, { cast: true }));
      } else {
        add(mesh(r.ground, M.ground, ox, oz));
        add(mesh(r.water, M.water, ox, oz));
        add(mesh(r.roads, M.roads, ox, oz));
        add(mesh(r.bld, M.bld, ox, oz, { cast: true }));
        if (r.trees && r.trees.length) { L.trees = makeTrees(r.trees, ox, oz); L.trees.forEach(add); }
      }
      if (r.lamps.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(r.lamps, 3));
        const p = new THREE.Points(g, M.lamp); p.position.set(ox, 0, oz); p.frustumCulled = false; add(p);
        const hl = new THREE.Points(g, M.halo); hl.position.set(ox, -4, oz); hl.frustumCulled = false; add(hl);
      }
      rec.lods[lod] = L;
      if (rec.state === "new") {
        rec.lines = r.lines; rec.signals = r.signals; rec.places = r.places.map((p) => ({ ...p, x: p.x + ox, z: p.z + oz }));
        rec.bcount = r.bcount; rec.state = "ok";
        for (const fn of T.onLoad) fn(rec);
      }
      rec.shown = -1; // пересчитать видимость
      T.dirty = true;
    }
  };
  function farShader(sh) {
    sh.uniforms.uNight = T.uNight;
    sh.fragmentShader = "uniform float uNight;\n" + sh.fragmentShader.replace("#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 tx = texture2D(map, vUv);
        diffuseColor.rgb *= tx.rgb * (1.0 - tx.a * 0.46 * (1.0 - uNight * 0.75));
      #endif`);
  }
  function pump() {
    while (inflight < 4 && queue.length) {
      const [k, lod] = queue.shift();
      let rec = T.loaded.get(k);
      if (!rec) rec = newRec(k);
      if (rec.state === "fail" || rec.lods[lod] || rec.busy[lod]) continue;
      buildLod(rec, lod);
    }
  }
  function disposeLod(rec, lod) {
    const L = rec.lods[lod]; if (!L) return;
    for (const o of L.objs) {
      S.scene.remove(o);
      if (o.geometry && o.geometry !== treeGeo && o.geometry !== coneGeo && o.geometry !== treeLo && o.geometry !== coneLo) o.geometry.dispose();
    }
    if (L.tex) L.tex.dispose(); if (L.mat) L.mat.dispose();
    delete rec.lods[lod];
  }
  function unload(rec) {
    rec.state = "dead";
    for (const l of Object.keys(rec.lods)) disposeLod(rec, +l);
    T.loaded.delete(rec.k);
    for (const fn of T.onUnload || []) fn(rec);
  }
  function setShown(rec, lod, treeMode) {
    if (rec.shown === lod && rec.treeMode === treeMode) return;
    for (const l in rec.lods) {
      const L = rec.lods[l], on = +l === lod;
      for (const o of L.objs) o.visible = on;
      if (L.trees) { // 0 — нет, 1 — простые кроны, 2 — полные без теней, 3 — полные с тенями
        for (let i = 0; i < 2; i++) { L.trees[i].visible = on && treeMode >= 2; L.trees[i].castShadow = treeMode === 3; }
        L.trees[2].visible = on && treeMode === 1; L.trees[3].visible = on && treeMode === 1;
      }
    }
    rec.shown = lod; rec.treeMode = treeMode;
  }

  // какие тайлы нужны сейчас
  let lastUpd = 0;
  T.update = function () {
    if (!T.index) return;
    T.applyPending();
    const now = performance.now();
    if (now - lastUpd < 200 && !T.dirty) return;
    if (S.isFlying() && S.flyProgress() < 0.85) return; // не грузим промежуточные кварталы во время перелёта
    lastUpd = now; T.dirty = false;
    const q = S.viewQuad(120).filter(Boolean);
    if (q.length < 4) return;
    const lod = T.lod = lodFor();
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const v of q) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
    const [tx0, ty0] = T.tileAt(x0, z0), [tx1, ty1] = T.tileAt(x1, z1);
    const cx = S.target.x, cz = S.target.z, want = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const k = x + "_" + y; if (!T.have.has(k)) continue;
      const [ox, oz] = tileOrigin(x, y);
      if (!quadHitsRect(q, ox, oz, ox + TILE_M, oz + TILE_M)) continue;
      want.push([k, Math.hypot(ox + TILE_M / 2 - cx, oz + TILE_M / 2 - cz)]);
    }
    want.sort((a, b) => a[1] - b[1]);
    const wanted = new Set(want.map((w) => w[0]));
    queue.length = 0;
    for (const [k] of want) {
      const r = T.loaded.get(k);
      if (r) { r.used = now; if (r.lods[lod]) r.lods[lod].used = now; }
      if (!r || (!r.lods[lod] && !r.busy[lod] && r.state !== "fail")) queue.push([k, lod]);
    }
    pump();
    // выгрузка: дальних тайлов можно держать больше — они дешёвые
    const Q = TPM.city.Q, max = lod === 2 ? (Q.farTiles || 40) : Q.maxTiles;
    const recs = [...T.loaded.values()].filter((r) => r.state === "ok" && !wanted.has(r.k)).sort((a, b) => a.used - b.used);
    let total = T.loaded.size;
    for (const r of recs) { if (total <= max) break; if (now - r.used > 2500) { unload(r); total--; } }
    // видимость; ненужный уровень детализации освобождаем через 8 с
    const tm = S.mpp >= (Q.treeMpp || C.treeMpp) ? 0 : S.mpp >= C.treeLodMpp ? 1 : S.mpp >= C.treeShadowMpp ? 2 : 3;
    for (const r of T.loaded.values()) {
      if (r.state !== "ok") continue;
      const show = !wanted.has(r.k) ? -1 : r.lods[lod] ? lod : r.lods[2 - lod] ? 2 - lod : -1;
      setShown(r, show, tm);
      if (show >= 0) r.lods[show].used = now;
      for (const l in r.lods) if (+l !== show && now - r.lods[l].used > 8000 && !(wanted.has(r.k) && +l === lod)) { disposeLod(r, +l); r.shown = -2; }
    }
    T.wanted = wanted;
  };
  function quadHitsRect(q, x0, z0, x1, z1) {
    // разделяющие оси: оси прямоугольника + рёбра четырёхугольника
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const v of q) { a = Math.min(a, v.x); b = Math.max(b, v.x); c = Math.min(c, v.z); d = Math.max(d, v.z); }
    if (b < x0 || a > x1 || d < z0 || c > z1) return false;
    const R = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const p = q[i], n = q[(i + 1) % 4], ex = n.x - p.x, ez = n.z - p.z, nx = -ez, nz = ex;
      let inside = false;
      for (const [rx, rz] of R) if ((rx - p.x) * nx + (rz - p.z) * nz >= 0) { inside = true; break; }
      // ориентация четырёхугольника неизвестна — проверим обе стороны
      let other = false;
      for (const [rx, rz] of R) if ((rx - p.x) * nx + (rz - p.z) * nz <= 0) { other = true; break; }
      if (!inside || !other) { // весь прямоугольник по одну сторону ребра — проверим, наружу ли это
        const qc = q[(i + 2) % 4], side = (qc.x - p.x) * nx + (qc.z - p.z) * nz;
        const rs = (R[0][0] - p.x) * nx + (R[0][1] - p.z) * nz;
        if (side * rs < 0) return false;
      }
    }
    return true;
  }
  T.isBusy = () => inflight > 0 || queue.length > 0 || applyQ.length > 0;

  T.init = function () { makeMaterials(); treeGeometries(); makeWorkers(); };
})();
