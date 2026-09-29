#!/usr/bin/env python3
"""把用户手绘的长江折线做"有限度平滑"：
   - centripetal Catmull-Rom 细分 → 高斯平滑 → 偏离超过 CAP 就拉回
   - 输出控制点 + 统计（全长 / 最大偏离 / 最小曲率半径）
坐标：米制局部坐标，X 东 / Z 南，原点 = 图幅中心（与主程序 toLocal 完全一致）
"""
import json
import numpy as np

MPP = 8.216
TEXW, TEXH = 7680, 5632
CAP = 100.0                     # 允许偏离用户原线的最大值（米）
SIGMA = 260.0                   # 平滑尺度（米）

pts = np.array(json.load(open('user_pts.json')), dtype=float)
M = np.stack([(pts[:, 0] - TEXW / 2) * MPP, (pts[:, 1] - TEXH / 2) * MPP], axis=1)


def catmull(P, n=40):
    ext = np.vstack([P[0] + (P[0] - P[1]), P, P[-1] + (P[-1] - P[-2])])
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                              + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return np.array(out)


def resample(P, step):
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    t = np.arange(0, s[-1], step)
    return np.stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])], axis=1)


def gsmooth(P, sigma_m, step=25.0):
    Q = resample(P, step)
    k = max(3, int(sigma_m / step * 3) | 1)
    x = np.arange(k) - k // 2
    g = np.exp(-0.5 * (x / (sigma_m / step)) ** 2)
    g /= g.sum()
    pad = k // 2
    Xp = np.pad(Q[:, 0], pad, mode='edge')
    Zp = np.pad(Q[:, 1], pad, mode='edge')
    return np.stack([np.convolve(Xp, g, 'valid'), np.convolve(Zp, g, 'valid')], axis=1)


def closest(P, Q):
    """Q 中每点到折线 P 的最近距离与最近点坐标"""
    bd = np.full(len(Q), np.inf)
    bp = np.zeros_like(Q)
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        v = b - a
        L2 = float(v @ v) or 1e-9
        t = np.clip(((Q - a) @ v) / L2, 0, 1)
        proj = a + t[:, None] * v
        d = np.linalg.norm(Q - proj, axis=1)
        m = d < bd
        bd[m] = d[m]
        bp[m] = proj[m]
    return bd, bp


def min_radius(P):
    r = []
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        ab = np.linalg.norm(b - a); bc = np.linalg.norm(c - b); ca = np.linalg.norm(a - c)
        area = abs(np.cross(b - a, c - b)) / 2
        r.append((ab * bc * ca) / (4 * area) if area > 1e-6 else 1e9)
    return np.array(r)


def rdp(P, eps):
    if len(P) < 3:
        return P
    a, b = P[0], P[-1]
    v = b - a
    L2 = float(v @ v) or 1e-9
    w = P[1:-1] - a
    t = np.clip((w @ v) / L2, 0, 1)
    d = np.linalg.norm(P[1:-1] - (a + t[:, None] * v), axis=1)
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(P[:i + 2], eps)[:-1], rdp(P[i + 1:], eps)])
    return np.vstack([a, b])


dense = catmull(M, 40)
arc0 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))])[-1]
S = gsmooth(dense, SIGMA)
for _ in range(8):
    S = gsmooth(S, 150)
    d, p = closest(dense, S)
    over = d > CAP
    if over.any():
        S[over] = p[over] + (S[over] - p[over]) / d[over][:, None] * CAP
    else:
        break
d, _ = closest(dense, S)
print('原始折线全长 %.2f km' % (arc0 / 1000))
print('平滑后偏离：最大 %.1f m  平均 %.1f m  (上限 %.0f m)' % (d.max(), d.mean(), CAP))

S2 = resample(S, 120.0)
len_s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(S2, axis=0), axis=1))])
rr = min_radius(S2)
j = int(np.argmin(rr))
print('平滑后全长 %.2f km' % (len_s[-1] / 1000))
print('最小曲率半径 %.0f m，位于 %.0f%% 处（原来的折角半径只有几十米）' % (rr[j], 100 * len_s[j] / len_s[-1]))
print('曲率半径 < 500 m 的点占比 %.0f%%' % (100 * (rr < 500).mean()))

C = rdp(S2, 12.0)
print('控制点：%d 个（用户原来 %d 个）' % (len(C), len(M)))
json.dump({'v': 1, 'units': 'meters', 'frame': 'local metres, X east / Z south, origin = map centre',
           'cap_m': CAP, 'world': C.round(1).tolist()}, open('path_smoothed.json', 'w'))
np.save('world_dense.npy', S2)
print('saved: path_smoothed.json, world_dense.npy')
