#!/usr/bin/env python3
"""把词典、规则和内核打包成可注入的 zh-cn.pack.js。

产物:
  build/zh-cn.pack.js   注入包（含 window.__ZHCN_CONFIG__ + 内核）
  src/dict.zh-CN.json   合并后的主词典（便于后续维护/社区翻译）
"""
import json, os, sys, time, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
BUILD = os.path.join(ROOT, 'build')
VERSION = '1.0.0'


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def main():
    os.makedirs(BUILD, exist_ok=True)
    dicts = []
    for name in sorted(os.listdir(SRC)):
        if name.startswith('dict.') and name.endswith('.json'):
            d = load_json(os.path.join(SRC, name), {})
            if isinstance(d, dict):
                dicts.append((name, d))
    merged = {}
    dup = 0
    for name, d in dicts:
        for en, zh in d.items():
            if en in merged and merged[en] != zh:
                dup += 1
            merged[en] = zh
    # 去掉与英文完全相同的空翻译
    merged = {k: v for k, v in merged.items() if v and v != k}

    rules = load_json(os.path.join(SRC, 'rules.zh-CN.json'), [])
    rules = [r for r in rules if isinstance(r, list) and len(r) == 2]

    with open(os.path.join(SRC, 'dict.zh-CN.json'), 'w', encoding='utf-8') as f:
        json.dump(dict(merged), f, ensure_ascii=False, indent=1, sort_keys=True)

    kernel = open(os.path.join(SRC, 'kernel.js'), encoding='utf-8').read()
    cfg = {
        'version': VERSION,
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'dict': merged,
        'rules': rules,
    }
    out = io.StringIO()
    out.write('/* Antigravity 中文语言层 v%s — %s\n' % (VERSION, cfg['builtAt']))
    out.write(' * 词条 %d 条，动态规则 %d 条。由 tools/build.py 生成，勿手工编辑 build 产物。\n */\n' % (len(merged), len(rules)))
    out.write('window.__ZHCN_CONFIG__ = ')
    json.dump(cfg, out, ensure_ascii=False, separators=(',', ':'))
    out.write(';\n')
    out.write(kernel)
    pack = out.getvalue()
    with open(os.path.join(BUILD, 'zh-cn.pack.js'), 'w', encoding='utf-8') as f:
        f.write(pack)

    with open(os.path.join(BUILD, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': VERSION, 'builtAt': cfg['builtAt'], 'entries': len(merged), 'rules': len(rules)},
                  f, ensure_ascii=False, indent=2)

    print('词条: %d（重复覆盖 %d）' % (len(merged), dup))
    print('规则: %d' % len(rules))
    print('注入包: %s  %.1f KB' % (os.path.join(BUILD, 'zh-cn.pack.js'), len(pack.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
