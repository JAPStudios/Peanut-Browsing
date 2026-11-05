const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SITE_ID_PATTERN = /^[a-f0-9]{20}$/;
const PAGE_ID_PATTERN = /^[a-f0-9]{64}$/;
const MAX_HTML_CHARS = 350000;
const MAX_TEXT_CHARS = 120000;

function fingerprint(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function validateIds(siteId, pageId) {
    if (typeof siteId !== 'string' || !SITE_ID_PATTERN.test(siteId)) {
        throw new Error('The imported website identifier is invalid.');
    }
    if (pageId !== undefined && (typeof pageId !== 'string' || !PAGE_ID_PATTERN.test(pageId))) {
        throw new Error('The imported page identifier is invalid.');
    }
}

async function readJson(filePath) {
    const source = await fs.readFile(filePath, 'utf8');
    return JSON.parse(source);
}

async function atomicWrite(filePath, value) {
    const temporaryPath = filePath + '.tmp';
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(temporaryPath, filePath);
}

async function listImportedSites(importRoot) {
    let entries = [];
    try {
        entries = await fs.readdir(importRoot, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }

    const sites = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !SITE_ID_PATTERN.test(entry.name)) continue;
        try {
            const manifest = await readJson(path.join(importRoot, entry.name, 'manifest.json'));
            sites.push({
                id: entry.name,
                websiteUrl: manifest.websiteUrl || '',
                startUrl: manifest.startUrl || '',
                importedAt: manifest.importedAt || '',
                pageCount: manifest.pageCount || 0,
                errorCount: Array.isArray(manifest.errors) ? manifest.errors.length : 0,
                pages: (manifest.pages || []).map(page => ({
                    id: page.id,
                    url: page.url,
                    title: page.title || 'Untitled page'
                }))
            });
        } catch {
            // A damaged manifest does not prevent other imported websites from appearing.
        }
    }
    return sites.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
}

async function readImportedPage(importRoot, siteId, pageId) {
    validateIds(siteId, pageId);
    const siteDirectory = path.join(importRoot, siteId);
    const manifest = await readJson(path.join(siteDirectory, 'manifest.json'));
    const entry = (manifest.pages || []).find(page => page.id === pageId);
    if (!entry) throw new Error('The imported page was not found.');
    const page = await readJson(path.join(siteDirectory, pageId + '.json'));
    return {
        siteId,
        pageId,
        websiteUrl: manifest.websiteUrl,
        ...page
    };
}

async function saveImportedPage(importRoot, input) {
    if (!input || typeof input !== 'object') throw new Error('An imported page is required.');
    validateIds(input.siteId, input.pageId);

    const siteDirectory = path.join(importRoot, input.siteId);
    const manifestPath = path.join(siteDirectory, 'manifest.json');
    const manifest = await readJson(manifestPath);
    const entry = (manifest.pages || []).find(page => page.id === input.pageId);
    if (!entry) throw new Error('The imported page was not found.');

    const pagePath = path.join(siteDirectory, input.pageId + '.json');
    const page = await readJson(pagePath);
    const title = input.title === undefined ? page.title : input.title;
    const description = input.description === undefined ? page.description : input.description;
    const html = input.html === undefined ? page.html : input.html;
    const textContent = input.textContent === undefined ? page.textContent : input.textContent;

    if (typeof title !== 'string' || title.length > 512) throw new Error('The page title must be text of at most 512 characters.');
    if (typeof description !== 'string' || description.length > 4000) throw new Error('The page description must be text of at most 4,000 characters.');
    if (typeof html !== 'string' || html.length > MAX_HTML_CHARS) throw new Error('The page HTML exceeds the editor limit.');
    if (typeof textContent !== 'string' || textContent.length > MAX_TEXT_CHARS) throw new Error('The page text exceeds the editor limit.');

    const sourceTitle = page.sourceTitle ?? page.title;
    const sourceDescription = page.sourceDescription ?? page.description;
    const sourceHtml = page.sourceHtml ?? page.html;
    const sourceTextContent = page.sourceTextContent ?? page.textContent;
    const sourceHash = page.sourceHash || fingerprint([
        sourceTitle, sourceDescription, sourceHtml, sourceTextContent
    ].join('\n'));
    const editedHash = fingerprint([title, description, html, textContent].join('\n'));
    const updated = {
        ...page,
        title,
        description,
        html,
        textContent,
        sourceTitle,
        sourceDescription,
        sourceHtml,
        sourceTextContent,
        sourceHash,
        editedHash,
        sourceUpdatedSinceEdit: false,
        editedAt: new Date().toISOString()
    };
    await atomicWrite(pagePath, updated);

    entry.title = title;
    await atomicWrite(manifestPath, manifest);

    return {
        status: 'saved',
        siteId: input.siteId,
        pageId: input.pageId,
        title: updated.title,
        editedAt: updated.editedAt
    };
}

module.exports = { listImportedSites, readImportedPage, saveImportedPage };