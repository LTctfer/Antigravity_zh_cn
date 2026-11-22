#!/usr/bin/env python3
"""将内核、词典与图形界面安装器编译为独立单文件 Antigravity中文助手.exe。

无需任何第三方打包库，直接调用 Windows 自带的 .NET Framework csc.exe。
"""
import argparse
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
BUILD = os.path.join(ROOT, 'build')
SRC = os.path.join(ROOT, 'src')


def find_csc():
    windir = os.environ.get('WINDIR', r'C:\Windows')
    patterns = [
        os.path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.*', 'csc.exe'),
        os.path.join(windir, 'Microsoft.NET', 'Framework', 'v4.*', 'csc.exe'),
    ]
    for pat in patterns:
        hits = sorted(glob.glob(pat), reverse=True)
        if hits:
            return hits[0]
    raise SystemExit('未找到 .NET Framework csc.exe，无法编译 EXE。')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'Antigravity中文助手.exe'))
    ap.add_argument('--skip-pack', action='store_true')
    args = ap.parse_args()

    if not args.skip_pack:
        sys.path.insert(0, TOOLS)
        import build  # noqa: E402
        build.main()

    pack_js = os.path.join(BUILD, 'zh-cn.pack.js')
    meta_json = os.path.join(BUILD, 'meta.json')
    hook_js = os.path.join(SRC, 'main-hook.js')
    cs_src = os.path.join(TOOLS, 'gui_installer.cs')
    ico_path = os.path.join(TOOLS, 'app.ico')
    manifest_path = os.path.join(TOOLS, 'app.manifest')

    for f in (pack_js, meta_json, hook_js, cs_src):
        if not os.path.isfile(f):
            raise SystemExit('缺少编译所需文件：%s' % f)

    csc = find_csc()
    out_exe = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_exe), exist_ok=True)

    cmd = [
        csc,
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/platform:anycpu',
        '/utf8output',
        '/r:System.dll',
        '/r:System.Core.dll',
        '/r:System.Drawing.dll',
        '/r:System.Windows.Forms.dll',
        '/r:System.Web.Extensions.dll',
        '/resource:%s,zh-cn.pack.js' % pack_js,
        '/resource:%s,main-hook.js' % hook_js,
        '/resource:%s,meta.json' % meta_json,
        '/out:%s' % out_exe,
    ]
    if os.path.isfile(ico_path):
        cmd.append('/win32icon:%s' % ico_path)
    if os.path.isfile(manifest_path):
        cmd.append('/win32manifest:%s' % manifest_path)
    cmd.append(cs_src)

    print('正在编译 EXE:', csc)
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if res.stdout.strip():
        print(res.stdout.strip())
    if res.stderr.strip():
        print(res.stderr.strip())
    if res.returncode != 0:
        raise SystemExit('编译失败（退出码 %d）' % res.returncode)

    size_kb = os.path.getsize(out_exe) / 1024.0
    print('生成成功: %s (%.1f KB)' % (out_exe, size_kb))


if __name__ == '__main__':
    main()
