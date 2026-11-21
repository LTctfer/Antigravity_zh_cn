#!/usr/bin/env python3
"""从 workbench bundle 中按 JSX/属性语义挖 UI 文案，过滤库噪音。

用法: python tools/mine_ui.py [main.js] [out.json]
输出: [{"text": str, "where": [keys...], "count": n}]
"""
import json, re, sys, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else 'ref/web/main.js'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'ref/ui_strings.json'

s = open(SRC, encoding='utf-8', errors='replace').read()

KEYS = r'(?:children|label|title|placeholder|description|tooltip|ariaLabel|aria-label|alt|message|header|subtitle|heading|headingText|text|hint|emptyText|confirmLabel|cancelLabel|buttonLabel|tooltipText|displayName|name|summary|details|body|caption|content|dialogTitle|menuLabel|actionLabel|statusText|errorText|helpText|toast|notice|banner|promptMessage)'
# key:"string"  |  key=:`template`
pat = re.compile(KEYS + r'\s*[:=]\s*(?:"((?:[^"\\\n]|\\.){1,200})"|`((?:[^`\\]|\\.){1,200})`)')

BADCH = set(['{', '}', '<', '>', '\n', '\t', '\\', '%s', '%d'])
CODE = re.compile(r'(=>|\breturn\b|\bfunction\b|\.map\(|\.filter\(|\bconst\b|;;|^\s*[a-z]+[A-Z]|\bpx\b|^-?\d|\bvscode\b|^\w+\.(js|ts|css)$)')
STOPWORD = re.compile(r'^(?:[a-z][A-Za-z0-9]*|[A-Z][a-z]+[A-Z][A-Za-z]*)$')  # 驼峰标识符


def ok(t):
    t = t.strip()
    if not (2 <= len(t) <= 160):
        return None
    if STOPWORD.match(t):
        return None
    if CODE.search(t):
        return None
    for ch in BADCH:
        if ch in t:
            return None
    if not re.search(r'[A-Za-z]{2}', t):
        return None
    if re.match(r'^[A-Za-z0-9_.\-]+$', t) and ' ' not in t and not re.match(r'^[A-Z]?[a-z]+$', t):
        return None
    return t


hits = collections.defaultdict(lambda: {'where': set(), 'count': 0, 'n': 0})
for m in pat.finditer(s):
    key = m.group(0).split(':')[0].split('=')[0].strip()
    raw = m.group(1) if m.group(1) is not None else m.group(2)
    if raw is None:
        continue
    t = raw
    if m.group(2) is not None:
        # 模板串 -> 把 ${...} 归一成 {n}
        t = re.sub(r'\$\{[^}]*\}', '{n}', t)
        if '{n}' in t:
            t = t.replace('{n}', '{n}')
    t = t.strip()
    if not t:
        continue
    got = ok(t)
    if not got:
        continue
    rec = hits[got]
    rec['where'].add(key)
    rec['count'] += 1

out = [{'text': k, 'where': sorted(v['where']), 'count': v['count']} for k, v in hits.items()]
out.sort(key=lambda x: (-x['count'], x['text']))
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print('ui strings:', len(out), '->', OUT)
