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
    const selected = tab.id === activeTabId;
    const wrapper = document.createElement('div');
    wrapper.className = 'tab';
    wrapper.setAttribute('data-selected', String(selected));

    const select = document.createElement('button');
    select.className = 'tab-select';
    select.type = 'button';
    select.setAttribute('aria-pressed', String(selected));
    select.setAttribute('aria-label', (tab.private ? 'Private tab: ' : 'Tab: ') + (tab.title || 'New Tab'));
    select.dataset.tabId = tab.id;
    select.addEventListener('click', () => api.switchTab(tab.id));
    select.addEventListener('keydown', event => {
        const currentTabs = Array.from(tabsElement.querySelectorAll('.tab-select'));
        const currentIndex = currentTabs.indexOf(select);
        if (currentIndex < 0 || currentTabs.length === 0) return;

        let targetIndex = null;
        if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % currentTabs.length;
        else if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + currentTabs.length) % currentTabs.length;
        else if (event.key === 'Home') targetIndex = 0;
        else if (event.key === 'End') targetIndex = currentTabs.length - 1;

        if (targetIndex !== null) {
            event.preventDefault();
            const target = currentTabs[targetIndex];
            target.focus();
            api.switchTab(target.dataset.tabId);
        }
    });

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = (tab.private ? 'Private · ' : '') +
        (tab.loading ? 'Loading…' : (tab.title || 'New Tab'));

    const close = document.createElement('button');
    close.className = 'close-tab';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close ' + (tab.title || 'New Tab'));
    close.textContent = '×';
    close.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        close.dataset.focusTabId = tab.id;
        api.closeTab(tab.id);
    });

    select.append(title);
    wrapper.append(select, close);
    return wrapper;
}

function render(state) {
    latestState = state;
    const focusedTabId = document.activeElement?.dataset?.focusTabId || document.activeElement?.dataset?.tabId || null;
    tabsElement.replaceChildren(...state.tabs.map(tab => makeTab(tab, state.activeTabId)));
    if (focusedTabId) {
        const nextFocus = Array.from(tabsElement.querySelectorAll('.tab-select'))
            .find(tab => tab.dataset.tabId === focusedTabId);
        const activeTab = nextFocus || Array.from(tabsElement.querySelectorAll('.tab-select'))
            .find(tab => tab.dataset.tabId === state.activeTabId);
        if (activeTab) activeTab.focus();
    }
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