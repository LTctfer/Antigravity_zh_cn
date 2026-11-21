# Antigravity 简体中文语言层

把 Google Antigravity（Hub 桌面端）的界面做成中文的可维护补丁：**1900 条词条 + 54 条动态规则**，覆盖侧边栏、对话区、设置、自动化、自定义、项目、快捷键、权限、终端、浏览器、产物预览等界面文案。

---

## 1. 一键安装与快捷用法

### 方式 A：零依赖一行命令在线安装（无需 Git / Python）

在 Windows PowerShell 中直接执行：

```powershell
irm https://raw.githubusercontent.com/LTctfer/Antigravity_zh_cn/main/tools/install.ps1 | iex
```

### 方式 B：本地脚本安装（有 Python 自动重编，无 Python 自动回退 PowerShell）

```bat
安装中文.bat
```

安装完成后支持一键重启 Antigravity 立即生效，同时会把外置词库同步到 `%USERPROFILE%\.antigravity-zhcn\zh-cn.pack.js`。

### 日常便捷工具与快捷键

| 方式 / 操作 | 作用 | 说明 |
| --- | --- | --- |
| `创建中文桌面快捷方式.bat` | 生成无感自愈桌面图标 | 沿用原版图标、零黑框；官方更新覆盖后启动前自动静默修复 |
| `更新词库.bat` | 秒级更新外置词库 | 无需重打包 `app.asar`、无需重启客户端 |
| `Alt + Shift + L` | 中 / 英文原版即时切换 | 跨所有子面板同步还原英文或切回中文 |
| `Alt + Shift + R` | 热重载最新词库 | 改完词典或运行 `更新词库.bat` 后按一下立即生效 |
| `Alt + Shift + C` | 收集当前页漏翻英文 | 自动过滤代码与隐藏节点，生成 JSON 模板复制到剪贴板 |

其他手动命令：

```bash
python -X utf8 tools\build.py                     # 生成注入包（改词典后执行）
python -X utf8 tools\install.py --force            # 写入 Antigravity
python -X utf8 tools\install.py --update-dict      # 仅更新外置词库（支持 --online）
python -X utf8 tools\install.py --status           # 查看安装状态
python -X utf8 tools\install.py --restore          # 还原英文原版
python -X utf8 tools\install.py --dir "D:\Apps\antigravity"   # 指定安装目录
```

> 所有命令行参数同样适用于无 Python 的 `tools\install.ps1`（如 `-Status`、`-Restore`、`-UpdateDict`、`-Ensure`、`-Launch`、`-Restart`）。

## 2. 它是怎么工作的

Antigravity 的界面不是传统的 Electron + 本地网页，而是：

```
Antigravity.exe (Electron 壳, resources/app.asar)
   └─ 主进程启动 resources/bin/language_server.exe（动态端口）
        └─ 浏览器窗口加载 https://127.0.0.1:<port>/  （React 单页应用，无 i18n 层）
```

界面文案硬编码在 `language_server.exe` 内嵌的前端 bundle 里，没有语言包机制，所以走 **运行时语言层**：

1. `tools/install.py` 把两个文件写进 `resources/app.asar` 的 `dist/zh-cn/`：
   - `zh-cn.pack.js` —— 词典 + 规则 + 翻译内核（DOM 层）
   - `main-hook.js` —— 主进程钩子
2. 在 `dist/main.js` 的 `"use strict";` 之后插入一行 `require('./zh-cn/main-hook.js')`。
3. 钩子监听 `web-contents-created`，优先从用户目录 `%USERPROFILE%\.antigravity-zhcn\zh-cn.pack.js` 加载词库（不存在时回退 `app.asar` 内置包），并对**本地来源**（`https://127.0.0.1:<port>/`、`plugin://`、`localhost` sidecar）的每个 frame 执行注入；外部网站一律跳过。
4. 内核用 `MutationObserver` 持续把新渲染的文本节点/属性翻成中文，React 重渲染也不会被覆盖回英文，并记录原文以支持 `Alt+Shift+L` 一键还原。
5. 同时给 Chromium 追加 `--lang=zh-CN`，让原生右键菜单、文件对话框、错误页也跟着变中文。

不修改 `language_server.exe`，不改动网络流量，所有词条都在本地 JSON 里。

## 3. 目录结构

```
src/
  kernel.js           翻译内核（文本节点 + 属性 + MutationObserver + iframe 递归）
  main-hook.js        主进程注入钩子（按 frame 注入，过滤外部站点）
  dict.part1..8.json  分模块的词典源文件（人工维护）
  dict.zh-CN.json     合并后的主词典（build 时自动生成）
  rules.zh-CN.json    动态文案规则（问候语、快捷键行、相对时间、tokens 计数…）
tools/
  build.py            打包词典 + 规则 + 内核 -> build/zh-cn.pack.js
  install.py          备份 / 注入 / 外置同步 / 自愈 / 还原
  install.ps1         免 Python 原生 PowerShell 全功能安装器（支持在线一行命令）
  create_shortcut.ps1 创建无黑框自愈桌面快捷方式
  asar.py             纯标准库的 asar 读写与增量重打包
  mine_ui.py          从 bundle 按 JSX 属性挖 UI 文案
  mine_jsx.py         从 bundle 按 createElement 子节点挖 UI 文案
  coverage.mjs        注入后扫描“仍是英文”的文案，生成缺口清单（CDP）
  scan_settings.mjs   逐个点开设置分区，收集每个分区的缺口
  shoot_settings.mjs  逐个设置分区截图 + 统计剩余英文（生成 docs/settings-*.png）
  cdp_test.mjs        单页注入冒烟测试 + 截图
ref/
  web/main_233.js     线上 workbench bundle 快照（用于挖词/对齐新版本）
build/                产物：注入包、覆盖率缺口清单、预览截图
```

## 4. 升级 Antigravity 之后

官方更新会整体替换 `resources/app.asar`，补丁随之失效（备份文件仍在 `resources/app.asar.zh-cn.bak`）。

* **推荐（一劳永逸）**：运行一次 `创建中文桌面快捷方式.bat`，以后从桌面的 **Antigravity (中文版)** 打开，每次启动前会自动比对哈希，一旦发现被官方更新覆盖就会静默重注再启动，全程无感。
* **手动修复**：更新后重新执行一次 `安装中文.bat`，安装器会自动识别“asar 已被升级替换”，刷新备份并重新注入，不会出现版本错配。

## 5. 维护 / 扩充词条

```bash
# 1) 抓当前版本的 bundle（Antigravity 运行时，端口见 netstat 中 language_server.exe）
curl -sk https://127.0.0.1:<port>/main.js -o ref/web/main_new.js

# 2) 挖出未收录的文案
python -X utf8 tools/mine_ui.py  ref/web/main_new.js ref/ui_new.json
python -X utf8 tools/mine_jsx.py ref/web/main_new.js

# 3) 翻译后写进 src/dict.part*.json，重新打包（第 1 节命令）

# 4) 视觉回归：注入后扫描剩余英文（需要带 --remote-debugging-port 启动的实例）
MSYS_NO_PATHCONV=1 BASE_URL=https://127.0.0.1:<port> node tools/coverage.mjs / /settings /customizations
```

词条按整段文本精确匹配，字符串要和应用里渲染出来的**完全一致**（含大小写、标点）。带变量的句子写成 `rules.zh-CN.json` 里的正则 + `$1` 占位。

运行时调试（DevTools Console）：

```js
__zhcn.stats        // { text, attr, docs } 已翻译数量
__zhcn.translate('Settings')   // 单条试翻
__zhcn.rescan()     // 手动重扫当前文档
__zhcn.off(); __zhcn.on()      // 临时关闭/开启
```

## 6. 覆盖情况（v1.0.0 实测，Antigravity 2.33.0）

用 `tools/shoot_settings.mjs` 逐屏统计后，设置十个分区的残留英文都只剩品牌/型号/键名/邮箱：

| 分区 | 残留英文（预期保留） |
| --- | --- |
| 通用 / 应用 / 通知 / 浏览器 / 对话 / 反馈 / 账户 | 3 条（Antigravity、Gemini 3.8 Flash、邮箱） |
| 外观 | 4 条（另有 Google Sans、14px） |
| 快捷键 | 6 条（另有 Ctrl / Alt / Shift 键名） |
| 模型 | 4 条（另有 Gemini 模型、Google AI Pro 等品牌） |

## 7. 已知边界

- **保留英文**：产品名与型号（Antigravity、Gemini 3.8 Flash、Pro/Flash Lite）、第三方插件与技能名（Auth0、Stripe、chrome-devtools…）、市场里的插件宣传文案、邮箱与代码片段。
- **代码区域不翻译**：编辑器内容、`<pre>/<code>`、终端输出、Markdown 正文一律跳过，避免污染用户数据。
- 词典是“界面文案覆盖”，不是官方 i18n；新版本新增的文案需要按第 5 节补词。
- 个别由后端返回、前端原样渲染的句子（例如远端会话标题）属于用户内容，不会被翻译。

## 8. 卸载

```bat
卸载中文.bat
```

或 `python -X utf8 tools\install.py --restore`。会把备份的 `app.asar` 还原并删除清单文件，重启即回到英文原版。
