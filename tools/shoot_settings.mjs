// 逐个打开设置分区：截图 + 统计剩余英文。
// 用法: node tools/shoot_settings.mjs [port] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 9222);
const root = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[3] || path.join(root, '..', 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((x) => x.type === 'page' && x.url.startsWith('https://127.0.0.1'));
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
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
const origin = await ev('location.origin');
const screens = ['General', 'App', 'Appearance', 'Shortcuts', 'Notifications', 'Models', 'Browser', 'Conversations', 'Provide Feedback', 'Account'];

const COLLECT = `(() => {
  const out = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest('code,pre,kbd,textarea,[contenteditable]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
    if (t.length < 2 || /[\\u4e00-\\u9fff]/.test(t) || !/[A-Za-z]{3}/.test(t)) continue;
    out.add(t);
  }
  return [...out];
})()`;

const report = [];
for (const s of screens) {
  await send('Page.navigate', { url: `${origin}/?settingsOpen=true&settingsScreen=${encodeURIComponent(s)}` });
  await sleep(6000);
  const left = (await ev(COLLECT)) || [];
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `settings-${s.replace(/[^a-z]/gi, '')}.png`);
  if (shot.result?.data) fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  report.push({ screen: s, remaining: left });
  console.log(`[${s}] 剩余英文 ${left.length} -> ${file}`);
}
fs.writeFileSync(path.join(OUT, 'settings-report.json'), JSON.stringify(report, null, 1), 'utf8');
ws.close();
