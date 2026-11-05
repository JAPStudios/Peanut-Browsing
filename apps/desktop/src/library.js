const api = window.peanutBrowser;
const sitesElement = document.getElementById('sites');
const pagesElement = document.getElementById('pages');
const bookmarksElement = document.getElementById('bookmarks');
const historyElement = document.getElementById('history');
const statusElement = document.getElementById('status');
const emptyState = document.getElementById('empty-state');
const editor = document.getElementById('page-editor');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const htmlInput = document.getElementById('html-source');
const textInput = document.getElementById('text-content');
const pageUrl = document.getElementById('page-url');
const previewFrame = document.getElementById('page-preview');
const assetCountElement = document.getElementById('asset-count');
const saveButton = document.getElementById('save-page');
const batchSitesInput = document.getElementById('batch-sites');
const batchImportButton = document.getElementById('batch-import');
const batchStatus = document.getElementById('batch-status');

let sites = [];
let profile = { bookmarks: [], history: [] };
let selectedSiteId = null;
let selectedPageId = null;
let activePageUrl = '';

function updatePreview() {
    if (!activePageUrl) {
        previewFrame.srcdoc = '';
        return;
    }
    let baseUrl;
    try {
        baseUrl = new URL(activePageUrl).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    } catch {
        previewFrame.srcdoc = '';
        return;
    }

    let source = htmlInput.value;
    source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    source = source.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
    const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src https: \'unsafe-inline\'; font-src https: data:; media-src https:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri https:">';
    const base = '<base href="' + baseUrl + '">';
    if (/<head\b[^>]*>/i.test(source)) {
        source = source.replace(/<head\b[^>]*>/i, match => match + policy + base);
    } else {
        source = '<head>' + policy + base + '</head>' + source;
    }
    previewFrame.srcdoc = source;
}

function makeItem(title, subtitle, selected, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item';
    button.setAttribute('aria-current', String(selected));
    button.addEventListener('click', action);

    const titleNode = document.createElement('span');
    titleNode.className = 'item-title';
    titleNode.textContent = title;

    const subtitleNode = document.createElement('span');
    subtitleNode.className = 'item-subtitle';
    subtitleNode.textContent = subtitle;

    button.append(titleNode, subtitleNode);
    return button;
}

function makeSavedRow(title, subtitle, openAction, removeAction = null) {
    const row = document.createElement('div');
    row.className = 'saved-row';
    const openButton = makeItem(title, subtitle, false, openAction);
    row.append(openButton);
    if (removeAction) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'remove-saved';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', removeAction);
        row.append(removeButton);
    }
    return row;
}

function renderProfile() {
    bookmarksElement.replaceChildren(...profile.bookmarks.map(item => makeSavedRow(
        item.title || 'Saved page',
        item.url,
        () => api.openSavedUrl(item.url),
        async () => {
            profile = await api.removeBookmark(item.url);
            renderProfile();
            statusElement.textContent = 'Bookmark removed.';
        }
    )));
    historyElement.replaceChildren(...profile.history.map(item => makeSavedRow(
        item.title || 'Visited page',
        item.url,
        () => api.openSavedUrl(item.url)
    )));
}

function renderSites() {
    sitesElement.replaceChildren(...sites.map(site => makeItem(
        site.websiteUrl || 'Imported website',
        site.pageCount + ' pages · ' + site.errorCount + ' import errors',
        site.id === selectedSiteId,
        () => selectSite(site.id)
    )));
}

function renderPages() {
    const site = sites.find(item => item.id === selectedSiteId);
    const pages = site ? site.pages : [];
    pagesElement.replaceChildren(...pages.map(page => makeItem(
        page.title || 'Untitled page',
        page.url,
        page.id === selectedPageId,
        () => selectPage(page.id)
    )));
}

async function loadSites() {
    statusElement.textContent = 'Loading imported websites…';
    try {
        sites = await api.listImports();
        profile = await api.listProfile();
        renderProfile();
        if (!sites.some(site => site.id === selectedSiteId)) {
            selectedSiteId = sites[0]?.id || null;
            selectedPageId = null;
        }
        renderSites();
        renderPages();
        if (selectedSiteId && selectedPageId) await loadPage(selectedPageId);
        else {
            editor.hidden = true;
            emptyState.hidden = false;
            statusElement.textContent = sites.length
                ? 'Select a page to review its captured source.'
                : 'No websites imported yet. Open a website in Peanut Browsing, then select Import site.';
        }
    } catch (error) {
        statusElement.textContent = error.message || 'The imported-site library could not be loaded.';
    }
}

function selectSite(siteId) {
    selectedSiteId = siteId;
    selectedPageId = null;
    renderSites();
    renderPages();
    editor.hidden = true;
    emptyState.hidden = false;
    const site = sites.find(item => item.id === siteId);
    statusElement.textContent = site ? 'Select a page from ' + site.websiteUrl : 'Select a page.';
}

async function selectPage(pageId) {
    selectedPageId = pageId;
    renderPages();
    await loadPage(pageId);
}

async function loadPage(pageId) {
    try {
        const page = await api.readImportedPage({ siteId: selectedSiteId, pageId });
        titleInput.value = page.title || '';
        descriptionInput.value = page.description || '';
        htmlInput.value = page.html || '';
        textInput.value = page.textContent || '';
        pageUrl.textContent = page.url || '';
        assetCountElement.textContent = 'Captured same-origin assets: ' + (page.assets || []).length;
        activePageUrl = page.url || '';
        updatePreview();
        editor.hidden = false;
        emptyState.hidden = true;
        statusElement.textContent = page.editedAt ? 'Previously edited ' + page.editedAt : 'Original imported source';
    } catch (error) {
        statusElement.textContent = error.message || 'The imported page could not be opened.';
    }
}

editor.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedSiteId || !selectedPageId) return;
    saveButton.disabled = true;
    statusElement.textContent = 'Saving corrections…';
    try {
        const result = await api.saveImportedPage({
            siteId: selectedSiteId,
            pageId: selectedPageId,
            title: titleInput.value,
            description: descriptionInput.value,
            html: htmlInput.value,
            textContent: textInput.value
        });
        const site = sites.find(item => item.id === selectedSiteId);
        const page = site?.pages.find(item => item.id === selectedPageId);
        if (page) page.title = result.title;
        renderPages();
        updatePreview();
        statusElement.textContent = 'Saved corrections at ' + result.editedAt;
    } catch (error) {
        statusElement.textContent = error.message || 'The corrections could not be saved.';
    } finally {
        saveButton.disabled = false;
    }
});

htmlInput.addEventListener('input', updatePreview);
batchImportButton.addEventListener('click', async () => {
    const addresses = Array.from(new Set(batchSitesInput.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean)));
    if (addresses.length === 0 || addresses.length > 10) {
        batchStatus.textContent = 'Enter between 1 and 10 website addresses, one per line.';
        return;
    }
    batchImportButton.disabled = true;
    batchStatus.textContent = 'Starting website imports…';
    try {
        const results = await api.importSites(addresses);
        const imported = results.filter(result => result.status !== 'failed');
        const failed = results.length - imported.length;
        await loadSites();
        batchStatus.textContent = 'Imported ' + imported.length + ' website(s); ' + failed + ' failed.';
    } catch (error) {
        batchStatus.textContent = error.message || 'Batch import failed.';
    } finally {
        batchImportButton.disabled = false;
    }
});
api.onImportProgress(progress => {
    const sitePrefix = progress.websiteTotal
        ? 'Website ' + progress.websiteIndex + ' of ' + progress.websiteTotal + ': '
        : '';
    batchStatus.textContent = progress.status === 'discovering-sitemaps'
        ? sitePrefix + 'checking robots.txt and sitemap indexes…'
        : sitePrefix + 'captured ' + progress.completed + ' page(s).';
});
document.getElementById('clear-history').addEventListener('click', async () => {
    profile = await api.clearHistory();
    renderProfile();
    statusElement.textContent = 'Browsing history cleared.';
});
document.getElementById('refresh').addEventListener('click', loadSites);
loadSites();