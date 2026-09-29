/* ===================================================================
   FPV 航线自动飞行 · 注入模块 (MINIS)
   依赖同作用域内的：toLocal / ter / camera / renderer / scene / sky / LANDMARKS / clamp / smoothstep
   对外 API：
     FPV.start(cfg)      开启（cfg 可选，覆盖默认）
     FPV.stop()          关闭
     FPV.seek(km)        跳到指定里程
     FPV.tick(dt)        手动推进（animate 里自动调用）
     FPV.stepAndSnap(...)录制辅助：推进一帧并离屏出图上传
     FPV.info()          当前状态
   =================================================================== */
(function () {
  const LL = __PATH_LL__;                 // [[lon,lat], ...] 688 点，来自 DEM 谷底校正航线

  /* ---------- 1. 局部坐标 + 弧长参数化 ---------- */
  const P = [];
  for (let i = 0; i < LL.length; i++) { const p = toLocal(LL[i][0], LL[i][1]); P.push([p.x, p.z]); }
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const TOTAL = S[S.length - 1];
  const N = P.length;

  function at(s) {
    s = clamp(s, 0, TOTAL);
    let lo = 0, hi = N - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
    const dx = P[hi][0] - P[lo][0], dz = P[hi][1] - P[lo][1];
    const n = Math.hypot(dx, dz) || 1;
    return { x: P[lo][0] + dx * t, z: P[lo][1] + dz * t, tx: dx / n, tz: dz / n, i: lo, t: t };
  }
  /* 曲线（曲率 → 压坡角） */
  function curvature(s) {
    const d = 90, a = at(s - d), b = at(s), c = at(s + d);
    const v1x = b.x - a.x, v1z = b.z - a.z, v2x = c.x - b.x, v2z = c.z - b.z;
    const cr = (v1x * v2z - v1z * v2x) / ((Math.hypot(v1x, v1z) * Math.hypot(v2x, v2z)) || 1);
    return Math.asin(clamp(cr, -1, 1)) / d;      // 弧度/米，左正右负
  }

  /* ---------- 2. 沿程地形 / 谷底 / 高度剖面（场景米，含 exag） ---------- */
  let TERR = null, FLOOR = null, Y = null;
  const CFG = {
    speed: 148, speedFast: 178, speedSlow: 96,
    lookAhead: 340, fov: 64, fovSpeedGain: 16, fovDiveGain: 9,
    clear: 150, low: 76, diveFrom: 1180, diveEnd: 9200,
    rollMax: 0.40, shake: 1.0, hud: true, brand: "宜昌 3D · yichang-3d",
    lmWindow: 1500, lmHold: 0.85, followLandmarks: true, speedLines: true,
  };
  const st = {
    on: false, s: 0, v: CFG.speed, t: 0, fovNow: CFG.fov, rollNow: 0,
    shakeT: 0, lastLm: null, lmBlend: 0, cardA: 0, cardLm: null, cardT: 0,
  };

  function buildProfile() {
    if (TERR) return;
    const e = (ter && ter.exag) ? ter.exag : 1;
    TERR = new Float32Array(N); FLOOR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const h = ter.sampleHeight(P[i][0], P[i][1]);
      TERR[i] = (h === null ? 0 : h) * e;
    }
    const step = TOTAL / (N - 1);
    for (let i = 0; i < N; i++) {
      const a = at(S[i]), nx = -a.tz, nz = a.tx;
      let mn = Infinity;
      for (let d = -520; d <= 520; d += 40) {
        const h = ter.sampleHeight(a.x + nx * d, a.z + nz * d);
        if (h !== null) mn = Math.min(mn, h * e);
      }
      FLOOR[i] = (mn === Infinity ? TERR[i] : mn);
    }
    const sm = (arr, winM) => {
      const w = Math.max(1, Math.round(winM / step));
      const o = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        let s = 0, c = 0;
        for (let k = -w; k <= w; k++) { const j = Math.min(arr.length - 1, Math.max(0, i + k)); s += arr[j]; c++; }
        o[i] = s / c;
      }
      return o;
    };
    TERR = sm(TERR, 260); FLOOR = sm(FLOOR, 620);
    /* 计划高度：离谷底 low 与 离地形 clear 取大；开场俯冲 */
    Y = new Float32Array(N);
    for (let i = 0; i < N; i++) Y[i] = Math.max(TERR[i] + CFG.clear, FLOOR[i] + CFG.low);
    for (let i = 0; i < N; i++) {
      const s = S[i];
      const ramp = s < CFG.diveEnd ? Math.pow(1 - s / CFG.diveEnd, 1.35) : 0;
      Y[i] += (CFG.diveFrom - Y[i]) * ramp;
    }
    Y = sm(Y, 420);
  }
  function sampleY(s) {
    const a = at(s), i = a.i, j = Math.min(N - 1, i + 1);
    return Y[i] + (Y[j] - Y[i]) * a.t;
  }

  /* ---------- 3. 地标事件（沿程里程） ---------- */
  let EVENTS = null;
  function buildEvents() {
    if (EVENTS) return;
    EVENTS = [];
    for (const L of (typeof LANDMARKS !== "undefined" ? LANDMARKS : [])) {
      const p = toLocal(L.lon, L.lat);
      let bi = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = (P[i][0] - p.x) ** 2 + (P[i][1] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const h = ter.sampleHeight(p.x, p.z);
      EVENTS.push({
        L: L, x: p.x, z: p.z, s: S[bi], off: Math.sqrt(bd),
        y: ((h === null ? (L.a || 60) : h) * ((ter && ter.exag) ? ter.exag : 1)) + 40,
      });
    }
    EVENTS.sort((a, b) => a.s - b.s);
  }

  /* ---------- 4. 主循环：把相机挂到航线上 ---------- */
  const _pos = new THREE.Vector3(), _look = new THREE.Vector3(), _tmp = new THREE.Vector3();
  function tick(dt) {
    if (!st.on) return;
    buildProfile(); buildEvents();
    dt = Math.min(Math.max(dt, 0.0005), 0.08);
    st.t += dt;

    /* 目标速度：弯道减速、地标减速、直线加速 */
    const k = Math.abs(curvature(st.s));
    let vT = CFG.speed + (CFG.speedFast - CFG.speed) * clamp(1 - k * 900, 0, 1) - clamp(k * 2600, 0, 34);
    /* 地标附近减速，便于读信息卡 */
    let near = null, nearD = Infinity;
    for (const e of EVENTS) {
      const d = e.s - st.s;
      if (d > -900 && d < 1500 && Math.abs(d) < nearD) { nearD = Math.abs(d); near = e; }
    }
    if (near && nearD < 900) vT *= CFG.lmHold;
    st.v += clamp(vT - st.v, -70 * dt, 42 * dt);
    st.s += st.v * dt;
    if (st.s > TOTAL - 1) { st.s = TOTAL - 1; }

    const a = at(st.s), ah = at(st.s + CFG.lookAhead);
    const y = sampleY(st.s);
    _pos.set(a.x, y, a.z);
    _look.set(ah.x, sampleY(st.s + CFG.lookAhead), ah.z);

    /* 地标追踪：把视线拉向地标，权重按接近程度平滑 */
    if (CFG.followLandmarks && EVENTS && EVENTS.length) {
      let best = null, bw = 0;
      for (const e of EVENTS) {
        const d = e.s - st.s;
        const w = (d > -700 && d < CFG.lmWindow) ? (1 - Math.abs((d - CFG.lmWindow * 0.22) / (CFG.lmWindow * 0.78))) : 0;
        if (w > bw) { bw = w; best = e; }
      }
      const w = clamp(bw, 0, 1) * 0.92;
      st.lmBlend += (w - st.lmBlend) * Math.min(1, dt * 2.2);
      if (best) {
        _tmp.set(best.x, best.y, best.z);
        _look.lerp(_tmp, st.lmBlend * 0.85);
        st.cardLm = best;
      }
    }
    /* 信息卡显示窗口 */
    if (st.cardLm) {
      const d = st.cardLm.s - st.s;
      const want = (d > -820 && d < 1500) ? 1 : 0;
      st.cardA += (want - st.cardA) * Math.min(1, dt * 2.4);
      if (st.cardA < 0.01 && !want) st.cardLm = null;
    }

    /* FOV：随速度与俯冲张开 */
    const dive = clamp((sampleY(st.s) - Y[N - 1] * 0 - FLOOR[at(st.s).i]) / 900, 0, 1);
    const fT = CFG.fov + CFG.fovSpeedGain * clamp((st.v - CFG.speed) / 90, 0, 1) + CFG.fovDiveGain * dive;
    st.fovNow += (fT - st.fovNow) * Math.min(1, dt * 1.6);

    /* 压坡：按曲率与当前速度 */
    const rollT = clamp(-Math.atan(st.v * st.v * curvature(st.s + 60) / 9.8) * 0.55, -CFG.rollMax, CFG.rollMax);
    st.rollNow += (rollT - st.rollNow) * Math.min(1, dt * 2.0);

    /* 相机 */
    st.shakeT += dt;
    const amp = (0.05 + 0.16 * clamp(st.v / 200, 0, 1)) * CFG.shake;
    const sA = Math.sin(st.shakeT * 11.7) * 0.6 + Math.sin(st.shakeT * 5.3) * 0.4;
    const sB = Math.sin(st.shakeT * 9.1) * 0.5 + Math.sin(st.shakeT * 17.3) * 0.5;
    const sC = Math.sin(st.shakeT * 7.7) * 0.5 + Math.sin(st.shakeT * 13.1) * 0.5;
    camera.position.set(_pos.x + sA * amp, _pos.y + sC * amp * 0.7, _pos.z + sB * amp);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    camera.rotateZ(st.rollNow);
    camera.fov = st.fovNow;
    camera.near = 3;
    camera.updateProjectionMatrix();
    if (typeof sky !== "undefined" && sky) sky.position.copy(camera.position);
  }

  /* ---------- 5. HUD（画在 2D canvas 上，作为 WebGL 叠加层，离屏出图也带 UI） ---------- */
  const UI = { cv: document.createElement("canvas"), tex: null, scene: null, cam: null, quad: null };
  function initUI() {
    if (UI.tex) return;
    UI.cv.width = 1920; UI.cv.height = 1080;
    UI.tex = new THREE.CanvasTexture(UI.cv);
    UI.tex.colorSpace = THREE.SRGBColorSpace;
    UI.scene = new THREE.Scene();
    UI.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    UI.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: UI.tex, transparent: true, depthTest: false, depthWrite: false }));
    UI.scene.add(UI.quad);
  }
  function f2(v) { return v.toFixed(2); }
  function drawHud(W, H) {
    if (!CFG.hud) return;
    initUI();
    const g = UI.cv.getContext("2d");
    const K = UI.cv.width / 1920;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, UI.cv.width, UI.cv.height);
    g.scale(K, K);
    const F = (s, w) => (w || 600) + " " + s + "px -apple-system,\"PingFang SC\",Helvetica,Arial,sans-serif";
    g.textBaseline = "alphabetic";

    /* 暗角 + 速度线（速度感） */
    const vg = g.createRadialGradient(960, 540, 460, 960, 540, 1120);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.42)");
    g.fillStyle = vg; g.fillRect(0, 0, 1920, 1080);
    if (CFG.speedLines) {
      const sp = clamp((st.v - 120) / 90, 0, 1);
      if (sp > 0.01) {
        g.save(); g.translate(960, 540);
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2 + st.t * 0.35;
          const r0 = 620 + ((i * 37) % 200), r1 = r0 + 210 + sp * 340;
          g.strokeStyle = "rgba(255,255,255," + (0.05 + 0.12 * sp) * (0.4 + 0.6 * Math.abs(Math.sin(i * 2.1 + st.t * 3))) + ")";
          g.lineWidth = 2 + 3 * sp;
          g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
        }
        g.restore();
      }
    }

    /* 左上：品牌 */
    g.font = F(26, 600); g.fillStyle = "rgba(232,238,246,.72)";
    g.fillText(CFG.brand, 56, 78);
    g.font = F(20, 400); g.fillStyle = "rgba(143,162,184,.85)";
    g.fillText("长江航线 · " + f2(TOTAL / 1000) + " km", 56, 110);

    /* 左下：速度块 */
    const kmh = Math.round(st.v * 3.6);
    g.font = F(92, 700); g.fillStyle = "#ffffff";
    g.fillText(String(kmh), 56, 950);
    g.font = F(26, 500); g.fillStyle = "rgba(143,162,184,.95)";
    g.fillText("km/h", 60 + g.measureText(String(kmh)).width * 0 + 205, 950);
    const agl = sampleY(st.s) - TERR[at(st.s).i];
    g.font = F(24, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText("海拔 " + Math.round(sampleY(st.s)) + " m　离地 " + Math.round(agl) + " m", 56, 992);
    /* 速度条 */
    g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(56, 1012, 300, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(56, 1012, 300 * clamp(st.v / 220, 0, 1), 6);

    /* 右上：航向 + 航迹 */
    const a = at(st.s);
    const hdg = (Math.atan2(a.tx, -a.tz) * 180 / Math.PI + 360) % 360;
    g.font = F(34, 600); g.fillStyle = "#e8eef6"; g.textAlign = "right";
    g.fillText(String(Math.round(hdg)).padStart(3, "0") + "°", 1864, 92);
    g.font = F(20, 400); g.fillStyle = "rgba(143,162,184,.9)";
    g.fillText("航向", 1864, 120);
    g.textAlign = "left";

    /* 底部：进度条 + 地标刻度 */
    const bx = 160, bw = 1600, by = 1042;
    g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(bx, by, bw, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(bx, by, bw * clamp(st.s / TOTAL, 0, 1), 6);
    if (EVENTS) for (const e of EVENTS) {
      const x = bx + bw * clamp(e.s / TOTAL, 0, 1);
      g.fillStyle = (Math.abs(e.s - st.s) < 1500) ? "#ffd166" : "rgba(255,209,102,.55)";
      g.beginPath(); g.arc(x, by + 3, 4.5, 0, 7); g.fill();
    }
    g.font = F(20, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText(f2(st.s / 1000) + " / " + f2(TOTAL / 1000) + " km", bx, by - 14);
    const nx = nextEvent();
    if (nx) {
      g.textAlign = "right"; g.fillStyle = "rgba(255,209,102,.95)";
      g.fillText("下一地标 " + nx.L.n + "　" + f2((nx.s - st.s) / 1000) + " km", bx + bw, by - 14);
      g.textAlign = "left";
    }

    /* 地标信息卡 */
    if (st.cardLm && st.cardA > 0.01) {
      const L = st.cardLm.L, al = clamp(st.cardA, 0, 1);
      const px = 1180, py = 250, pw = 660, ph = 300;
      g.save(); g.globalAlpha = al;
      g.fillStyle = "rgba(10,17,26,.80)";
      g.strokeStyle = "rgba(79,195,247,.65)"; g.lineWidth = 2;
      roundRect(g, px, py, pw, ph, 16); g.fill(); g.stroke();
      /* 左侧色条 */
      g.fillStyle = "#4fc3f7"; g.fillRect(px, py + 26, 5, ph - 52);
      g.font = F(46, 700); g.fillStyle = "#ffffff";
      g.fillText(L.n, px + 36, py + 78);
      g.font = F(22, 500); g.fillStyle = "#9fdcff";
      g.fillText((L.k || "") + "　海拔 " + (L.a || "-") + " m　距航线 " + Math.round(st.cardLm.off) + " m", px + 38, py + 118);
      g.font = F(24, 400); g.fillStyle = "rgba(214,226,240,.92)";
      wrap(g, L.d || "", px + 38, py + 164, pw - 76, 34, 4);
      g.restore();
      /* 屏幕上的地标指示 */
      const pr = cam.project(new THREE.Vector3(st.cardLm.x, st.cardLm.y, st.cardLm.z));
      if (pr) {
        const sx = pr.x * (1920 / innerWidth), sy = pr.y * (1080 / innerHeight);
        if (sx > 0 && sx < 1920 && sy > 0 && sy < 1080) {
          g.save(); g.globalAlpha = al;
          g.strokeStyle = "#ffd166"; g.lineWidth = 3;
          g.beginPath(); g.arc(sx, sy, 16, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(sx - 26, sy); g.lineTo(sx - 8, sy); g.moveTo(sx + 8, sy); g.lineTo(sx + 26, sy);
          g.moveTo(sx, sy - 26); g.lineTo(sx, sy - 8); g.moveTo(sx, sy + 8); g.lineTo(sx, sy + 26); g.stroke();
          g.restore();
        }
      }
    }
    UI.tex.needsUpdate = true;
  }
  function nextEvent() {
    if (!EVENTS) return null;
    for (const e of EVENTS) if (e.s > st.s + 120) return e;
    return null;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function wrap(g, text, x, y, maxW, lh, maxLines) {
    const chars = String(text).split("");
    let line = "", n = 0;
    for (const ch of chars) {
      if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, y); y += lh; n++; line = ch; if (n >= maxLines - 1) break; }
      else line += ch;
    }
    if (line) g.fillText(line, x, y);
  }

  /* ---------- 6. 离屏出帧（含 HUD）+ 上传 ---------- */
  window.fpvSnap = async function (W, H, label) {
    drawHud(W, H);
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.NoColorSpace });
    const asp = camera.aspect, onear = camera.near;
    camera.aspect = W / H; camera.near = 3; camera.updateProjectionMatrix();
    if (sky) sky.position.copy(camera.position);
    renderer.setRenderTarget(rt);
    renderer.autoClear = true; renderer.render(scene, camera);
    if (CFG.hud && UI.scene) { renderer.autoClear = false; renderer.render(UI.scene, UI.cam); renderer.autoClear = true; }
    const buf = new Uint8Array(W * H * 4);
    try { renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); } catch (e) { }
    renderer.setRenderTarget(null);
    camera.aspect = asp; camera.near = onear; camera.updateProjectionMatrix();
    rt.dispose();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const cx = c.getContext("2d"), id = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) id.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    cx.putImageData(id, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    let ok = "no-server";
    try { const r = await fetch("/__snap?name=" + encodeURIComponent(label || "fpv"), { method: "POST", body: blob }); ok = r.ok ? "ok" : ("HTTP " + r.status); }
    catch (e) { ok = "err " + e.message; }
    return ok;
  };

  /* ---------- 7. 连续录制（分段，边录边上传） ---------- */
  window.fpvRecord = async function (o) {
    o = o || {};
    const fps = o.fps || 30, secs = o.secs || 8, W = o.W || 1280, H = o.H || 720;
    const from = (o.fromKm !== undefined) ? o.fromKm * 1000 : st.s;
    const pre = o.prefix || "f";
    st.s = clamp(from, 0, TOTAL - 1);
    st.v = CFG.speed;
    const n = Math.round(fps * secs);
    window.__rec = { i: 0, n: n, done: false, last: "" };
    for (let i = 0; i < n; i++) {
      tick(1 / fps);
      const name = pre + "_" + String(i).padStart(5, "0") + ".jpg";
      window.__rec.last = await window.fpvSnap(W, H, name);
      window.__rec.i = i + 1;
      if (o.onFrame) o.onFrame(i);
    }
    window.__rec.done = true;
    return "recorded " + n + " frames @" + W + "x" + H;
  };

  /* ---------- 8. 对外 ---------- */
  const FPV = {
    CFG: CFG, st: st, TOTAL: TOTAL, P: P, S: S, events: () => EVENTS,
    get on() { return st.on; },
    start(cfg) {
      Object.assign(CFG, cfg || {});
      TERR = FLOOR = Y = EVENTS = null;
      buildProfile(); buildEvents();
      st.on = true; st.s = 0; st.v = CFG.speed; st.t = 0; st.cardLm = null; st.cardA = 0;
      if (typeof flight !== "undefined" && flight) flight.active = false;
      return "FPV start: " + (TOTAL / 1000).toFixed(2) + " km, " + EVENTS.length + " 地标";
    },
    stop() { st.on = false; return "FPV stop"; },
    seek(km) { st.s = clamp(km * 1000, 0, TOTAL - 1); st.cardA = 0; st.cardLm = null; return "seek " + km + " km"; },
    tick: tick,
    info() {
      const a = at(st.s);
      return { km: st.s / 1000, total: TOTAL / 1000, v: st.v, y: sampleY(st.s), terr: TERR[a.i],
               fov: st.fovNow, roll: st.rollNow, card: st.cardLm ? st.cardLm.L.n : null, hud: CFG.hud };
    },
    /* 高频调用：推进 + 出图 */
    async snapStep(dt, W, H, label) { tick(dt); return await window.fpvSnap(W, H, label); },
  };
  window.FPV = FPV;
})();
