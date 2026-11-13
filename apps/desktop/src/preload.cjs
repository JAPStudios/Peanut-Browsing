const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peanutBrowser', {
    navigate: value => ipcRenderer.invoke('peanut:navigate', value),
    importSite: () => ipcRenderer.invoke('peanut:import-site'),
    importSites: addresses => ipcRenderer.invoke('peanut:import-sites', addresses),
    openLibrary: () => ipcRenderer.invoke('peanut:open-library'),
    toggleBookmark: () => ipcRenderer.invoke('peanut:toggle-bookmark'),
    listProfile: () => ipcRenderer.invoke('peanut:list-profile'),
    openSavedUrl: value => ipcRenderer.invoke('peanut:open-saved-url', value),
    removeBookmark: value => ipcRenderer.invoke('peanut:remove-bookmark', value),
    clearHistory: () => ipcRenderer.invoke('peanut:clear-history'),
    removeHistoryEntry: input => ipcRenderer.invoke('peanut:remove-history-entry', input),
    listImports: () => ipcRenderer.invoke('peanut:list-imports'),
    createContentBlock: input => ipcRenderer.invoke('peanut:create-content-block', input),
    createWebsite: input => ipcRenderer.invoke('peanut:create-website', input),
    createWebsitePage: input => ipcRenderer.invoke('peanut:create-website-page', input),
    readImportedPage: input => ipcRenderer.invoke('peanut:read-imported-page', input),
    saveImportedPage: input => ipcRenderer.invoke('peanut:save-imported-page', input),
    exportSite: siteId => ipcRenderer.invoke('peanut:export-site', siteId),
    newTab: () => ipcRenderer.invoke('peanut:new-tab'),
    newPrivateTab: () => ipcRenderer.invoke('peanut:new-private-tab'),
    closeTab: id => ipcRenderer.invoke('peanut:close-tab', id),
    switchTab: id => ipcRenderer.invoke('peanut:switch-tab', id),
    back: () => ipcRenderer.invoke('peanut:back'),
    forward: () => ipcRenderer.invoke('peanut:forward'),
    reload: () => ipcRenderer.invoke('peanut:reload'),
    stop: () => ipcRenderer.invoke('peanut:stop'),
    onState: callback => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('peanut:state', (_event, state) => callback(state));
    },
    onFocusAddress: callback => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('peanut:focus-address', () => callback());
    },
    onImportProgress: callback => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('peanut:import-progress', (_event, progress) => callback(progress));
    }
});