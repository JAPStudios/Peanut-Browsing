const api = window.peanutBrowser;
const sitesElement = document.getElementById('sites');
const pagesElement = document.getElementById('pages');
const bookmarksElement = document.getElementById('bookmarks');
const historyElement = document.getElementById('history');
const extensionsElement = document.getElementById('extensions');
const loadExtensionButton = document.getElementById('load-extension');
const historySearchInput = document.getElementById('history-search');
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
const sourceUpdateNote = document.getElementById('source-update-note');
const restoreSourceButton = document.getElementById('restore-source');
const saveButton = document.getElementById('save-page');
const batchSitesInput = document.getElementById('batch-sites');
const batchImportButton = document.getElementById('batch-import');
const exportButton = document.getElementById('export-site');
const batchStatus = document.getElementById('batch-status');
const newSiteNameInput = document.getElementById('new-site-name');
const newSiteTemplateInput = document.getElementById('new-site-template');
const newSiteThemeInput = document.getElementById('new-site-theme');
const createSiteButton = document.getElementById('create-site');
const openSiteButton = document.getElementById('open-site');
const newPagePathInput = document.getElementById('new-page-path');
const createPageButton = document.getElementById('create-page');
const blockTypeInput = document.getElementById('block-type');
const blockTextInput = document.getElementById('block-text');
const blockUrlInput = document.getElementById('block-url');
const blockUrlLabel = document.getElementById('block-url-label');
const insertBlockButton = document.getElementById('insert-block');

let sites = [];
let profile = { bookmarks: [], history: [], extensions: [] };
let extensions = [];
let selectedSiteId = null;
let selectedPageId = null;
let activePageUrl = '';
let activeSiteId = '';
let activeAssetToken = '';
let activePageAssets = [];
let currentPage = null;

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
    for (const asset of activePageAssets) {
        if (!asset.filename || !activeSiteId || !activeAssetToken) continue;
        const localUrl = 'peanut-asset://' + activeSiteId + '/' + asset.filename + '?token=' + activeAssetToken;
        const references = [...(Array.isArray(asset.references) ? asset.references : []), asset.url].filter(Boolean);
        for (const reference of references) {
            const escapedReference = reference.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            source = source.split(reference).join(localUrl);
            if (escapedReference !== reference) source = source.split(escapedReference).join(localUrl);
        }
    }
    const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data: peanut-asset:; style-src https: peanut-asset: \'unsafe-inline\'; font-src https: data: peanut-asset:; media-src https: peanut-asset:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri https: peanut-site:">';
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
        removeButton.setAttribute('aria-label', 'Remove ' + title);
        removeButton.addEventListener('click', removeAction);
        row.append(removeButton);
    }
    return row;
}

function renderExtensions() {
    extensionsElement.replaceChildren(...extensions.map(extension => {
        const row = document.createElement('div');
        row.className = 'saved-row extension-row';
        const details = document.createElement('div');
        details.className = 'extension-details';
        const name = document.createElement('span');
        name.className = 'item-title';
        name.textContent = extension.name || 'Unnamed extension';
        const version = document.createElement('span');
        version.className = 'item-subtitle';
        version.textContent = 'Version ' + (extension.version || 'unknown');
        details.append(name, version);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'remove-saved';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', 'Remove extension ' + (extension.name || extension.id));
        removeButton.addEventListener('click', async () => {
            removeButton.disabled = true;
            try {
                const result = await api.removeExtension(extension.id);
                extensions = result.extensions || [];
                renderExtensions();
                statusElement.textContent = 'Extension removed.';
            } catch (error) {
                statusElement.textContent = error.message || 'The extension could not be removed.';
                removeButton.disabled = false;
            }
        });
        row.append(details, removeButton);
        return row;
    }));
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
    const historyQuery = historySearchInput.value.trim().toLocaleLowerCase();
    const visibleHistory = profile.history.filter(item => !historyQuery ||
        (item.title + ' ' + item.url).toLocaleLowerCase().includes(historyQuery));
    historyElement.replaceChildren(...visibleHistory.map(item => makeSavedRow(
        item.title || 'Visited page',
        item.url + ' · ' + new Date(item.visitedAt).toLocaleString(),
        () => api.openSavedUrl(item.url),
        async () => {
            profile = await api.removeHistoryEntry({ url: item.url, visitedAt: item.visitedAt });
            renderProfile();
            statusElement.textContent = 'History entry removed.';
        }
    )));
}

function renderSites() {
    sitesElement.replaceChildren(...sites.map(site => makeItem(
        site.name || site.websiteUrl || 'Imported website',
        site.authored && site.template
            ? site.template + ' · ' + (site.theme || 'light') + ' · ' + site.pageCount + ' pages'
            : site.pageCount + ' pages · ' + site.errorCount + ' import errors',
        site.id === selectedSiteId,
        () => selectSite(site.id)
    )));
    exportButton.disabled = !sites.some(site => site.id === selectedSiteId);
    openSiteButton.disabled = !sites.some(site => site.id === selectedSiteId && site.authored);
    createPageButton.disabled = !sites.some(site => site.id === selectedSiteId && site.authored);
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
        extensions = await api.listExtensions();
        renderProfile();
        renderExtensions();
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
        currentPage = page;
        activeSiteId = page.siteId || '';
        activeAssetToken = page.assetToken || '';
        activePageAssets = Array.isArray(page.assets) ? page.assets : [];
        titleInput.value = page.title || '';
        descriptionInput.value = page.description || '';
        sourceUpdateNote.hidden = !page.sourceUpdatedSinceEdit;
        sourceUpdateNote.textContent = page.sourceUpdatedSinceEdit
            ? 'The live website changed after these corrections were saved. The edited version has been preserved.'
            : '';
        restoreSourceButton.disabled = ![
            page.sourceTitle, page.sourceDescription, page.sourceHtml, page.sourceTextContent
        ].some(value => typeof value === 'string');
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

restoreSourceButton.addEventListener('click', () => {
    if (!currentPage || !selectedSiteId || !selectedPageId) return;
    titleInput.value = currentPage.sourceTitle ?? currentPage.title ?? '';
    descriptionInput.value = currentPage.sourceDescription ?? currentPage.description ?? '';
    htmlInput.value = currentPage.sourceHtml ?? currentPage.html ?? '';
    textInput.value = currentPage.sourceTextContent ?? currentPage.textContent ?? '';
    updatePreview();
    statusElement.textContent = 'Original imported source restored in the editor. Save corrections to apply it.';
});

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
        currentPage = await api.readImportedPage({ siteId: selectedSiteId, pageId: selectedPageId });
        sourceUpdateNote.hidden = !currentPage.sourceUpdatedSinceEdit;
        updatePreview();
        statusElement.textContent = 'Saved corrections at ' + result.editedAt;
    } catch (error) {
        statusElement.textContent = error.message || 'The corrections could not be saved.';
    } finally {
        saveButton.disabled = false;
    }
});

htmlInput.addEventListener('input', updatePreview);

const blockTextLabel = document.getElementById('block-text-label');

function updateBlockControls() {
    const type = blockTypeInput.value;
    const needsUrl = ['link', 'button', 'image'].includes(type);
    const needsText = type !== 'divider';
    blockUrlInput.hidden = !needsUrl;
    blockUrlLabel.hidden = !needsUrl;
    blockUrlInput.required = needsUrl;
    blockUrlLabel.textContent = type === 'image'
        ? 'Image address'
        : (type === 'button' ? 'Button destination' : 'Link address');
    blockUrlInput.placeholder = type === 'image'
        ? 'https://example.com/image.png'
        : 'https://example.com';
    blockTextInput.hidden = !needsText;
    blockTextLabel.hidden = !needsText;
    blockTextInput.required = needsText && type !== 'image';
    blockTextLabel.textContent = type === 'image'
        ? 'Alternative text (optional)'
        : (type === 'button' ? 'Button label' :
            (type === 'callout' ? 'Callout text' : 'Text or one list item per line'));
}

blockTypeInput.addEventListener('change', updateBlockControls);
insertBlockButton.addEventListener('click', async () => {
    insertBlockButton.disabled = true;
    try {
        const block = await api.createContentBlock({
            type: blockTypeInput.value,
            text: blockTextInput.value,
            url: blockUrlInput.value,
            source: htmlInput.value
        });
        htmlInput.value = block;
        blockTextInput.value = '';
        updatePreview();
        statusElement.textContent = 'Content block inserted. Save corrections to keep it.';
    } catch (error) {
        statusElement.textContent = error.message || 'The content block could not be inserted.';
    } finally {
        insertBlockButton.disabled = false;
    }
});
updateBlockControls();



createSiteButton.addEventListener('click', async () => {
    createSiteButton.disabled = true;
    batchStatus.textContent = 'Creating website…';
    try {
        const result = await api.createWebsite({ name: newSiteNameInput.value, template: newSiteTemplateInput.value, theme: newSiteThemeInput.value });
        newSiteNameInput.value = '';
        await loadSites();
        selectSite(result.id);
        await selectPage(result.pageId);
        batchStatus.textContent = 'Created ' + result.websiteUrl + ' with the ' + result.theme + ' theme. Add pages, edit the source, then export the website.';
    } catch (error) {
        batchStatus.textContent = error.message || 'Website creation failed.';
    } finally {
        createSiteButton.disabled = false;
    }
});

openSiteButton.addEventListener('click', async () => {
    const site = sites.find(item => item.id === selectedSiteId && item.authored);
    if (!site) return;
    try {
        await api.openSavedUrl(site.websiteUrl);
        statusElement.textContent = 'Opened ' + site.websiteUrl;
    } catch (error) {
        statusElement.textContent = error.message || 'The website could not be opened.';
    }
});

createPageButton.addEventListener('click', async () => {
    if (!selectedSiteId) return;
    createPageButton.disabled = true;
    batchStatus.textContent = 'Adding page…';
    try {
        const result = await api.createWebsitePage({ siteId: selectedSiteId, path: newPagePathInput.value });
        newPagePathInput.value = '';
        await loadSites();
        selectSite(result.siteId);
        await selectPage(result.pageId);
        batchStatus.textContent = 'Added ' + result.url;
    } catch (error) {
        batchStatus.textContent = error.message || 'Page creation failed.';
    } finally {
        createPageButton.disabled = !sites.some(site => site.id === selectedSiteId && site.authored);
    }
});

exportButton.addEventListener('click', async () => {
    if (!selectedSiteId) return;
    exportButton.disabled = true;
    batchStatus.textContent = 'Preparing a static website export…';
    try {
        const result = await api.exportSite(selectedSiteId);
        if (result.status === 'cancelled') {
            batchStatus.textContent = 'Website export cancelled.';
        } else {
            batchStatus.textContent = 'Exported ' + result.pageCount + ' pages plus ' +
                result.assetCount + ' assets to ' + result.directory +
                (result.unresolvedAssetCount ? '. Some page assets were not available locally.' : '.');
        }
    } catch (error) {
        batchStatus.textContent = error.message || 'Website export failed.';
    } finally {
        exportButton.disabled = !sites.some(site => site.id === selectedSiteId);
    }
});
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
historySearchInput.addEventListener('input', renderProfile);

loadExtensionButton.addEventListener('click', async () => {
    loadExtensionButton.disabled = true;
    try {
        const result = await api.addExtension();
        extensions = result.extensions || [];
        renderExtensions();
        if (result.status === 'loaded') {
            statusElement.textContent = 'Extension loaded. It will be restored when Peanut Browsing starts.';
        } else if (result.status === 'already-loaded') {
            statusElement.textContent = 'That extension is already loaded.';
        }
    } catch (error) {
        statusElement.textContent = error.message || 'The extension could not be loaded.';
    } finally {
        loadExtensionButton.disabled = false;
    }
});

document.getElementById('clear-history').addEventListener('click', async () => {
    profile = await api.clearHistory();
    renderProfile();
    statusElement.textContent = 'Browsing history cleared.';
});
document.getElementById('refresh').addEventListener('click', loadSites);
loadSites();