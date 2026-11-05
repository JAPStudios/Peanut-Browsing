const MAX_QUERY_LENGTH = 200;
const MAX_PAGE = 20;
const RESULTS_PER_PAGE = 20;

export function validateSearchRequest(query, page) {
    if (typeof query !== 'string') throw new Error('Enter a search phrase.');
    const normalizedQuery = query.trim().replace(/\\s+/g, ' ');
    if (!normalizedQuery || normalizedQuery.length > MAX_QUERY_LENGTH) {
        throw new Error('Search phrases must contain between 1 and ' + MAX_QUERY_LENGTH + ' characters.');
    }
    const normalizedPage = page === undefined ? 1 : Number(page);
    if (!Number.isInteger(normalizedPage) || normalizedPage < 1 || normalizedPage > MAX_PAGE) {
        throw new Error('The requested search-results page is outside the supported range.');
    }
    return { query: normalizedQuery, page: normalizedPage };
}

export function validateSearchEndpoint(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('The search service address is not configured correctly.');
    let endpoint;
    try { endpoint = new URL(value.trim()); } catch (error) {
        throw new Error('The search service address is not configured correctly.');
    }
    const hostname = endpoint.hostname.toLowerCase();
    const isIpv4 = /^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(hostname);
    const privateIpv4 = isIpv4 && (/^10\\./.test(hostname) || /^127\\./.test(hostname) ||
        /^169\\.254\\./.test(hostname) || /^192\\.168\\./.test(hostname) ||
        /^172\\.(?:1[6-9]|2\\d|3[01])\\./.test(hostname) || /^0\\./.test(hostname));
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname.endsWith('.internal') || hostname.endsWith('.test') || hostname.endsWith('.invalid') ||
        hostname.includes(':') || privateIpv4) {
        throw new Error('The search service must use a public HTTPS address.');
    }
    endpoint.hash = '';
    return endpoint;
}

export function buildSearchUrl(endpointValue, query, page) {
    const endpoint = validateSearchEndpoint(endpointValue);
    const request = validateSearchRequest(query, page);
    const path = endpoint.pathname.replace(/\\/+$/, '');
    endpoint.pathname = path.endsWith('/search') ? path : path + '/search';
    endpoint.search = '';
    endpoint.searchParams.set('q', request.query);
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('pageno', String(request.page));
    endpoint.searchParams.set('safesearch', '1');
    endpoint.searchParams.set('language', 'en');
    return endpoint;
}

export function normalizeSearchResults(results) {
    if (!Array.isArray(results)) throw new Error('The search service returned an invalid results document.');
    const seen = new Set();
    const normalized = [];
    for (const result of results.slice(0, RESULTS_PER_PAGE * 2)) {
        if (!result || typeof result !== 'object' || typeof result.url !== 'string') continue;
        let url;
        try { url = new URL(result.url); } catch (error) { continue; }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        url.hash = '';
        if (seen.has(url.href)) continue;
        seen.add(url.href);
        const title = typeof result.title === 'string' ? result.title.trim().slice(0, 500) : '';
        const content = typeof result.content === 'string' ? result.content.trim().slice(0, 1600) : '';
        const engine = typeof result.engine === 'string' ? result.engine.trim().slice(0, 80) : '';
        const score = Number(result.score);
        normalized.push({
            title: title || url.hostname,
            url: url.href,
            displayUrl: url.hostname + url.pathname,
            snippet: content,
            engine,
            score: Number.isFinite(score) ? score : null
        });
        if (normalized.length >= RESULTS_PER_PAGE) break;
    }
    return normalized;
}
