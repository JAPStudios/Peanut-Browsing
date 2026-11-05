const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fetch = require('cross-fetch');
const { ElectronBlocker, adsAndTrackingLists } = require('@ghostery/adblocker-electron');
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, Menu, session } = require('electron');
const { crawlSite } = require('./importer.cjs');
const { listImportedSites, readImportedPage, saveImportedPage } = require('./import-library.cjs');
const { createProfileStore, normalizeUrl } = require('./profile-store.cjs');

const TOOLBAR_HEIGHT = 104;
const NEW_TAB_FILE = path.join(__dirname, 'newtab.html');
const SEARCH_TEMPLATE = process.env.PEANUT_SEARCH_URL || 'http://127.0.0.1:8080/search?q={query}';

let windowRef;
let chromeView;
let libraryWindow = null;
let adblocker = null;
let protectionStatus = 'initializing';
let profileStore = null;
let importInProgress = false;
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
            loading: Boolean(tab.loading),
            private: Boolean(tab.private)
        })),
        canGoBack: active ? active.view.webContents.navigationHistory.canGoBack() : false,
        canGoForward: active ? active.view.webContents.navigationHistory.canGoForward() : false,
        loading: active ? Boolean(active.loading) : false,
        trackingProtection: protectionStatus,
        isBookmarked: Boolean(active && profileStore &&
            profileStore.getState().bookmarks.some(item => item.url === normalizeUrl(active.url)))
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
        if (profileStore && tab.url) {
            profileStore.updateHistoryTitle(tab.url, tab.title, tab.private)
                .then(publishState).catch(error => console.error('Could not update browsing history:', error));
        }
        publishState();
    });
    contents.on('did-navigate', (_event, url) => {
        tab.url = url;
        if (profileStore) {
            profileStore.recordVisit(url, tab.title, tab.private)
                .then(publishState).catch(error => console.error('Could not record browsing history:', error));
        }
        publishState();
    });
    contents.on('did-navigate-in-page', (_event, url) => {
        tab.url = url;
        if (profileStore) {
            profileStore.recordVisit(url, tab.title, tab.private)
                .then(publishState).catch(error => console.error('Could not record browsing history:', error));
        }
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
        } else if (modifier && key === 'n' && input.shift) {
            event.preventDefault();
            createTab(null, true, true);
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

function createTab(destination = null, activate = true, isPrivate = false) {
    const id = String(nextTabId++);
    const partition = isPrivate ? 'private-' + crypto.randomUUID() : 'persist:peanut-browser';
    const view = new WebContentsView({
        webPreferences: {
            partition,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            spellcheck: true
        }
    });
    const tab = { id, view, title: isPrivate ? 'Private Tab' : 'New Tab', url: '', loading: false, private: isPrivate, partition };
    tabs.set(id, tab);
    if (adblocker) {
        try {
            adblocker.enableBlockingInSession(session.fromPartition(partition));
        } catch (error) {
            console.error('Peanut Browsing could not enable tracking protection for a new tab:', error);
        }
    }
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
    if (tab.private) {
        const privateSession = session.fromPartition(tab.partition);
        if (adblocker) {
            try {
                adblocker.disableBlockingInSession(privateSession);
            } catch {
                // The blocker may not have initialized for this private session.
            }
        }
        Promise.all([
            privateSession.clearStorageData(),
            privateSession.clearCache(),
            privateSession.clearAuthCache()
        ]).catch(() => {});
    }

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

async function loadTrackingProtection() {
    try {
        const cachePath = path.join(app.getPath('userData'), 'tracking-filters.bin');
        adblocker = await ElectronBlocker.fromLists(
            fetch,
            adsAndTrackingLists,
            {
                loadCosmeticFilters: false,
                loadExtendedSelectors: false,
                loadGenericCosmeticsFilters: false,
                enableMutationObserver: false
            },
            {
                path: cachePath,
                read: fs.readFile,
                write: fs.writeFile
            }
        );
        for (const tab of tabs.values()) {
            adblocker.enableBlockingInSession(session.fromPartition(tab.partition));
        }
        protectionStatus = 'enabled';
    } catch (error) {
        protectionStatus = 'unavailable';
        console.error('Peanut Browsing tracking protection could not initialise:', error);
    }
    publishState();
}

function createLibraryWindow() {
    if (libraryWindow && !libraryWindow.isDestroyed()) {
        libraryWindow.focus();
        return;
    }
    libraryWindow = new BrowserWindow({
        width: 1120,
        height: 820,
        minWidth: 760,
        minHeight: 560,
        title: 'Peanut Browsing — Imported Sites',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    libraryWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    libraryWindow.loadFile(path.join(__dirname, 'library.html'));
    libraryWindow.on('closed', () => {
        libraryWindow = null;
    });
}

function registerIpc() {
    const isChrome = event => chromeView && event.sender === chromeView.webContents;
    const isTrustedUi = event => isChrome(event) ||
        (libraryWindow && !libraryWindow.isDestroyed() && event.sender === libraryWindow.webContents);
    const importRoot = () => path.join(app.getPath('userData'), 'imports');

    ipcMain.handle('peanut:navigate', (event, value) => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return navigateActive(value);
    });
    ipcMain.handle('peanut:open-library', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        createLibraryWindow();
    });
    ipcMain.handle('peanut:toggle-bookmark', async event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        const tab = activeTab();
        if (!tab || tab.private) throw new Error('Bookmarks are unavailable in private tabs.');
        const bookmarked = await profileStore.toggleBookmark(tab.url, tab.title);
        publishState();
        return bookmarked;
    });
    ipcMain.handle('peanut:list-profile', event => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        return profileStore.getState();
    });
    ipcMain.handle('peanut:open-saved-url', (event, value) => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        const destination = safeWebUrl(value);
        if (!destination) throw new Error('The saved address is not a valid HTTP or HTTPS URL.');
        if (!windowRef || windowRef.isDestroyed()) createWindow();
        return createTab(destination, true);
    });
    ipcMain.handle('peanut:remove-bookmark', async (event, value) => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        const result = await profileStore.removeBookmark(value);
        publishState();
        return result;
    });
    ipcMain.handle('peanut:clear-history', async event => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        const result = await profileStore.clearHistory();
        publishState();
        return result;
    });
    ipcMain.handle('peanut:list-imports', event => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        return listImportedSites(importRoot());
    });
    ipcMain.handle('peanut:read-imported-page', (event, input) => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        return readImportedPage(importRoot(), input?.siteId, input?.pageId);
    });
    ipcMain.handle('peanut:save-imported-page', (event, input) => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        return saveImportedPage(importRoot(), input);
    });
    ipcMain.handle('peanut:import-site', async event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        if (importInProgress) throw new Error('Another website import is already running.');
        const tab = activeTab();
        if (!tab) throw new Error('No active tab is available.');
        if (tab.private) throw new Error('Website import is disabled in private tabs.');
        importInProgress = true;
        try {
            return await crawlSite(tab.view.webContents.getURL(), progress => {
                if (chromeView && !chromeView.webContents.isDestroyed()) {
                    chromeView.webContents.send('peanut:import-progress', progress);
                }
            });
        } finally {
            importInProgress = false;
        }
    });
    ipcMain.handle('peanut:import-sites', async (event, addresses) => {
        if (!isTrustedUi(event)) throw new Error('Not authorised.');
        if (importInProgress) throw new Error('Another website import is already running.');
        if (!Array.isArray(addresses)) throw new Error('Provide a list of website addresses.');
        const list = Array.from(new Set(addresses.map(value => String(value || '').trim()).filter(Boolean)));
        if (list.length === 0 || list.length > 10) {
            throw new Error('Provide between 1 and 10 website addresses per batch.');
        }
        const results = [];
        importInProgress = true;
        try {
            for (let index = 0; index < list.length; index += 1) {
                const address = list[index];
                const progressHandler = progress => {
                    const update = { ...progress, websiteIndex: index + 1, websiteTotal: list.length };
                    if (chromeView && !chromeView.webContents.isDestroyed()) {
                        chromeView.webContents.send('peanut:import-progress', update);
                    }
                    if (libraryWindow && !libraryWindow.isDestroyed()) {
                        libraryWindow.webContents.send('peanut:import-progress', update);
                    }
                };
                try {
                    results.push(await crawlSite(address, progressHandler));
                } catch (error) {
                    results.push({ status: 'failed', websiteUrl: address, error: error.message || 'Import failed.' });
                }
            }
            return results;
        } finally {
            importInProgress = false;
        }
    });
    ipcMain.handle('peanut:new-tab', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return createTab();
    });
    ipcMain.handle('peanut:new-private-tab', event => {
        if (!isChrome(event)) throw new Error('Not authorised.');
        return createTab(null, true, true);
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

app.whenReady().then(async () => {
    profileStore = createProfileStore(path.join(app.getPath('userData'), 'profile.json'));
    await profileStore.load();
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
    if (process.env.PEANUT_CI_TEST === '1') {
        loadTrackingProtection().then(() => {
            app.exit(protectionStatus === 'enabled' ? 0 : 1);
        });
    } else {
        loadTrackingProtection();
    }
    app.on('activate', () => {
        if (!windowRef || windowRef.isDestroyed()) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});