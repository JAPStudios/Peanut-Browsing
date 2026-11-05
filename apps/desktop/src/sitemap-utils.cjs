const net = require('node:net');
const dns = require('node:dns').promises;
const ipaddr = require('ipaddr.js');

function isPublicAddress(address) {
    try {
        return ipaddr.process(address).range() === 'unicast';
    } catch {
        return false;
    }
}

async function assertPublicHostname(hostname) {
    if (typeof hostname !== 'string' || !hostname || net.isIP(hostname)) {
        throw new Error('Website imports require a public DNS hostname.');
    }
    let records;
    try {
        records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new Error('The website hostname could not be resolved.');
    }
    if (!records.length || records.some(record => !isPublicAddress(record.address))) {
        throw new Error('The website hostname resolves to a private, local or reserved network address.');
    }
    return records;
}

function normalizeHttpUrl(value, requiredOrigin, requiredPathPrefix = '/') {
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
    if (requiredPathPrefix && requiredPathPrefix !== '/') {
        const prefix = requiredPathPrefix.replace(/\\/+$/, '');
        if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
    }
    url.hash = '';
    return url;
}

function normalizeAssetUrl(value, requiredOrigin) {
    const url = normalizeHttpUrl(value);
    if (!url) return null;
    if (url.origin === requiredOrigin) return url;
    if (url.protocol !== 'https:') return null;
    const trustedCdn = [
        '.wixstatic.com',
        '.parastorage.com',
        '.wixmp.com',
        '.filesusr.com'
    ].some(suffix => url.hostname.endsWith(suffix));
    return trustedCdn ? url : null;
}

function decodeXml(value) {
    const decodePoint = number => {
        const point = Number(number);
        return point >= 0 && point <= 0x10FFFF && !(point >= 0xD800 && point <= 0xDFFF)
            ? String.fromCodePoint(point)
            : '';
    };
    return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'").replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => decodePoint(n))
        .replace(/&#x([\da-f]+);/gi, (_, n) => decodePoint(parseInt(n, 16)));
}

function extractSitemapLocations(xml, limit = 2000) {
    const locations = [];
    const pattern = /<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi;
    let match;
    while ((match = pattern.exec(String(xml))) && locations.length < limit) {
        const location = decodeXml(match[1].trim());
        if (location) locations.push(location);
    }
    return locations;
}

module.exports = { normalizeHttpUrl, normalizeAssetUrl, decodeXml, extractSitemapLocations, isPublicAddress, assertPublicHostname };