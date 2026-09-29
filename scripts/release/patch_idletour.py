import sys, os

src, mod_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8', errors='ignore').read()
mod = open(mod_path, encoding='utf-8').read()

anchor = '$("#btn-tour").onclick = () => {'
i = s.find(anchor)
assert i > 0, '未找到 #btn-tour 处理函数'
# 用花括号配平找到函数体结尾
b = s.index('{', i)
depth, j = 0, b
while j < len(s):
    c = s[j]
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
    j += 1
end = s.index(';', j) + 1          # 函数体后的分号
print('锚点 @%d，函数体 %d..%d' % (i, b, end))
print('插入点前 60 字符: %r' % s[end-60:end])

assert out != src
s2 = s[:end] + "\n" + mod + s[end:]
with open(out, 'w', encoding='utf-8') as f:
    f.write(s2)
    f.flush()
    os.fsync(f.fileno())
v = open(out, encoding='utf-8', errors='ignore').read()
assert v.count('IDLETOUR') >= 2 and 'IDLE_MS = 60000' in v and v.count('state.tour = !state.tour') == 1
print('写出 %s  %.3f MB（原 %.3f MB，+%.1f KB）' % (out, os.path.getsize(out)/1e6, len(s)/1e6, (os.path.getsize(out)-len(s))/1e3))
print('校验: IDLETOUR 注入 1 次 ✓   btn-tour 处理函数保留:', v.count('state.tour = !state.tour') == 1)
