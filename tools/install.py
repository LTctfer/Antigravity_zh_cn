#!/usr/bin/env python3
"""Antigravity 简体中文语言层 — 安装 / 卸载 / 状态检查。

用法:
  python tools/install.py                # 安装（自动探测安装目录）
  python tools/install.py --dir "C:\\Users\\me\\AppData\\Local\\Programs\\antigravity"
  python tools/install.py --status       # 查看当前状态
  python tools/install.py --restore      # 还原为原始英文版
  python tools/install.py --force        # 应用正在运行时也强制替换

工作原理:
  1. 备份 resources/app.asar -> resources/app.asar.zh-cn.bak
  2. 往 asar 里加入 dist/zh-cn/main-hook.js 与 dist/zh-cn/zh-cn.pack.js
  3. 在 dist/main.js 的 "use strict" 之后插入 require('./zh-cn/main-hook.js')
  4. 重新打包并原子替换，写入 resources/zh-cn.manifest.json
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asar  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
SRC = os.path.join(ROOT, 'src')
MARK = "require('./zh-cn/main-hook.js')"
PREFIX = '/dist/zh-cn/'

CANDIDATES = [
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'antigravity'),
    os.path.join(os.environ.get('PROGRAMFILES', ''), 'Antigravity'),
    os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Antigravity'),
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Antigravity'),
]


def find_dir(explicit=None):
    if explicit:
        return os.path.abspath(explicit)
    for c in CANDIDATES:
        if c and os.path.isfile(os.path.join(c, 'resources', 'app.asar')):
            return c
    raise SystemExit('未找到 Antigravity 安装目录，请用 --dir 指定（包含 Antigravity.exe 的目录）')


def paths(app_dir):
    res = os.path.join(app_dir, 'resources')
    return {
        'dir': app_dir,
        'resources': res,
        'asar': os.path.join(res, 'app.asar'),
        'backup': os.path.join(res, 'app.asar.zh-cn.bak'),
        'manifest': os.path.join(res, 'zh-cn.manifest.json'),
    }


def sha256_file(path, limit=None):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def app_running():
    try:
        out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Antigravity.exe', '/NH'],
                             capture_output=True, timeout=20).stdout
        return b'Antigravity.exe' in out
    except Exception:
        return False


def read_manifest(p):
    try:
        with open(p['manifest'], encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def status(p):
    m = read_manifest(p)
    patched = False
    hook_present = False
    if os.path.isfile(p['asar']):
        entries = {k for k, _ in asar.list_entries(p['asar'])}
        hook_present = (PREFIX + 'zh-cn.pack.js') in entries
        main = None
        for k, meta in asar.list_entries(p['asar']):
            if k == '/dist/main.js':
                main = asar.read_entry(p['asar'], meta)
                break
        patched = bool(main and MARK.encode('utf-8') in main[:4096])
    return {
        'installDir': p['dir'],
        'asar': p['asar'],
        'backup': os.path.isfile(p['backup']),
        'installed': bool(hook_present and patched),
        'manifest': m,
        'running': app_running(),
    }


def patch_main_js(src):
    text = src.decode('utf-8', 'surrogateescape')
    if MARK in text:
        return src
    inject = MARK + ';\n'
    stripped = text.lstrip()
    lead = len(text) - len(stripped)
    if stripped.startswith('"use strict";'):
        cut = text.index('"use strict";') + len('"use strict";')
        out = text[:cut] + '\n' + inject + text[cut:]
    elif stripped.startswith("'use strict';"):
        cut = text.index("'use strict';") + len("'use strict';")
        out = text[:cut] + '\n' + inject + text[cut:]
    else:
        out = inject + text
    return out.encode('utf-8', 'surrogateescape')


def install(app_dir, force=False):
    p = paths(app_dir)
    if not os.path.isfile(p['asar']):
        raise SystemExit('未找到 %s' % p['asar'])
    if app_running() and not force:
        raise SystemExit('Antigravity 正在运行。请先完全退出（含托盘），或加 --force 强制替换。')

    pack_path = os.path.join(BUILD, 'zh-cn.pack.js')
    hook_path = os.path.join(SRC, 'main-hook.js')
    for f in (pack_path, hook_path):
        if not os.path.isfile(f):
            raise SystemExit('缺少 %s，请先运行 python tools/build.py' % f)

    # 备份原始 asar；应用升级后（当前 asar 已不是我们打过补丁的那份）自动刷新备份
    cur_hash = sha256_file(p['asar'])
    manifest_old = read_manifest(p) or {}
    cur_patched = False
    try:
        for k, meta in asar.list_entries(p['asar']):
            if k == '/dist/main.js':
                body = asar.read_entry(p['asar'], meta) or b''
                cur_patched = MARK.encode('utf-8') in body[:4096]
                break
    except Exception:
        pass

    if not os.path.isfile(p['backup']):
        shutil.copy2(p['asar'], p['backup'])
        print('已备份原始 app.asar ->', p['backup'])
    elif not cur_patched and manifest_old.get('originalSha256') not in (None, cur_hash):
        shutil.copy2(p['asar'], p['backup'])
        print('检测到 Antigravity 已升级，已刷新备份 ->', p['backup'])

    orig_hash = sha256_file(p['backup'])

    with open(pack_path, 'rb') as f:
        pack = f.read()
    with open(hook_path, 'rb') as f:
        hook = f.read()

    entries = {k: m for k, m in asar.list_entries(p['asar'])}
    main_key = '/dist/main.js'
    if main_key not in entries:
        raise SystemExit('asar 内缺少 dist/main.js，版本结构可能已变化')
    main_src = asar.read_entry(p['asar'], entries[main_key])

    replacements = {
        PREFIX + 'zh-cn.pack.js': pack,
        PREFIX + 'main-hook.js': hook,
        main_key: patch_main_js(main_src),
    }

    tmp = p['asar'] + '.zh-cn.tmp'
    info = asar.repack(p['asar'], tmp, replacements=replacements)

    # 校验新 asar
    new_entries = {k for k, _ in asar.list_entries(tmp)}
    for k in replacements:
        if k not in new_entries:
            os.remove(tmp)
            raise SystemExit('打包校验失败：缺少 %s' % k)

    replaced = False
    try:
        os.replace(tmp, p['asar'])
        replaced = True
    except OSError as exc:
        if not force:
            os.remove(tmp)
            raise SystemExit('替换 app.asar 失败（应用可能仍被占用）：%s' % exc)
        # 强制模式：先改名再落盘
        aside = p['asar'] + '.locked'
        try:
            os.replace(p['asar'], aside)
            os.replace(tmp, p['asar'])
            replaced = True
        finally:
            if os.path.isfile(aside):
                try:
                    os.remove(aside)
                except OSError:
                    pass

    manifest = {
        'name': 'Antigravity 简体中文语言层',
        'version': json.loads(open(os.path.join(BUILD, 'meta.json'), encoding='utf-8').read())['version']
        if os.path.isfile(os.path.join(BUILD, 'meta.json')) else '1.0.0',
        'installedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
        'originalSha256': orig_hash,
        'patchedSha256': sha256_file(p['asar']),
        'entries': info['files'],
        'marker': MARK,
    }
    with open(p['manifest'], 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print('安装完成：%s' % p['dir'])
    print('  注入文件：dist/zh-cn/main-hook.js, dist/zh-cn/zh-cn.pack.js')
    print('  入口挂钩：dist/main.js -> %s' % MARK)
    print('  重启 Antigravity 后生效。')


def restore(app_dir):
    p = paths(app_dir)
    if not os.path.isfile(p['backup']):
        raise SystemExit('没有找到备份，无法还原：%s' % p['backup'])
    if app_running():
        raise SystemExit('Antigravity 正在运行，请先完全退出后重试。')
    shutil.copy2(p['backup'], p['asar'])
    if os.path.isfile(p['manifest']):
        os.remove(p['manifest'])
    print('已还原为原始版本，重启 Antigravity 即可恢复英文界面。')


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('--dir')
    ap.add_argument('--status', action='store_true')
    ap.add_argument('--restore', action='store_true')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    app_dir = find_dir(args.dir)
    p = paths(app_dir)
    if args.status:
        print(json.dumps(status(p), ensure_ascii=False, indent=2))
        return
    if args.restore:
        restore(app_dir)
        return
    install(app_dir, force=args.force)
    print()
    print(json.dumps(status(p), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
