'use strict';
/* Antigravity 简体中文语言层 — 主进程注入钩子
 *
 * 由安装器写入 resources/app.asar 的 dist/zh-cn/ 下，并在 dist/main.js 顶部
 * 以 require('./zh-cn/main-hook.js') 方式加载。
 *
 * 职责：
 *   1) 把 Chromium 原生界面语言切到 zh-CN（右键菜单、文件选择框等）；
 *   2) 对本地 workbench 的每个 frame（含跨域 iframe）注入 zh-cn.pack.js。
 */
const fs = require('fs');
const path = require('path');

const PACK_FILE = path.join(__dirname, 'zh-cn.pack.js');
const LOCAL_ORIGIN = /^(?:https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?|plugin:|vscode-webview:|agy-favicon:)\//i;

let code = '';
try {
  code = fs.readFileSync(PACK_FILE, 'utf8');
} catch (err) {
  code = '';
}

if (code) {
  const { app } = require('electron');

  // 让 Chromium 自带 UI（原生右键菜单、文件对话框、拼写检查）使用中文。
  try {
    app.commandLine.appendSwitch('lang', 'zh-CN');
  } catch (err) {}

  const injectFrame = (frame) => {
    if (!frame) return;
    let url = '';
    try {
      url = frame.url || '';
    } catch (err) {
      return;
    }
    // 只翻译本地 workbench / sidecar，绝不碰用户在浏览器里打开的外部网站
    if (url && !LOCAL_ORIGIN.test(url)) return;
    try {
      const p = frame.executeJavaScript(code, true);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (err) {}
  };

  const walkFrames = (frame) => {
    if (!frame) return;
    injectFrame(frame);
    let children = [];
    try {
      children = frame.frames || [];
    } catch (err) {
      children = [];
    }
    for (const child of children) walkFrames(child);
  };

  const hookContents = (wc) => {
    if (!wc || wc.__zhcnHooked) return;
    wc.__zhcnHooked = true;
    const run = () => {
      try {
        walkFrames(wc.mainFrame);
      } catch (err) {}
    };
    wc.on('dom-ready', () => setTimeout(run, 30));
    wc.on('did-frame-finish-load', () => setTimeout(run, 60));
    wc.on('did-navigate-in-page', () => setTimeout(run, 80));
  };

  app.on('web-contents-created', (_event, contents) => hookContents(contents));
}
