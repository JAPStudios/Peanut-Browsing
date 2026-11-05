'use strict';

const MAX_BLOCK_TEXT = 12000;

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function createContentBlock(input) {
    if (!input || typeof input !== 'object') throw new Error('A content block is required.');
    const type = input.type;
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > MAX_BLOCK_TEXT) {
        throw new Error('Enter block text of 1 to 12,000 characters.');
    }
    const safeText = escapeHtml(text);
    if (type === 'heading') return '<h2>' + safeText + '</h2>';
    if (type === 'subheading') return '<h3>' + safeText + '</h3>';
    if (type === 'paragraph') return '<p>' + safeText.replace(/\r?\n/g, '<br>') + '</p>';
    if (type === 'quote') return '<blockquote><p>' + safeText.replace(/\r?\n/g, '<br>') + '</p></blockquote>';
    if (type === 'list') {
        const items = text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
        if (items.length === 0 || items.length > 100) throw new Error('A list must contain 1 to 100 non-empty lines.');
        return '<ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
    }
    if (type === 'link') {
        let url;
        try {
            url = new URL(String(input.url || '').trim());
        } catch {
            throw new Error('Enter a complete HTTP or HTTPS link address.');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('Links must use HTTP or HTTPS without embedded credentials.');
        }
        return '<p><a href="' + escapeHtml(url.href) + '">' + safeText + '</a></p>';
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
