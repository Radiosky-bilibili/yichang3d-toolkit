#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 z13 瓦片重建程序内嵌 DEM（Terrarium RGB PNG，与图幅精确对齐）。
输出候选尺寸，用于权衡精度/体积。"""
import math, os
import numpy as np
from PIL import Image

RIVER = "/var/minis/workspace/river"
Z, X0, X1, Y0, Y1 = 13, 6620, 6634, 3356, 3366
LON0, LON1, LAT0, LAT1 = 110.918, 111.577, 30.487, 30.902
W_M, H_M = 63099.2, 46272.8


def merc(lon, lat):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


# ---- 拼瓦片并裁剪到 bbox（保持亚米精度，不做 int16 量化）----
W = (X1 - X0 + 1) * 256
H = (Y1 - Y0 + 1) * 256
big = np.zeros((H, W, 3), np.float32)
for ix in range(X0, X1 + 1):
    for iy in range(Y0, Y1 + 1):
        p = os.path.join(RIVER, 't13/%d_%d.png' % (ix, iy))
        if os.path.exists(p):
            a = np.asarray(Image.open(p).convert('RGB'), np.float32)
            big[(iy - Y0) * 256:(iy - Y0 + 1) * 256, (ix - X0) * 256:(ix - X0 + 1) * 256] = a
xa, ya = merc(LON0, LAT0)
xb, yb = merc(LON1, LAT1)
px0, px1 = (xa - X0) * 256, (xb - X0) * 256
py0, py1 = (yb - Y0) * 256, (ya - Y0) * 256
ox, oy = int(round(px0)), int(round(py0))
crop = big[oy:oy + int(round(py1 - py0)), ox:ox + int(round(px1 - px0))]
He = (crop[:, :, 0] * 256.0 + crop[:, :, 1] + crop[:, :, 2] / 256.0) - 32768.0
print('z13 裁切 %s  %.1f m/px  高程 %.1f~%.1f' % (crop.shape[:2], W_M / crop.shape[1], He.min(), He.max()))

for N in (1024, 1536, 2048):
    im = Image.fromarray(He.astype(np.float32), 'F').resize((N, N), Image.BOX)
    h = np.asarray(im, np.float32)
    q = np.rint(h).astype(np.int32) + 32768          # 量化到 1 m
    q = np.clip(q, 0, 65535)
    rgb = np.empty((N, N, 3), np.uint8)
    rgb[:, :, 0] = (q >> 8) & 0xFF
    rgb[:, :, 1] = q & 0xFF
    rgb[:, :, 2] = 0                                  # B 恒为 0 → PNG 压缩率大增
    out = os.path.join(RIVER, 'dem_app_%d.png' % N)
    Image.fromarray(rgb).save(out, optimize=True)
    sz = os.path.getsize(out) / 1e6
    print('  %d²  %.1f m/px  %.2f MB  （base64 后 %.2f MB）' % (N, W_M / N, sz, sz * 4 / 3))
