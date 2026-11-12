const MAX_LINKS = 200;

function decodeCodePoint(value, radix) {
    const codePoint = Number.parseInt(value, radix);
    if (!Number.isInteger(codePoint) || codePoint === 0 || codePoint > 0x10FFFF ||
        (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
        return '\uFFFD';
    }
    return String.fromCodePoint(codePoint);
}

export function decodeHtml(value) {
    return String(value).replace(
        /&(amp|quot|apos|lt|gt|#39);|&#(\d+);|&#x([\da-f]+);/gi,
        (entity, named, decimal, hexadecimal) => {
            if (decimal !== undefined) return decodeCodePoint(decimal, 10);
            if (hexadecimal !== undefined) return decodeCodePoint(hexadecimal, 16);
            const entities = {
                '&amp;': '&',
                '&quot;': '"',
                '&apos;': "'",
                '&#39;': "'",
                '&lt;': '<',
                '&gt;': '>'
            };
            return entities[entity.toLowerCase()] || entity;
        }
    );
}

export function attribute(tag, name) {
    const pattern = new RegExp(
        '(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))',
        'i'
    );
    const match = String(tag).match(pattern);
    return match ? decodeHtml(match[1] || match[2] || match[3] || '').trim() : null;
}

export function metaContent(html, key, value) {
    const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
    for (const tag of tags) {
        if ((attribute(tag, key) || '').toLowerCase() === value) {
            return attribute(tag, 'content');
        }
    }
    return null;
}

export function collectLinks(html, base) {
    const links = new Map();
    const tags = String(html).match(/<a\b[^>]*>/gi) || [];
    for (const tag of tags) {
        if (links.size >= MAX_LINKS) break;
        const href = attribute(tag, 'href');
        if (!href || /^(#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
        try {
            const url = new URL(href, base);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
            url.hash = '';
            links.set(url.href, { url: url.href, sameOrigin: url.origin === base.origin });
        } catch (error) {
            // Malformed links are excluded from the preview.
        }
    }
    return Array.from(links.values());
}
