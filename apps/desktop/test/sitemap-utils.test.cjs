const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeHttpUrl,
    decodeXml,
    extractSitemapLocations
} = require('../src/sitemap-utils.cjs');

test('accepts same-origin HTTP addresses and strips fragments', () => {
    const result = normalizeHttpUrl('https://example.test/page#section', 'https://example.test');
    assert.equal(result.href, 'https://example.test/page');
});

test('rejects unsafe schemes, credentials, private hosts and cross-origin URLs', () => {
    assert.equal(normalizeHttpUrl('file:///tmp/page.html'), null);
    assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
    assert.equal(normalizeHttpUrl('https://user:pass@example.test/'), null);
    assert.equal(normalizeHttpUrl('http://127.0.0.1/'), null);
    assert.equal(normalizeHttpUrl('http://192.168.1.5/'), null);
    assert.equal(normalizeHttpUrl('http://localhost/'), null);
    assert.equal(normalizeHttpUrl('https://other.test/', 'https://example.test'), null);
});

test('decodes XML entities and safely ignores invalid numeric code points', () => {
    assert.equal(decodeXml('A&amp;B &#x1F600; &#99999999;'), 'A&B 😀 ');
});

test('extracts ordinary, namespaced and CDATA sitemap locations', () => {
    const xml = '<urlset><url><loc>https://example.test/a&amp;b</loc></url>' +
        '<x:url><x:loc><![CDATA[https://example.test/c]]></x:loc></x:url></urlset>';
    assert.deepEqual(extractSitemapLocations(xml), [
        'https://example.test/a&b',
        'https://example.test/c'
    ]);
});

test('respects a caller-supplied sitemap location limit', () => {
    const xml = '<urlset><url><loc>https://example.test/a</loc></url>' +
        '<url><loc>https://example.test/b</loc></url></urlset>';
    assert.deepEqual(extractSitemapLocations(xml, 1), ['https://example.test/a']);
});