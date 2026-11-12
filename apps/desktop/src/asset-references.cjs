const MAX_CSS_REFERENCES = 50;

function addReference(references, value, baseUrl) {
    const reference = String(value || '').trim();
    if (!reference || /^(data:|blob:|#)/i.test(reference)) return;
    try {
        const target = new URL(reference, baseUrl);
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return;
        target.hash = '';
        references.add(target.href);
    } catch {
        // Invalid CSS references are ignored.
    }
}

function extractCssAssetReferences(css, baseUrl, limit = MAX_CSS_REFERENCES) {
    const references = new Set();
    const source = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    const referencePattern = /@import\s+["']([^"']+)["']|url\(\s*(?:(["'])(.*?)\2|([^)]*?))\s*\)/gi;
    let match;
    while ((match = referencePattern.exec(source)) && references.size < limit) {
        addReference(references, match[1] ?? match[3] ?? match[4], baseUrl);
    }
    return Array.from(references);
}

module.exports = { extractCssAssetReferences };
