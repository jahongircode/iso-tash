// =====================================================================
//  3D-сцена (three.js): изометрическая камера, пиксель-арт постобработка,
//  солнце и тени, управление (мышь, тач, клавиатура).
//
//  Пиксель-арт получается так же, как в образце (isometric Warsaw):
//   1) сцена рендерится в текстуру пониженного разрешения (1 px = 2–3 px экрана);
//   2) шейдер рисует тёмный контур по скачкам глубины, сводит цвета к палитре
//      с упорядоченным дизерингом и растягивает картинку без сглаживания;
//   3) камера «привязана» к пиксельной сетке — при движении картинка не рябит.
// =====================================================================
(function () {
  const C = TPM.config;
  const S = TPM.scene = {
    target: new THREE.Vector3(0, 0, 0), mpp: C.start.mpp, az: 0, azT: 0, el: C.elevation * Math.PI / 180,
    px: 2, moving: false, lastMove: 0, time: 0, fps: 30, hooks: {},
  };
  let renderer, rt, camera, scene, post, postScene, postCam, sun, hemi, W = 0, H = 0, w = 0, h = 0;

  S.init = function (canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance", stencil: false });
    renderer.setPixelRatio(1);
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8c8870);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6a6450, 0.62);
    sun = new THREE.DirectionalLight(0xfff1dc, 0.95);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    scene.add(hemi, sun, sun.target);
    // постобработка
    post = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, thr: { value: 1 }, near: { value: 1 }, far: { value: 6000 }, levels: { value: 22 }, outline: { value: 0.55 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        precision highp float;
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float thr, near, far, levels, outline;
        varying vec2 vUv;
        float D(vec2 o){ return texture2D(tDepth, vUv + o / res).x * (far - near); }
        float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); float i = q.x + q.y * 4.0;
          return mod(i * 5.0 + floor(i / 4.0) * 3.0, 16.0) / 16.0; }
        void main(){
          vec2 uv = (floor(vUv * res) + 0.5) / res;
          vec3 c = texture2D(tColor, uv).rgb;
          float d = D(vec2(0.0));
          float e = max(max(D(vec2(1.0,0.0)), D(vec2(-1.0,0.0))), max(D(vec2(0.0,1.0)), D(vec2(0.0,-1.0)))) - d;
          // контур только на ближнем объекте (как карандашная обводка)
          if (e > thr && d < far - near - 1.0) c *= outline;
          // палитра + дизеринг
          float b = bayer(floor(vUv * res)) - 0.5;
          c = floor(c * levels + 0.5 + b * 0.7) / levels;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    postScene = new THREE.Scene();
    postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
    S.scene = scene; S.camera = camera; S.renderer = renderer; S.sun = sun; S.hemi = hemi;
    S.resize();
    window.addEventListener("resize", S.resize);
    initInput(canvas);
  };

  S.resize = function () {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, true);
    w = Math.ceil(W / S.px); h = Math.ceil(H / S.px);
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedIntType;
    post.uniforms.tColor.value = rt.texture; post.uniforms.tDepth.value = rt.depthTexture;
    post.uniforms.res.value.set(w, h);
    S.w = w; S.h = h; S.W = W; S.H = H;
  };
  S.setPixel = function (px) { if (px !== S.px) { S.px = px; S.resize(); } };
  S.setShadows = function (size) {
    renderer.shadowMap.enabled = size > 0;
    sun.castShadow = size > 0;
    if (size > 0) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  };

  // ---------------- камера ----------------
  const tmp = new THREE.Vector3();
  function camDir() {
    const a = S.az + Math.PI * 0.75; // по умолчанию камера на юго-западе, север — вверх-влево
    return tmp.set(Math.cos(a) * Math.cos(S.el), Math.sin(S.el), Math.sin(a) * Math.cos(S.el));
  }
  function updateCamera() {
    const hw = w * S.mpp / 2, hh = h * S.mpp / 2;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    const d = camDir();
    // дистанция камеры растёт с охватом, чтобы нижний край кадра не срезался ближней плоскостью
    const D = Math.max(2500, hh * 1.4 / Math.tan(S.el) + 900);
    camera.position.set(S.target.x + d.x * D, S.target.y + d.y * D, S.target.z + d.z * D);
    camera.lookAt(S.target);
    camera.near = 1; camera.far = D * 2 + 1500;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // привязка к пиксельной сетке (только когда не вращаем)
    if (Math.abs(S.az - S.azT) < 1e-4) {
      const R = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), U = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const pr = camera.position.dot(R), pu = camera.position.dot(U);
      const dr = Math.round(pr / S.mpp) * S.mpp - pr, du = Math.round(pu / S.mpp) * S.mpp - pu;
      camera.position.addScaledVector(R, dr).addScaledVector(U, du);
      camera.updateMatrixWorld();
    }
    post.uniforms.thr.value = S.mpp / Math.tan(S.el) * 1.6 + 0.35;
    post.uniforms.near.value = camera.near; post.uniforms.far.value = camera.far;
    // тень следует за видом
    const ext = Math.max(hw, hh) * 1.25 + 60;
    sun.target.position.copy(S.target);
    sun.position.copy(S.target).addScaledVector(S.sunDir || new THREE.Vector3(0.4, 0.8, 0.3), 1500);
    const sc = sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 3500; sc.updateProjectionMatrix(); }
  }
  S.updateCamera = updateCamera;

  // экран (CSS px) -> точка на земле
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  S.screenToGround = function (sx, sy, out) {
    ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // пересечение прямой (а не луча) с землёй: точка верна и для краёв кадра «за» ближней плоскостью
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    return (out || new THREE.Vector3()).set(o.x + d.x * t, 0, o.z + d.z * t);
  };
  S.raycaster = () => { ray.setFromCamera(ndc, camera); return ray; };
  S.setNdc = (sx, sy) => ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
  S.project = function (x, y, z, out) {
    tmp.set(x, y, z).project(camera);
    out = out || [0, 0]; out[0] = (tmp.x + 1) / 2 * W; out[1] = (1 - tmp.y) / 2 * H; return out;
  };
  // мировые точки углов экрана на земле (для подгрузки тайлов и мини-карты)
  S.viewQuad = function (pad = 0) {
    return [[-pad, -pad], [W + pad, -pad], [W + pad, H + pad], [-pad, H + pad]].map(([x, y]) => S.screenToGround(x, y));
  };

  // ---------------- ввод ----------------
  let fly = null, zoomT = null, zoomAnchor = null, drag = null, pinch = null, down = null, rotAnim = null;
  const vel = new THREE.Vector2();
  const ptrs = new Map();
  const mark = () => { S.moving = true; S.lastMove = performance.now(); };
  function clampView() {
    const b = C.boundsM;
    S.target.x = Math.min(b.e, Math.max(b.w, S.target.x)); S.target.z = Math.min(b.s, Math.max(b.n, S.target.z));
    S.mpp = Math.min(C.maxMpp, Math.max(C.minMpp, S.mpp));
  }
  function zoomAt(newMpp, sx, sy) {
    const before = S.screenToGround(sx, sy);
    S.mpp = Math.min(C.maxMpp, Math.max(C.minMpp, newMpp));
    updateCamera();
    const after = S.screenToGround(sx, sy);
    if (before && after) { S.target.x += before.x - after.x; S.target.z += before.z - after.z; }
    clampView(); mark();
  }
  S.zoomBy = (f, sx, sy) => { fly = null; zoomT = Math.min(C.maxMpp, Math.max(C.minMpp, (zoomT || S.mpp) * f)); zoomAnchor = [sx ?? W / 2, sy ?? H / 2]; };
  S.rotate = (d) => { S.azT += d * Math.PI / 2; mark(); };
  function panScreen(dx, dy) {
    const a = S.screenToGround(W / 2, H / 2), b = S.screenToGround(W / 2 + dx, H / 2 + dy);
    if (a && b) { S.target.x -= b.x - a.x; S.target.z -= b.z - a.z; }
    clampView(); mark();
  }
  function initInput(el) {
    const loc = (e) => [e.clientX, e.clientY];
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, loc(e));
      fly = null; zoomT = null; vel.set(0, 0);
      if (ptrs.size === 1) { drag = { last: loc(e), t: performance.now() }; down = { p: loc(e), t: performance.now(), moved: 0 }; }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: S.mpp }; drag = null; down = null; }
    });
    el.addEventListener("pointermove", (e) => {
      const p = loc(e);
      if (!ptrs.has(e.pointerId)) { S.hooks.hover && S.hooks.hover(p[0], p[1]); return; }
      ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; zoomAt(pinch.m * pinch.d / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
      if (drag) {
        const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
        panScreen(dx, dy);
        const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
        vel.set(vel.x * 0.6 + dx / dt * 0.4, vel.y * 0.6 + dy / dt * 0.4);
        drag.last = p; drag.t = now;
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (down && ptrs.size === 0) {
        if (down.moved < 8 && performance.now() - down.t < 500 && S.hooks.tap) S.hooks.tap(down.p[0], down.p[1]);
        if (drag && performance.now() - drag.t > 80) vel.set(0, 0);
      }
      if (ptrs.size === 0) { drag = null; down = null; }
      else if (ptrs.size === 1) drag = { last: [...ptrs.values()][0], t: performance.now() };
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const d = Math.sign(e.deltaY) * Math.min(1.5, Math.abs(e.deltaY) / (e.deltaMode ? 3 : 120));
      S.zoomBy(Math.pow(1.35, d), e.clientX, e.clientY);
    }, { passive: false });
    el.addEventListener("dblclick", (e) => S.zoomBy(0.5, e.clientX, e.clientY));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = e.key.toLowerCase(), st = 90;
      if (k === "+" || k === "=") S.zoomBy(0.7);
      else if (k === "-") S.zoomBy(1.4);
      else if (k === "q" || k === "й") S.rotate(-1);
      else if (k === "e" || k === "у") S.rotate(1);
      else if (k === "arrowleft" || k === "a" || k === "ф") panScreen(st, 0);
      else if (k === "arrowright" || k === "d" || k === "в") panScreen(-st, 0);
      else if (k === "arrowup" || k === "w" || k === "ц") panScreen(0, st);
      else if (k === "arrowdown" || k === "s" || k === "ы") panScreen(0, -st);
    });
  }
  S.flyTo = function (x, z, mpp, dur) {
    const dist = Math.hypot(x - S.target.x, z - S.target.z);
    fly = { x0: S.target.x, z0: S.target.z, m0: S.mpp, x1: x, z1: z, m1: mpp || S.mpp, t0: S.time, dur: dur || Math.min(2.4, 0.9 + dist / 4000),
      bump: Math.min(1.8, 1 + dist / (W * S.mpp) * 0.5) };
    zoomT = null; vel.set(0, 0);
  };
  S.isFlying = () => !!fly;
  S.flyProgress = () => fly ? (S.time - fly.t0) / fly.dur : 1;
  S.jumpTo = (x, z, mpp) => { fly = null; S.target.x = x; S.target.z = z; if (mpp) S.mpp = mpp; mark(); };

  function step(dt) {
    if (fly) {
      let t = Math.min(1, (S.time - fly.t0) / fly.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      S.target.x = fly.x0 + (fly.x1 - fly.x0) * e; S.target.z = fly.z0 + (fly.z1 - fly.z0) * e;
      const lm = Math.log(fly.m0) + (Math.log(fly.m1) - Math.log(fly.m0)) * e + Math.log(fly.bump) * Math.sin(Math.PI * e);
      S.mpp = Math.exp(lm);
      if (t >= 1) fly = null;
      clampView(); mark();
    } else {
      if (zoomT !== null) {
        const nm = Math.abs(zoomT / S.mpp - 1) < 0.004 ? zoomT : Math.exp(Math.log(S.mpp) + (Math.log(zoomT) - Math.log(S.mpp)) * Math.min(1, dt * 12));
        zoomAt(nm, zoomAnchor[0], zoomAnchor[1]);
        if (nm === zoomT) zoomT = null;
      }
      if (!drag && vel.length() > 20) { panScreen(vel.x * dt, vel.y * dt); vel.multiplyScalar(Math.pow(0.03, dt)); }
    }
    if (Math.abs(S.azT - S.az) > 1e-4) { S.az += (S.azT - S.az) * Math.min(1, dt * 7); if (Math.abs(S.azT - S.az) < 0.002) S.az = S.azT; mark(); }
    if (performance.now() - S.lastMove > 160) S.moving = false;
  }
  S.settled = () => !S.moving && !fly && zoomT === null && !drag;

  // ---------------- цикл ----------------
  let last = 0, lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (S.paused || now - last < 1000 / S.fps - 1) return;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    last = now; lastT = now; S.time += dt;
    step(dt);
    updateCamera();
    S.hooks.frame && S.hooks.frame(dt);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    S.hooks.after && S.hooks.after(dt);
  }
  S.start = () => { updateCamera(); requestAnimationFrame(frame); };
  S.renderOnce = () => { updateCamera(); renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(postScene, postCam); };
})();
