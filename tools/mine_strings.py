#!/usr/bin/env python3
"""从 Antigravity workbench bundle 中挖出候选 UI 文案。"""
import json, re, sys, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else 'ref/web/main.js'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'ref/candidates.json'

s = open(SRC, encoding='utf-8', errors='replace').read()

STOP = re.compile(r'^(https?://|data:|vscode-|/|\.|#|\$|[A-Za-z0-9_-]+\.(js|css|png|svg|json|ts|tsx|md)$)')
CODEISH = re.compile(r'(=>|\breturn\b|function|\.\w+\(|\bconst\b|;;|\{\}|\[\]|\\u|\\x|^[a-z][a-zA-Z0-9]*$|_id\b|px$|^0x)')
BADCH = set(['{', '}', '<', '>', '`', '\n', '\t', '\\', '%s', '%d'])


def looks_ui(t):
    if not (2 <= len(t) <= 160):
        return False
    if STOP.search(t):
        return False
    if CODEISH.search(t):
        return False
    for ch in BADCH:
        if ch in t:
            return False
    if not re.search(r'[A-Za-z]{2}', t):
        return False
    words = t.split()
    if len(words) == 1:
        w = words[0]
        return bool(re.fullmatch(r'[A-Z][a-z]+[A-Za-z]*', w) or re.fullmatch(r'[A-Z]{2,6}', w))
    if re.search(r'[a-z][A-Z][a-z]', t):
        return False
    return True


cands = collections.Counter()
for m in re.finditer(r'"((?:[^"\\\n]|\\.){2,200})"', s):
    t = m.group(1).strip()
    if looks_ui(t):
        cands[t] += 1
for m in re.finditer(r'`((?:[^`\\]|\\.){2,200})`', s):
    t = m.group(1).strip()
    t2 = re.sub(r'\$\{[^}]*\}', '{n}', t)
    if '{n}' in t2 and looks_ui(t2):
        cands[t2] += 1

items = sorted(cands.items(), key=lambda kv: (-kv[1], kv[0]))
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(items, f, ensure_ascii=False, indent=0)
print('candidates:', len(items), '->', OUT)
