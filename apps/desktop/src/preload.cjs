const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peanutBrowser', {
    navigate: value => ipcRenderer.invoke('peanut:navigate', value),
    importSite: () => ipcRenderer.invoke('peanut:import-site'),
    openLibrary: () => ipcRenderer.invoke('peanut:open-library'),
    listImports: () => ipcRenderer.invoke('peanut:list-imports'),
    readImportedPage: input => ipcRenderer.invoke('peanut:read-imported-page', input),
    saveImportedPage: input => ipcRenderer.invoke('peanut:save-imported-page', input),
    newTab: () => ipcRenderer.invoke('peanut:new-tab'),
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