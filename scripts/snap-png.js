/* =====================================================================
 * snapPNG —— 无损导出当前画面（绕开 JPEG 4:2:0 色度子采样）
 *
 * 为什么需要它：
 *   canvas.toBlob("image/jpeg", q) 在 WebKit / Chromium 里 **固定使用 4:2:0
 *   色度子采样**，q 调到 1.0 也一样；缩放/二压之后，细笔画的文字边缘就会出现
 *   青/品红串色与彩色噪点。PNG 是无损、无子采样，所以正确做法是：
 *     ① 从 canvas 导出 PNG（本函数）
 *     ② 离线再转 JPEG，并显式指定 subsampling=0（4:4:4）
 *   WebGL 的 drawingBuffer 在合成后会被清空，因此必须在同一任务里
 *   render → drawImage 拷贝；本函数内置这一步（依赖页面已有的 window.frame()）。
 *
 * 用法（浏览器控制台 / 自动化里）：
 *   await snapPNG()                                   // 只拿 Blob
 *   await snapPNG({download:"yichang.png"})           // 触发浏览器下载
 *   await snapPNG({endpoint:"http://127.0.0.1:8765/__snap?name=a.png"})
 *                                                     // POST 到本地小服务落盘
 *   await snapPNG({scale:1})                          // 按 CSS 尺寸 1x 导出
 * ===================================================================== */
window.snapPNG = async function (opt) {
  opt = opt || {};
  var gl = document.getElementById("gl");          // WebGL canvas
  if (!gl) throw new Error("canvas #gl not found");
  var dpr = gl.width / gl.clientWidth;             // 设备像素比（本机 3）
  var k = dpr * (opt.scale || 1);

  if (typeof window.frame === "function") window.frame();   // 同步渲染一帧，保住缓冲区
  var out = document.createElement("canvas");
  out.width = Math.round(gl.clientWidth * k);
  out.height = Math.round(gl.clientHeight * k);
  var ctx = out.getContext("2d");
  ctx.drawImage(gl, 0, 0, out.width, out.height);  // 同一任务内拷贝（勿 await 在中间）

  if (opt.overlay !== false) snapPNG.renderOverlay(ctx, k); // 把 HTML 叠加层画成矢量

  var blob = await new Promise(function (res, rej) {
    out.toBlob(function (b) { b ? res(b) : rej(new Error("toBlob failed")); }, "image/png");
  });

  if (opt.endpoint) {                              // 落盘：本地 HTTP 服务
    try {
      await fetch(opt.endpoint, { method: "POST", mode: "no-cors", body: blob });
    } catch (e) { console.warn("POST 失败", e); }
  }
  if (opt.download) {                              // 或交给浏览器下载
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = opt.download;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 20000);
  }
  return blob;
};

/* 把叠加层（#labels 里的地标标签 / 圆点）按 3x 重画到 2D 画布上。
 * 思路：不依赖 html2canvas 之类的库，直接读 getComputedStyle + Range 的
 * 精确排版矩形，逐个元素重绘（背景、圆角、描边、文字），因此在设备像素
 * 尺度上渲染，文字是矢量的、边缘干净。 */
snapPNG.renderOverlay = function (ctx, k) {
  var root = document.getElementById("labels");
  if (!root) return;
  ctx.save();
  ctx.scale(k, k);
  ctx.textBaseline = "alphabetic";
  walk(root);
  ctx.restore();

  function rrect(x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function walk(el) {
    var s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;

    var bw = parseFloat(s.borderTopWidth) || 0;
    var rad = s.borderRadius || "0px";
    var radius = rad.indexOf("%") >= 0
      ? Math.min(r.width, r.height) * parseFloat(rad) / 100
      : parseFloat(rad) || 0;

    // 背景（CSS 的 border-box 布局：底色画在 padding-box 内）
    if (s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)") {
      rrect(r.left + bw, r.top + bw, r.width - 2 * bw, r.height - 2 * bw, radius - bw);
      ctx.fillStyle = s.backgroundColor;
      ctx.fill();
    }
    // 描边（CSS 边框在 border-box 内侧，故路径内缩 bw/2、线宽 bw）
    if (bw > 0 && s.borderTopStyle !== "none") {
      rrect(r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw, radius - bw / 2);
      ctx.strokeStyle = s.borderTopColor;
      ctx.lineWidth = bw;
      ctx.stroke();
    }

    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) {                       // 文本节点 → 用 Range 取精确位置
        var t = n.nodeValue.replace(/\s+/g, " ");
        if (!t.trim()) continue;
        var rg = document.createRange();
        rg.selectNodeContents(n);
        var b = rg.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        ctx.font = s.fontStyle + " " + s.fontWeight + " " + s.fontSize +
                   " " + s.fontFamily.replace(/"/g, "'");
        if ("letterSpacing" in ctx) {
          ctx.letterSpacing = (s.letterSpacing === "normal" ? "0px" : s.letterSpacing);
        }
        var m = ctx.measureText(t);
        var asc = m.actualBoundingBoxAscent || parseFloat(s.fontSize) * 0.78;
        var desc = m.actualBoundingBoxDescent || parseFloat(s.fontSize) * 0.22;
        ctx.fillStyle = s.color;
        ctx.fillText(t, b.left, b.top + (b.height + (asc - desc)) / 2);
      } else if (n.nodeType === 1) {
        walk(n);
      }
    }
  }
};
