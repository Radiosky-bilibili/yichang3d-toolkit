  /* ---------- 5. HUD ----------
     实时模式：画在 DOM canvas 上（浏览器合成，无纹理上传，开销最低）
     出帧模式：画在 WebGL 叠加层（离屏渲染时能连带 UI 一起截到）           */
  const UI = { cv: null, ctx: null, tex: null, scene: null, cam: null, quad: null,
               domCv: null, domCtx: null, domOn: false, grad: null, gradKey: "" };
  function devSize(dprMax) {
    const dpr = Math.min(dprMax || 1.5, window.devicePixelRatio || 1);
    const w = Math.max(480, Math.round((window.innerWidth || 390) * dpr));
    const h = Math.max(320, Math.round((window.innerHeight || 844) * dpr));
    return [w, h];
  }
  /* --- DOM 图层 --- */
  function initDomHud() {
    if (UI.domCv) return;
    const c = document.createElement("canvas");
    c.id = "fpv-hud";
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45";
    document.body.appendChild(c);
    UI.domCv = c; UI.domCtx = c.getContext("2d");
    const s = devSize();
    c.width = s[0]; c.height = s[1];
    window.addEventListener("resize", function () { const s2 = devSize(); c.width = s2[0]; c.height = s2[1]; UI.gradKey = ""; });
  }
  /* --- WebGL 叠加层（仅出帧用） --- */
  function initUI(W, H) {
    const s = (W && H) ? [W, H] : devSize(2);
    if (!UI.tex) {
      UI.cv = document.createElement("canvas");
      UI.tex = new THREE.CanvasTexture(UI.cv);
      UI.tex.colorSpace = THREE.SRGBColorSpace;
      UI.scene = new THREE.Scene();
      UI.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      UI.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: UI.tex, transparent: true, depthTest: false, depthWrite: false }));
      UI.scene.add(UI.quad);
    }
    if (UI.cv.width !== s[0] || UI.cv.height !== s[1]) {
      UI.cv.width = s[0]; UI.cv.height = s[1];
      UI.tex.dispose(); UI.tex = new THREE.CanvasTexture(UI.cv);
      UI.tex.colorSpace = THREE.SRGBColorSpace; UI.quad.material.map = UI.tex; UI.gradKey = "";
    }
  }
  /* --- 渐变缓存（避免每帧全屏渐变填充） --- */
  function gradients(cv) {
    const key = cv.width + "x" + cv.height;
    if (UI.gradKey === key) return UI.grad;
    const G = {};
    const scrim = document.createElement("canvas"); scrim.width = 4; scrim.height = 200;
    const s1 = scrim.getContext("2d").createLinearGradient(0, 0, 0, 200);
    s1.addColorStop(0, "rgba(0,0,0,.46)"); s1.addColorStop(1, "rgba(0,0,0,0)");
    const c1 = scrim.getContext("2d"); c1.fillStyle = s1; c1.fillRect(0, 0, 4, 200); G.top = scrim;
    const scrim2 = document.createElement("canvas"); scrim2.width = 4; scrim2.height = 220;
    const s2 = scrim2.getContext("2d").createLinearGradient(0, 0, 0, 220);
    s2.addColorStop(0, "rgba(0,0,0,0)"); s2.addColorStop(1, "rgba(0,0,0,.58)");
    const c2 = scrim2.getContext("2d"); c2.fillStyle = s2; c2.fillRect(0, 0, 4, 220); G.bot = scrim2;
    const vig = document.createElement("canvas"); vig.width = 256; vig.height = 256;
    const c3 = vig.getContext("2d");
    const vg = c3.createRadialGradient(128, 128, 60, 128, 128, 210);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.42)");
    c3.fillStyle = vg; c3.fillRect(0, 0, 256, 256); G.vig = vig;
    UI.grad = G; UI.gradKey = key;
    return G;
  }
  function f2(v) { return v.toFixed(2); }
  /* 核心绘制：cv/ctx + 设计空间（高度 1080，宽度自适应） */
  function paint(cv, g, bot) {
    bot = bot || 0;
    const K = cv.height / 1080;
    const DW = cv.width / K;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.scale(K, K);
    const G = gradients(cv);
    const F = (s, w) => (w || 600) + " " + Math.round(s * SC) + "px -apple-system,\"PingFang SC\",Helvetica,Arial,sans-serif";
    g.textBaseline = "alphabetic";
    const narrow = DW < 1500;
    const M = narrow ? 30 : 56;
    const SC = narrow ? 0.60 : 1;                 // 窄屏整体缩小字号

    /* 暗角 + 上下压暗（用缓存的小图拉伸） */
    g.drawImage(G.vig, 0, 0, DW, 1080);
    g.drawImage(G.top, 0, 0, DW, 200);
    g.drawImage(G.bot, 0, 860 - bot, DW, 220);

    /* 左上：品牌 */
    g.font = F(narrow ? 22 : 26, 600); g.fillStyle = "rgba(232,238,246,.75)";
    g.fillText(CFG.brand, M, 78);
    g.font = F(narrow ? 17 : 20, 400); g.fillStyle = "rgba(143,162,184,.85)";
    g.fillText("长江航线 · " + f2(TOTAL / 1000) + " km", M, 110);

    /* 左下：速度 / 海拔 */
    const kmh = Math.round(st.v * 3.6);
    g.font = F(narrow ? 74 : 92, 700); g.fillStyle = "#ffffff";
    g.fillText(String(kmh), M, 950 - bot);
    const numW = g.measureText(String(kmh)).width;
    g.font = F(narrow ? 22 : 26, 500); g.fillStyle = "rgba(143,162,184,.95)";
    g.fillText("km/h", M + numW + 12, 950 - bot);
    const camY = camera.position.y, agl = camY - TERR[at(st.s).i];
    g.font = F(narrow ? 19 : 24, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText("海拔 " + Math.round(camY) + " m　离地 " + Math.round(agl) + " m", M, 992 - bot);
    const barW = narrow ? 200 : 300;
    g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(M, 1012 - bot, barW, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(M, 1012 - bot, barW * clamp(st.v / 240, 0, 1), 6);

    /* 右上：航向 */
    const a = at(st.s);
    const hdg = (Math.atan2(a.tx, -a.tz) * 180 / Math.PI + 360) % 360;
    g.textAlign = "right";
    g.font = F(narrow ? 28 : 34, 600); g.fillStyle = "#e8eef6";
    g.fillText(String(Math.round(hdg)).padStart(3, "0") + "°", DW - M, 92);
    g.font = F(narrow ? 17 : 20, 400); g.fillStyle = "rgba(143,162,184,.9)";
    g.fillText("航向", DW - M, 120);
    g.textAlign = "left";

    /* 底部：进度条 + 地标刻度 */
    const bx = M, bw = DW - M * 2, by = 1042 - bot;
    g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(bx, by, bw, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(bx, by, bw * clamp(st.s / TOTAL, 0, 1), 6);
    if (EVENTS) for (const e of EVENTS) {
      const x = bx + bw * clamp(e.s / TOTAL, 0, 1);
      g.fillStyle = (Math.abs(e.s - st.s) < 1500) ? "#ffd166" : "rgba(255,209,102,.55)";
      g.beginPath(); g.arc(x, by + 3, 4.5, 0, 7); g.fill();
    }
    g.font = F(narrow ? 17 : 20, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText(f2(st.s / 1000) + " / " + f2(TOTAL / 1000) + " km", bx, by - 14);
    const nx = nextEvent();
    if (nx) {
      g.textAlign = "right"; g.fillStyle = "rgba(255,209,102,.95)";
      g.fillText("下一地标 " + nx.L.n + "　" + f2((nx.s - st.s) / 1000) + " km", bx + bw, by - 14);
      g.textAlign = "left";
    }

    /* 地标信息卡 + 锁定指示 */
    if (st.cardLm && st.cardA > 0.01) {
      const L = st.cardLm.L, al = clamp(st.cardA, 0, 1);
      const pw = Math.min(narrow ? 430 : 660, DW - M * 2), ph = narrow ? 216 : 300;
      const px = Math.max(M, DW - M - pw), py = narrow ? 120 : 250;
      g.save(); g.globalAlpha = al;
      g.fillStyle = "rgba(10,17,26,.80)";
      g.strokeStyle = "rgba(79,195,247,.65)"; g.lineWidth = 2;
      roundRect(g, px, py, pw, ph, 16); g.fill(); g.stroke();
      g.fillStyle = "#4fc3f7"; g.fillRect(px, py + 22, 5, ph - 44);
      g.font = F(narrow ? 34 : 46, 700); g.fillStyle = "#ffffff";
      g.fillText(L.n, px + 26, py + 62 * SC + 12);
      g.font = F(narrow ? 17 : 22, 500); g.fillStyle = "#9fdcff";
      g.fillText((L.k || "") + "　海拔 " + (L.a || "-") + " m　距航线 " + Math.round(st.cardLm.off) + " m", px + 28, py + 96 * SC + 14);
      g.font = F(narrow ? 19 : 24, 400); g.fillStyle = "rgba(214,226,240,.92)";
      wrap(g, L.d || "", px + 28, py + 138 * SC + 16, pw - 56, narrow ? 23 : 34, 4);
      g.restore();
      _proj.set(st.cardLm.x, st.cardLm.y, st.cardLm.z).project(camera);
      const behind = (_proj.z > 1);
      const sx = (_proj.x * 0.5 + 0.5) * DW, sy = (-_proj.y * 0.5 + 0.5) * 1080;
      const onScreen = !behind && sx > 40 && sx < DW - 40 && sy > 40 && sy < 1040;
      g.save(); g.globalAlpha = al;
      if (onScreen) {
        g.strokeStyle = "#ffd166"; g.lineWidth = 3;
        g.beginPath(); g.arc(sx, sy, 16, 0, 7); g.stroke();
        g.beginPath();
        g.moveTo(sx - 26, sy); g.lineTo(sx - 8, sy);
        g.moveTo(sx + 8, sy); g.lineTo(sx + 26, sy);
        g.moveTo(sx, sy - 26); g.lineTo(sx, sy - 8);
        g.moveTo(sx, sy + 8); g.lineTo(sx, sy + 26);
        g.stroke();
      } else {
        const cx = DW / 2, cy = 540;
        let dx = sx - cx, dy = sy - cy;
        const LL2 = Math.hypot(dx, dy) || 1;
        dx /= LL2; dy /= LL2;
        g.translate(cx + dx * (DW / 2 - 70), cy + dy * 470);
        g.rotate(Math.atan2(dy, dx) + Math.PI / 2);
        g.fillStyle = "#ffd166";
        g.beginPath(); g.moveTo(0, -20); g.lineTo(15, 14); g.lineTo(0, 6); g.lineTo(-15, 14); g.closePath(); g.fill();
      }
      g.restore();
    }
  }
  function drawHud(W, H) {                  // 出帧用：画到 WebGL 叠加层
    if (!CFG.hud) return;
    initUI(W, H);
    paint(UI.cv, UI.cv.getContext("2d"), 0);
    UI.tex.needsUpdate = true;
  }
  function drawHudDom() {                   // 实时用：画到 DOM 图层
    if (!CFG.hud) { if (UI.domCv) UI.domCtx.clearRect(0, 0, UI.domCv.width, UI.domCv.height); return; }
    initDomHud();
    let bot = 0;
    const bar = document.getElementById("fpvbar");
    if (bar && bar.offsetHeight) {
      const dpr = UI.domCv.width / Math.max(1, window.innerWidth);
      const K = UI.domCv.height / 1080;
      bot = Math.round((bar.offsetHeight * dpr) / K) + 18;   // 按控制条真实高度留白
    }
    paint(UI.domCv, UI.domCtx, bot);
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

  /* ---------- 5b. 实时 UI：FPV 按钮 + 飞行控制条 ---------- */
  const LIVE = { speed: 1 };
  function mkStyle() {
    if (document.getElementById("fpv-css")) return;
    const st2 = document.createElement("style");
    st2.id = "fpv-css";
    st2.textContent = [
      "#btn-fpv{color:#7fd4ff}",
      "#btn-fpv.on{background:rgba(79,195,247,.22)!important;color:#bfe9ff!important;box-shadow:0 0 0 1px rgba(79,195,247,.5) inset}",
      "#fpvbar{position:fixed;left:50%;transform:translateX(-50%);bottom:max(16px,env(safe-area-inset-bottom));z-index:70;",
      "display:none;align-items:center;justify-content:center;flex-wrap:wrap;row-gap:7px;gap:9px;padding:8px 11px;border-radius:16px;",
      "max-width:calc(100vw - 16px);",
      "background:rgba(9,14,22,.74);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);",
      "border:1px solid rgba(79,195,247,.28);box-shadow:0 8px 30px rgba(0,0,0,.5);",
      "font:500 13px -apple-system,'PingFang SC',Helvetica,Arial,sans-serif;color:#d6e2f0;white-space:nowrap}",
      "#fpvbar.on{display:flex}",
      "#fpvbar b{font-weight:600;color:#8fb8d8;font-size:12px;letter-spacing:.06em}",
      "#fpvbar button{border:0;background:rgba(255,255,255,.08);color:#cfe4f5;font:600 13px inherit;padding:7px 11px;border-radius:10px}",
      "#fpvbar button.sel{background:rgba(79,195,247,.92);color:#05121c}",
      "#fpvbar .sp{width:1px;height:20px;background:rgba(255,255,255,.14)}",
      "[data-fpvhide]{display:none!important}",
      "@media (max-width:560px){#fpvbar{gap:6px;row-gap:6px;padding:6px 8px;border-radius:14px;font-size:11.5px;",
      "width:min(420px,calc(100vw - 20px))}",
      "#fpvbar button{font-size:11.5px;padding:5px 8px;border-radius:8px}",
      "#fpvbar b{font-size:10.5px;letter-spacing:.02em}",
      "#fpvbar .sp{display:none}}"
    ].join("");
    document.head.appendChild(st2);
  }
  let uiBound = false;
  function buildUI() {
    mkStyle();
    if (!document.getElementById("fpvbar")) {
      const bar = document.createElement("div");
      bar.id = "fpvbar";
      bar.innerHTML = '<b>FPV</b>' +
        '<button data-sp="0.7">慢</button><button data-sp="1" class="sel">标准</button><button data-sp="1.4">快</button>' +
        '<span class="sp"></span>' +
        '<button data-tg="follow" class="sel" title="地标自动追踪开关">追焦</button>' +
        '<button data-tg="hud" class="sel" title="HUD 显示开关">HUD</button>' +
        '<span class="sp"></span><b>航点</b>' +
        '<button data-act="prev" title="上一个航点（←）">◀</button>' +
        '<button data-act="next" title="跳到下一个航点（→）">▶</button>' +
        '<span class="sp"></span><b id="fpv-auto" style="color:#ffd166"></b><button data-act="exit">退出</button>';
      document.body.appendChild(bar);
      bar.addEventListener("click", function (ev) {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.sp) {
          LIVE.speed = parseFloat(b.dataset.sp);
          CFG.speed = CFG.speed0 * LIVE.speed; CFG.speedRush = CFG.speedRush0 * LIVE.speed; CFG.speedSlow = CFG.speedSlow0 * LIVE.speed;
          [].forEach.call(bar.querySelectorAll("[data-sp]"), (x) => x.classList.toggle("sel", x === b));
        } else if (b.dataset.tg === "follow") {
          CFG.followLandmarks = !CFG.followLandmarks;
          b.classList.toggle("sel", CFG.followLandmarks);
        } else if (b.dataset.tg === "hud") {
          CFG.hud = !CFG.hud; b.classList.toggle("sel", CFG.hud);
        } else if (b.dataset.act === "next") { const r = FPV.next(); try { toast ? 0 : 0; } catch (e) { } }
        else if (b.dataset.act === "prev") { FPV.prev(); }
        else if (b.dataset.act === "exit") { FPV.stop(); }
      });
    }
    /* 设置面板里注入挂机巡航设置 */
    if (!document.getElementById("t-fpvidle")) {
      const panel = document.getElementById("panel");
      const note = document.getElementById("p-note");
      if (panel) {
        const row1 = document.createElement("label");
        row1.className = "row";
        row1.innerHTML = '<span>挂机自动巡航</span><input type="checkbox" id="t-fpvidle" checked>';
        const row2 = document.createElement("label");
        row2.className = "row";
        row2.innerHTML = '<span>挂机时长</span><input type="range" id="s-fpvidle" min="30" max="300" step="10" value="120"><b id="v-fpvidle">2.0 分</b>';
        if (note && note.parentNode === panel) { panel.insertBefore(row1, note); panel.insertBefore(row2, note); }
        else { panel.appendChild(row1); panel.appendChild(row2); }
        const chk = row1.querySelector("input"), rng = row2.querySelector("input"), vv = row2.querySelector("b");
        const sync = () => {
          IDLE.on = chk.checked;
          IDLE.sec = Math.max(10, rng.value | 0);
          vv.textContent = (IDLE.sec / 60).toFixed(1) + " 分";
          resetIdle();
        };
        chk.onchange = sync; rng.oninput = sync;
        chk.checked = IDLE.on; rng.value = IDLE.sec; vv.textContent = (IDLE.sec / 60).toFixed(1) + " 分";
      }
    }
    if (!document.getElementById("btn-fpv")) {
      const side = document.getElementById("side");
      const b = document.createElement("button");
      b.id = "btn-fpv"; b.title = "FPV 航线飞行（快捷键 F）";
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 12h12l-2.6-2.6 1.4-1.4L19.8 12l-5.4 4.6-1.4-1.4L15.6 13H3z" fill="currentColor"/><path d="M21 5.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>';
      b.onclick = () => FPV.toggle();
      if (side) side.insertBefore(b, side.firstChild); else document.body.appendChild(b);
    }
    const b2 = document.getElementById("btn-fpv");
    if (b2) b2.classList.toggle("on", st.on);
    const bar2 = document.getElementById("fpvbar");
    if (bar2) bar2.classList.toggle("on", st.on);
    const au = document.getElementById("fpv-auto");
    if (au) au.textContent = IDLE && IDLE.auto ? "挂机自动巡航中 · 触摸退出" : "";
    if (UI.domCv) UI.domCv.style.display = st.on ? "" : "none";
    const hide = ["#top", "#side", "#dock", "#compass", "#scale", "#panel", "#labels"];
    for (const s of hide) {
      const el = document.querySelector(s); if (!el) continue;
      if (st.on) { if (el.getAttribute("data-fpvhide") === null) el.setAttribute("data-fpvhide", el.style.display || ""); el.style.display = "none"; }
      else if (el.getAttribute("data-fpvhide") !== null) { el.style.display = el.getAttribute("data-fpvhide") || ""; el.removeAttribute("data-fpvhide"); }
    }
  }

