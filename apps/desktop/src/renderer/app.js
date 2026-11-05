const api = window.peanutBrowser;
const tabsElement = document.getElementById('tabs');
const addressElement = document.getElementById('address');
const statusElement = document.getElementById('page-status');
const protectionStatusElement = document.getElementById('protection-status');
const downloadStatusElement = document.getElementById('download-status');
const backButton = document.getElementById('back');
const forwardButton = document.getElementById('forward');
const reloadButton = document.getElementById('reload');
const importButton = document.getElementById('import-site');
const bookmarkButton = document.getElementById('bookmark-page');
let latestState = null;

function makeTab(tab, activeTabId) {
    const button = document.createElement('button');
    button.className = 'tab';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === activeTabId));
    button.addEventListener('click', () => api.switchTab(tab.id));

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = (tab.private ? 'Private · ' : '') +
        (tab.loading ? 'Loading…' : (tab.title || 'New Tab'));

    const close = document.createElement('span');
    close.className = 'close-tab';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', 'Close tab');
    close.textContent = '×';
    close.addEventListener('click', event => {
        event.stopPropagation();
        api.closeTab(tab.id);
    });

    button.append(title, close);
    return button;
}

function render(state) {
    latestState = state;
    tabsElement.replaceChildren(...state.tabs.map(tab => makeTab(tab, state.activeTabId)));
    const active = state.tabs.find(tab => tab.id === state.activeTabId);
    if (active && document.activeElement !== addressElement) {
        addressElement.value = active.url || '';
    }
    backButton.disabled = !state.canGoBack;
    forwardButton.disabled = !state.canGoForward;
    reloadButton.textContent = state.loading ? '×' : '↻';
    reloadButton.setAttribute('aria-label', state.loading ? 'Stop loading' : 'Reload');
    const canImportWebsite = Boolean(active && !active.private &&
        ((active.url || '').startsWith('http://') || (active.url || '').startsWith('https://')));
    importButton.disabled = !canImportWebsite;
    importButton.title = canImportWebsite
        ? 'Capture pages from the current website'
        : 'Open a public website before importing it';
    bookmarkButton.disabled = Boolean(!active || active.private ||
        !(/^https?:\/\//i.test(active.url) || /^peanut-site:\/\/[a-f0-9]{20}\//i.test(active.url)));
    bookmarkButton.textContent = state.isBookmarked ? '★' : '☆';
    bookmarkButton.title = state.isBookmarked ? 'Remove bookmark' : 'Bookmark this page';
    statusElement.textContent = state.loading
        ? 'Loading page…'
        : (active?.private ? 'Private browsing' : (active?.title || 'Peanut Browsing'));
    protectionStatusElement.textContent = state.trackingProtection === 'enabled'
        ? 'Tracking protection: active'
        : (state.trackingProtection === 'unavailable'
            ? 'Tracking protection: unavailable'
            : 'Tracking protection: initializing');
    downloadStatusElement.textContent = state.downloadStatus || 'Downloads ready';
}

document.getElementById('address-form').addEventListener('submit', event => {
    event.preventDefault();
    api.navigate(addressElement.value).catch(error => {
        statusElement.textContent = error.message || 'Navigation could not be started.';
    });
    addressElement.blur();
});
bookmarkButton.addEventListener('click', async () => {
    try {
        const bookmarked = await api.toggleBookmark();
        statusElement.textContent = bookmarked ? 'Bookmark saved.' : 'Bookmark removed.';
    } catch (error) {
        statusElement.textContent = error.message || 'Bookmark could not be changed.';
    }
});
document.getElementById('new-tab').addEventListener('click', () => api.newTab());
document.getElementById('new-private-tab').addEventListener('click', () => api.newPrivateTab());
document.getElementById('open-library').addEventListener('click', () => api.openLibrary());
backButton.addEventListener('click', () => api.back());
forwardButton.addEventListener('click', () => api.forward());
reloadButton.addEventListener('click', () => {
    if (latestState?.loading) api.stop();
    else api.reload();
});
importButton.addEventListener('click', async () => {
    importButton.disabled = true;
    statusElement.textContent = 'Preparing website import…';
    try {
        const result = await api.importSite();
        statusElement.textContent = 'Imported ' + result.pageCount + ' pages from ' + result.websiteUrl;
    } catch (error) {
        statusElement.textContent = error.message || 'Website import failed.';
    } finally {
        importButton.disabled = false;
    }
});
api.onImportProgress(progress => {
    if (progress.status === 'discovering-sitemaps') {
        statusElement.textContent = 'Checking robots.txt and sitemap indexes…';
    } else if (progress.status === 'importing') {
        statusElement.textContent = 'Importing page ' + progress.completed + ' of up to ' + progress.limit;
    }
});
addressElement.addEventListener('focus', () => addressElement.select());
api.onFocusAddress(() => {
    addressElement.focus();
    addressElement.select();
});
api.onState(render);