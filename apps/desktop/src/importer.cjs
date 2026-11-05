const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { app, BrowserWindow } = require('electron');

const MAX_PAGES = 250;
const MAX_HTML_CHARS = 350000;
const MAX_TEXT_CHARS = 120000;
const MAX_LINKS_PER_PAGE = 2000;
const MAX_ASSETS_PER_PAGE = 20;
const MAX_TOTAL_ASSETS = 300;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 50 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 20000;

function normalizeHttpUrl(value, requiredOrigin) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        net.isIP(url.hostname)) return null;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
        url.hostname.endsWith('.local') || url.hostname.includes(':') ||
        /^127\./.test(url.hostname) || /^10\./.test(url.hostname) ||
        /^192\.168\./.test(url.hostname) || /^169\.254\./.test(url.hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(url.hostname)) return null;
    if (requiredOrigin && url.origin !== requiredOrigin) return null;
    url.hash = '';
    return url;
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function withTimeout(promise, milliseconds, onTimeout) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                if (onTimeout) onTimeout();
                reject(new Error('Page load timed out.'));
            }, milliseconds);
        })
    ]).finally(() => clearTimeout(timer));
}

async function extractPage(windowRef) {
    return windowRef.webContents.executeJavaScript(`(() => {
        const description = document.querySelector('meta[name="description"], meta[property="og:description"]');
        const canonical = document.querySelector('link[rel~="canonical"]');
        return {
            url: location.href,
            title: document.title || '',
            description: description ? description.content || '' : '',
            canonicalUrl: canonical ? canonical.href || '' : '',
            language: document.documentElement.lang || '',
            html: document.documentElement ? document.documentElement.outerHTML.slice(0, ${MAX_HTML_CHARS}) : '',
            textContent: document.body ? document.body.innerText.slice(0, ${MAX_TEXT_CHARS}) : '',
            links: Array.from(document.querySelectorAll('a[href]'))
                .slice(0, ${MAX_LINKS_PER_PAGE})
                .map(link => link.href),
            assets: Array.from(document.querySelectorAll('img[src], source[src], video[poster], audio[src], link[href], script[src]'))
                .slice(0, 100)
                .map(element => element.currentSrc || element.href || element.src || element.poster)
                .filter(Boolean)
        };
    })()`, false);
}


function extensionForAsset(url, contentType) {
    const known = {
        'text/css': '.css',
        'text/javascript': '.js',
        'application/javascript': '.js',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/avif': '.avif',
        'image/x-icon': '.ico',
        'font/woff': '.woff',
        'font/woff2': '.woff2',
        'application/font-woff': '.woff',
        'application/vnd.ms-fontobject': '.eot'
    };
    if (known[contentType]) return known[contentType];
    try {
        const extension = path.extname(new URL(url).pathname).toLowerCase();
        return /^\\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin';
    } catch {
        return '.bin';
    }
}

async function readLimitedBody(response, limit) {
    if (!response.body || typeof response.body.getReader !== 'function') return null;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > limit) {
            await reader.cancel();
            return null;
        }
        chunks.push(Buffer.from(result.value));
    }
    return Buffer.concat(chunks, size);
}

async function downloadAsset(browserSession, value, origin, directory, assetState) {
    const assetUrl = normalizeHttpUrl(value, origin);
    if (!assetUrl) return null;
    if (assetState.byUrl.has(assetUrl.href)) return assetState.byUrl.get(assetUrl.href);
    if (assetState.pending.has(assetUrl.href)) return assetState.pending.get(assetUrl.href);
    if (assetState.byUrl.size + assetState.pending.size >= MAX_TOTAL_ASSETS) return null;

    const task = (async () => {
        try {
            const response = await browserSession.fetch(assetUrl.href, {
                method: 'GET',
                credentials: 'include',
                redirect: 'manual',
                signal: AbortSignal.timeout(15000)
            });
            if (!response.ok || (response.status >= 300 && response.status < 400)) return null;
            const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            const supported = contentType.startsWith('image/') || contentType.startsWith('font/') ||
                contentType === 'text/css' || contentType === 'text/javascript' ||
                contentType === 'application/javascript' || contentType === 'application/font-woff' ||
                contentType === 'application/vnd.ms-fontobject';
            if (!supported) return null;
            const declaredSize = Number(response.headers.get('content-length') || 0);
            if (declaredSize > MAX_ASSET_BYTES) return null;
            const bytes = await readLimitedBody(response, MAX_ASSET_BYTES);
            if (!bytes || bytes.length === 0 ||
                assetState.totalBytes + assetState.reservedBytes + bytes.length > MAX_TOTAL_ASSET_BYTES) return null;

            assetState.reservedBytes += bytes.length;
            const id = fingerprint(assetUrl.href);
            const filename = id + extensionForAsset(assetUrl.href, contentType);
            try {
                await fs.writeFile(path.join(directory, filename), bytes);
            } catch (error) {
                assetState.reservedBytes -= bytes.length;
                throw error;
            }
            assetState.reservedBytes -= bytes.length;
            const record = {
                id,
                url: assetUrl.href,
                filename,
                mimeType: contentType,
                size: bytes.length
            };
            assetState.totalBytes += bytes.length;
            assetState.byUrl.set(assetUrl.href, record);
            return record;
        } catch {
            return null;
        }
    })();

    assetState.pending.set(assetUrl.href, task);
    try {
        return await task;
    } finally {
        assetState.pending.delete(assetUrl.href);
    }
}

async function writePage(directory, page) {
    const id = fingerprint(page.url);
    const filename = id + '.json';
    const record = {
        ...page,
        sourceHash: fingerprint(page.html + '\n' + page.textContent),
        importedAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(directory, filename), JSON.stringify(record), 'utf8');
    return { id, filename, url: page.url, title: page.title };
}

async function crawlSite(startAddress, onProgress = () => {}) {
    const start = normalizeHttpUrl(startAddress);
    if (!start) throw new Error('Open a public HTTP or HTTPS website before starting an import.');

    const origin = start.origin;
    const domainDirectory = fingerprint(origin).slice(0, 20);
    const importDirectory = path.join(app.getPath('userData'), 'imports', domainDirectory);
    await fs.mkdir(importDirectory, { recursive: true });

    const browser = new BrowserWindow({
        show: false,
        width: 1000,
        height: 760,
        webPreferences: {
            partition: 'persist:peanut-browser',
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    const contents = browser.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const allowSameOrigin = (_event, details) => {
        const target = typeof details === 'string' ? details : details?.url;
        const normalized = normalizeHttpUrl(target, origin);
        if (!normalized) _event.preventDefault();
    };
    contents.on('will-navigate', allowSameOrigin);
    contents.on('will-redirect', allowSameOrigin);

    const queue = [start.href];
    const queued = new Set(queue);
    const visited = new Set();
    const saved = [];
    const errors = [];
    const assetsDirectory = path.join(importDirectory, 'assets');
    await fs.mkdir(assetsDirectory, { recursive: true });
    const browserSession = contents.session;
    const assetState = { byUrl: new Map(), pending: new Map(), totalBytes: 0, reservedBytes: 0 };

    try {
        while (queue.length > 0 && visited.size < MAX_PAGES) {
            const address = queue.shift();
            if (visited.has(address)) continue;
            visited.add(address);
            onProgress({ status: 'importing', completed: saved.length, discovered: queued.size, currentUrl: address, limit: MAX_PAGES });

            try {
                await withTimeout(contents.loadURL(address), PAGE_TIMEOUT_MS, () => contents.stop());
                const extracted = await extractPage(browser);
                const finalUrl = normalizeHttpUrl(extracted.url, origin);
                if (!finalUrl) {
                    errors.push({ url: address, reason: 'The page redirected outside the starting website.' });
                    continue;
                }

                const page = {
                    url: finalUrl.href,
                    title: String(extracted.title || '').slice(0, 512),
                    description: String(extracted.description || '').slice(0, 4000),
                    canonicalUrl: normalizeHttpUrl(extracted.canonicalUrl, origin)?.href || finalUrl.href,
                    language: String(extracted.language || '').slice(0, 35),
                    html: String(extracted.html || '').slice(0, MAX_HTML_CHARS),
                    textContent: String(extracted.textContent || '').slice(0, MAX_TEXT_CHARS),
                    htmlTruncated: String(extracted.html || '').length >= MAX_HTML_CHARS,
                    textTruncated: String(extracted.textContent || '').length >= MAX_TEXT_CHARS
                };
                const assetUrls = Array.from(new Set(extracted.assets || [])).slice(0, MAX_ASSETS_PER_PAGE);
                const pageAssets = await Promise.all(assetUrls.map(assetUrl =>
                    downloadAsset(browserSession, assetUrl, origin, assetsDirectory, assetState)
                ));
                page.assets = pageAssets.filter(Boolean);
                const savedPage = await writePage(importDirectory, page);
                saved.push(savedPage);

                for (const link of extracted.links || []) {
                    if (queued.size >= MAX_PAGES * 8) break;
                    const next = normalizeHttpUrl(link, origin);
                    if (!next || visited.has(next.href) || queued.has(next.href)) continue;
                    queued.add(next.href);
                    queue.push(next.href);
                }
            } catch (error) {
                errors.push({ url: address, reason: String(error.message || 'Page could not be imported.') });
            }
        }

        const manifest = {
            websiteUrl: origin,
            startUrl: start.href,
            importedAt: new Date().toISOString(),
            pageCount: saved.length,
            assetCount: assetState.byUrl.size,
            assetBytes: assetState.totalBytes,
            assets: Array.from(assetState.byUrl.values()),
            pages: saved,
            errors
        };
        await fs.writeFile(path.join(importDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        const result = {
            status: queue.length > 0 ? 'limit-reached' : 'complete',
            websiteUrl: origin,
            pageCount: saved.length,
            errorCount: errors.length,
            assetCount: assetState.byUrl.size,
            assetBytes: assetState.totalBytes,
            manifestPath: path.join(importDirectory, 'manifest.json')
        };
        onProgress({ status: result.status, completed: saved.length, discovered: queued.size, currentUrl: '', limit: MAX_PAGES });
        return result;
    } finally {
        if (!browser.isDestroyed()) browser.destroy();
    }
}

module.exports = { crawlSite };