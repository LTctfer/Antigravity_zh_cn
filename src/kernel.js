/* Antigravity 简体中文语言层（内核）
 * 纯 DOM 层翻译：文本节点 + 可见属性 + MutationObserver + 同源 iframe 递归。
 * 支持：中英即时切换还原、运行期词库热重载、未翻译词条收集、轻量状态提示。
 * 由 tools/build.py 与本包内的 DICT / RULES 一起打包成 zh-cn.pack.js，
 * 由 Electron 主进程通过 webContents/frame.executeJavaScript 注入。
 */
(function () {
  'use strict';
  var NEW_CFG = window.__ZHCN_CONFIG__ || {};
  if (window.__zhcn && window.__zhcn.installed) {
    if (window.__zhcn._cfg !== NEW_CFG && typeof window.__zhcn.reload === 'function') {
      window.__zhcn.reload(NEW_CFG);
    }
    return;
  }

  var CFG = NEW_CFG;
  var DICT = {};
  var RULES = [];
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder'];
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1,
    VAR: 1, TEXTAREA: 1, INPUT: 1, IFRAME: 1, CANVAS: 1, SVG: 1, PATH: 1
  };
  var SKIP_SELECTOR = [
    '[contenteditable]', '[data-zhcn-skip]',
    '.monaco-editor .view-lines', '.monaco-editor .view-line',
    '.cm-editor .cm-line', '.markdown-body', '[class*="markdown"]',
    '[data-testid*="markdown"]', '[class*="prose"]',
    '.xterm-helper-textarea', '.xterm .xterm-rows'
  ].join(',');

  var compiled = [];
  var lookup = Object.create(null);
  var memo = Object.create(null);
  var phraseRe = null;
  var phraseMap = Object.create(null);

  function loadConfig(cfg) {
    CFG = cfg || {};
    DICT = CFG.dict || {};
    RULES = CFG.rules || [];
    compiled = [];
    for (var i = 0; i < RULES.length; i++) {
      try { compiled.push([new RegExp(RULES[i][0]), RULES[i][1]]); } catch (e) {}
    }
    lookup = Object.create(null);
    Object.keys(DICT).forEach(function (k) { lookup[k] = DICT[k]; });
    memo = Object.create(null);
    phraseRe = null;
    phraseMap = Object.create(null);
  }

  loadConfig(CFG);

  var skipCache = new WeakMap();
  var appliedText = new WeakMap();   // textNode -> 原文
  var appliedAttr = new WeakMap();   // el -> {attr: 原文}
  var origTitles = new WeakMap();    // doc -> 原 title
  var stats = { text: 0, attr: 0, docs: 0 };
  var enabled = true;
  var writing = false;

  function norm(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  function translateCore(core) {
    if (memo[core] !== undefined) return memo[core];
    var out = lookup[core];
    if (out == null) {
      var m = /^(.+?)([:：。．.!！?？…]+)$/.exec(core);
      if (m && lookup[m[1]] != null) {
        out = lookup[m[1]] + m[2].replace(':', '：').replace('!', '！').replace('?', '？');
      }
    }
    if (out == null) {
      for (var i = 0; i < compiled.length; i++) {
        var re = compiled[i][0];
        if (!re.test(core)) continue;
        var tpl = compiled[i][1];
        out = core.replace(re, function () {
          var args = arguments;
          var groups = [];
          for (var k = 1; k < args.length - 2; k++) groups.push(args[k]);
          return tpl.replace(/\$(\d+)/g, function (whole, n) {
            var g = groups[Number(n) - 1];
            return g == null ? whole : translateGroup(g);
          });
        });
        break;
      }
      // 规则产物里常残留英文短语（例如「Automations：Ctrl+U」），再按词典整词替换一次
      if (out != null && out !== core && /[A-Za-z]{3}/.test(out)) out = applyPhrases(out);
    }
    if (out == null && /^[\x00-\x7f]*$/.test(core) === false) out = null;
    memo[core] = out == null ? '' : out;
    return out === '' ? null : out;
  }

  // 规则捕获组的一层再翻译（如 "4 days, 9 hours" -> "4 天 9 小时"）
  function translateGroup(g) {
    if (!g) return g;
    var key = norm(g);
    var hit = lookup[key];
    if (hit != null) return hit;
    for (var i = 0; i < compiled.length; i++) {
      if (compiled[i][0].test(key)) return key.replace(compiled[i][0], compiled[i][1]);
    }
    return g;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildPhrases() {
    if (phraseRe) return;
    var keys = [];
    for (var k in DICT) {
      if (k.length < 5 || k.length > 60) continue;
      if (!/^[A-Za-z]/.test(k)) continue;
      if (!/\s/.test(k) && k.length < 4) continue;
      if (/[0-9(){}[\]]/.test(k)) continue;
      keys.push(k);
    }
    keys.sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) phraseMap[keys[i]] = DICT[keys[i]];
    phraseRe = keys.length
      ? new RegExp('(^|[^A-Za-z0-9])(' + keys.map(escapeRe).join('|') + ')(?![A-Za-z0-9])', 'g')
      : /(?!)/g;
  }

  function applyPhrases(s) {
    buildPhrases();
    return s.replace(phraseRe, function (m, pre, key) { return pre + (phraseMap[key] || key); });
  }

  function translateString(raw) {
    if (!raw) return null;
    var lead = raw.match(/^\s*/)[0];
    var tail = raw.match(/\s*$/)[0];
    var core = norm(raw);
    if (!core) return null;
    if (!/[A-Za-z]/.test(core)) return null;
    var zh = translateCore(core);
    if (!zh || zh === core) return null;
    return lead + zh + tail;
  }

  function isSkipped(el) {
    if (!el || el.nodeType !== 1) return false;
    var cached = skipCache.get(el);
    if (cached !== undefined) return cached;
    var skip = !!(SKIP_TAGS[el.tagName] || el.isContentEditable);
    if (!skip) {
      try { skip = !!(el.closest && el.closest(SKIP_SELECTOR)); } catch (e) { skip = false; }
    }
    skipCache.set(el, skip);
    return skip;
  }

  function procText(node) {
    if (!enabled || writing) return;
    var parent = node.parentElement;
    if (!parent || isSkipped(parent)) return;
    var raw = node.nodeValue;
    if (!raw || raw.length > 4000) return;
    var zh = translateString(raw);
    if (!zh) return;
    if (!appliedText.has(node)) appliedText.set(node, raw);
    stats.text++;
    writing = true;
    try { node.nodeValue = zh; } finally { writing = false; }
  }

  function procAttr(el, attr) {
    if (!enabled || writing || !el.getAttribute) return;
    var raw = el.getAttribute(attr);
    if (!raw || raw.length > 4000) return;
    if (el.tagName === 'INPUT' && attr === 'value') {
      var t = (el.type || '').toLowerCase();
      if (t !== 'button' && t !== 'submit' && t !== 'reset') return;
    }
    var zh = translateString(raw);
    if (!zh) return;
    var rec = appliedAttr.get(el) || {};
    if (!(attr in rec)) rec[attr] = raw;
    appliedAttr.set(el, rec);
    stats.attr++;
    writing = true;
    try { el.setAttribute(attr, zh); } finally { writing = false; }
  }

  // 属性是否允许翻译：INPUT/TEXTAREA 等本身不承载正文，但 placeholder/title 要翻。
  function isSkippedForAttr(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;
    try {
      if (el.closest && el.closest('[data-zhcn-skip]')) return true;
    } catch (e) {}
    return false;
  }

  function procElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (isSkippedForAttr(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      if (el.hasAttribute(ATTRS[i])) procAttr(el, ATTRS[i]);
    }
    if (el.tagName === 'INPUT') procAttr(el, 'value');
    if (el.tagName === 'META' && el.getAttribute('name') === 'description') procAttr(el, 'content');
    if (el.shadowRoot && enabled) hookDoc(el.shadowRoot, true);
  }

  var ATTR_SELECTOR = '[placeholder],[title],[aria-label],[alt],[data-placeholder],input[value],meta[name="description"]';

  function attrPass(root) {
    if (!root || !root.querySelectorAll) return;
    var list;
    try { list = root.querySelectorAll(ATTR_SELECTOR); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) procElement(list[i]);
    if (root.nodeType === 1) procElement(root);
  }

  var queue = [];
  var scheduled = false;

  function flush() {
    scheduled = false;
    var budget = 900;
    while (queue.length && budget-- > 0) {
      var item = queue.shift();
      if (!item) continue;
      if (item.nodeType === 3) procText(item);
      // 元素：整棵子树都要处理（React 常一次性插入整块 DOM，只处理根元素会漏掉里面的文本）
      else if (item.nodeType === 1 || item.nodeType === 11 || item.nodeType === 9) walk(item);
    }
    if (queue.length) schedule();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (window.requestIdleCallback) window.requestIdleCallback(flush, { timeout: 400 });
    else setTimeout(flush, 24);
  }

  function enqueue(node) {
    queue.push(node);
    if (queue.length > 4000) queue.splice(0, queue.length - 4000);
    schedule();
  }

  function walk(root) {
    if (!root || !enabled) return;
    if (root.nodeType === 3) { procText(root); return; }
    var doc = root.ownerDocument || root;
    attrPass(root);
    var walker;
    try {
      walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    } catch (e) { return; }
    var n, guard = 0;
    while ((n = walker.nextNode()) && guard++ < 200000) procText(n);
  }

  // 遍历当前页面内所有可见根（含 Shadow DOM 与同源 iframe）
  function walkAllRoots(doc, fn, seen) {
    if (!doc || !seen) return;
    if (seen.has(doc)) return;
    seen.add(doc);
    var root = doc.body || doc.documentElement || doc;
    fn(root, doc);
    try {
      var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].shadowRoot) walkAllRoots(all[i].shadowRoot, fn, seen);
      }
      var iframes = root.querySelectorAll ? root.querySelectorAll('iframe') : [];
      for (var j = 0; j < iframes.length; j++) {
        try {
          if (iframes[j].contentDocument) walkAllRoots(iframes[j].contentDocument, fn, seen);
        } catch (e) {}
      }
    } catch (e) {}
  }

  function restoreRoot(root, doc) {
    if (!root) return;
    writing = true;
    try {
      if (doc && doc.documentElement && doc.documentElement.getAttribute('lang') === 'zh-CN') {
        doc.documentElement.setAttribute('lang', 'en');
      }
      if (doc === document && origTitles.has(doc)) {
        doc.title = origTitles.get(doc);
      }
      if (root.querySelectorAll) {
        var list = root.querySelectorAll(ATTR_SELECTOR);
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          var rec = appliedAttr.get(el);
          if (!rec) continue;
          for (var attr in rec) {
            if (Object.prototype.hasOwnProperty.call(rec, attr)) {
              el.setAttribute(attr, rec[attr]);
            }
          }
          appliedAttr.delete(el);
        }
      }
      var owner = root.ownerDocument || (root.nodeType === 9 ? root : document);
      var walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n, guard = 0;
      while ((n = walker.nextNode()) && guard++ < 200000) {
        if (appliedText.has(n)) {
          n.nodeValue = appliedText.get(n);
          appliedText.delete(n);
        }
      }
    } catch (e) {} finally {
      writing = false;
    }
  }

  function restoreAll() {
    queue = [];
    walkAllRoots(document, restoreRoot, new Set());
  }

  function hookDoc(doc, isShadow) {
    if (!doc || doc.__zhcnHooked) return;
    doc.__zhcnHooked = true;
    stats.docs++;
    try {
      if (doc.documentElement) doc.documentElement.setAttribute('lang', 'zh-CN');
      if (doc === document) {
        if (!origTitles.has(doc)) origTitles.set(doc, doc.title);
        doc.title = translateString(doc.title) || doc.title;
      }
      var titleEl = doc.querySelector && doc.querySelector('title');
      if (titleEl) procText(titleEl.firstChild || titleEl);
    } catch (e) {}
    walk(doc.body || doc);
    try {
      var mo = new MutationObserver(function (records) {
        if (!enabled) return;
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === 'characterData') { if (r.target && !writing) enqueue(r.target); }
          else if (r.type === 'attributes') { if (r.target) enqueue(r.target); }
          else {
            for (var j = 0; j < r.addedNodes.length; j++) {
              var node = r.addedNodes[j];
              if (!node) continue;
              if (node.nodeType === 3) enqueue(node);
              else if (node.nodeType === 1) { enqueue(node); }
            }
          }
        }
      });
      mo.observe(doc.documentElement || doc, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS
      });
    } catch (e) {}
    if (!isShadow) patchIframes(doc);
  }

  var iframeTimer = null;
  function patchIframes(doc) {
    var list;
    try { list = doc.querySelectorAll('iframe'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      try {
        var d = f.contentDocument;
        if (d && !d.__zhcnHooked) hookDoc(d, false);
      } catch (e) { /* 跨域：由主进程按 frame 单独注入 */ }
    }
    if (iframeTimer) return;
    iframeTimer = setInterval(function () {
      if (!enabled) return;
      try { patchIframes(document); } catch (e) {}
    }, 1500);
    setTimeout(function () { if (iframeTimer) { clearInterval(iframeTimer); iframeTimer = null; } }, 120000);
  }

  function rescan() {
    if (!enabled) return;
    try {
      walkAllRoots(document, function (root, doc) {
        if (doc && doc.documentElement) doc.documentElement.setAttribute('lang', 'zh-CN');
        if (doc === document && doc.title) doc.title = translateString(doc.title) || doc.title;
        walk(root);
      }, new Set());
    } catch (e) {}
  }

  var toastTimer = null;
  function toast(msg) {
    if (window !== window.top) return;
    try {
      var host = document.body || document.documentElement;
      if (!host) return;
      var el = document.getElementById('__zhcn-toast__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__zhcn-toast__';
        el.setAttribute('data-zhcn-skip', '1');
        el.style.cssText = [
          'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
          'padding:8px 14px', 'border-radius:8px',
          'background:rgba(24,24,27,0.92)', 'color:#f4f4f5',
          'border:1px solid rgba(255,255,255,0.14)',
          'box-shadow:0 8px 24px rgba(0,0,0,0.38)',
          'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif',
          'pointer-events:none', 'transition:opacity .22s ease', 'opacity:0'
        ].join(';');
        host.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        el.style.opacity = '0';
      }, 2200);
    } catch (e) {}
  }

  function isLikelyUiEnglish(s) {
    if (!s || s.length < 2 || s.length > 180) return false;
    if (!/[A-Za-z]{2}/.test(s)) return false;
    // 跳过已含中文、URL、路径、邮箱、纯版本号、代码符号密集行
    if (/[\u4e00-\u9fff]/.test(s)) return false;
    if (/^(https?:\/\/|file:\/\/|[A-Za-z]:\\|\/[\w.-]+)/i.test(s)) return false;
    if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(s)) return false;
    if (/^v?\d+(\.\d+)+([-.]\w+)?$/i.test(s)) return false;
    return true;
  }

  function isElVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      var st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      var rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (e) { return true; }
  }

  function collectMissing() {
    var out = [];
    var seen = Object.create(null);
    function push(raw) {
      var core = norm(raw || '');
      if (!isLikelyUiEnglish(core)) return;
      if (seen[core]) return;
      if (translateString(core)) return;
      seen[core] = 1;
      out.push(core);
    }
    walkAllRoots(document, function (root) {
      if (!root) return;
      var owner = root.ownerDocument || (root.nodeType === 9 ? root : document);
      try {
        var walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var n, guard = 0;
        while ((n = walker.nextNode()) && guard++ < 100000) {
          var p = n.parentElement;
          if (!p || isSkipped(p) || !isElVisible(p)) continue;
          if (appliedText.has(n)) continue;
          push(n.nodeValue);
        }
        if (root.querySelectorAll) {
          var list = root.querySelectorAll(ATTR_SELECTOR);
          for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (isSkippedForAttr(el) || !isElVisible(el)) continue;
            var rec = appliedAttr.get(el) || {};
            for (var j = 0; j < ATTRS.length; j++) {
              var a = ATTRS[j];
              if (a in rec) continue;
              if (el.hasAttribute(a)) push(el.getAttribute(a));
            }
          }
        }
      } catch (e) {}
    }, new Set());
    return out;
  }

  function setEnabled(next, showToast) {
    enabled = !!next;
    if (!enabled) {
      restoreAll();
      if (showToast) toast('已切换为英文原版（Alt+Shift+L 切回中文）');
    } else {
      rescan();
      if (showToast) toast('已切换为简体中文');
    }
    return enabled;
  }

  function reload(newCfg, showToast) {
    var wasEnabled = enabled;
    restoreAll();
    loadConfig(newCfg);
    if (window.__zhcn) {
      window.__zhcn._cfg = CFG;
      window.__zhcn.version = CFG.version || '1.0.0';
      window.__zhcn.dict = DICT;
      window.__zhcn.rules = RULES;
    }
    enabled = wasEnabled;
    if (enabled) rescan();
    if (showToast) toast('词库已热更新（' + Object.keys(DICT).length + ' 条）');
  }

  window.__zhcn = {
    installed: true,
    _cfg: CFG,
    version: CFG.version || '1.0.0',
    dict: DICT,
    rules: RULES,
    stats: stats,
    translate: translateString,
    rescan: rescan,
    off: function (silent) { return setEnabled(false, !silent); },
    on: function (silent) { return setEnabled(true, !silent); },
    toggle: function (forceState, silent) {
      var next = typeof forceState === 'boolean' ? forceState : !enabled;
      return setEnabled(next, !silent);
    },
    isEnabled: function () { return enabled; },
    reload: reload,
    collectMissing: collectMissing,
    toast: toast
  };

  function start() {
    hookDoc(document, false);
    // SPA 首屏渲染较晚，追加两次兜底扫描
    setTimeout(rescan, 800);
    setTimeout(rescan, 2500);
    setTimeout(rescan, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
