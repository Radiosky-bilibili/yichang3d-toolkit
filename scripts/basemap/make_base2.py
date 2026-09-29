#!/usr/bin/env python3
"""程序化底图 v2 —— 用 DEM + 航线数据生成"像正经地形图"的底图（替代卫星影像）。

关键做法：
  1. 高度场：DEM 先轻度平滑消除 61m 采样造成的台阶，再升采样，叠加分形噪声（陡处细节更多）
  2. 晕渲：多尺度（大尺度明暗 × 细节高光），避免块状
  3. 水体：沿航线逐点测"平坦低洼带"宽度 → 变宽 ribbon（水库宽、峡谷窄，还原真实河宽）
     并叠加 DEM 平坦掩膜，得到自然岸线
  4. 色带：考究的 5–9 段色标；陡坡/背光偏冷，向阳偏暖
  5. 等高线：每 100 m 细线，每 500 m 略重
风格：A 标准地形图 / C 水墨三峡
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RIVER = "/var/minis/workspace/river"
W_M, H_M = 63099.2, 46272.8
OUT_W = int(sys.argv[1]) if len(sys.argv) > 1 else 3072
STYLE = (sys.argv[2] if len(sys.argv) > 2 else "A").upper()
OUT = sys.argv[3] if len(sys.argv) > 3 else "/tmp/base_%s.jpg" % STYLE
OUT_H = int(round(OUT_W * H_M / W_M))
RES = W_M / OUT_W                      # 米/像素
PATHW = json.load(open(os.path.join(RIVER, "path_snapped.json")))["world"]


# ---------------------------------------------------------------- 基础工具
def arr(im):
    return np.asarray(im, dtype=np.float32)


def blurf(a, r):
    """float 数组快速模糊（缩放近似）"""
    if r <= 0:
        return a
    f = max(2, int(round(r * 2.2)))
    h, w = a.shape
    im = Image.fromarray(a.astype(np.float32), "F")
    return arr(im.resize((max(4, w // f), max(4, h // f)), Image.BILINEAR).resize((w, h), Image.BICUBIC))


def up_f(a, size):
    return arr(Image.fromarray(a.astype(np.float32), "F").resize(size, Image.BICUBIC))


def load_dem():
    rgb = np.asarray(Image.open(os.path.join(RIVER, "dem_2171481.png")).convert("RGB")).astype(np.float32)
    return (rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256.0) - 32768.0


def fbm(shape, octaves=5, base=4, gain=0.5, seed=11):
    """分形噪声（用双三次插值随机网格近似）"""
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = int(base * (2 ** o))
        g = rng.normal(0, 1, (n, n)).astype(np.float32)
        layer = arr(Image.fromarray(g, "F").resize((shape[1], shape[0]), Image.BICUBIC))
        out += layer * amp
        tot += amp
        amp *= gain
    out /= tot
    s = np.percentile(np.abs(out), 99) + 1e-6
    return np.clip(out / s, -1.2, 1.2)


def hillshade(H, res_m, az_deg=315.0, alt_deg=45.0, zf=1.0):
    dy, dx = np.gradient(H)
    dx = dx / res_m * zf
    dy = dy / res_m * zf
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dy, dx)
    az = np.radians(360.0 - az_deg + 90.0)
    alt = np.radians(alt_deg)
    return np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)


def world2px(X, Z, w, h):
    return (X + W_M / 2) / W_M * w, (Z + H_M / 2) / H_M * h


# ---------------------------------------------------------------- 真实河宽
def river_widths(H, step_m=30.0, rise_m=9.0, max_half=1100.0):
    """沿航线逐点探测"平坦低洼带"半宽：向外行军直到地形抬升超过 rise_m"""
    h, w = H.shape
    res = W_M / w
    n = len(PATHW)
    out = []
    for i in range(0, n, 2):
        X, Z = PATHW[i]
        j0 = max(0, i - 2)
        j1 = min(n - 1, i + 2)
        tx, tz = PATHW[j1][0] - PATHW[j0][0], PATHW[j1][1] - PATHW[j0][1]
        L = np.hypot(tx, tz) or 1.0
        nx, nz = -tz / L, tx / L
        # 中心基准高程（邻域最低）
        c = []
        for d in np.arange(-step_m, step_m + 1, step_m):
            x, y = world2px(X + nx * d, Z + nz * d, w, h)
            xi, yi = int(np.clip(x, 0, w - 1)), int(np.clip(y, 0, h - 1))
            c.append(H[yi, xi])
        base = float(np.percentile(c, 15))
        half = 0.0
        for sgn in (1, -1):
            d = 0.0
            while d < max_half:
                d += step_m
                x, y = world2px(X + nx * d * sgn, Z + nz * d * sgn, w, h)
                xi, yi = int(np.clip(x, 0, w - 1)), int(np.clip(y, 0, h - 1))
                if H[yi, xi] > base + rise_m:
                    break
            half = max(half, d)
        out.append(max(70.0, min(max_half, half * 0.92)))
    return out


def river_layer(shape, halfs, soft_px):
    w, h = shape[1], shape[0]
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    pts = []
    for k, i in enumerate(range(0, len(PATHW), 2)):
        X, Z = PATHW[i]
        pts.append(world2px(X, Z, w, h))
    for k in range(len(pts) - 1):
        r0 = halfs[k] / W_M * w
        r1 = halfs[min(k + 1, len(halfs) - 1)] / W_M * w
        x0, y0 = pts[k]
        x1, y1 = pts[k + 1]
        dx, dy = x1 - x0, y1 - y0
        L = np.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        d.polygon([(x0 + nx * r0, y0 + ny * r0), (x1 + nx * r1, y1 + ny * r1),
                   (x1 - nx * r1, y1 - ny * r1), (x0 - nx * r0, y0 - ny * r0)], fill=255)
        for (x, y), r in (((x0, y0), r0), ((x1, y1), r1)):
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    m = arr(im) / 255.0
    inner = np.clip(m * 1.15, 0, 1)
    edge = np.clip(m - arr(im.filter(ImageFilter.MinFilter(5))) / 255.0, 0, 1)
    return inner, edge


# ---------------------------------------------------------------- 主流程
def main():
    H0 = load_dem()
    base = blurf(H0, 1.1)                                  # 消台阶
    H = up_f(base, (OUT_W, OUT_H))
    rough = np.clip(np.hypot(*np.gradient(H)) / RES / 55.0, 0, 1)      # 0..1 粗糙度
    detail = fbm((OUT_H, OUT_W), octaves=4, base=3, gain=0.5, seed=17)
    Hd = H + detail * (10.0 + 70.0 * rough)                # 细节只在起伏处（大尺度）
    # --- 多尺度晕渲 ---
    big = hillshade(blurf(Hd, 3.2), RES * 3.2, az_deg=315, alt_deg=42)
    mid = hillshade(blurf(Hd, 1.2), RES * 1.2, az_deg=315, alt_deg=44)
    fine = hillshade(Hd, RES, az_deg=315, alt_deg=48)
    sh = np.clip(big * (0.62 + 0.42 * mid) + 0.16 * (fine - 0.5), 0, 1.2)
    # --- 环境光遮蔽 ---
    ao = np.clip(0.5 + 0.5 * np.tanh((Hd - blurf(Hd, 7)) / (RES * 7 * 1.4)), 0, 1)
    # --- 水体 ---
    halfs = river_widths(H0)
    riv, redge = river_layer((OUT_H, OUT_W), halfs, max(1.4, OUT_W / 1400))
    riv = np.clip(blurf(riv, max(0.8, OUT_W / 2600)) * 1.35, 0, 1)
    flat = np.clip(1.0 - np.abs(Hd - blurf(Hd, 5)) / 14.0, 0, 1) * np.clip(1.0 - (Hd - 40) / 260.0, 0, 1)
    water = np.clip(np.maximum(riv, flat * riv * 1.6), 0, 1)

    if STYLE == "A":
        # 现代扁平地形图：量化色带 + 低对比晕渲 + 白色等高线
        edg = [(0, 0xc3, 0xd2, 0xb4), (150, 0xa9, 0xc0, 0x93), (300, 0x8d, 0xa9, 0x74),
               (450, 0xb3, 0xa8, 0x74), (620, 0xcb, 0xba, 0x8a), (820, 0xdc, 0xcf, 0xa8),
               (1020, 0xea, 0xe1, 0xc6), (1250, 0xf7, 0xf4, 0xe9)]
        col = np.zeros(H.shape[:2] + (3,), np.float32)
        for k in range(len(edg)):
            e, r, g, b = edg[k]
            hi = edg[k + 1][0] if k + 1 < len(edg) else 1e9
            m = (Hd >= e) & (Hd < hi)
            col[m] = (r, g, b)
        # 低对比晕渲（保留形体的立体感但不脏）
        light = 0.60 + 0.58 * sh
        img = col * light[:, :, None]
        # 坡向冷暖（很淡）
        t = np.clip(sh * 1.1 - 0.15, 0, 1)[:, :, None]
        img = img * (np.array([0.97, 0.99, 1.03], np.float32) * (1 - t) + np.array([1.04, 1.01, 0.97], np.float32) * t)
        # 水体：干净的蓝色 + 岸线
        wcol = np.array([0x4e, 0x89, 0xb0], np.float32) * (1 - np.clip((150 - Hd) / 220, 0, 1))[:, :, None] + \
               np.array([0x2f, 0x63, 0x8c], np.float32) * np.clip((150 - Hd) / 220, 0, 1)[:, :, None]
        img = img * (1 - water[:, :, None]) + wcol * water[:, :, None]
        img = img * (1 - 0.22 * redge[:, :, None])
        # 白色细等高线（每 100 m）+ 深色主等高线（每 500 m）
        def clines(step):
            band = np.floor(Hd / step)
            m = np.zeros(H.shape[:2], bool)
            m[1:, :] |= band[1:, :] != band[:-1, :]
            m[:, 1:] |= band[:, 1:] != band[:, :-1]
            return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
        c100 = clines(100.0) * (1 - water * 2.0)
        c500 = clines(500.0) * (1 - water * 2.0)
        img = img * (1 - 0.42 * c100[:, :, None]) + 255.0 * (0.42 * c100)[:, :, None]
        img = img * (1 - 0.40 * c500[:, :, None]) + np.array([0x6e, 0x6a, 0x5c], np.float32) * (0.40 * c500)[:, :, None]
    else:
        # 水墨三峡：宣纸底 + 墨色山峦 + 淡青江水 + 留白雾
        paper = np.array([0xf7, 0xf4, 0xea], np.float32)
        inkd = np.array([0x39, 0x45, 0x4a], np.float32)
        ink = np.clip(0.78 * (1 - blurf(sh, 1.6)), 0, 1)
        ink = np.clip(np.tanh(ink * 1.15) * 1.05, 0, 1)
        ink = ink * np.clip(0.22 + 0.95 * (1 - (Hd - 80) / 1250.0), 0.10, 1.05)
        img = paper * (1 - ink[:, :, None]) + inkd * ink[:, :, None]
        # 云雾留白：低洼处提亮
        mist = np.clip(1.0 - (Hd - 60) / 300.0, 0, 1) * np.clip(1 - water * 3, 0, 1)
        img = img * (1 - 0.35 * mist[:, :, None]) + np.array([0xff, 0xff, 0xfd], np.float32) * (0.35 * mist)[:, :, None]
        wcol = np.array([0x9e, 0xbc, 0xc9], np.float32)
        img = img * (1 - water[:, :, None] * 0.95) + wcol * (water[:, :, None] * 0.95)
        img = img * (1 - 0.18 * redge[:, :, None])
        band = np.floor(Hd / 200.0)
        cm = np.zeros(H.shape[:2], bool)
        cm[1:, :] |= band[1:, :] != band[:-1, :]
        cm[:, 1:] |= band[:, 1:] != band[:, :-1]
        cm = np.asarray(Image.fromarray((cm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
        img = img * (1 - 0.13 * (cm * (1 - water * 2.0))[:, :, None])
    # 细颗粒（印刷感）
    n = fbm((OUT_H, OUT_W), octaves=3, base=6, gain=0.5, seed=5) * 1.8
    img = np.clip(img + n[:, :, None], 0, 255).astype(np.uint8)
    Image.fromarray(img).save(OUT, quality=88, optimize=True, progressive=True, subsampling=0)
    print("写出 %s  %dx%d  %.2f MB" % (OUT, OUT_W, OUT_H, os.path.getsize(OUT) / 1e6))


if __name__ == "__main__":
    main()
