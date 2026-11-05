const api = window.peanutBrowser;
const sitesElement = document.getElementById('sites');
const pagesElement = document.getElementById('pages');
const statusElement = document.getElementById('status');
const emptyState = document.getElementById('empty-state');
const editor = document.getElementById('page-editor');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const htmlInput = document.getElementById('html-source');
const textInput = document.getElementById('text-content');
const pageUrl = document.getElementById('page-url');
const saveButton = document.getElementById('save-page');

let sites = [];
let selectedSiteId = null;
let selectedPageId = null;

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
        statusElement.textContent = 'Saved corrections at ' + result.editedAt;
    } catch (error) {
        statusElement.textContent = error.message || 'The corrections could not be saved.';
    } finally {
        saveButton.disabled = false;
    }
});

document.getElementById('refresh').addEventListener('click', loadSites);
loadSites();