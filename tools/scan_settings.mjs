// 逐个点开「设置」的每个分区，收集仍是英文的界面文案。
// 用法: node tools/scan_settings.mjs [port]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 9222);
const root = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((x) => x.type === 'page' && x.url.startsWith('https://127.0.0.1'));
if (!target) throw new Error('未找到 workbench 页面');
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
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
}

const COLLECT = `(() => {
  const CJK = /[\\u4e00-\\u9fff]/;
  const BAD = /^(?:https?:|mailto:|\\/|\\.)|[\\\\{}<>]|^[\\d.,%\\/\\s]+$/;
  const out = new Set();
  const add = (s) => {
    if (!s) return;
    const t = s.replace(/\\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 260) return;
    if (CJK.test(t)) return;
    if (!/[A-Za-z]{2}/.test(t)) return;
    if (BAD.test(t)) return;
    if (/^[a-z]+$/.test(t)) return;
    out.add(t);
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest('script,style,code,pre,kbd,textarea,[contenteditable],[data-zhcn-skip],.markdown-body,[class*="markdown"]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;          // 跳过未显示的分区
    if (getComputedStyle(el).visibility === 'hidden') continue;
    add(n.nodeValue);
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
    for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (v) add(v);
    }
  }
  return [...out];
})()`;

await send('Runtime.enable');
await send('Page.enable');
await sleep(2000);

const origin = await ev('location.origin');
await send('Page.navigate', { url: origin + '/?settingsOpen=true&settingsScreen=General' });
await sleep(5000);

const sections = await ev(`(() => [...document.querySelectorAll('[data-testid^="settings-nav-item-"]')]
  .map(el => ({ testid: el.getAttribute('data-testid'), text: el.innerText.trim() })))()`);
console.log('设置分区:', sections.map((s) => s.testid.replace('settings-nav-item-', '')).join(', '));

const found = new Map();
for (const s of sections) {
  const key = s.testid.replace('settings-nav-item-', '');
  await ev(`(() => { const el = document.querySelector('[data-testid="${s.testid}"]'); if (el) el.click(); return true; })()`);
  await sleep(1600);
  const list2 = (await ev(COLLECT)) || [];
  for (const t of list2) {
    if (!found.has(t)) found.set(t, []);
    found.get(t).push(key);
  }
  console.log(`[${key}] 剩余英文 ${list2.length}`);
}

const arr = [...found.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
fs.mkdirSync(path.join(root, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(root, '..', 'build', 'settings_gaps.json'), JSON.stringify(arr, null, 1), 'utf8');
fs.writeFileSync(path.join(root, '..', 'build', 'settings_gaps.txt'),
  arr.map(([t, s]) => `${t}\t${[...new Set(s)].join(',')}`).join('\n'), 'utf8');
console.log('合计未翻译:', arr.length);
ws.close();
