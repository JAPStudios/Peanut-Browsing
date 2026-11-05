const path = require('node:path');
const { app, BaseWindow, WebContentsView, ipcMain, Menu } = require('electron');
const { crawlSite } = require('./importer.cjs');

const TOOLBAR_HEIGHT = 104;
const NEW_TAB_FILE = path.join(__dirname, 'newtab.html');
const SEARCH_TEMPLATE = process.env.PEANUT_SEARCH_URL || 'http://127.0.0.1:8080/search?q={query}';

let windowRef;
let chromeView;
let activeTabId = null;
let nextTabId = 1;
const tabs = new Map();

function safeWebUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

function resolveInput(value) {
    const input = String(value || '').trim();
    if (!input) return null;

    const direct = safeWebUrl(input);
    if (direct) return direct;

    if (!/\s/.test(input) && /^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(input) &&
        input.includes('.')) {
        const withScheme = safeWebUrl('https://' + input);
        if (withScheme) return withScheme;
    }

    if (!SEARCH_TEMPLATE.includes('{query}')) {
        throw new Error('PEANUT_SEARCH_URL must contain the {query} placeholder.');
    }
    const searchBase = safeWebUrl(SEARCH_TEMPLATE.replace('{query}', 'query'));
    if (!searchBase) throw new Error('The configured search endpoint must be a valid HTTP or HTTPS URL.');
    return SEARCH_TEMPLATE.replace('{query}', encodeURIComponent(input));
}

function activeTab() {
    return tabs.get(activeTabId) || null;
}

function browserState() {
    const active = activeTab();
    return {
        activeTabId,
        tabs: Array.from(tabs.values()).map(tab => ({
            id: tab.id,
            title: tab.title || 'New Tab',
            url: tab.url || '',
            loading: Boolean(tab.loading)
        })),
        canGoBack: active ? active.view.webContents.navigationHistory.canGoBack() : false,
        canGoForward: active ? active.view.webContents.navigationHistory.canGoForward() : false,
        loading: active ? Boolean(active.loading) : false
    };
}

function publishState() {
    if (!chromeView || chromeView.webContents.isDestroyed()) return;
    chromeView.webContents.send('peanut:state', browserState());
}

function layoutViews() {
    if (!windowRef || windowRef.isDestroyed()) return;
    const [width, height] = windowRef.getContentSize();
    chromeView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
    const active = activeTab();
    if (active) {
        active.view.setBounds({
            x: 0,
            y: TOOLBAR_HEIGHT,
            width,
            height: Math.max(0, height - TOOLBAR_HEIGHT)
        });
    }
}

function attachTabEvents(tab) {
    const contents = tab.view.webContents;

    contents.on('page-title-updated', (_event, title) => {
        tab.title = title || 'Untitled';
        publishState();
    });
    contents.on('did-navigate', (_event, url) => {
        tab.url = url;
        publishState();
    });
    contents.on('did-navigate-in-page', (_event, url) => {
        tab.url = url;
        publishState();
    });
    contents.on('did-start-loading', () => {
        tab.loading = true;
        publishState();
    });
    contents.on('did-stop-loading', () => {
        tab.loading = false;
        tab.url = contents.getURL();
        tab.title = contents.getTitle() || tab.title;
        publishState();
    });
    contents.on('render-process-gone', () => {
        tab.loading = false;
        tab.title = 'Page stopped responding';
        publishState();
    });

    contents.on('will-navigate', (event, details) => {
        const destination = typeof details === 'string' ? details : details?.url;
        if (!safeWebUrl(destination)) event.preventDefault();
    });
    contents.on('will-redirect', (event, details) => {
        const destination = typeof details === 'string' ? details : details?.url;
        if (!safeWebUrl(destination)) event.preventDefault();
    });
    contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const modifier = input.control || input.meta;
        const key = String(input.key || '').toLowerCase();
        if (modifier && key === 'l') {
            event.preventDefault();
            if (chromeView && !chromeView.webContents.isDestroyed()) {
                chromeView.webContents.send('peanut:focus-address');
            }
        } else if (modifier && key === 't') {
            event.preventDefault();
            createTab();
        } else if (modifier && key === 'w') {
            event.preventDefault();
            closeTab(tab.id);
        } else if (modifier && key === 'r') {
            event.preventDefault();
            contents.reload();
        } else if (input.alt && key === 'arrowleft' && contents.navigationHistory.canGoBack()) {
            event.preventDefault();
            contents.navigationHistory.goBack();
        } else if (input.alt && key === 'arrowright' && contents.navigationHistory.canGoForward()) {
            event.preventDefault();
            contents.navigationHistory.goForward();
        }
    });
    contents.setWindowOpenHandler(({ url }) => {
        const destination = safeWebUrl(url);
        if (destination) createTab(destination, true);
        return { action: 'deny' };
    });
}

function createTab(destination = null, activate = true) {
    const id = String(nextTabId++);
    const view = new WebContentsView({
        webPreferences: {
            partition: 'persist:peanut-browser',
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            spellcheck: true
        }
    });
    const tab = { id, view, title: 'New Tab', url: '', loading: false };
    tabs.set(id, tab);
    attachTabEvents(tab);

    if (activate) switchTab(id);
    if (destination) {
        view.webContents.loadURL(destination).catch(() => {
            tab.loading = false;
            publishState();
        });
    } else {
        view.webContents.loadFile(NEW_TAB_FILE).catch(() => {});
    }
    publishState();
    return id;
}

function switchTab(id) {
    const next = tabs.get(String(id));
    if (!next || !windowRef) return false;

    const current = activeTab();
    if (current) windowRef.contentView.removeChildView(current.view);
    activeTabId = next.id;
    windowRef.contentView.addChildView(next.view);
    layoutViews();
    next.view.webContents.focus();
    publishState();
    return true;
}

function closeTab(id) {
    const tab = tabs.get(String(id));
    if (!tab) return false;

    const wasActive = tab.id === activeTabId;
    if (wasActive) windowRef.contentView.removeChildView(tab.view);
    tabs.delete(tab.id);
    tab.view.webContents.close();

    if (tabs.size === 0) {
        createTab();
    } else if (wasActive) {
        const next = Array.from(tabs.values()).at(-1);
        switchTab(next.id);
    }
    publishState();
    return true;
}

function navigateActive(input) {
    const tab = activeTab();
    if (!tab) throw new Error('No active tab is available.');
    const destination = resolveInput(input);
    if (!destination) return false;
    tab.loading = true;
    tab.view.webContents.loadURL(destination).catch(() => {
        tab.loading = false;
        publishState();
    });
    publishState();
    return true;
}

function registerIpc() {
    const isChrome = event => chromeView && event.sender === chromeView.webContents;

    ipcMain.handle('peanut:navigate', (event, value) => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return navigateActive(value);
    });
    ipcMain.handle('peanut:import-site', async event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (!tab) throw new Error('No active tab is available.');
        return crawlSite(tab.view.webContents.getURL(), progress => {
            if (chromeView && !chromeView.webContents.isDestroyed()) {
                chromeView.webContents.send('peanut:import-progress', progress);
            }
        });
    });
    ipcMain.handle('peanut:new-tab', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return createTab();
    });
    ipcMain.handle('peanut:close-tab', (event, id) => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return closeTab(id);
    });
    ipcMain.handle('peanut:switch-tab', (event, id) => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return switchTab(id);
    });
    ipcMain.handle('peanut:back', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (tab && tab.view.webContents.navigationHistory.canGoBack()) {
            tab.view.webContents.navigationHistory.goBack();
        }
    });
    ipcMain.handle('peanut:forward', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (tab && tab.view.webContents.navigationHistory.canGoForward()) {
            tab.view.webContents.navigationHistory.goForward();
        }
    });
    ipcMain.handle('peanut:reload', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (tab) tab.view.webContents.reload();
    });
    ipcMain.handle('peanut:stop', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (tab) tab.view.webContents.stop();
    });
}

function createWindow() {
    windowRef = new BaseWindow({
        width: 1280,
        height: 820,
        minWidth: 760,
        minHeight: 520,
        title: 'Peanut Browsing'
    });

    chromeView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    chromeView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    windowRef.contentView.addChildView(chromeView);
    chromeView.setBounds({ x: 0, y: 0, width: 1280, height: TOOLBAR_HEIGHT });
    chromeView.webContents.on('did-finish-load', publishState);
    chromeView.webContents.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    registerIpc();
    createTab();
    windowRef.on('resize', layoutViews);
    windowRef.on('closed', () => {
        for (const tab of tabs.values()) {
            if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
        }
        tabs.clear();
        windowRef = null;
        chromeView = null;
        activeTabId = null;
    });
    windowRef.show();
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
        if (!windowRef || windowRef.isDestroyed()) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});