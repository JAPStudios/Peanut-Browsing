const MAX_QUERY_LENGTH = 200;
const MAX_PAGE = 20;
const RESULTS_PER_PAGE = 20;

function isNonPublicIpv4(hostname) {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return false;
    const octets = hostname.split('.').map(Number);
    if (octets.some(value => value < 0 || value > 255)) return true;
    const [a, b, c] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2) ||
            (b === 88 && c === 99))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113);
}

export function validatePublicWebsiteUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) {
        throw new Error('Enter a valid public website address.');
    }
    let url;
    try { url = new URL(value.trim()); } catch (error) {
        throw new Error('Enter a valid public website address.');
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || !hostname ||
        url.username || url.password || hostname === 'localhost' ||
        hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname.endsWith('.internal') || hostname.endsWith('.test') ||
        hostname.endsWith('.invalid') || hostname.includes(':') ||
        isNonPublicIpv4(hostname)) {
        throw new Error('Only public HTTP or HTTPS websites can be added to the Peanut Index.');
    }
    url.hash = '';
    return url.href;
}

export function validateSearchRequest(query, page) {
    if (typeof query !== 'string') throw new Error('Enter a search phrase.');
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
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
    const hostname = endpoint.hostname.toLowerCase().replace(/^\\[|\\]$/g, '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname.endsWith('.internal') || hostname.endsWith('.test') || hostname.endsWith('.invalid') ||
        hostname.includes(':') || isNonPublicIpv4(hostname)) {
        throw new Error('The search service must use a public HTTPS address.');
    }
    endpoint.hash = '';
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

export function normalizeTotalResults(value) {
    if (value === null || value === undefined) return null;
    const total = Number(value);
    return Number.isFinite(total) && total >= 0 ? total : null;
}
