#!/usr/bin/env python3
"""从原始 index.html + fpv_module_master.js + hud_live.js 生成实时 FPV 版单文件 HTML。

补丁：
  1. animate() 里 flying 判定加入 FPV
  2. animate() 里 FPV 模式下用 FPV.tick(dt) 接管相机
  3. renderer.render(scene, camera) 之后调用 FPV.postRender()（画 HUD 叠加层）
  4. 注入 FPV 模块（HUD 段替换为自适应实时版）
"""
import os

ROOT = "/var/minis/workspace/fpv"
ORIG = "/var/minis/workspace/yichang3d-repo/index.html"
MOD = os.path.join(ROOT, "fpv_module_master.js")
HUD = os.path.join(ROOT, "hud_live.js")
OUT = os.path.join(ROOT, "yichang-3d-fpv.html")

src = open(ORIG, encoding="utf-8", errors="replace").read()

o1 = "  const flying = !!(flight && flight.active);"
assert src.count(o1) == 1, "flying"
src = src.replace(o1, "  const flying = !!(flight && flight.active) || !!(window.FPV && window.FPV.on);")

o2 = "    if (flying) {\n      flight.update(dt);\n    } else {"
assert src.count(o2) == 1, "update"
src = src.replace(o2, "    if (window.FPV && window.FPV.on) {\n      window.FPV.tick(dt);\n    } else if (flying) {\n      flight.update(dt);\n    } else {")

o3 = "    sky.position.copy(camera.position);\n    renderer.render(scene, camera);\n  }"
assert src.count(o3) == 1, "render hook (%d)" % src.count(o3)
src = src.replace(o3, "    sky.position.copy(camera.position);\n    renderer.render(scene, camera);\n    if (window.FPV && window.FPV.on && window.FPV.postRender) window.FPV.postRender();\n  }")

mod = open(MOD, encoding="utf-8").read()

# --- 用实时 HUD + UI 段替换原 HUD 段 ---
a = mod.index("  /* ---------- 5. HUD")
b = mod.index("  /* ---------- 6. 离屏出帧")
mod = mod[:a] + open(HUD, encoding="utf-8").read() + mod[b:]

# --- start/stop 里加 UI 刷新；补 toggle / postRender / 键盘 ---
old_start = """      st.on = true; st.s = 0; st.v = CFG.speed; st.t = 0; st.cardLm = null; st.cardA = 0;
      if (typeof flight !== "undefined" && flight) flight.active = false;
      return "FPV start: " + (TOTAL / 1000).toFixed(2) + " km, " + EVENTS.length + " 地标";"""
new_start = """      st.on = true; st.s = 0; st.v = CFG.speed; st.t = 0; st.cardLm = null; st.cardA = 0;
      st.lookInit = false;
      if (typeof flight !== "undefined" && flight) flight.active = false;
      if (typeof state !== "undefined" && state) { state.tour = false; state.autoRot = false; }
      if (window.noAnim) window.noAnim();
      initUI(); buildUI();
      return "FPV start: " + (TOTAL / 1000).toFixed(2) + " km, " + EVENTS.length + " 地标";"""
assert mod.count(old_start) == 1, "start"
mod = mod.replace(old_start, new_start)

old_stop = '    stop() { st.on = false; st.holdT = 0; IDLE.auto = false; resetIdle(); if (typeof buildUI === "function") buildUI(); return "FPV stop"; },'
new_stop = old_stop + '''
    toggle() { if (st.on) return FPV.stop(); return FPV.start(); },
    postRender() {                        // animate() 主场景渲染后调用：实时画 HUD（DOM 图层，30Hz 节流）
      if (!st.on) return;
      const now = performance.now();
      if (!st.hudLast || now - st.hudLast > 32 || (st.cardLm && now - st.hudLast > 20)) {
        drawHudDom(); st.hudLast = now;
      }
    },'''
assert mod.count(old_stop) == 1, "stop"
mod = mod.replace(old_stop, new_stop)

# 键盘 + 其他模式按钮联动（只绑一次）
mod = mod.replace("""  window.FPV = FPV;
})();""", """  /* 键盘 F 切换；点了程序的其它模式按钮则自动退出 FPV */
  (function bindOnce() {
    if (window.__fpvBound) return;
    window.__fpvBound = true;
    document.addEventListener("keydown", function (e) {
      if (e.key === "f" || e.key === "F") { if (!window.FPV.on) { FPV.start(); } else { FPV.stop(); } }
      else if (e.key === "Escape" && window.FPV.on) FPV.stop();
      else if ((e.key === "n" || e.key === "N" || e.key === "ArrowRight") && window.FPV.on) { FPV.next(); }
      else if ((e.key === "p" || e.key === "P" || e.key === "ArrowLeft") && window.FPV.on) { FPV.prev(); }
    });
    document.addEventListener("click", function (e) {
      const t = e.target.closest && e.target.closest("#btn-fly,#btn-tour,#btn-top,#btn-rot,#modes button");
      if (t && window.FPV && window.FPV.on) FPV.stop();
    });
    document.addEventListener("DOMContentLoaded", function () { try { buildUI(); } catch (err) { } });
    setTimeout(function () { try { buildUI(); } catch (err) { } }, 1200);
  })();

  window.FPV = FPV;
})();""")

k = src.rfind("</script>")
src = src[:k] + "\n\n/* ====== FPV 实时模块 (MINIS) ====== */\n" + mod + "\n" + src[k:]
open(OUT, "w", encoding="utf-8").write(src)
print("built %s  %.1f MB" % (OUT, os.path.getsize(OUT) / 1e6))
