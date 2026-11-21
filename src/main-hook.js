'use strict';
/* Antigravity 简体中文语言层 — 主进程注入钩子
 *
 * 由安装器写入 resources/app.asar 的 dist/zh-cn/ 下，并在 dist/main.js 顶部
 * 以 require('./zh-cn/main-hook.js') 方式加载。
 *
 * 职责：
 *   1) 把 Chromium 原生界面语言切到 zh-CN（右键菜单、文件选择框等）；
 *   2) 优先从用户目录 ~/.antigravity-zhcn/zh-cn.pack.js 加载词库（支持免重启热更新），
 *      若不存在则回退到 asar 内置的 zh-cn.pack.js；
 *   3) 对本地 workbench 的每个 frame（含跨域 iframe）注入翻译内核；
 *   4) 统一调度快捷键：
 *        Alt+Shift+L  中/英文原版即时切换
 *        Alt+Shift+R  热重载本地/外置词库
 *        Alt+Shift+C  收集当前页漏翻词条并复制到剪贴板
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const INTERNAL_PACK = path.join(__dirname, 'zh-cn.pack.js');
const EXTERNAL_PACK = path.join(os.homedir(), '.antigravity-zhcn', 'zh-cn.pack.js');
const LOCAL_ORIGIN = /^(?:https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?|plugin:|vscode-webview:|agy-favicon:)\//i;

let cachedCode = '';
let cachedSource = '';
let cachedMtime = -1;
let zhEnabled = true;

function loadPack(force) {
  try {
    if (fs.existsSync(EXTERNAL_PACK)) {
      const st = fs.statSync(EXTERNAL_PACK);
      if (st.size > 100 && (force || cachedSource !== 'external' || st.mtimeMs !== cachedMtime)) {
        cachedCode = fs.readFileSync(EXTERNAL_PACK, 'utf8');
        cachedSource = 'external';
        cachedMtime = st.mtimeMs;
        return cachedCode;
      }
      if (cachedCode && cachedSource === 'external') return cachedCode;
    }
  } catch (err) {}

  if (force || !cachedCode || cachedSource !== 'internal') {
    try {
      cachedCode = fs.readFileSync(INTERNAL_PACK, 'utf8');
      cachedSource = 'internal';
      cachedMtime = -1;
    } catch (err) {
      cachedCode = '';
    }
  }
  return cachedCode;
}

if (loadPack(true)) {
  const { app, clipboard, webContents } = require('electron');

  // 让 Chromium 自带 UI（原生右键菜单、文件对话框、拼写检查）使用中文。
  try {
    app.commandLine.appendSwitch('lang', 'zh-CN');
  } catch (err) {}

  const isLocalFrame = (frame) => {
    if (!frame) return false;
    let url = '';
    try {
      url = frame.url || '';
    } catch (err) {
      return false;
    }
    // 只翻译本地 workbench / sidecar，绝不碰用户在浏览器里打开的外部网站
    return !url || LOCAL_ORIGIN.test(url);
  };

  const execOnFrame = (frame, js) => {
    if (!isLocalFrame(frame)) return Promise.resolve(null);
    try {
      const p = frame.executeJavaScript(js, true);
      if (p && typeof p.catch === 'function') return p.catch(() => null);
      return Promise.resolve(p);
    } catch (err) {
      return Promise.resolve(null);
    }
  };

  const collectLocalFrames = (frame, out = []) => {
    if (!frame) return out;
    if (isLocalFrame(frame)) out.push(frame);
    let children = [];
    try {
      children = frame.frames || [];
    } catch (err) {
      children = [];
    }
    for (const child of children) collectLocalFrames(child, out);
    return out;
  };

  const injectAll = (wc) => {
    const code = loadPack(false);
    if (!code || !wc || wc.isDestroyed()) return;
    const frames = collectLocalFrames(wc.mainFrame);
    for (const f of frames) {
      const suffix = zhEnabled ? '' : ';window.__zhcn&&window.__zhcn.off(true);';
      execOnFrame(f, code + suffix);
    }
  };

  const allLocalWebContents = () => {
    try {
      return webContents.getAllWebContents().filter((w) => w && !w.isDestroyed());
    } catch (err) {
      return [];
    }
  };

  const toggleLanguage = (activeWc) => {
    zhEnabled = !zhEnabled;
    for (const w of allLocalWebContents()) {
      const frames = collectLocalFrames(w.mainFrame);
      for (const f of frames) {
        const silent = !(w === activeWc && f === w.mainFrame);
        execOnFrame(f, `window.__zhcn&&window.__zhcn.toggle(${zhEnabled},${silent})`);
      }
    }
  };

  const reloadPackHot = (activeWc) => {
    const code = loadPack(true);
    if (!code) return;
    const label = cachedSource === 'external' ? '外置词库' : '内置词库';
    for (const w of allLocalWebContents()) {
      const frames = collectLocalFrames(w.mainFrame);
      for (const f of frames) {
        const showToast = w === activeWc && f === w.mainFrame;
        execOnFrame(
          f,
          code +
            (zhEnabled ? '' : ';window.__zhcn&&window.__zhcn.off(true);') +
            (showToast
              ? `;window.__zhcn&&window.__zhcn.toast(${JSON.stringify('已热重载' + label)} + '（' + Object.keys((window.__zhcn&&window.__zhcn.dict)||{}).length + ' 条）');`
              : '')
        );
      }
    }
  };

  const exportMissingToClipboard = async (activeWc) => {
    if (!activeWc || activeWc.isDestroyed()) return;
    const frames = collectLocalFrames(activeWc.mainFrame);
    const results = await Promise.all(
      frames.map((f) => execOnFrame(f, 'window.__zhcn?window.__zhcn.collectMissing():[]'))
    );
    const merged = [];
    const seen = new Set();
    for (const arr of results) {
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (typeof item === 'string' && item && !seen.has(item)) {
          seen.add(item);
          merged.push(item);
        }
      }
    }
    if (!merged.length) {
      execOnFrame(activeWc.mainFrame, 'window.__zhcn&&window.__zhcn.toast("当前页面未检测到漏翻英文")');
      return;
    }
    const obj = {};
    for (const k of merged) obj[k] = '';
    try {
      clipboard.writeText(JSON.stringify(obj, null, 2));
      execOnFrame(
        activeWc.mainFrame,
        `window.__zhcn&&window.__zhcn.toast(${JSON.stringify(`已复制 ${merged.length} 条未翻译词条到剪贴板`)})`
      );
    } catch (err) {}
  };

  const hookContents = (wc) => {
    if (!wc || wc.__zhcnHooked) return;
    wc.__zhcnHooked = true;
    const run = () => {
      try {
        injectAll(wc);
      } catch (err) {}
    };
    wc.on('dom-ready', () => setTimeout(run, 30));
    wc.on('did-frame-finish-load', () => setTimeout(run, 60));
    wc.on('did-navigate-in-page', () => setTimeout(run, 80));

    wc.on('before-input-event', (event, input) => {
      if (!input || input.type !== 'keyDown') return;
      if (!input.alt || !input.shift || input.control || input.meta) return;
      const k = (input.key || '').toLowerCase();
      const c = input.code || '';
      if (c === 'KeyL' || k === 'l') {
        event.preventDefault();
        toggleLanguage(wc);
      } else if (c === 'KeyR' || k === 'r') {
        event.preventDefault();
        reloadPackHot(wc);
      } else if (c === 'KeyC' || k === 'c') {
        event.preventDefault();
        exportMissingToClipboard(wc);
      }
    });
  };

  app.on('web-contents-created', (_event, contents) => hookContents(contents));
}
