"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Preload script — runs in every BrowserWindow before the page loads.
 * Exposes a minimal, secure API via contextBridge so the renderer can
 * communicate with the main-process auto-updater without nodeIntegration.
 */
const electron_1 = require("electron");
const updaterAPI = {
    onStateChanged: (callback) => {
        const handler = (_event, state) => {
            callback(state);
        };
        electron_1.ipcRenderer.on('updater:state-changed', handler);
        // Return unsubscribe function
        return () => {
            electron_1.ipcRenderer.removeListener('updater:state-changed', handler);
        };
    },
    applyUpdate: () => electron_1.ipcRenderer.invoke('updater:apply'),
    quitAndInstall: () => electron_1.ipcRenderer.invoke('updater:quit-and-install'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:check-for-updates'),
    getState: () => electron_1.ipcRenderer.invoke('updater:get-state'),
};
let deviceChooserSubscriberCount = 0;
const dialogAPI = {
    showOpenDialog: () => electron_1.ipcRenderer.invoke('dialog:open-workspace'),
    showOpenMultipleFolderDialog: () => electron_1.ipcRenderer.invoke('dialog:open-workspaces'),
};
const notificationAPI = {
    send: (options) => electron_1.ipcRenderer.invoke('notification:send', options),
    openSystemPreferences: () => electron_1.ipcRenderer.invoke('notification:open-system-preferences'),
    onClicked: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        electron_1.ipcRenderer.on('notification:clicked', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('notification:clicked', handler);
        };
    },
};
const storageAPI = {
    getItems: () => electron_1.ipcRenderer.invoke('storage:get-items'),
    updateItems: (changes) => electron_1.ipcRenderer.invoke('storage:update-items', changes),
    onChanged: (callback) => {
        const handler = (_event, changes) => {
            callback(changes);
        };
        electron_1.ipcRenderer.on('storage:changed', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('storage:changed', handler);
        };
    },
};
const logsAPI = {
    getElectronLogs: () => electron_1.ipcRenderer.invoke('logs:electron'),
};
const extensionsAPI = {
    sendAuthorities: (authoritiesMap) => electron_1.ipcRenderer.invoke('extensions:send-authorities', authoritiesMap),
};
const deepLinkAPI = {
    onDeepLink: (callback) => {
        const handler = (_event, url) => {
            callback(url);
        };
        electron_1.ipcRenderer.on('deep-link', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('deep-link', handler);
        };
    },
    getStoredDeepLink: () => electron_1.ipcRenderer.invoke('deep-link:get-stored'),
};
const agentAPI = {
    updateActiveAgentCount: (count) => electron_1.ipcRenderer.invoke('agent:update-active-count', count),
};
function subscribeIpcChannel(channel, callback) {
    const handler = (_event, payload) => {
        callback(payload);
    };
    electron_1.ipcRenderer.on(channel, handler);
    return () => {
        electron_1.ipcRenderer.removeListener(channel, handler);
    };
}
const wcvBrowserAPI = {
    acquire: (req) => electron_1.ipcRenderer.invoke('wcv:acquire', req),
    show: (tabKey, boundsCss) => electron_1.ipcRenderer.invoke('wcv:show', tabKey, boundsCss),
    hide: (tabKey) => electron_1.ipcRenderer.invoke('wcv:hide', tabKey),
    setBounds: (tabKey, boundsCss) => {
        electron_1.ipcRenderer.send('wcv:set-bounds-sync', tabKey, boundsCss);
        return Promise.resolve();
    },
    setThemeColor: (color) => electron_1.ipcRenderer.invoke('wcv:set-theme-color', color),
    setPinned: (tabKey, pinned) => electron_1.ipcRenderer.invoke('wcv:set-pinned', tabKey, pinned),
    setAgentControlling: (tabKey, active) => electron_1.ipcRenderer.invoke('wcv:set-agent-controlling', tabKey, active),
    setOverlayActive: (tabKey, active) => electron_1.ipcRenderer.invoke('wcv:set-overlay-active', tabKey, active),
    setPortalOverlayOpen: (open) => electron_1.ipcRenderer.invoke('wcv:set-portal-overlay-open', open),
    elevate: (tabKey, reason, focusBrowser) => electron_1.ipcRenderer.invoke('wcv:elevate', tabKey, reason, focusBrowser),
    setDragOver: (tabKey, active) => electron_1.ipcRenderer.invoke('wcv:set-drag-over', tabKey, active),
    demote: (tabKey, reason) => electron_1.ipcRenderer.invoke('wcv:demote', tabKey, reason),
    navigate: (tabKey, url) => electron_1.ipcRenderer.invoke('wcv:navigate', tabKey, url),
    control: (tabKey, action) => electron_1.ipcRenderer.invoke('wcv:control', tabKey, action),
    sendMouse: (tabKey, params, coordSpace) => coordSpace !== undefined
        ? electron_1.ipcRenderer.invoke('wcv:send-mouse', tabKey, params, coordSpace)
        : electron_1.ipcRenderer.invoke('wcv:send-mouse', tabKey, params),
    sendKey: (tabKey, params) => electron_1.ipcRenderer.invoke('wcv:send-key', tabKey, params),
    insertText: (tabKey, text) => electron_1.ipcRenderer.invoke('wcv:insert-text', tabKey, text),
    setViewportSize: (tabKey, size) => electron_1.ipcRenderer.invoke('wcv:set-viewport-size', tabKey, size),
    capturePage: (tabKey) => electron_1.ipcRenderer.invoke('wcv:capture-page', tabKey),
    dispose: (tabKey) => electron_1.ipcRenderer.invoke('wcv:dispose', tabKey),
    onGuestEvent: (cb) => subscribeIpcChannel('wcv:guest-event', cb),
    onZOrderChanged: (cb) => subscribeIpcChannel('wcv:z-order-changed', cb),
    onShortcutForwarded: (cb) => subscribeIpcChannel('wcv:shortcut-forwarded', cb),
    onCursorChanged: (cb) => subscribeIpcChannel('wcv:cursor-changed', cb),
};
let promptRequestSubscriberCount = 0;
const electronNativeAPI = {
    getZoomLevel: () => electron_1.webFrame.getZoomFactor(),
    getPathForFile: (file) => electron_1.webUtils.getPathForFile(file),
    setTitleBarOverlay: (options) => electron_1.ipcRenderer.invoke('window:set-title-bar-overlay', options),
    minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
    maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
    unmaximize: () => electron_1.ipcRenderer.invoke('window:unmaximize'),
    isMaximized: () => electron_1.ipcRenderer.invoke('window:is-maximized'),
    close: () => electron_1.ipcRenderer.invoke('window:close'),
    toggleDevTools: () => electron_1.ipcRenderer.invoke('window:toggle-devtools'),
    zoomIn: () => {
        void electron_1.ipcRenderer.invoke('window:zoom-in');
    },
    zoomOut: () => {
        void electron_1.ipcRenderer.invoke('window:zoom-out');
    },
    resetZoom: () => {
        void electron_1.ipcRenderer.invoke('window:reset-zoom');
    },
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
    revealInFilePicker: (path) => electron_1.ipcRenderer.invoke('shell:reveal-in-file-picker', path),
    onWebviewDeviceChooserEvent: (callback) => {
        if (++deviceChooserSubscriberCount === 1) {
            electron_1.ipcRenderer.send('webview:device-chooser-subscriber-state', true);
        }
        const unsubscribe = subscribeIpcChannel('webview:device-chooser-event', callback);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            unsubscribe();
            if (--deviceChooserSubscriberCount === 0) {
                electron_1.ipcRenderer.send('webview:device-chooser-subscriber-state', false);
            }
        };
    },
    respondWebviewDeviceChooser: (requestId, resolution) => electron_1.ipcRenderer.invoke('webview:device-chooser-response', requestId, resolution),
    getWebviewMemoryUsage: (webContentsIds) => electron_1.ipcRenderer.invoke('webview:get-memory-usage', webContentsIds),
    getDefaultDownloadDirectory: () => electron_1.ipcRenderer.invoke('dialog:get-default-download-dir'),
    showContextMenu: (items) => electron_1.ipcRenderer.invoke('window:show-context-menu', items),
    closeContextMenu: () => electron_1.ipcRenderer.invoke('window:close-context-menu'),
    executeJavaScriptInIsolatedWorld: (wcId, worldId, code) => electron_1.ipcRenderer.invoke('webview:execute-js-isolated-world', wcId, worldId, code),
    scriptJailProtocol: 2,
    listWebviewFrames: (wcId) => electron_1.ipcRenderer.invoke('webview:list-frames', wcId),
    executeJavaScriptInFrameIsolatedWorld: (wcId, frameId, code, expectedOrigin) => electron_1.ipcRenderer.invoke('webview:execute-js-frame-isolated-world', wcId, frameId, code, expectedOrigin),
    runScriptInJail: (req) => electron_1.ipcRenderer.invoke('script-jail:run', req),
    abortScriptJail: (jailId) => electron_1.ipcRenderer.invoke('script-jail:abort', jailId),
    warmScriptJail: () => electron_1.ipcRenderer.invoke('script-jail:warm'),
    subscribeWebviewSecurityState: (webContentsId, callback) => {
        // The push channel and the initial fetch can race; `seq` orders them.
        let latestSeq = 0;
        let subscribed = true;
        const deliver = (state) => {
            if (!subscribed ||
                !state ||
                state.webContentsId !== webContentsId ||
                state.seq <= latestSeq) {
                return;
            }
            latestSeq = state.seq;
            callback(state);
        };
        const handler = (_event, state) => {
            deliver(state);
        };
        electron_1.ipcRenderer.on('webview:security-state-changed', handler);
        void electron_1.ipcRenderer
            .invoke('webview:get-security-state', webContentsId)
            .then(deliver, () => undefined);
        return () => {
            subscribed = false;
            electron_1.ipcRenderer.removeListener('webview:security-state-changed', handler);
        };
    },
    allowWebviewCertificate: (webContentsId, url) => electron_1.ipcRenderer.invoke('webview:allow-certificate', webContentsId, url),
    clearWebviewSiteData: (webContentsId, origin) => electron_1.ipcRenderer.invoke('webview:clear-site-data', webContentsId, origin),
    onWebviewOpenNewTab: (callback) => {
        const handler = (_event, url, webContentsId) => {
            callback(url, webContentsId);
        };
        electron_1.ipcRenderer.on('webview:open-new-tab', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('webview:open-new-tab', handler);
        };
    },
    setWebviewDownloadDirectory: (webContentsId, downloadDir) => electron_1.ipcRenderer.invoke('webview:set-download-dir', webContentsId, downloadDir),
    setWebviewAgentControlled: (webContentsId, active) => electron_1.ipcRenderer.invoke('webview:set-agent-controlled', webContentsId, active),
    openWebviewDownload: (downloadId) => electron_1.ipcRenderer.invoke('webview:open-download', downloadId),
    showWebviewDownloadInFolder: (downloadId) => electron_1.ipcRenderer.invoke('webview:show-download-in-folder', downloadId),
    cancelWebviewDownload: (downloadId) => electron_1.ipcRenderer.invoke('webview:cancel-download', downloadId),
    resolveWebviewDownload: (downloadId, approve) => electron_1.ipcRenderer.invoke('webview:resolve-download', downloadId, approve),
    selectDownloadDirectory: (defaultPath) => electron_1.ipcRenderer.invoke('dialog:select-download-dir', defaultPath),
    onWebviewFaviconUpdated: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        electron_1.ipcRenderer.on('webview:favicon-updated', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('webview:favicon-updated', handler);
        };
    },
    onWebviewDownloadProgress: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        electron_1.ipcRenderer.on('webview:download-progress', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('webview:download-progress', handler);
        };
    },
    setWebviewDialogPolicy: (webContentsId, policy) => electron_1.ipcRenderer.invoke('webview:set-dialog-policy', webContentsId, policy),
    handleWebviewDialog: (webContentsId, decision) => electron_1.ipcRenderer.invoke('webview:handle-javascript-dialog', webContentsId, decision),
    onWebviewDialogOpening: (callback) => subscribeIpcChannel('webview:javascript-dialog-opening', callback),
    getWebviewNetworkRequests: (webContentsId) => electron_1.ipcRenderer.invoke('webview:get-network-requests', webContentsId),
    clearWebviewNetworkRequests: (webContentsId) => electron_1.ipcRenderer.invoke('webview:clear-network-requests', webContentsId),
    onWebviewNetworkRequest: (callback) => subscribeIpcChannel('webview:network-request-updated', callback),
    onWebviewPromptRequest: (callback) => {
        promptRequestSubscriberCount += 1;
        if (promptRequestSubscriberCount === 1) {
            electron_1.ipcRenderer.send('webview:prompt-subscriber-state', true);
        }
        const unsubscribe = subscribeIpcChannel('webview:prompt-request', callback);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            unsubscribe();
            promptRequestSubscriberCount = Math.max(0, promptRequestSubscriberCount - 1);
            if (promptRequestSubscriberCount === 0) {
                electron_1.ipcRenderer.send('webview:prompt-subscriber-state', false);
            }
        };
    },
    respondWebviewPrompt: (promptId, value) => electron_1.ipcRenderer.invoke('webview:prompt-response', promptId, value),
    setWebviewFileChooserPolicy: (webContentsId, policy) => electron_1.ipcRenderer.invoke('webview:set-file-chooser-policy', webContentsId, policy),
    handleWebviewFileChooser: (webContentsId, decision) => electron_1.ipcRenderer.invoke('webview:handle-file-chooser', webContentsId, decision),
    setWebviewInputFiles: (webContentsId, request) => electron_1.ipcRenderer.invoke('webview:set-input-files', webContentsId, request),
    resolveWebviewUploadFiles: (request) => electron_1.ipcRenderer.invoke('webview:resolve-upload-files', request),
    onWebviewFileChooserOpened: (callback) => subscribeIpcChannel('webview:file-chooser-opened', callback),
    setWebviewWebMcpEnabled: (enabled) => electron_1.ipcRenderer.invoke('webview:webmcp-set-enabled', enabled),
    listWebviewWebMcpTools: (webContentsId, origin) => electron_1.ipcRenderer.invoke('webview:webmcp-list-tools', webContentsId, origin),
    callWebviewWebMcpTool: (webContentsId, origin, params) => electron_1.ipcRenderer.invoke('webview:webmcp-call-tool', webContentsId, origin, params),
    cancelWebviewWebMcpToolCall: (webContentsId, callId) => electron_1.ipcRenderer.invoke('webview:webmcp-cancel-tool-call', webContentsId, callId),
    wcvBrowser: wcvBrowserAPI,
};
// SSH windows (a switch in additionalArguments): the LS and its paths are
// remote, so laptop file APIs are hidden and the toolkit uses remote ones.
const BACKEND_SWITCH = '--agy-backend=';
const isRemoteWindow = process.argv
    .find((a) => a.startsWith(BACKEND_SWITCH))
    ?.slice(BACKEND_SWITCH.length) === 'ssh';
// SSH windows have no script jail.
if (!isRemoteWindow) {
    electron_1.ipcRenderer.on('agy-script-jail:port', (event, payload) => {
        window.postMessage({
            type: 'agy-script-jail-port',
            jailId: payload?.jailId,
        }, '*', event.ports);
    });
}
const ideAPI = {
    isInstalled: () => electron_1.ipcRenderer.invoke('ide:is-installed'),
};
const wslAPI = {
    getState: () => electron_1.ipcRenderer.invoke('wsl:get-state'),
    connect: (distro) => electron_1.ipcRenderer.invoke('wsl:connect', distro),
};
const desktopMicAPI = {
    getAccessStatus: () => electron_1.ipcRenderer.invoke('mic:get-access-status'),
    requestAccess: () => electron_1.ipcRenderer.invoke('mic:request-access'),
    openSystemPreferences: () => electron_1.ipcRenderer.invoke('mic:open-system-preferences'),
};
function createLocalSshRemoteAPI() {
    const progressCallbacks = new Map();
    // A random start: a connect from before a reload can't match a new call.
    let lastRequestId = Math.floor(Math.random() * 2 ** 30);
    electron_1.ipcRenderer.on('ssh:progress', (_event, progress) => {
        const callback = typeof progress?.requestId === 'number'
            ? progressCallbacks.get(progress.requestId)
            : undefined;
        if (callback && typeof progress?.message === 'string') {
            try {
                callback(progress.message);
            }
            catch {
                // The page's callback failed; the connect goes on.
            }
        }
    });
    return {
        kind: 'local',
        getState: () => electron_1.ipcRenderer.invoke('ssh:get-state'),
        listHosts: (options) => electron_1.ipcRenderer.invoke('ssh:list-hosts', { configFile: options?.configFile }),
        chooseConfigFile: () => electron_1.ipcRenderer.invoke('ssh:choose-config-file'),
        connect: async (host, options) => {
            const requestId = ++lastRequestId;
            const onProgress = options?.onProgress;
            if (typeof onProgress === 'function') {
                progressCallbacks.set(requestId, onProgress);
            }
            try {
                return await electron_1.ipcRenderer.invoke('ssh:connect', host, {
                    requestId,
                    intent: options?.intent,
                    configFile: options?.configFile,
                });
            }
            catch {
                // The main process refused the call: still a result, not a rejection.
                return {
                    ok: false,
                    code: 'UNKNOWN',
                    message: "Couldn't connect to the SSH host. See the app log.",
                };
            }
            finally {
                progressCallbacks.delete(requestId);
            }
        },
    };
}
function createRemoteSshRemoteAPI() {
    const intentCallbacks = new Set();
    const takeIntent = async () => {
        let intent;
        try {
            intent = await electron_1.ipcRenderer.invoke('ssh:take-intent');
        }
        catch {
            // The page is going away, or its window is no longer an SSH window.
            return;
        }
        if (intent !== 'newProject') {
            return;
        }
        for (const callback of [...intentCallbacks]) {
            try {
                callback(intent);
            }
            catch {
                // The page's callback failed.
            }
        }
    };
    electron_1.ipcRenderer.on('ssh:intent', () => {
        if (intentCallbacks.size > 0) {
            void takeIntent();
        }
    });
    return {
        kind: 'ssh',
        getState: () => electron_1.ipcRenderer.invoke('ssh:get-state'),
        stopServer: () => electron_1.ipcRenderer.invoke('ssh:stop-server'),
        onIntent: (callback) => {
            if (typeof callback !== 'function') {
                return () => { };
            }
            intentCallbacks.add(callback);
            void takeIntent();
            return () => {
                intentCallbacks.delete(callback);
            };
        },
        openLocalWindow: async () => {
            try {
                await electron_1.ipcRenderer.invoke('ssh:open-local-window');
            }
            catch {
                // Refused, e.g. while this window isn't focused.
            }
        },
    };
}
electron_1.contextBridge.exposeInMainWorld('nativeNotifications', notificationAPI);
electron_1.contextBridge.exposeInMainWorld('nativeStorage', storageAPI);
electron_1.contextBridge.exposeInMainWorld('agent', agentAPI);
// Sidecar UIs: the toolkit maps them to plugin:// only where this exists. A
// local window's send sets the laptop's map; an SSH window's only refreshes
// its host's, which main builds from the host's server (remoteSidecars.ts).
electron_1.contextBridge.exposeInMainWorld('extensions', extensionsAPI);
if (isRemoteWindow) {
    // No laptop-only APIs (updater, logs, deep links with auth codes; main
    // refuses them too). Of electronNative, no built-in browser,
    // script jail or getPathForFile: dropped files get uploaded
    // instead of passing laptop paths to the remote agent. Remote paths can't
    // be shown in Finder either.
    // The toolkit uses window.sshRemote only where window.electronNative exists.
    const remoteNative = {
        getZoomLevel: electronNativeAPI.getZoomLevel,
        setTitleBarOverlay: electronNativeAPI.setTitleBarOverlay,
        minimize: electronNativeAPI.minimize,
        maximize: electronNativeAPI.maximize,
        unmaximize: electronNativeAPI.unmaximize,
        isMaximized: electronNativeAPI.isMaximized,
        close: electronNativeAPI.close,
        toggleDevTools: electronNativeAPI.toggleDevTools,
        zoomIn: electronNativeAPI.zoomIn,
        zoomOut: electronNativeAPI.zoomOut,
        resetZoom: electronNativeAPI.resetZoom,
        openExternal: electronNativeAPI.openExternal,
        showContextMenu: electronNativeAPI.showContextMenu,
        closeContextMenu: electronNativeAPI.closeContextMenu,
        revealInFilePicker: () => Promise.resolve(),
    };
    electron_1.contextBridge.exposeInMainWorld('electronNative', remoteNative);
    electron_1.contextBridge.exposeInMainWorld('sshRemote', createRemoteSshRemoteAPI());
}
else {
    electron_1.contextBridge.exposeInMainWorld('electronUpdater', updaterAPI);
    electron_1.contextBridge.exposeInMainWorld('dialog', dialogAPI);
    electron_1.contextBridge.exposeInMainWorld('logs', logsAPI);
    electron_1.contextBridge.exposeInMainWorld('deepLink', deepLinkAPI);
    electron_1.contextBridge.exposeInMainWorld('electronNative', electronNativeAPI);
    electron_1.contextBridge.exposeInMainWorld('ide', ideAPI);
    electron_1.contextBridge.exposeInMainWorld('wsl', wslAPI);
    electron_1.contextBridge.exposeInMainWorld('desktopMic', desktopMicAPI);
    electron_1.contextBridge.exposeInMainWorld('sshRemote', createLocalSshRemoteAPI());
}
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*(?:,|\s)\s*(\d{1,3})\s*(?:,|\s)\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;
const CSS_VAR_RE = /^var\(\s*(--[^,\s)]+)(?:\s*,\s*(.+))?\)$/;
function parseCssColorToHex6(raw) {
    const s = raw.trim();
    if (!s) {
        return undefined;
    }
    if (HEX6_RE.test(s)) {
        return s.toUpperCase();
    }
    const h3 = HEX3_RE.exec(s);
    if (h3) {
        return `#${h3[1]}${h3[1]}${h3[2]}${h3[2]}${h3[3]}${h3[3]}`.toUpperCase();
    }
    const rgb = RGB_RE.exec(s);
    if (!rgb) {
        return undefined;
    }
    if (rgb[4] !== undefined) {
        const a = rgb[4].endsWith('%')
            ? Number(rgb[4].slice(0, -1)) / 100
            : Number(rgb[4]);
        if (!Number.isFinite(a) || a < 1) {
            return undefined;
        }
    }
    const h2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v))))
        .toString(16)
        .padStart(2, '0');
    return `#${h2(rgb[1])}${h2(rgb[2])}${h2(rgb[3])}`.toUpperCase();
}
// TODO(yushis): Push `wcvBrowser.setThemeColor` directly from toolkit `themeProvider`
// and remove this interim `:root` `--background` MutationObserver bridge.
function installHubSurfaceThemeAutoSync() {
    const g = globalThis;
    if (!g.document ||
        typeof g.getComputedStyle !== 'function' ||
        (g.top && g.self && g.top !== g.self)) {
        return;
    }
    let lastSyncedHex = '';
    let observedRoot = null;
    const syncNow = () => {
        const rootEl = g.document?.documentElement;
        if (!rootEl) {
            return;
        }
        if (observedRoot !== rootEl && typeof g.MutationObserver === 'function') {
            observedRoot = rootEl;
            new g.MutationObserver(syncNow).observe(rootEl, {
                attributes: true,
                attributeFilter: ['style', 'class', 'data-theme'],
            });
        }
        const style = g.getComputedStyle?.(rootEl);
        let cur = style?.getPropertyValue?.('--background')?.trim() ?? '';
        for (let depth = 0; depth < 3 && cur; depth++) {
            const hex = parseCssColorToHex6(cur);
            if (hex) {
                cur = hex;
                break;
            }
            const m = CSS_VAR_RE.exec(cur);
            if (!m) {
                break;
            }
            cur = style?.getPropertyValue?.(m[1])?.trim() || m[2]?.trim() || '';
        }
        const hex = parseCssColorToHex6(cur);
        if (hex && hex !== lastSyncedHex) {
            lastSyncedHex = hex;
            void Promise.resolve(electron_1.ipcRenderer.invoke('wcv:set-theme-color', hex)).catch(() => undefined);
        }
    };
    syncNow();
    g.document.addEventListener?.('DOMContentLoaded', syncNow);
    g.addEventListener?.('load', syncNow);
}
const FLAG_KEY = 'jetski.developer.customFlagOverrides';
const MIG_KEY = `${FLAG_KEY}.migrated`;
const WRITE_EV = 'agy-flag-overrides-write';
const parseFlags = (v) => {
    try {
        const p = typeof v === 'string' ? JSON.parse(v) : null;
        return p && typeof p === 'object' && !Array.isArray(p) ? String(v) : null;
    }
    catch {
        return null;
    }
};
/** Hydrates and mirrors `jetski.developer.customFlagOverrides` via `app_storage.json` across ephemeral LS ports. */
function installCustomFlagOverridesSync() {
    const g = globalThis;
    const h = g.location?.hostname;
    const okHost = !g.location ||
        (/^https?:$/.test(g.location.protocol ?? '') &&
            (h === '127.0.0.1' || h === 'localhost'));
    if (!okHost || (g.top && g.self && g.top !== g.self)) {
        return;
    }
    // Own writes not yet acknowledged; their broadcasts are echoed back before
    // the reply, so any broadcast seen meanwhile is superseded by our write.
    let pending = 0;
    const persist = (v) => {
        pending++;
        void Promise.resolve(electron_1.ipcRenderer.invoke('storage:update-items', {
            [FLAG_KEY]: v,
            [MIG_KEY]: 'true',
        }))
            .catch(() => { })
            .finally(() => pending--);
    };
    const runMain = (js) => void Promise.resolve(electron_1.webFrame.executeJavaScript?.(js)).catch(() => { });
    let s;
    let last = null;
    let suppress = false;
    try {
        if (!g.localStorage?.getItem || !g.localStorage.setItem) {
            return;
        }
        s = g.localStorage;
        const m = electron_1.ipcRenderer.sendSync?.('storage:get-items-sync');
        if (!m || typeof m !== 'object') {
            // Untrusted sender or IPC failure: never treat as a fresh install.
            return;
        }
        const kv = m;
        const migrated = MIG_KEY in kv || FLAG_KEY in kv;
        const disk = parseFlags(kv[FLAG_KEY]);
        const localRaw = s.getItem(FLAG_KEY);
        const local = parseFlags(localRaw);
        last = migrated ? disk : local;
        if (disk !== null && localRaw !== disk) {
            s.setItem(FLAG_KEY, disk);
        }
        else if (!migrated && local !== null) {
            persist(local);
        }
        else if (migrated && disk === null && localRaw !== null) {
            s.removeItem?.(FLAG_KEY);
        }
    }
    catch {
        return;
    }
    const syncOut = () => {
        try {
            const raw = suppress ? undefined : s.getItem(FLAG_KEY);
            const next = raw ? parseFlags(raw) : null;
            const valid = raw === null || next !== null;
            if (raw !== undefined && valid && next !== last) {
                last = next;
                persist(next);
            }
        }
        catch {
            // Ignore storage access errors during unload.
        }
    };
    // Not `storage`: that fires when another window on the same origin wrote
    // the shared localStorage, and that window persists its own change.
    [WRITE_EV, 'pagehide', 'beforeunload'].forEach((ev) => g.addEventListener?.(ev, syncOut));
    g.addEventListener?.('visibilitychange', syncOut);
    const kJson = JSON.stringify(FLAG_KEY);
    runMain(`(()=>{const P=window.Storage?.prototype,L=window.localStorage,K=${kJson},E=${JSON.stringify(WRITE_EV)};if(!P||!L||P.__agyFlagHook)return;Object.defineProperty(P,'__agyFlagHook',{value:1});const n=()=>{window.dispatchEvent(new Event(E))},si=P.setItem,ri=P.removeItem,cl=P.clear;P.setItem=function(k,v){si.call(this,k,v);if(this===L&&String(k)===K)n()};P.removeItem=function(k){ri.call(this,k);if(this===L&&String(k)===K)n()};P.clear=function(){cl.call(this);if(this===L)n()}})()`);
    electron_1.ipcRenderer.on('storage:changed', (_e, changes) => {
        const raw = changes && FLAG_KEY in changes ? changes[FLAG_KEY] : undefined;
        const next = raw === null ? null : parseFlags(raw);
        if (raw === undefined || (raw !== null && next === null)) {
            return;
        }
        try {
            const cur = s.getItem(FLAG_KEY);
            if (cur === next) {
                last = next;
                return;
            }
            // A local value not yet persisted (or a newer write from another window
            // sharing this origin) wins over a possibly stale broadcast.
            if (pending > 0 || cur !== last) {
                return;
            }
            last = next;
            suppress = true;
            if (next === null) {
                s.removeItem?.(FLAG_KEY);
            }
            else {
                s.setItem(FLAG_KEY, next);
            }
            runMain(`window.dispatchEvent(new StorageEvent('storage',{key:${kJson},newValue:${JSON.stringify(next)},storageArea:window.localStorage}))`);
        }
        catch {
            // Ignore teardown write failures.
        }
        finally {
            suppress = false;
        }
    });
}
// Not SSH windows: no built-in browser tabs; flag overrides are the laptop's.
if (!isRemoteWindow) {
    installHubSurfaceThemeAutoSync();
    installCustomFlagOverridesSync();
}
