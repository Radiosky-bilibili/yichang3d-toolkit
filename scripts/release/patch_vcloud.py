import sys
src, mod, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8', errors='ignore').read()
assert 'window.VCLOUD' not in s, '已注入过'
a = 'const flying = !!(flight && flight.active);'
assert s.count(a) == 1, '动画锚点不唯一'
s = s.replace(a, a + '\n    if (window.__vcloudTick) window.__vcloudTick(dt, camera, state, flying);')
b = 'window.frame = '
c2 = 'clouds.visible = flying;'
assert s.count(c2) == 1, '贴图云开关行未找到'
s = s.replace(c2, 'clouds.visible = flying && !window.__vcloudActive;')
assert s.count(b) == 1, '顶层锚点不唯一'
k = s.index(b)
mod_src = open(mod, encoding='utf-8').read()
s = s[:k] + '\n' + mod_src + '\n' + s[k:]
assert s.count('window.VCLOUD') >= 1 and s.count('__vcloudTick') >= 2
open(out, 'w', encoding='utf-8').write(s)
print('注入完成，输出 %d 字节' % len(s.encode()))
