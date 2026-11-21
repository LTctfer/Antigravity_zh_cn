// 覆盖率检查：注入语言包后，列出页面上仍然是英文的可见文案与属性。
// 用法: node tools/coverage.mjs [route1 route2 ...]
//   默认扫描若干常用路由；结果写入 build/untranslated.txt / .json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 9222;
const BASE = process.env.BASE_URL || 'https://127.0.0.1:10174';
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/settings', '/automations', '/customizations', '/projects'];
const root = path.dirname(fileURLToPath(import.meta.url));
const pack = fs.readFileSync(path.join(root, '..', 'build', 'zh-cn.pack.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page' && x.url.startsWith('https://127.0.0.1') && (!process.env.BASE_URL || x.url.startsWith(process.env.BASE_URL)));
      if (t) return t;
    } catch {}
    await sleep(500);
  }
  throw new Error('未找到可调试页面');
}

const target = await pickTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((r) => pending.set(mid, r));
};
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');

const COLLECT = `(() => {
  const CJK = /[\\u4e00-\\u9fff]/;
  const BAD = /^(?:https?:|mailto:|\\/|\\.|[a-z0-9_-]+\\.[a-z]{2,4}$)|[\\\\{}<>]|\\b[a-z]+_[a-z]+\\b|^[\\d.,%/\\s]+$/i;
  const out = new Set();
  const add = (s) => {
    if (!s) return;
    const t = s.replace(/\\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 220) return;
    if (CJK.test(t)) return;
    if (!/[A-Za-z]{2}/.test(t)) return;
    if (BAD.test(t)) return;
    if (/^[a-z]+$/.test(t)) return;                 // 单个小写词多为代码/路径
    if (/^[a-zA-Z0-9_-]+\\.[a-zA-Z]{1,4}$/.test(t)) return;
    out.add(t);
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest('script,style,code,pre,kbd,textarea,[contenteditable],[data-zhcn-skip],.markdown-body,[class*="markdown"]')) continue;
    add(n.nodeValue);
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
    if (el.closest('script,style,[data-zhcn-skip]')) continue;
    for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (v) add(v);
    }
  }
  return [...out];
})()`;

const found = new Map();
for (const route of routes) {
  await send('Page.navigate', { url: BASE + route });
  await sleep(3500);
  await evaluate(pack + '\n;"ok"');
  await sleep(1800);
  const list = await evaluate(COLLECT) || [];
  for (const s of list) {
    if (!found.has(s)) found.set(s, []);
    found.get(s).push(route);
  }
  console.log(`[${route}] 剩余英文 ${list.length}`);
}

const arr = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
fs.mkdirSync(path.join(root, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(root, '..', 'build', 'untranslated.txt'), arr.map(([s, r]) => `${s}\t${[...new Set(r)].join(',')}`).join('\n'), 'utf8');
fs.writeFileSync(path.join(root, '..', 'build', 'untranslated.json'), JSON.stringify(arr, null, 1), 'utf8');
console.log('合计未翻译:', arr.length);
ws.close();
