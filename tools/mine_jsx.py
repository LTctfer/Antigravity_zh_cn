#!/usr/bin/env python3
"""补充挖掘：提取 JSX children 形式（createElement(...,"文本")）里的 UI 文案。"""
import re, json, collections, sys

BUNDLE = sys.argv[1] if len(sys.argv) > 1 else 'ref/web/main.js'
DICT = sys.argv[2] if len(sys.argv) > 2 else 'src/dict.zh-CN.json'
OUT = 'ref/new_strings.txt'

s = open(BUNDLE, encoding='utf-8', errors='replace').read()
known = json.load(open(DICT, encoding='utf-8'))

pat = re.compile(r'(?:,|\})"((?:[^"\\\n]|\\.){2,200})"\)')
BAD = re.compile(r'(=>|\breturn\b|function|^\s*[a-z]|;;|\{\}|\\u|\\x|^https?:|^/|\.\w+$)')
BADCH = set(['{', '}', '<', '>', '%s', '\\'])

c = collections.Counter()
for m in pat.finditer(s):
    t = m.group(1)
    if not re.search(r'[A-Za-z]{2}', t):
        continue
    if BAD.search(t):
        continue
    if re.search(r'[a-z][A-Z][a-z]', t):
        continue
    if any(ch in t for ch in BADCH):
        continue
    c[t] += 1

new = [(t, n) for t, n in c.items() if t not in known]
new.sort(key=lambda x: (-x[1], x[0]))
with open(OUT, 'w', encoding='utf-8') as f:
    for t, n in new:
        f.write('%d\t%s\n' % (n, t))
print('jsx-children 未收录:', len(new), '->', OUT)
