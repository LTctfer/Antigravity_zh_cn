#!/usr/bin/env python3
"""最小可用的 Electron ASAR 读写实现（仅标准库）。

布局（与 @electron/asar 一致）：
  0   uint32 = 4
  4   uint32 = 8 + paddedJsonLen
  8   uint32 = 4 + paddedJsonLen
  12  uint32 = jsonLen
  16  json + 0 填充到 4 字节对齐
  ...  文件内容（offset 相对 16 + paddedJsonLen）
"""
import hashlib, json, os, struct, sys

BLOCK = 4 * 1024 * 1024
MAGIC = 4


def read_header(path):
    with open(path, 'rb') as f:
        head = f.read(16)
        if len(head) < 16:
            raise ValueError('不是有效的 asar 文件: %s' % path)
        _, hsize, _, jsize = struct.unpack('<4I', head)
        f.seek(16)
        raw = f.read(jsize)
    return json.loads(raw.decode('utf-8')), 8 + hsize


def list_entries(asar_path):
    header, _ = read_header(asar_path)
    out = []

    def walk(node, prefix):
        for name, meta in node.get('files', {}).items():
            p = prefix + '/' + name
            if 'files' in meta:
                walk(meta, p)
            else:
                out.append((p, meta))

    walk(header, '')
    return out


def read_entry(asar_path, meta, base=None):
    if base is None:
        _, base = read_header(asar_path)
    if meta.get('unpacked'):
        return None
    with open(asar_path, 'rb') as f:
        f.seek(base + int(meta.get('offset', 0)))
        return f.read(int(meta.get('size', 0)))


def extract(asar_path, dest):
    header, base = read_header(asar_path)
    entries = list_entries(asar_path)
    with open(asar_path, 'rb') as f:
        for p, meta in entries:
            target = os.path.join(dest, p.lstrip('/').replace('/', os.sep))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if meta.get('unpacked'):
                with open(target + '.unpacked', 'w', encoding='utf-8') as o:
                    o.write(str(meta.get('size', 0)))
                continue
            f.seek(base + int(meta.get('offset', 0)))
            data = f.read(int(meta.get('size', 0)))
            with open(target, 'wb') as o:
                o.write(data)
    return entries


def _integrity(data):
    blocks = []
    for i in range(0, max(len(data), 1), BLOCK):
        chunk = data[i:i + BLOCK]
        if chunk:
            blocks.append(hashlib.sha256(chunk).hexdigest())
    return {
        'algorithm': 'SHA256',
        'hash': hashlib.sha256(data).hexdigest(),
        'blockSize': BLOCK,
        'blocks': blocks or [hashlib.sha256(b'').hexdigest()],
    }


def _write(entries, out_path, raw_of):
    """entries: [(path, meta)]；raw_of(path, meta) -> bytes | None(解包文件)"""
    root = {'files': {}}
    blobs = []
    offset = 0
    for path, meta in entries:
        parts = [p for p in path.split('/') if p]
        node = root
        for part in parts[:-1]:
            node = node['files'].setdefault(part, {'files': {}})
        data = raw_of(path, meta)
        meta = dict(meta)
        if data is None:
            meta['unpacked'] = True
            meta.pop('offset', None)
        else:
            meta['size'] = len(data)
            meta['offset'] = str(offset)
            meta['integrity'] = _integrity(data)
            offset += len(data)
            blobs.append(data)
        node['files'][parts[-1]] = meta

    payload = b''.join(blobs)
    js = json.dumps({'files': root['files']}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    padded = (len(js) + 3) & ~3
    header = struct.pack('<4I', MAGIC, 8 + padded, 4 + padded, len(js)) + js + b'\x00' * (padded - len(js))
    with open(out_path, 'wb') as f:
        f.write(header)
        f.write(payload)
    return {'files': len(entries), 'bytes': len(header) + len(payload)}


def repack(src_asar, dst_asar, replacements=None, removals=()):
    """在既有 asar 基础上替换/新增文件，未改动的条目原样搬运。"""
    replacements = replacements or {}
    _, base = read_header(src_asar)
    entries = [(p, m) for p, m in list_entries(src_asar) if p not in removals]
    known = {p for p, _ in entries}

    def raw_of(path, meta):
        if path in replacements:
            return replacements[path]
        if meta.get('unpacked'):
            return None
        with open(src_asar, 'rb') as f:
            f.seek(base + int(meta.get('offset', 0)))
            return f.read(int(meta.get('size', 0)))

    entries.sort(key=lambda x: x[0])
    for path in sorted(replacements):
        if path not in known:
            entries.append((path, {}))
    entries.sort(key=lambda x: x[0])
    return _write(entries, dst_asar, raw_of)


def pack(src_dir, out_path):
    entries = []
    for root, _dirs, names in os.walk(src_dir):
        for name in names:
            full = os.path.join(root, name)
            rel = '/' + os.path.relpath(full, src_dir).replace(os.sep, '/')
            if rel.endswith('.unpacked'):
                continue
            entries.append((rel, {}))
    entries.sort()

    def raw_of(path, meta):
        with open(os.path.join(src_dir, path.lstrip('/').replace('/', os.sep)), 'rb') as f:
            return f.read()

    return _write(entries, out_path, raw_of)


def summary(asar_path):
    return {'entries': len(list_entries(asar_path)), 'bytes': os.path.getsize(asar_path)}


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('用法: python tools/asar.py <extract|pack|list> src [dst]')
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == 'extract':
        print(json.dumps({'entries': len(extract(sys.argv[2], sys.argv[3]))}, ensure_ascii=False))
    elif cmd == 'pack':
        print(json.dumps(pack(sys.argv[2], sys.argv[3]), ensure_ascii=False))
    elif cmd == 'list':
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 20
        for p, meta in list_entries(sys.argv[2])[:limit]:
            print(meta.get('size'), 'unpacked' if meta.get('unpacked') else '', p)
    else:
        print('未知命令', cmd)
        sys.exit(2)
