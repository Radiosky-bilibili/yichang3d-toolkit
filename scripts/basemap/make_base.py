#!/usr/bin/env python3
"""用 DEM + 航线数据程序化生成底图纹理（替代卫星影像）。

风格：
  A  standard  —— 晕渲 + 高程色带 + 等高线 + 水系（通用/专业）
  C  ink       —— 水墨三峡（宣纸底 + 墨色山峦 + 淡青水系）
输出 JPEG，尺寸由 OUT_W 控制（默认 4096，宽高比按图幅 63099.2 × 46272.8）。
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageChops

RIVER = "/var/minis/workspace/river"
DEM = os.path.join(RIVER, "dem_2171481.png")
PATH = os.path.join(RIVER, "path_snapped.json")
W_M, H_M = 63099.2, 46272.8          # 图幅（米）
OUT_W = int(sys.argv[1]) if len(sys.argv) > 1 else 4096
STYLE = sys.argv[2] if len(sys.argv) > 2 else "A"
OUT = sys.argv[3] if len(sys.argv) > 3 else "/tmp/base_%s.jpg" % STYLE
OUT_H = int(round(OUT_W * H_M / W_M))
# 地标（用于地名标注前的定位参考，可留空）
LANDMARKS = json.load(open(os.path.join(RIVER, "landmarks.json")))
if isinstance(LANDMARKS, dict):
    LANDMARKS = LANDMARKS.get("landmarks") or LANDMARKS.get("items") or []


# ---------------------------------------------------------------- DEM
def load_height():
    rgb = np.asarray(Image.open(DEM).convert("RGB")).astype(np.float32)
    return (rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256.0) - 32768.0


def up(arr, size):
    im = Image.fromarray(arr.astype(np.float32), mode="F")
    return np.asarray(im.resize(size, Image.BICUBIC), dtype=np.float32)


def smooth(a, px):
    """float32 数组的快速模糊（缩放近似，PIL 不支持对 F 模式做 GaussianBlur）"""
    if px <= 0:
        return a
    f = max(2, int(round(px * 2.2)))
    h, w = a.shape
    im = Image.fromarray(a.astype(np.float32), mode="F")
    small = im.resize((max(4, w // f), max(4, h // f)), Image.BILINEAR)
    return np.asarray(small.resize((w, h), Image.BICUBIC), dtype=np.float32)


# ---------------------------------------------------------------- 光照
def hillshade(H, res_m, az_deg=315.0, alt_deg=42.0):
    """标准 hillshade（用本地梯度，注意 y 向下为南）。"""
    dy, dx = np.gradient(H)
    dx /= res_m
    dy /= res_m
    slope = np.arctan(np.hypot(dx, dy) * 1.0)
    aspect = np.arctan2(-dy, dx)                     # -dy: 北为正
    az = np.radians(360.0 - az_deg + 90.0)
    alt = np.radians(alt_deg)
    sh = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(sh, 0, 1)


def curvature_ao(H, res_m, r=6):
    """粗略的环境光遮蔽：与邻域均值比较，凹处更暗。"""
    m = smooth(H, r)
    d = (H - m) / (res_m * r * 1.6)
    return np.clip(0.5 + 0.5 * np.tanh(d), 0, 1)


# ---------------------------------------------------------------- 色带
def ramp(H, stops):
    """stops: [(elev, (r,g,b)), ...] 升序"""
    out = np.zeros(H.shape + (3,), np.float32)
    es = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32)
    for c in range(3):
        out[:, :, c] = np.interp(H, es, cs[:, c])
    return out


RAMP_NAT = [(0, (0x4a, 0x6b, 0x52)), (120, (0x6c, 0x84, 0x5c)), (260, (0x8b, 0x9a, 0x62)),
            (420, (0xa8, 0xa5, 0x6e)), (620, (0xbc, 0xac, 0x83)), (820, (0xc9, 0xbd, 0x9c)),
            (1000, (0xdd, 0xd6, 0xc2)), (1300, (0xf1, 0xee, 0xe6)), (1500, (0xff, 0xff, 0xff))]


# ---------------------------------------------------------------- 等高线与水系
def contour_mask(H, step=100.0, res_m=1.0):
    band = np.floor(H / step)
    m = np.zeros(H.shape, bool)
    m[1:, :] |= band[1:, :] != band[:-1, :]
    m[:, 1:] |= band[:, 1:] != band[:, :-1]
    return m


def river_mask(shape, w_m=760.0, soft=True):
    """按航线数据画水体 ribbon：世界米 → 纹理像素。"""
    sx = shape[1] / W_M
    sy = shape[0] / H_M
    im = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    wp = json.load(open(PATH))["world"]
    pts = [((X + W_M / 2) * sx, (Z + H_M / 2) * sy) for X, Z in wp]
    r = w_m / W_M * shape[1]
    d.line(pts, fill=255, width=max(2, int(r * 2)), joint="curve")
    # 端头圆点和更宽的水面（下游更宽）
    for i, (x, y) in enumerate(pts):
        t = i / max(1, len(pts) - 1)
        rr = r * (0.85 + 0.75 * t)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    m = np.asarray(im, np.float32) / 255.0
    if soft:
        m = np.clip(m + 0.65 * np.asarray(im.filter(ImageFilter.GaussianBlur(OUT_W / 1600)), np.float32) / 255.0, 0, 1)
    return m


# ---------------------------------------------------------------- 输出组装
def shade_style_A(H, res_m, W, Hs, riv):
    base = ramp(Hs, RAMP_NAT)
    sh = hillshade(Hs, res_m, az_deg=315, alt_deg=46)
    sh = smooth(sh, 1.2)
    ao = curvature_ao(Hs, res_m, r=8)
    light = 0.42 + 0.62 * sh
    img = base * light[:, :, None] * (0.86 + 0.28 * ao)[:, :, None]
    # 高光/暖调
    img += (np.clip(sh - 0.72, 0, 1)[:, :, None] * base * 0.35)
    # 水体
    water_top = np.array([0x2f, 0x6b, 0x8a], np.float32)
    water_bot = np.array([0x1d, 0x4a, 0x66], np.float32)
    depth = np.clip((120 - Hs) / 160.0, 0, 1)[:, :, None]
    wcol = water_top * (1 - depth) + water_bot * depth
    img = img * (1 - riv[:, :, None]) + wcol * riv[:, :, None]
    # 等高线
    cm = contour_mask(Hs, 100.0)
    cmj = np.asarray(Image.fromarray((cm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
    img = img * (1 - 0.16 * cmj[:, :, None]) + np.array([0x33, 0x3d, 0x40], np.float32) * (0.16 * cmj)[:, :, None]
    return img


def shade_style_C(H, res_m, W, Hs, riv):
    paper = np.array([0xf5, 0xf0, 0xe4], np.float32)
    ink = np.array([0x4a, 0x52, 0x55], np.float32)
    sh = hillshade(Hs, res_m, az_deg=315, alt_deg=38)
    sh = smooth(sh, 1.6)
    # 坡度越陡越"墨"
    dy, dx = np.gradient(Hs)
    grad = np.hypot(dx, dy) / res_m
    ink_amt = np.clip(0.55 * (1 - sh) + 0.55 * np.tanh(grad / 42.0), 0, 1)
    ink_amt = smooth(ink_amt, 1.4)
    # 高海拔也压墨
    ink_amt = ink_amt * np.clip(0.35 + 0.85 * (1 - (Hs - 60) / 1200.0), 0.15, 1.1)
    img = paper * (1 - ink_amt[:, :, None]) + ink * ink_amt[:, :, None]
    # 河谷留白 + 淡青水
    water = np.array([0xa8, 0xc4, 0xcf], np.float32)
    img = img * (1 - riv[:, :, None] * 0.92) + water * (riv[:, :, None] * 0.92)
    # 细墨线等高线
    cm = contour_mask(Hs, 200.0)
    cmj = np.asarray(Image.fromarray((cm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
    img = img * (1 - 0.10 * cmj[:, :, None])
    return img


def noise_texture(shape, amp=5.0):
    rng = np.random.default_rng(7)
    n = rng.normal(0, 1, (shape[0] // 2, shape[1] // 2)).astype(np.float32)
    n = np.asarray(Image.fromarray(n, "F").resize((shape[1], shape[0]), Image.BICUBIC), np.float32)
    n = n / (np.abs(n).max() + 1e-6)
    return (n * amp)[:, :, None]


def main():
    H = load_height()
    size = (OUT_W, OUT_H)
    print("DEM %s → 输出 %dx%d（%.1f m/px）" % (H.shape, OUT_W, OUT_H, W_M / OUT_W))
    Hs = up(H, size)
    res_m = W_M / OUT_W
    riv = river_mask((OUT_H, OUT_W), w_m=780.0)
    if STYLE.upper() == "A":
        img = shade_style_A(H, res_m, OUT_W, Hs, riv)
    else:
        img = shade_style_C(H, res_m, OUT_W, Hs, riv)
    img = img + noise_texture(img.shape[:2], amp=4.0)
    out = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(OUT, quality=88, optimize=True, progressive=True, subsampling=0)
    print("写出 %s  %.2f MB" % (OUT, os.path.getsize(OUT) / 1e6))


if __name__ == "__main__":
    main()
