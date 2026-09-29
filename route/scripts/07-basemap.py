#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""程序化底图 v3 —— 用 z13 高精度 DEM（16.4 m/px）生成
管线参数全部按"米"定义，与输出分辨率无关。
用法: make_base3.py [输出宽度] [风格 A|C] [输出路径]
"""
import gc
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RIVER = "/var/minis/workspace/river"
W_M, H_M = 63099.2, 46272.8
DEM = os.path.join(RIVER, "dem_z13.npy")
OUT_W = int(sys.argv[1]) if len(sys.argv) > 1 else 4096
STYLE = (sys.argv[2] if len(sys.argv) > 2 else "A").upper()
OUT = sys.argv[3] if len(sys.argv) > 3 else "/tmp/base3_%s.jpg" % STYLE
OUT_H = int(round(OUT_W * H_M / W_M))
RES = W_M / OUT_W                       # 米/像素
PATHW = json.load(open(os.path.join(RIVER, "path_snapped.json")))["world"]



def mem(tag):
    try:
        d = dict(l.split(':', 1) for l in open('/proc/self/status') if ':' in l)
        print('  [mem] %-14s RSS %6.0f MB  峰值 %6.0f MB' % (
            tag, int(d['VmRSS'].split()[0]) / 1024.0, int(d['VmPeak'].split()[0]) / 1024.0), flush=True)
    except Exception:
        pass

def arr(im):
    return np.asarray(im, dtype=np.float32)


def blurf(a, px):
    if px <= 0:
        return a
    f = max(2, int(round(px * 2.2)))
    h, w = a.shape
    im = Image.fromarray(a, "F")
    return arr(im.resize((max(4, w // f), max(4, h // f)), Image.BILINEAR).resize((w, h), Image.BICUBIC))


def up_f(a, size):
    return arr(Image.fromarray(a, "F").resize(size, Image.BICUBIC))


def fbm(shape, octaves=5, base_px=6.0, gain=0.5, seed=11):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(base_px * (2 ** o)))
        g = rng.normal(0, 1, (n, n)).astype(np.float32)
        out += arr(Image.fromarray(g, "F").resize((shape[1], shape[0]), Image.BICUBIC)) * amp
        tot += amp
        amp *= gain
    out /= tot
    return np.clip(out / (np.percentile(np.abs(out), 99) + 1e-6), -1.2, 1.2)


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


def river_widths(H, half_step_m=25.0, rise_m=8.0, max_half=1000.0):
    """沿航线逐点探测平坦低洼带半宽（从 DEM 反推真实河宽）"""
    h, w = H.shape
    n = len(PATHW)
    out = []
    for i in range(0, n, 2):
        X, Z = PATHW[i]
        j0, j1 = max(0, i - 2), min(n - 1, i + 2)
        tx, tz = PATHW[j1][0] - PATHW[j0][0], PATHW[j1][1] - PATHW[j0][1]
        L = np.hypot(tx, tz) or 1.0
        nx, nz = -tz / L, tx / L
        c = []
        for d in np.arange(-half_step_m, half_step_m + 1, half_step_m):
            x, y = world2px(X + nx * d, Z + nz * d, w, h)
            c.append(H[int(np.clip(y, 0, h - 1)), int(np.clip(x, 0, w - 1))])
        base = float(np.percentile(c, 10))
        half = 0.0
        for sgn in (1, -1):
            d = 0.0
            while d < max_half:
                d += half_step_m
                x, y = world2px(X + nx * d * sgn, Z + nz * d * sgn, w, h)
                if H[int(np.clip(y, 0, h - 1)), int(np.clip(x, 0, w - 1))] > base + rise_m:
                    break
            half = max(half, d)
        out.append(max(70.0, min(max_half, half * 0.90)))
    return out


def river_layer(shape, halfs):
    h, w = shape
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    pts = [world2px(PATHW[i][0], PATHW[i][1], w, h) for i in range(0, len(PATHW), 2)]
    for k in range(len(pts) - 1):
        r0 = halfs[k] / W_M * w
        r1 = halfs[min(k + 1, len(halfs) - 1)] / W_M * w
        (x0, y0), (x1, y1) = pts[k], pts[k + 1]
        dx, dy = x1 - x0, y1 - y0
        L = np.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        d.polygon([(x0 + nx * r0, y0 + ny * r0), (x1 + nx * r1, y1 + ny * r1),
                   (x1 - nx * r1, y1 - ny * r1), (x0 - nx * r0, y0 - ny * r0)], fill=255)
        for (x, y), r in (((x0, y0), r0), ((x1, y1), r1)):
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    m = arr(im) / 255.0
    inner = np.clip(m * 1.06, 0, 1)
    edge = np.clip(m - arr(im.filter(ImageFilter.MinFilter(5))) / 255.0, 0, 1)
    return inner, edge


def strip_lines(band, width_px=3):
    m = np.zeros(band.shape, bool)
    m[1:, :] |= band[1:, :] != band[:-1, :]
    m[:, 1:] |= band[:, 1:] != band[:, :-1]
    if width_px > 1:
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(width_px))) > 127
    return m.astype(np.float32)


def main():
    H0 = np.load(DEM).astype(np.float32)
    mpp = W_M / H0.shape[1]
    print("DEM %s  %.1f m/px  → 输出 %dx%d（%.1f m/px）" % (H0.shape, mpp, OUT_W, OUT_H, RES), flush=True)

    mem("load")
    m = max(1.0, 16.0 / RES)                       # 分辨率补偿系数（相对 16 m/px）
    base = blurf(H0, 1.0 * m)                      # 轻度平滑（真实 DEM 不必多）
    del H0
    gc.collect()
    H = up_f(base, (OUT_W, OUT_H))
    del base
    gc.collect()

    mem("upsample")
    rough = np.clip(np.hypot(*np.gradient(H)) / RES / 45.0, 0, 1)
    detail = fbm((OUT_H, OUT_W), octaves=5, base_px=OUT_W / 900.0, gain=0.5, seed=17)
    Hd = H + detail * (3.0 + 22.0 * rough) * m
    del detail, rough, H
    gc.collect()

    # --- 多尺度晕渲（模糊半径按米换算）---
    big = hillshade(blurf(Hd, 100.0 / RES), 100.0, az_deg=315, alt_deg=40)
    mid = hillshade(blurf(Hd, 40.0 / RES), 40.0, az_deg=315, alt_deg=43)
    fine = hillshade(Hd, RES, az_deg=315, alt_deg=50)
    sh = np.clip(big * (0.55 + 0.48 * mid) + 0.20 * (fine - 0.5), 0, 1.25)
    del big, mid, fine
    gc.collect()

    mem("shading")
    ao = np.clip(0.5 + 0.5 * np.tanh((Hd - blurf(Hd, 240.0 / RES)) / (240.0 * 1.3)), 0, 1)

    # --- 水体 ---
    halfs = river_widths(np.load(DEM).astype(np.float32))
    riv, redge = river_layer((OUT_H, OUT_W), halfs)
    riv = np.clip(blurf(riv, 2.0) * 1.30, 0, 1)
    flat = np.clip(1.0 - np.abs(Hd - blurf(Hd, 130.0 / RES)) / 12.0, 0, 1) * np.clip(1.0 - (Hd - 40) / 300.0, 0, 1)
    water = np.clip(np.maximum(riv, flat * riv * 1.8), 0, 1)
    del flat, riv
    gc.collect()

    mem("water")
    out = np.zeros((OUT_H, OUT_W, 3), np.uint8)
    llight = (0.60 + 0.58 * sh).astype(np.float32)
    del sh
    gc.collect()
    CH = 256
    for y0 in range(0, OUT_H, CH):
        y1 = min(OUT_H, y0 + CH)
        hd = Hd[y0:y1]
        wt = water[y0:y1]
        re = redge[y0:y1]
        ll = llight[y0:y1]
        if STYLE == "A":
            edg = [(0, 0xc6, 0xd4, 0xb7), (150, 0xac, 0xc3, 0x96), (300, 0x90, 0xac, 0x77),
                   (450, 0xb6, 0xab, 0x77), (650, 0xcd, 0xbc, 0x8c), (850, 0xdd, 0xd0, 0xa9),
                   (1050, 0xea, 0xe1, 0xc6), (1250, 0xf7, 0xf4, 0xe9)]
            col = np.empty(hd.shape + (3,), np.uint8)
            for k in range(len(edg)):
                e, r, g, b = edg[k]
                hi = edg[k + 1][0] if k + 1 < len(edg) else 1e9
                col[(hd >= e) & (hd < hi)] = (r, g, b)
            img = col.astype(np.float32)
            del col
            img *= ll[:, :, None]
            # 水体
            deep = np.clip((150 - hd) / 220.0, 0, 1)[:, :, None]
            img *= (1 - wt[:, :, None])
            img += (np.array([0x4e, 0x89, 0xb0], np.float32) * (1 - deep)
                    + np.array([0x2a, 0x5e, 0x88], np.float32) * deep) * wt[:, :, None]
            img *= (1 - 0.22 * re[:, :, None])
            # 等高线
            b100 = np.floor(hd / 100.0)
            b500 = np.floor(hd / 500.0)
            m = np.zeros(hd.shape, bool)
            m[1:, :] |= b100[1:, :] != b100[:-1, :]
            m[:, 1:] |= b100[:, 1:] != b100[:, :-1]
            m[0, :] |= True
            c100 = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
            m = np.zeros(hd.shape, bool)
            m[1:, :] |= b500[1:, :] != b500[:-1, :]
            m[:, 1:] |= b500[:, 1:] != b500[:, :-1]
            m[0, :] |= True
            c500 = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
            wl = np.clip(1 - wt * 2.0, 0, 1)[:, :, None]
            c100 = c100[:, :, None] * wl
            c500 = c500[:, :, None] * wl
            img *= (1 - 0.40 * c100)
            img += 255.0 * (0.40 * c100)
            img *= (1 - 0.38 * c500)
            img += np.array([0x6e, 0x6a, 0x5c], np.float32) * (0.38 * c500)
            del c100, c500, wl, b100, b500, m
        else:
            ink = np.clip(np.tanh(np.clip(0.80 * (1 - ll), 0, 1) * 1.2) * 1.05, 0, 1)
            ink = ink * np.clip(0.20 + 1.00 * (1 - (hd - 80) / 1300.0), 0.08, 1.05)
            img = np.array([0xf7, 0xf4, 0xea], np.float32) * (1 - ink[:, :, None]) + \
                  np.array([0x37, 0x43, 0x48], np.float32) * ink[:, :, None]
            del ink
            mist = np.clip(1.0 - (hd - 60) / 320.0, 0, 1) * np.clip(1 - wt * 3, 0, 1)
            img *= (1 - 0.38 * mist[:, :, None])
            img += np.array([0xff, 0xff, 0xfd], np.float32) * (0.38 * mist)[:, :, None]
            del mist
            img *= (1 - wt[:, :, None] * 0.95)
            img += np.array([0x9c, 0xbb, 0xc9], np.float32) * (wt * 0.95)[:, :, None]
            img *= (1 - 0.16 * re[:, :, None])
            b200 = np.floor(hd / 200.0)
            m = np.zeros(hd.shape, bool)
            m[1:, :] |= b200[1:, :] != b200[:-1, :]
            m[:, 1:] |= b200[:, 1:] != b200[:, :-1]
            m[0, :] |= True
            cm = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), np.float32) / 255.0
            img *= (1 - 0.12 * (cm * np.clip(1 - wt * 2, 0, 1))[:, :, None])
        out[y0:y1] = np.clip(img, 0, 255).astype(np.uint8)
        del img
        print('  行 %d/%d' % (y1, OUT_H), flush=True)
    del llight, water, redge, Hd, ao
    gc.collect()
    n = fbm((OUT_H, OUT_W), octaves=3, base_px=OUT_W / 300.0, gain=0.5, seed=5) * 1.1
    out = np.clip(out.astype(np.float32) + n[:, :, None], 0, 255).astype(np.uint8)
    del n
    gc.collect()
    mem("done")
    Image.fromarray(out).save(OUT, quality=90, optimize=True, progressive=True, subsampling=0)
    print("写出 %s  %dx%d  %.2f MB" % (OUT, OUT_W, OUT_H, os.path.getsize(OUT) / 1e6))
    return




if __name__ == "__main__":
    main()
