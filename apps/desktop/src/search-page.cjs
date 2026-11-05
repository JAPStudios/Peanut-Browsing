'use strict';

const MAX_RESULTS = 20;

function normalizeSearchPayload(query, payload) {
    const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
    if (!normalizedQuery || normalizedQuery.length > 200) {
        throw new Error('Search phrases must contain between 1 and 200 characters.');
    }
    if (!payload || payload.status !== 'ok' || !Array.isArray(payload.results)) {
        throw new Error('Peanut Browsing returned an invalid search response.');
    }

    const results = [];
    const seen = new Set();
    for (const item of payload.results.slice(0, MAX_RESULTS * 2)) {
        if (!item || typeof item.url !== 'string') continue;
        let url;
        try {
            url = new URL(item.url);
        } catch {
            continue;
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        url.hash = '';
        if (seen.has(url.href)) continue;
        seen.add(url.href);
        results.push({
            title: typeof item.title === 'string' && item.title.trim()
                ? item.title.trim().slice(0, 500)
                : url.hostname,
            url: url.href,
            displayUrl: typeof item.displayUrl === 'string' && item.displayUrl.trim()
                ? item.displayUrl.trim().slice(0, 1000)
                : url.hostname + url.pathname,
            snippet: typeof item.snippet === 'string'
                ? item.snippet.trim().slice(0, 1600)
                : (typeof item.content === 'string' ? item.content.trim().slice(0, 1600) : '')
        });
        if (results.length >= MAX_RESULTS) break;
    }

    const total = Number(payload.totalResults);
    return {
        query: normalizedQuery,
        results,
        totalResults: Number.isInteger(total) && total >= 0 ? total : null,
        hasNextPage: Boolean(payload.hasNextPage)
    };
}


function parseSearchNavigation(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'peanut-search:' || url.hostname !== 'results' ||
            url.pathname !== '/' || url.username || url.password) return null;
        const queries = url.searchParams.getAll('q');
        const pages = url.searchParams.getAll('page');
        if (queries.length !== 1 || pages.length > 1) return null;
        const query = queries[0].trim().replace(/\s+/g, ' ');
        if (pages.length && !/^[1-9]\d*$/.test(pages[0])) return null;
        const page = pages.length ? Number(pages[0]) : 1;
        if (!query || query.length > 200 || !Number.isInteger(page) || page < 1 || page > 20) return null;
        return { query, page };
    } catch {
        return null;
    }
}

module.exports = { normalizeSearchPayload, parseSearchNavigation };

