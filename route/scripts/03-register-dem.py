#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重建程序内嵌 DEM（Terrarium RGB PNG），并补偿与程序现有框架的配准差。

背景：z13 原始瓦片 vs 程序内现有 DEM 相差 约 东 +555 m / 南 +370 m（同地形、不同配准）。
程序内现有 DEM 与卫星影像、用户手绘航线处于同一框架，故新 DEM 须做同样补偿。
"""
import json
import math
import os
import numpy as np
from PIL import Image

R = "/var/minis/workspace/river"
os.chdir(R)
W_M, H_M = 63099.2, 46272.8
SHIFT_E, SHIFT_S = 555.0, 370.0

xs = sorted({int(f.split('_')[0]) for f in os.listdir('t13')})
ys = sorted({int(f.split('_')[1].split('.')[0]) for f in os.listdir('t13')})
M = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
for iy, y in enumerate(ys):
    for ix, x in enumerate(xs):
        p = 't13/%d_%d.png' % (x, y)
        a = np.asarray(Image.open(p).convert('RGB'), np.float32)
        M[iy * 256:(iy + 1) * 256, ix * 256:(ix + 1) * 256] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def tf(lon, lat, z=13):
    n = 2 ** z
    return ((lon + 180) / 360 * n,
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)


x0, y1 = tf(110.91796875, 30.486550842588485)
x1, y0 = tf(111.5771484375, 30.90222470517144)
mpp = W_M / ((x1 - x0) * 256)
sx = (x0 - xs[0]) * 256 - SHIFT_E / mpp
sy = (y0 - ys[0]) * 256 - SHIFT_S / mpp
ex = (x1 - xs[0]) * 256 - SHIFT_E / mpp
ey = (y1 - ys[0]) * 256 - SHIFT_S / mpp
src = Image.fromarray(M, 'F')
for N, out in ((2048, 'dem_app_2048.png'), (1024, 'dem_app_1024_reg.png')):
    h = np.asarray(src.crop((round(sx), round(sy), round(ex), round(ey))).resize((N, N), Image.BOX), np.float32)
    q = np.clip(np.rint(h).astype(np.int32) + 32768, 0, 65535)
    rgb = np.empty((N, N, 3), np.uint8)
    rgb[:, :, 0] = (q >> 8) & 255
    rgb[:, :, 1] = q & 255
    rgb[:, :, 2] = 0
    tmp = out + '.tmp.png'
    Image.fromarray(rgb).save(tmp, optimize=True)
    os.replace(tmp, out)
    print('%s  %.0f~%.0f m  %.2f MB' % (out, h.min(), h.max(), os.path.getsize(out) / 1e6))
del M, src

# ---------------- 验证 ----------------
ho = np.load('/tmp/H_old.npy')
hn = np.asarray(Image.open('dem_app_2048.png').convert('RGB'), np.float32)
hn = hn[:, :, 0] * 256 + hn[:, :, 1] - 32768
hr = np.asarray(Image.fromarray(hn, 'F').resize((1024, 1024), Image.BOX), np.float32)
d = np.abs(hr - ho)
print('配准后 vs 旧 DEM：平均差 %.1f m  95%% 分位 %.1f m' % (d.mean(), np.percentile(d, 95)))
wp = json.load(open('path_snapped.json'))['world']


def voff(H2, N):
    o = []
    for i in range(2, len(wp) - 2, 6):
        X, Z = wp[i]
        X2, Z2 = wp[i + 2]
        t = math.hypot(X2 - X, Z2 - Z) or 1
        tx, tz = (X2 - X) / t, (Z2 - Z) / t
        nx, nz = -tz, tx
        e = [H2[int(np.clip((Z + nz * s + H_M / 2) / H_M * N, 0, N - 1)),
                int(np.clip((X + nx * s + W_M / 2) / W_M * N, 0, N - 1))]
             for s in np.arange(-1200, 1201, 20)]
        o.append(-1200 + int(np.argmin(np.array(e))) * 20)
    return np.median(o)


print('沿法线谷底偏移：旧 DEM %+.0f m   新 DEM(配准后) %+.0f m  ← 应接近' % (voff(ho, 1024), voff(hn, 2048)))
