const MAX_CSS_REFERENCES = 50;
const MAX_SRCSET_REFERENCES = 50;

function normalizeReference(value, baseUrl) {
    const reference = String(value || '').trim();
    if (!reference || /^(data:|blob:|#)/i.test(reference)) return null;
    try {
        const target = new URL(reference, baseUrl);
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return null;
        target.hash = '';
        return target.href;
    } catch {
        return null;
    }
}

function extractCssAssetReferencePairs(css, baseUrl, limit = MAX_CSS_REFERENCES) {
    const references = new Map();
    const source = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    const referencePattern = /@import\s+["']([^"']+)["']|url\(\s*(?:(["'])(.*?)\2|([^)]*?))\s*\)/gi;
    let match;
    while ((match = referencePattern.exec(source)) && references.size < limit) {
        const reference = String(match[1] ?? match[3] ?? match[4] ?? '').trim();
        const url = normalizeReference(reference, baseUrl);
        if (url) {
            if (!references.has(url)) references.set(url, new Set());
            references.get(url).add(reference);
        }
    }
    return Array.from(references, ([url, values]) =>
        Array.from(values, reference => ({ url, reference }))
    ).flat();
}

function extractCssAssetReferences(css, baseUrl, limit = MAX_CSS_REFERENCES) {
    return Array.from(new Set(extractCssAssetReferencePairs(css, baseUrl, limit).map(asset => asset.url)));
}

function parseSrcsetUrls(value, limit = MAX_SRCSET_REFERENCES) {
    const source = String(value || '');
    const urls = [];
    let index = 0;

    while (index < source.length && urls.length < limit) {
        while (index < source.length && (source[index] === ',' || /\s/.test(source[index]))) index++;
        if (index >= source.length) break;

        const isDataUrl = source.slice(index, index + 5).toLowerCase() === 'data:';
        const start = index;
        while (index < source.length && !/\s/.test(source[index]) &&
            (isDataUrl || source[index] !== ',')) index++;
        let url = source.slice(start, index).replace(/,+$/, '');
        if (url) urls.push(url);

        if (index < source.length && source[index] !== ',') {
            while (index < source.length && source[index] !== ',') index++;
        }
        if (source[index] === ',') index++;
    }
    return urls;
}

function extractSrcsetAssetReferences(srcset, baseUrl, limit = MAX_SRCSET_REFERENCES) {
    const references = new Map();
    for (const reference of parseSrcsetUrls(srcset, limit)) {
        const url = normalizeReference(reference, baseUrl);
        if (url && !references.has(url)) references.set(url, reference);
    }
    return Array.from(references, ([url, reference]) => ({ url, reference }));
}

module.exports = {
    extractCssAssetReferences,
    extractCssAssetReferencePairs,
    extractSrcsetAssetReferences
};
