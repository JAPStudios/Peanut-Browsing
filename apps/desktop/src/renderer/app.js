const api = window.peanutBrowser;
const tabsElement = document.getElementById('tabs');
const addressElement = document.getElementById('address');
const statusElement = document.getElementById('page-status');
const backButton = document.getElementById('back');
const forwardButton = document.getElementById('forward');
const reloadButton = document.getElementById('reload');
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
    title.textContent = tab.loading ? 'Loading…' : (tab.title || 'New Tab');

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
    statusElement.textContent = state.loading ? 'Loading page…' : (active?.title || 'Peanut Browsing');
}

document.getElementById('address-form').addEventListener('submit', event => {
    event.preventDefault();
    api.navigate(addressElement.value).catch(error => {
        statusElement.textContent = error.message || 'Navigation could not be started.';
    });
    addressElement.blur();
});
document.getElementById('new-tab').addEventListener('click', () => api.newTab());
backButton.addEventListener('click', () => api.back());
forwardButton.addEventListener('click', () => api.forward());
reloadButton.addEventListener('click', () => {
    if (latestState?.loading) api.stop();
    else api.reload();
});
addressElement.addEventListener('focus', () => addressElement.select());
api.onFocusAddress(() => {
    addressElement.focus();
    addressElement.select();
});
api.onState(render);