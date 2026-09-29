#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 z13 Terrarium 瓦片拼成与图幅精确对齐的高精度 DEM（16.4 m/px）"""
import math, os
import numpy as np
from PIL import Image

Z = 13
X0, X1 = 6620, 6634
Y0, Y1 = 3356, 3366
LON0, LON1, LAT0, LAT1 = 110.918, 111.577, 30.487, 30.902
W_M, H_M = 63099.2, 46272.8
OUT = '/var/minis/workspace/river/dem_z13.npy'


def merc(lon, lat):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


# ---- 1. 拼瓦片 ----
W = (X1 - X0 + 1) * 256
H = (Y1 - Y0 + 1) * 256
big = np.zeros((H, W, 3), np.float32)
for ix in range(X0, X1 + 1):
    for iy in range(Y0, Y1 + 1):
        p = 't13/%d_%d.png' % (ix, iy)
        if not os.path.exists(p):
            print('缺瓦片', p); continue
        a = np.asarray(Image.open(p).convert('RGB'), np.float32)
        big[(iy - Y0) * 256:(iy - Y0 + 1) * 256, (ix - X0) * 256:(ix - X0 + 1) * 256] = a
print('拼接完成', big.shape)

# ---- 2. 按图幅 bbox 精确裁剪 ----
xa, ya = merc(LON0, LAT0)      # 西南（y 最大）
xb, yb = merc(LON1, LAT1)      # 东北（y 最小）
px0 = (xa - X0) * 256
px1 = (xb - X0) * 256
py0 = (yb - Y0) * 256
py1 = (ya - Y0) * 256
print('裁剪像素 x %.2f..%.2f  y %.2f..%.2f' % (px0, px1, py0, py1))
ox, oy = int(round(px0)), int(round(py0))
w = int(round(px1 - px0))
h = int(round(py1 - py0))
crop = big[oy:oy + h, ox:ox + w]
print('裁剪结果', crop.shape, '→ %.1f m/px' % (W_M / w))

# ---- 3. Terrarium 解码 ----
He = (crop[:, :, 0] * 256.0 + crop[:, :, 1] + crop[:, :, 2] / 256.0) - 32768.0
print('高程 %.0f ~ %.0f m  均值 %.0f' % (He.min(), He.max(), He.mean()))
np.save(OUT, He.astype(np.int16))
print('已保存', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))

# ---- 4. 与航线对齐自检 ----
import json
wp = json.load(open('/var/minis/workspace/river/path_snapped.json'))['world']
vals = []
for X, Z in wp:
    xi = int(np.clip((X + W_M / 2) / W_M * w, 0, w - 1))
    yi = int(np.clip((Z + H_M / 2) / H_M * h, 0, h - 1))
    vals.append(He[yi, xi])
vals = np.array(vals)
print('沿线高程 中位 %.0f m  最小 %.0f  最大 %.0f' % (np.median(vals), vals.min(), vals.max()))
