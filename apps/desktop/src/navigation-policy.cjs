'use strict';

function safeWebUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

function safeBrowserUrl(value) {
    const webUrl = safeWebUrl(value);
    if (webUrl) return webUrl;
    try {
        const url = new URL(value);
        if (url.protocol !== 'peanut-site:' || !/^[a-f0-9]{20}$/.test(url.hostname) ||
            url.username || url.password || url.search.length > 2048) return null;
        return url.href;
    } catch {
        return null;
    }
}

module.exports = { safeWebUrl, safeBrowserUrl };
