// =====================================================================
//  Движок карты: изометрическая камера, тайлы, кэш слоёв, ввод, цикл кадров.
//
//  Всё рисуется в ОДИН canvas пониженного разрешения (1 пиксель canvas = px
//  CSS-пикселей), который растягивается без сглаживания. Это даёт честный
//  пиксель-арт и экономит заливку пикселей на слабых устройствах.
//
//  Изометрия: мировая точка (x — восток, y — юг) переводится на экран так:
//      X = k·(dx + dy) + W/2,   Y = k/2·(dy − dx) + H/2
//  т.е. карта повёрнута на 45° и сжата по вертикали вдвое (как в референсах).
// =====================================================================
(function () {
  const C = TPM.config, geo = TPM.geo;
  const A = Math.SQRT1_2;

  const E = TPM.engine = {
    canvas: null, ctx: null, W: 0, H: 0, px: 2,
    cam: { x: geo.x(C.start.lng), y: geo.y(C.start.lat), z: C.start.zoom },
    k: 1, g: 1, // k — экранных пикселей на мировую единицу, g — пикселей на метр
    time: 0, // секунды с начала
    moving: false, lastMove: 0,
    tileStyle: "pixel",
    hooks: { tap: null, frame: null, hover: null },
  };

  // ---------------- проекция ----------------
  function updateK() {
    E.k = A * Math.pow(2, E.cam.z) / E.px;
    E.g = E.k / geo.MPU;
  }
  E.project = (wx, wy, out) => {
    const dx = wx - E.cam.x, dy = wy - E.cam.y, k = E.k;
    out = out || [0, 0];
    out[0] = k * (dx + dy) + E.W / 2;
    out[1] = k * 0.5 * (dy - dx) + E.H / 2;
    return out;
  };
  E.unproject = (X, Y) => {
    const u = (X - E.W / 2) / E.k, v = 2 * (Y - E.H / 2) / E.k;
    return [E.cam.x + (u - v) / 2, E.cam.y + (u + v) / 2];
  };
  E.screenDelta = (dX, dY) => { // экранное смещение -> мировое
    const u = dX / E.k, v = 2 * dY / E.k;
    return [(u - v) / 2, (u + v) / 2];
  };

  // ---------------- canvas и размеры ----------------
  E.init = function (canvas) {
    E.canvas = canvas;
    E.ctx = canvas.getContext("2d", { alpha: false });
    E.resize();
    window.addEventListener("resize", () => { E.resize(); });
    initInput(canvas);
  };
  E.resize = function () {
    const host = E.canvas.parentElement;
    const w = host.clientWidth, h = host.clientHeight;
    E.W = Math.ceil(w / E.px); E.H = Math.ceil(h / E.px);
    E.canvas.width = E.W; E.canvas.height = E.H;
    E.canvas.style.width = E.W * E.px + "px";
    E.canvas.style.height = E.H * E.px + "px";
    E.ctx.imageSmoothingEnabled = false;
    updateK();
    for (const c of caches) c.invalidate();
  };
  E.setPixelSize = function (px) { if (px !== E.px) { E.px = px; E.resize(); } };

  // ---------------- границы ----------------
  const BX0 = geo.x(C.bounds.w), BX1 = geo.x(C.bounds.e), BY0 = geo.y(C.bounds.n), BY1 = geo.y(C.bounds.s);
  function clampCam() {
    const c = E.cam;
    c.x = Math.min(BX1, Math.max(BX0, c.x));
    c.y = Math.min(BY1, Math.max(BY0, c.y));
    c.z = Math.min(C.maxZoom, Math.max(C.minZoom, c.z));
  }

  // =====================================================================
  //  ТАЙЛЫ
  // =====================================================================
  const tiles = new Map(); // key -> {img, ok, fail}
  let queue = [], loading = 0;
  const MAX_TILES = 260, CONC = 8;

  function tileURL(st, z, x, y) {
    const s = st.sub ? st.sub[(x + y) % st.sub.length] : "";
    return st.url.replace("{s}", s).replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }
  function getTile(key) {
    const t = tiles.get(key);
    if (t) { tiles.delete(key); tiles.set(key, t); } // LRU
    return t;
  }
  function pump() {
    while (loading < CONC && queue.length) {
      const key = queue.shift();
      if (tiles.has(key)) continue;
      const [sty, z, x, y] = key.split("/");
      const st = C.tiles[sty];
      const img = new Image();
      const t = { img, ok: false };
      tiles.set(key, t);
      loading++;
      img.onload = () => { t.ok = true; loading--; ground.dirty = true; pump(); };
      img.onerror = () => { t.fail = true; loading--; pump(); };
      img.src = tileURL(st, +z, +x, +y);
    }
    if (tiles.size > MAX_TILES) {
      for (const [k, t] of tiles) {
        if (tiles.size <= MAX_TILES) break;
        if (t.ok || t.fail) tiles.delete(k);
      }
    }
  }

  function drawTiles(ctx, view) {
    const st = C.tiles[E.tileStyle] || C.tiles.pixel;
    ctx.fillStyle = st.bg;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, view.W, view.H);
    let tz = Math.round(view.z + Math.log2(A / view.px) + 0.35);
    tz = Math.max(3, Math.min(st.maxZ, tz));
    const n = 1 << tz, size = 256 / n;
    // мировой bbox видимой области
    const corners = [[0, 0], [view.W, 0], [0, view.H], [view.W, view.H]].map(([X, Y]) => {
      const u = (X - view.W / 2) / view.k, v = 2 * (Y - view.H / 2) / view.k;
      return [view.x + (u - v) / 2, view.y + (u + v) / 2];
    });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of corners) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const tx0 = Math.floor(x0 / size), tx1 = Math.floor(x1 / size), ty0 = Math.floor(y0 / size), ty1 = Math.floor(y1 / size);
    const k = view.k;
    ctx.setTransform(k, -k / 2, k, k / 2, view.W / 2, view.H / 2);
    const need = [];
    const eps = size * 0.006;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        // отсечение по ромбу: центр тайла на экране
        const dx = (tx + 0.5) * size - view.x, dy = (ty + 0.5) * size - view.y;
        const X = k * (dx + dy) + view.W / 2, Y = k * 0.5 * (dy - dx) + view.H / 2;
        const R = k * size * 1.1;
        if (X < -R || X > view.W + R || Y < -R || Y > view.H + R) continue;
        const key = E.tileStyle + "/" + tz + "/" + tx + "/" + ty;
        const t = getTile(key);
        const ox = tx * size - view.x, oy = ty * size - view.y;
        if (t && t.ok) {
          ctx.drawImage(t.img, ox, oy, size + eps, size + eps);
          continue;
        }
        if (!t) need.push([key, (X - view.W / 2) ** 2 + (Y - view.H / 2) ** 2]);
        // пока грузится — растягиваем родительский тайл
        for (let d = 1; d <= 5 && tz - d >= 0; d++) {
          const pk = E.tileStyle + "/" + (tz - d) + "/" + (tx >> d) + "/" + (ty >> d);
          const p = tiles.get(pk);
          if (p && p.ok) {
            const f = 1 << d, sub = 256 / f;
            ctx.drawImage(p.img, (tx - ((tx >> d) << d)) * sub, (ty - ((ty >> d) << d)) * sub, sub, sub, ox, oy, size + eps, size + eps);
            break;
          }
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (need.length) {
      need.sort((a, b) => a[1] - b[1]);
      queue = need.map((n) => n[0]);
      pump();
    } else queue = [];
  }

  // =====================================================================
  //  КЭШ СЛОЁВ: статичный слой рисуется один раз во внеэкранный canvas
  //  с запасом по краям и потом только сдвигается/масштабируется.
  // =====================================================================
  const caches = [];
  class LayerCache {
    // opts.layers — сколько canvas рисуется одним проходом (например, дома + ночные огни)
    constructor(renderFn, opts = {}) {
      this.render = renderFn;
      this.margin = opts.margin ?? 0.35;
      this.alpha = opts.alpha ?? true;
      this.n = opts.layers || 1;
      this.budget = opts.budget || 7; // мс на кадр для отрисовки по частям
      const mk = () => Array.from({ length: this.n }, () => { const c = document.createElement("canvas"); return { c, x: c.getContext("2d", { alpha: this.alpha }) }; });
      this.front = mk(); this.back = mk();
      this.view = null; this.dirty = true; this.lastRender = 0; this.enabled = true; this.job = null;
      caches.push(this);
    }
    get canvas() { return this.front[0].c; }
    invalidate() { this.view = null; this.dirty = true; this.job = null; }
    rerender() {
      const mW = Math.ceil(E.W * this.margin), mH = Math.ceil(E.H * this.margin);
      const W = E.W + mW * 2, H = E.H + mH * 2;
      for (const L of this.back) {
        if (L.c.width !== W || L.c.height !== H) { L.c.width = W; L.c.height = H; }
        L.x.setTransform(1, 0, 0, 1, 0, 0); L.x.imageSmoothingEnabled = false;
        if (this.alpha) L.x.clearRect(0, 0, W, H);
      }
      const v = { x: E.cam.x, y: E.cam.y, z: E.cam.z, k: E.k, g: E.g, px: E.px, W, H, mW, mH };
      this.dirty = false; this.lastRender = performance.now();
      const r = this.render(this.back[0].x, v, this.back[1] && this.back[1].x);
      if (r && typeof r.next === "function") { this.job = { it: r, v }; this.step(); }
      else this.swap(v);
    }
    step() {
      const t0 = performance.now();
      while (this.job && performance.now() - t0 < this.budget) {
        if (this.job.it.next().done) { const v = this.job.v; this.job = null; this.swap(v); }
      }
    }
    swap(v) { const t = this.front; this.front = this.back; this.back = t; this.view = v; }
    exposed(v) {
      const f = Math.pow(2, E.cam.z - v.z);
      const [X, Y] = this.offset(f, v);
      return X > 0 || Y > 0 || X + v.W * f < E.W || Y + v.H * f < E.H;
    }
    // нужен ли перерендер для текущей камеры
    check(settled) {
      if (!this.enabled) return;
      if (this.job) {
        if (Math.abs(E.cam.z - this.job.v.z) > 0.75 || this.exposed(this.job.v)) { this.job = null; return this.rerender(); }
        return this.step();
      }
      const v = this.view;
      if (!v) return this.rerender();
      const dz = E.cam.z - v.z;
      const now = performance.now();
      if (this.exposed(v) || Math.abs(dz) > 0.75) return this.rerender();
      if (settled && (Math.abs(dz) > 0.01 || this.dirty) && now - this.lastRender > 120) return this.rerender();
      if (this.dirty && now - this.lastRender > 500) return this.rerender();
    }
    offset(f, v) {
      v = v || this.view;
      const dx = v.x - E.cam.x, dy = v.y - E.cam.y;
      const cx = E.k * (dx + dy) + E.W / 2, cy = E.k * 0.5 * (dy - dx) + E.H / 2;
      return [cx - (v.W / 2) * f, cy - (v.H / 2) * f];
    }
    blit(ctx, alpha = 1, layer = 0) {
      if (!this.enabled || !this.view) return;
      const f = Math.pow(2, E.cam.z - this.view.z);
      const [X, Y] = this.offset(f);
      const c = this.front[layer].c;
      ctx.globalAlpha = alpha;
      if (Math.abs(f - 1) < 1e-3) ctx.drawImage(c, Math.round(X), Math.round(Y));
      else ctx.drawImage(c, X, Y, this.view.W * f, this.view.H * f);
      ctx.globalAlpha = 1;
    }
  }
  E.LayerCache = LayerCache;

  E.drawRaster = drawTiles;
  // земля: векторная (TPM.ground) или растровые тайлы (спутник / запасной вариант)
  const ground = new LayerCache((ctx, v) => {
    if (E.tileStyle === "pixel" && TPM.world && TPM.world.ready && !TPM.world.failed) return TPM.ground.render(ctx, v);
    return drawTiles(ctx, v);
  }, { alpha: false, margin: 0.3 });
  E.ground = ground;
  E.setTileStyle = (s) => { E.tileStyle = s; queue = []; ground.invalidate(); };

  // =====================================================================
  //  ВВОД: перетаскивание с инерцией, колесо, щипок, двойной клик, клавиши
  // =====================================================================
  let fly = null, zoomTarget = null, zoomAnchor = null;
  const vel = { x: 0, y: 0 };
  const ptrs = new Map();
  let drag = null, pinch = null, downInfo = null;

  function markMove() { E.moving = true; E.lastMove = performance.now(); }

  function zoomAround(newZ, sx, sy) {
    const before = E.unproject(sx, sy);
    E.cam.z = Math.min(C.maxZoom, Math.max(C.minZoom, newZ));
    updateK();
    const after = E.unproject(sx, sy);
    E.cam.x += before[0] - after[0];
    E.cam.y += before[1] - after[1];
    clampCam(); updateK(); markMove();
  }
  E.zoomBy = (d, sx, sy) => {
    fly = null;
    zoomTarget = Math.min(C.maxZoom, Math.max(C.minZoom, (zoomTarget ?? E.cam.z) + d));
    zoomAnchor = [sx ?? E.W / 2, sy ?? E.H / 2];
  };

  function toLocal(e) {
    const r = E.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / E.px, (e.clientY - r.top) / E.px];
  }

  function initInput(el) {
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, toLocal(e));
      fly = null; zoomTarget = null; vel.x = vel.y = 0;
      if (ptrs.size === 1) {
        const p = toLocal(e);
        drag = { last: p, t: performance.now() };
        downInfo = { p, t: performance.now(), moved: 0 };
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: E.cam.z };
        drag = null; downInfo = null;
      }
    });
    el.addEventListener("pointermove", (e) => {
      const p = toLocal(e);
      if (!ptrs.has(e.pointerId)) { if (E.hooks.hover) E.hooks.hover(p[0], p[1]); return; }
      ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAround(pinch.z + Math.log2(d / pinch.d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        return;
      }
      if (drag) {
        const dX = p[0] - drag.last[0], dY = p[1] - drag.last[1];
        const [wx, wy] = E.screenDelta(dX, dY);
        E.cam.x -= wx; E.cam.y -= wy; clampCam();
        const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
        vel.x = vel.x * 0.6 + (-wx / dt) * 0.4; vel.y = vel.y * 0.6 + (-wy / dt) * 0.4;
        drag.last = p; drag.t = now;
        if (downInfo) downInfo.moved += Math.abs(dX) + Math.abs(dY);
        markMove();
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (downInfo && ptrs.size === 0) {
        const dt = performance.now() - downInfo.t;
        if (downInfo.moved * E.px < 8 && dt < 500 && E.hooks.tap) E.hooks.tap(downInfo.p[0], downInfo.p[1]);
        if (performance.now() - drag.t > 80) { vel.x = vel.y = 0; }
      }
      if (ptrs.size === 0) { drag = null; downInfo = null; }
      else if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = { last: p, t: performance.now() }; }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = toLocal(e);
      const d = -Math.sign(e.deltaY) * Math.min(1.2, Math.abs(e.deltaY) / (e.deltaMode ? 3 : 160)) * 0.75;
      E.zoomBy(d, p[0], p[1]);
    }, { passive: false });
    el.addEventListener("dblclick", (e) => { const p = toLocal(e); E.zoomBy(1, p[0], p[1]); });
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      const step = 120 / E.k;
      if (e.key === "+" || e.key === "=") E.zoomBy(0.7);
      else if (e.key === "-") E.zoomBy(-0.7);
      else if (e.key === "ArrowLeft") { const d = E.screenDelta(-120, 0); E.cam.x += d[0]; E.cam.y += d[1]; markMove(); }
      else if (e.key === "ArrowRight") { const d = E.screenDelta(120, 0); E.cam.x += d[0]; E.cam.y += d[1]; markMove(); }
      else if (e.key === "ArrowUp") { const d = E.screenDelta(0, -120); E.cam.x += d[0]; E.cam.y += d[1]; markMove(); }
      else if (e.key === "ArrowDown") { const d = E.screenDelta(0, 120); E.cam.x += d[0]; E.cam.y += d[1]; markMove(); }
      else return;
      clampCam(); updateK();
    });
  }

  // плавный перелёт с «подпрыгиванием» зума для дальних точек
  E.flyTo = function (wx, wy, z, dur) {
    const p = E.project(wx, wy);
    const dist = Math.hypot(p[0] - E.W / 2, p[1] - E.H / 2) / Math.max(E.W, E.H);
    const dip = Math.min(2.5, Math.max(0, Math.log2(dist + 1) * 1.6));
    fly = { x0: E.cam.x, y0: E.cam.y, z0: E.cam.z, x1: wx, y1: wy, z1: z, dip, t0: E.time, dur: dur || Math.min(2.2, 0.9 + dist * 0.5) };
    zoomTarget = null; vel.x = vel.y = 0;
  };
  E.isFlying = () => !!fly;

  function stepCamera(dt) {
    if (fly) {
      let t = (E.time - fly.t0) / fly.dur;
      if (t >= 1) t = 1;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      E.cam.x = fly.x0 + (fly.x1 - fly.x0) * e;
      E.cam.y = fly.y0 + (fly.y1 - fly.y0) * e;
      E.cam.z = fly.z0 + (fly.z1 - fly.z0) * e - fly.dip * Math.sin(Math.PI * e);
      if (t >= 1) fly = null;
      clampCam(); updateK(); markMove();
      return;
    }
    if (zoomTarget !== null) {
      const dz = zoomTarget - E.cam.z;
      const nz = Math.abs(dz) < 0.004 ? zoomTarget : E.cam.z + dz * Math.min(1, dt * 12);
      zoomAround(nz, zoomAnchor[0], zoomAnchor[1]);
      if (nz === zoomTarget) zoomTarget = null;
    }
    if (!drag && (Math.abs(vel.x) + Math.abs(vel.y)) * E.k > 2) {
      E.cam.x += vel.x * dt; E.cam.y += vel.y * dt;
      const d = Math.pow(0.04, dt);
      vel.x *= d; vel.y *= d;
      clampCam(); markMove();
    }
    if (performance.now() - E.lastMove > 160) E.moving = false;
  }

  // =====================================================================
  //  ЦИКЛ КАДРОВ (ограничение FPS, пауза в фоне)
  // =====================================================================
  E.fps = 30;
  E.paused = false;
  let lastFrame = 0, lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const minDt = 1000 / E.fps - 1;
    if (now - lastFrame < minDt) return;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastFrame = now; lastT = now;
    E.time += dt;
    stepCamera(dt);
    updateK();
    if (E.hooks.frame) E.hooks.frame(dt, E.ctx);
  }
  E.start = () => requestAnimationFrame(frame);
  E.settled = () => !E.moving && !fly && zoomTarget === null && !drag;
})();
