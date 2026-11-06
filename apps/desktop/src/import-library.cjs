const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SITE_ID_PATTERN = /^[a-f0-9]{20}$/;
const PAGE_ID_PATTERN = /^[a-f0-9]{64}$/;
const MAX_HTML_CHARS = 350000;
const MAX_TEXT_CHARS = 120000;

const fileQueues = new Map();

function withFileLock(filePath, operation) {
    const previous = fileQueues.get(filePath) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    fileQueues.set(filePath, current);
    return current.finally(() => {
        if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
    });
}

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
    // A fixed ".tmp" name lets overlapping saves overwrite one another's
    // temporary data. Give every write its own exclusive temporary file.
    const temporaryPath = filePath + '.' + crypto.randomUUID() + '.tmp';
    try {
        await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), {
            encoding: 'utf8',
            flag: 'wx'
        });
        await fs.rename(temporaryPath, filePath);
    } finally {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
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
                name: manifest.name || '',
                authored: Boolean(manifest.authored),
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
    const pagePath = path.join(siteDirectory, input.pageId + '.json');

    // Serialize the read-modify-write cycle for a site's manifest. This keeps
    // concurrent page corrections from overwriting one another's page titles.
    return withFileLock(manifestPath, async () => {
        const manifest = await readJson(manifestPath);
        const entry = (manifest.pages || []).find(page => page.id === input.pageId);
        if (!entry) throw new Error('The imported page was not found.');

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
    });
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
    if (!['http:', 'https:', 'peanut-site:'].includes(url.protocol) || url.username || url.password) {
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
                if (!['http:', 'https:', 'peanut-site:'].includes(target.protocol)) return whole;
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
    let siteAddress;
    try {
        siteAddress = new URL(manifest.websiteUrl);
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
        if (source.protocol !== siteAddress.protocol || source.host !== siteAddress.host) continue;
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


function escapeHtmlText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const WEBSITE_TEMPLATES = {
    blank: '<main><h1>{{title}}</h1><p>Start building this website by editing this page.</p></main>',
    landing: '<main class="hero"><p class="eyebrow">WELCOME</p><h1>{{title}}</h1><p>Introduce this website and explain what visitors can find here.</p></main><section><h2>What this website offers</h2><p>Add the information, services or resources that matter to visitors.</p></section>',
    portfolio: '<main><h1>{{title}}</h1><p>A collection of selected work and projects.</p><section><h2>About</h2><p>Introduce the creator and the work.</p></section><section><h2>Selected work</h2><ul><li>Project one</li><li>Project two</li><li>Project three</li></ul></section></main>',
    blog: '<main><h1>{{title}}</h1><p>Articles and updates.</p><article><h2>First post</h2><p>Replace this introduction with the first article.</p></article><article><h2>Latest updates</h2><p>Add another post or update.</p></article></main>',
    documentation: '<main><h1>{{title}}</h1><p>Guides and reference material.</p><nav aria-label="Documentation sections"><a href="#getting-started">Getting started</a> · <a href="#guides">Guides</a> · <a href="#reference">Reference</a></nav><section id="getting-started"><h2>Getting started</h2><p>Explain the first steps.</p></section><section id="guides"><h2>Guides</h2><p>Add practical instructions.</p></section><section id="reference"><h2>Reference</h2><p>Add detailed reference material.</p></section></main>'
};

function makeAuthoredPage(url, title, template = 'blank') {
    const safeTitle = escapeHtmlText(title);
    const markup = WEBSITE_TEMPLATES[template];
    if (!markup) throw new Error('Choose a supported website template.');
    const content = markup.replace(/\{\{title\}\}/g, safeTitle);
    const html = '<!doctype html>\n<html lang="en">\n<head>\n' +
        '  <meta charset="utf-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        '  <title>' + safeTitle + '</title>\n' +
        '  <style>body{margin:0;font:16px/1.65 system-ui,sans-serif;color:#20242b;background:#fff}main,section{width:min(760px,calc(100% - 40px));margin:48px auto}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.1}h2{margin-top:2rem}.hero{padding:12vh 0}.eyebrow{letter-spacing:.12em;font-size:.8rem}a{color:#1459a6}li{margin:.5rem 0}</style>\\n' +
        '</head>\n<body>\n' + content + '\n</body>\n</html>\n';
    const sourceHash = fingerprint([title, '', html, title].join('\n'));
    return {
        url,
        title,
        description: '',
        canonicalUrl: url,
        language: 'en',
        html,
        textContent: title,
        htmlTruncated: false,
        textTruncated: false,
        assets: [],
        sourceTitle: title,
        sourceDescription: '',
        sourceHtml: html,
        sourceTextContent: title,
        sourceHash,
        editedHash: sourceHash,
        editedAt: null,
        sourceUpdatedSinceEdit: false,
        importedAt: new Date().toISOString()
    };
}

async function createWebsite(importRoot, input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const template = typeof input?.template === 'string' ? input.template : 'blank';
    if (!name || name.length > 80) throw new Error('Enter a website name of 1 to 80 characters.');
    if (!Object.prototype.hasOwnProperty.call(WEBSITE_TEMPLATES, template)) {
        throw new Error('Choose a supported website template.');
    }
    const siteId = fingerprint(crypto.randomUUID() + name).slice(0, 20);
    const websiteUrl = 'peanut-site://' + siteId + '/';
    const pageId = fingerprint(websiteUrl);
    const page = makeAuthoredPage(websiteUrl, name, template);
    const siteDirectory = path.join(importRoot, siteId);
    await fs.mkdir(siteDirectory, { recursive: false });
    await atomicWrite(path.join(siteDirectory, pageId + '.json'), page);
    const manifest = {
        websiteUrl,
        startUrl: websiteUrl,
        name,
        template,
        createdAt: new Date().toISOString(),
        importedAt: new Date().toISOString(),
        pageCount: 1,
        sitemapCount: 0,
        sitemapPageCount: 0,
        assetCount: 0,
        assetBytes: 0,
        assets: [],
        pages: [{ id: pageId, filename: pageId + '.json', url: websiteUrl, title: name }],
        errors: [],
        authored: true
    };
    await atomicWrite(path.join(siteDirectory, 'manifest.json'), manifest);
    return { id: siteId, websiteUrl, pageCount: 1, pageId, template };
}

async function createWebsitePage(importRoot, input) {
    if (!input || typeof input !== 'object') throw new Error('A website selection is required.');
    validateIds(input.siteId);
    const rawPath = typeof input.path === 'string' ? input.path.trim() : '';
    if (!rawPath || rawPath.length > 100) throw new Error('Enter a page path of 1 to 100 characters.');
    const segments = rawPath.replace(/^\/+|\/+$/g, '').split('/');
    if (segments.some(segment => !/^[a-z0-9][a-z0-9-]{0,39}$/i.test(segment))) {
        throw new Error('Use letters, numbers and hyphens for each page-path segment.');
    }
    const siteDirectory = path.join(importRoot, input.siteId);
    const manifestPath = path.join(siteDirectory, 'manifest.json');

    return withFileLock(manifestPath, async () => {
        const manifest = await readJson(manifestPath);
        if (!manifest.authored) throw new Error('New pages can only be added to websites created in Peanut Browsing.');
        const siteAddress = new URL(manifest.websiteUrl);
        const url = siteAddress.protocol + '//' + siteAddress.host + '/' +
            segments.map(segment => segment.toLowerCase()).join('/') + '/';
        if ((manifest.pages || []).some(page => page.url === url)) {
            throw new Error('That page path already exists in this website.');
        }
        const title = segments[segments.length - 1].replace(/-/g, ' ')
            .replace(/\b[a-z]/g, character => character.toUpperCase());
        const pageId = fingerprint(url);
        const page = makeAuthoredPage(url, title);
        await atomicWrite(path.join(siteDirectory, pageId + '.json'), page);
        manifest.pages.push({ id: pageId, filename: pageId + '.json', url, title });
        manifest.pageCount = manifest.pages.length;
        await atomicWrite(manifestPath, manifest);
        return { siteId: input.siteId, pageId, url, title, pageCount: manifest.pageCount };
    });
}

module.exports = { listImportedSites, readImportedPage, saveImportedPage, exportImportedSite, createWebsite, createWebsitePage };