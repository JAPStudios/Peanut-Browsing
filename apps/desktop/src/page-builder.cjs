'use strict';

const net = require('node:net');
const ipaddr = require('ipaddr.js');
const MAX_BLOCK_TEXT = 12000;

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHttpUrl(value, description) {
    let url;
    try {
        url = new URL(String(value || '').trim());
    } catch {
        throw new Error('Enter a complete HTTP or HTTPS ' + description + ' address.');
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const ipVersion = net.isIP(hostname);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        hostname === 'localhost' || hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') || hostname.endsWith('.internal') ||
        hostname.endsWith('.test') || hostname.endsWith('.invalid') ||
        (ipVersion && ipaddr.process(hostname).range() !== 'unicast')) {
        throw new Error('The ' + description + ' must use a public HTTP or HTTPS address without embedded credentials.');
    }
    return url.href;
}

function createContentBlock(input) {
    if (!input || typeof input !== 'object') throw new Error('A content block is required.');
    const type = input.type;
    const text = typeof input.text === 'string' ? input.text.trim() : '';

    if (type === 'divider') return '<hr class="peanut-divider">';

    if (type === 'image') {
        if (text.length > 500) throw new Error('Image alternative text must be 500 characters or fewer.');
        const url = safeHttpUrl(input.url, 'image');
        return '<figure class="peanut-image"><img src="' + escapeHtml(url) +
            '" alt="' + escapeHtml(text) + '" loading="lazy" decoding="async"></figure>';
    }

    if (!text || text.length > MAX_BLOCK_TEXT) {
        throw new Error('Enter block text of 1 to 12,000 characters.');
    }
    const safeText = escapeHtml(text);

    if (type === 'heading') return '<h2>' + safeText + '</h2>';
    if (type === 'subheading') return '<h3>' + safeText + '</h3>';
    if (type === 'paragraph') return '<p>' + safeText.replace(/\r?\n/g, '<br>') + '</p>';
    if (type === 'quote') return '<blockquote><p>' + safeText.replace(/\r?\n/g, '<br>') + '</p></blockquote>';
    if (type === 'callout') return '<aside class="peanut-callout"><p>' + safeText.replace(/\r?\n/g, '<br>') + '</p></aside>';
    if (type === 'list') {
        const items = text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
        if (items.length === 0 || items.length > 100) throw new Error('A list must contain 1 to 100 non-empty lines.');
        return '<ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
    }
    if (type === 'link') {
        const url = safeHttpUrl(input.url, 'link');
        return '<p><a href="' + escapeHtml(url) + '">' + safeText + '</a></p>';
    }
    if (type === 'button') {
        if (text.length > 200) throw new Error('Button labels must be 200 characters or fewer.');
        const url = safeHttpUrl(input.url, 'button destination');
        return '<p class="peanut-button-row"><a class="peanut-button" href="' +
            escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + safeText + '</a></p>';
    }
    throw new Error('Choose a supported content block type.');
}

function insertContentBlock(source, block) {
    if (typeof source !== 'string') throw new Error('Page source must be text.');
    const closingMain = source.search(/<\/main\s*>/i);
    if (closingMain >= 0) return source.slice(0, closingMain) + block + '\n' + source.slice(closingMain);
    const closingBody = source.search(/<\/body\s*>/i);
    if (closingBody >= 0) return source.slice(0, closingBody) + block + '\n' + source.slice(closingBody);
    return source + '\n' + block + '\n';
}

module.exports = { createContentBlock, insertContentBlock };
