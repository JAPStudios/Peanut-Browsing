const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_BOOKMARKS = 1000;
const MAX_HISTORY = 1000;
const MAX_VISIBLE_HISTORY = 200;

function normalizeUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
}

function createProfileStore(filePath) {
    let loaded = false;
    let data = { version: 1, bookmarks: [], history: [] };
    let writeQueue = Promise.resolve();

    async function load() {
        if (loaded) return getState();
        try {
            const source = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(source);
            data = {
                version: 1,
                bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks.filter(item =>
                    item && normalizeUrl(item.url) && typeof item.title === 'string'
                ).slice(0, MAX_BOOKMARKS) : [],
                history: Array.isArray(parsed.history) ? parsed.history.filter(item =>
                    item && normalizeUrl(item.url) && typeof item.title === 'string'
                ).slice(0, MAX_HISTORY) : []
            };
        } catch (error) {
            if (error.code !== 'ENOENT') {
                data = { version: 1, bookmarks: [], history: [] };
            }
        }
        loaded = true;
        return getState();
    }

    function getState() {
        return {
            bookmarks: data.bookmarks.map(item => ({ ...item })),
            history: data.history.slice(0, MAX_VISIBLE_HISTORY).map(item => ({ ...item }))
        };
    }

    function persist() {
        const snapshot = JSON.stringify(data, null, 2);
        writeQueue = writeQueue.then(async () => {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            const temporaryPath = filePath + '.tmp';
            await fs.writeFile(temporaryPath, snapshot, 'utf8');
            await fs.rename(temporaryPath, filePath);
        });
        return writeQueue;
    }

    async function recordVisit(value, title, privateMode = false) {
        if (privateMode) return getState();
        await load();
        const url = normalizeUrl(value);
        if (!url) return getState();
        const label = typeof title === 'string' && title.trim() ? title.trim().slice(0, 512) : url;
        const now = new Date().toISOString();
        const previous = data.history[0];
        if (previous && previous.url === url && Date.now() - Date.parse(previous.visitedAt) < 5000) {
            previous.title = label;
            previous.visitedAt = now;
        } else {
            data.history.unshift({ url, title: label, visitedAt: now });
        }
        data.history = data.history.slice(0, MAX_HISTORY);
        await persist();
        return getState();
    }

    async function updateHistoryTitle(value, title, privateMode = false) {
        if (privateMode) return getState();
        await load();
        const url = normalizeUrl(value);
        if (!url || typeof title !== 'string') return getState();
        const entry = data.history.find(item => item.url === url);
        if (entry) {
            entry.title = title.trim().slice(0, 512) || url;
            await persist();
        }
        return getState();
    }

    async function toggleBookmark(value, title) {
        await load();
        const url = normalizeUrl(value);
        if (!url) throw new Error('Only HTTP or HTTPS pages can be bookmarked.');
        const index = data.bookmarks.findIndex(item => item.url === url);
        if (index >= 0) {
            data.bookmarks.splice(index, 1);
        } else {
            const label = typeof title === 'string' && title.trim() ? title.trim().slice(0, 512) : url;
            data.bookmarks.unshift({ url, title: label, addedAt: new Date().toISOString() });
            data.bookmarks = data.bookmarks.slice(0, MAX_BOOKMARKS);
        }
        await persist();
        return data.bookmarks.some(item => item.url === url);
    }

    async function removeBookmark(value) {
        await load();
        const url = normalizeUrl(value);
        if (!url) return getState();
        data.bookmarks = data.bookmarks.filter(item => item.url !== url);
        await persist();
        return getState();
    }

    async function clearHistory() {
        await load();
        data.history = [];
        await persist();
        return getState();
    }

    async function isBookmarked(value) {
        await load();
        const url = normalizeUrl(value);
        return Boolean(url && data.bookmarks.some(item => item.url === url));
    }

    return {
        load,
        getState,
        recordVisit,
        updateHistoryTitle,
        toggleBookmark,
        removeBookmark,
        clearHistory,
        isBookmarked
    };
}

module.exports = { createProfileStore, normalizeUrl };