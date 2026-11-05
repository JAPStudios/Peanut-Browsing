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


function safeExportSegment(value) {
    let decoded = String(value || '');
    try {
        decoded = decodeURIComponent(decoded);
    } catch {
        // Preserve malformed percent sequences as ordinary filename text.
    }
    let segment = decoded.normalize('NFKC')
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
    if (!segment || segment === '.' || segment === '..') segment = 'page';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)) {
        segment = '_' + segment;
    }
    return segment;
}

function pageExportPath(value, usedPaths) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('An imported page has an invalid source address.');
    }
    const segments = url.pathname.split('/').filter(Boolean).map(safeExportSegment);
    let outputSegments = segments;
    if (outputSegments.length === 0) {
        outputSegments = ['index.html'];
    } else {
        const last = outputSegments[outputSegments.length - 1];
        const extension = path.extname(last);
        if (extension) {
            outputSegments[outputSegments.length - 1] = last.slice(0, -extension.length) + '.html';
        } else {
            outputSegments.push('index.html');
        }
    }
    let output = path.posix.join(...outputSegments);
    if (url.search) {
        const extension = path.posix.extname(output) || '.html';
        output = output.slice(0, -extension.length) + '-' +
            fingerprint(url.search).slice(0, 8) + extension;
    }
    if (usedPaths.has(output)) {
        const extension = path.posix.extname(output) || '.html';
        output = output.slice(0, -extension.length) + '-' +
            fingerprint(url.href).slice(0, 8) + extension;
    }
    usedPaths.add(output);
    return output;
}

function escapeHtmlAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function rewritePageLinks(html, sourceUrl, currentPath, pagePaths) {
    return html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])(.*?)\2/gi,
        (whole, prefix, quote, rawHref) => {
            try {
                const target = new URL(rawHref.replace(/&amp;/gi, '&'), sourceUrl);
                if (!['http:', 'https:'].includes(target.protocol)) return whole;
                const hash = target.hash;
                target.hash = '';
                const destination = pagePaths.get(target.href);
                if (!destination) return whole;
                let relative = path.posix.relative(path.posix.dirname(currentPath), destination);
                if (!relative.startsWith('.')) relative = './' + relative;
                return prefix + quote + escapeHtmlAttribute(relative + target.search + hash) + quote;
            } catch {
                return whole;
            }
        });
}

function rewriteCssAssets(css, sourceUrl, assetPaths) {
    return css.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi,
        (whole, quote, quotedValue, bareValue) => {
            const reference = String(quotedValue ?? bareValue ?? '').trim();
            if (!reference || /^(data:|blob:|#)/i.test(reference)) return whole;
            try {
                const target = new URL(reference, sourceUrl);
                target.hash = '';
                const localPath = assetPaths.get(target.href);
                return localPath ? 'url("' + localPath + '")' : whole;
            } catch {
                return whole;
            }
        }).replace(/@import\s+(["'])(.*?)\1/gi, (whole, quote, reference) => {
            try {
                const target = new URL(reference, sourceUrl);
                target.hash = '';
                const localPath = assetPaths.get(target.href);
                return localPath ? '@import "' + localPath + '"' : whole;
            } catch {
                return whole;
            }
        });
}

async function exportImportedSite(importRoot, siteId, destinationDirectory) {
    validateIds(siteId);
    if (typeof destinationDirectory !== 'string' || !destinationDirectory.trim()) {
        throw new Error('Choose a destination folder for the website export.');
    }
    const siteDirectory = path.join(importRoot, siteId);
    const manifest = await readJson(path.join(siteDirectory, 'manifest.json'));
    const sourcePages = Array.isArray(manifest.pages) ? manifest.pages : [];
    if (sourcePages.length === 0) throw new Error('This imported website has no pages to export.');
    let siteOrigin;
    try {
        siteOrigin = new URL(manifest.websiteUrl).origin;
    } catch {
        throw new Error('The imported website manifest has an invalid source address.');
    }

    const usedPaths = new Set();
    const pages = [];
    const pagePaths = new Map();
    for (const entry of sourcePages) {
        if (!entry || typeof entry.id !== 'string' || !PAGE_ID_PATTERN.test(entry.id)) continue;
        const page = await readJson(path.join(siteDirectory, entry.id + '.json'));
        const source = new URL(page.url);
        if (source.origin !== siteOrigin) continue;
        const outputPath = pageExportPath(page.url, usedPaths);
        pages.push({ entry, page, outputPath });
        source.hash = '';
        pagePaths.set(source.href, outputPath);
    }
    if (pages.length === 0) throw new Error('No valid imported pages were found.');

    const parentDirectory = path.resolve(destinationDirectory);
    await fs.mkdir(parentDirectory, { recursive: true });
    const exportDirectory = path.join(parentDirectory, 'peanut-browsing-' + siteId + '-' + Date.now());
    await fs.mkdir(exportDirectory, { recursive: false });
    const assetsDirectory = path.join(exportDirectory, 'assets');
    await fs.mkdir(assetsDirectory, { recursive: true });

    const assetPaths = new Map();
    const copiedAssets = [];
    for (const asset of Array.isArray(manifest.assets) ? manifest.assets : []) {
        if (!asset || typeof asset.url !== 'string' ||
            typeof asset.filename !== 'string' || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/i.test(asset.filename)) continue;
        const sourcePath = path.join(siteDirectory, 'assets', asset.filename);
        try {
            await fs.copyFile(sourcePath, path.join(assetsDirectory, asset.filename));
            assetPaths.set(asset.url, asset.filename);
            copiedAssets.push({ ...asset, exportPath: 'assets/' + asset.filename });
        } catch {
            // Missing or damaged assets are recorded as unresolved.
        }
    }

    let unresolvedAssetCount = 0;
    for (const asset of copiedAssets) {
        if (asset.mimeType !== 'text/css') continue;
        const cssPath = path.join(assetsDirectory, asset.filename);
        try {
            const css = await fs.readFile(cssPath, 'utf8');
            const rewritten = rewriteCssAssets(css, asset.url, assetPaths);
            await fs.writeFile(cssPath, rewritten, 'utf8');
        } catch {
            // Non-text or unreadable stylesheets remain as captured.
        }
    }

    for (const { page, outputPath } of pages) {
        let html = typeof page.html === 'string' ? page.html : '';
        const pageAssets = Array.isArray(page.assets) ? page.assets : [];
        for (const asset of pageAssets) {
            const localAsset = assetPaths.get(asset.url);
            if (!localAsset) {
                unresolvedAssetCount += 1;
                continue;
            }
            const relative = path.posix.relative(path.posix.dirname(outputPath), 'assets/' + localAsset);
            const references = [...(Array.isArray(asset.references) ? asset.references : []), asset.url].filter(Boolean);
            for (const reference of new Set(references)) {
                html = html.split(reference).join(relative);
                const escaped = reference.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                if (escaped !== reference) html = html.split(escaped).join(relative);
            }
        }
        html = rewritePageLinks(html, page.url, outputPath, pagePaths);
        const outputFile = path.join(exportDirectory, ...outputPath.split('/'));
        await fs.mkdir(path.dirname(outputFile), { recursive: true });
        await fs.writeFile(outputFile, html, 'utf8');
    }

    const exportManifest = {
        websiteUrl: manifest.websiteUrl || '',
        exportedAt: new Date().toISOString(),
        pageCount: pages.length,
        assetCount: copiedAssets.length,
        unresolvedAssetCount,
        pages: pages.map(({ page, outputPath }) => ({ sourceUrl: page.url, outputPath, title: page.title || '' })),
        assets: copiedAssets.map(asset => ({ sourceUrl: asset.url, exportPath: asset.exportPath, mimeType: asset.mimeType }))
    };
    await fs.writeFile(path.join(exportDirectory, 'peanut-export.json'), JSON.stringify(exportManifest, null, 2), 'utf8');

    return {
        status: 'exported',
        directory: exportDirectory,
        pageCount: pages.length,
        assetCount: copiedAssets.length,
        unresolvedAssetCount
    };
}

module.exports = { listImportedSites, readImportedPage, saveImportedPage, exportImportedSite };