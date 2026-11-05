const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeHttpUrl,
    normalizeAssetUrl,
    decodeXml,
    extractSitemapLocations,
    isPublicAddress,
    assertPublicHostname
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

test('classifies public and non-public IP address ranges', () => {
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
    assert.equal(isPublicAddress('127.0.0.1'), false);
    assert.equal(isPublicAddress('10.0.0.1'), false);
    assert.equal(isPublicAddress('192.168.1.1'), false);
    assert.equal(isPublicAddress('169.254.1.1'), false);
    assert.equal(isPublicAddress('::1'), false);
    assert.equal(isPublicAddress('fc00::1'), false);
    assert.equal(isPublicAddress('fe80::1'), false);
});

test('allows same-origin assets plus trusted HTTPS Wix media CDNs only', () => {
    assert.equal(
        normalizeAssetUrl('https://example.test/image.png', 'https://example.test').href,
        'https://example.test/image.png'
    );
    assert.equal(
        normalizeAssetUrl('https://static.wixstatic.com/media/image.png', 'https://example.test').hostname,
        'static.wixstatic.com'
    );
    assert.equal(normalizeAssetUrl('https://cdn.attacker.test/image.png', 'https://example.test'), null);
    assert.equal(normalizeAssetUrl('http://static.wixstatic.com/image.png', 'https://example.test'), null);
    assert.equal(normalizeAssetUrl('http://127.0.0.1/image.png', 'https://example.test'), null);
});

test('enforces a site path boundary on shared hosting domains', () => {
    assert.equal(
        normalizeHttpUrl('https://tenant.wixsite.com/site/about', 'https://tenant.wixsite.com', '/site').pathname,
        '/site/about'
    );
    assert.equal(
        normalizeHttpUrl('https://tenant.wixsite.com/another-site/', 'https://tenant.wixsite.com', '/site'),
        null
    );
});

test('rejects local DNS names before importing', async () => {
    await assert.rejects(assertPublicHostname('127.0.0.1'), /public DNS hostname/i);
    await assert.rejects(assertPublicHostname('localhost'), /private, local or reserved/i);
});