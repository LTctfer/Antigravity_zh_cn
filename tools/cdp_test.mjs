// CDP 冒烟测试：把 zh-cn.pack.js 注入真实 workbench 页面，统计翻译量并截图。
// 用法: node tools/cdp_test.mjs <url> [outPng] [--debug-port 9222]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'https://127.0.0.1:10174/settings';
const outPng = process.argv[3] || 'build/preview.png';
const port = 9222;
const root = path.dirname(fileURLToPath(import.meta.url));
const pack = fs.readFileSync(path.join(root, '..', 'build', 'zh-cn.pack.js'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

let target = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await targets();
    target = list.find((t) => t.type === 'page' && t.url.startsWith('https://127.0.0.1'));
    if (target) break;
  } catch {}
  await sleep(500);
}
if (!target) throw new Error('找不到页面 target，检查 Chrome 是否带 --remote-debugging-port 启动');

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((r) => pending.set(mid, r));
}
async function evalExpr(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');
await sleep(2500);
const before = await evalExpr(`document.body.innerText.split('\\n').filter(Boolean).slice(0,12)`);
const inject = await evalExpr(pack + '\n; "injected"');
await sleep(2500);
const stats = await evalExpr('JSON.stringify(window.__zhcn && window.__zhcn.stats)');
const after = await evalExpr(`document.body.innerText.split('\\n').filter(Boolean).slice(0,12)`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.mkdirSync(path.dirname(path.resolve(outPng)), { recursive: true });
if (shot.result?.data) fs.writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));

console.log('inject:', inject);
console.log('stats:', stats);
console.log('\n注入前:'); console.log(before.join(' | '));
console.log('\n注入后:'); console.log(after.join(' | '));
console.log('\n截图:', path.resolve(outPng));
ws.close();
