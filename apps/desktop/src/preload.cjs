const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peanutBrowser', {
    navigate: value => ipcRenderer.invoke('peanut:navigate', value),
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
    }
});