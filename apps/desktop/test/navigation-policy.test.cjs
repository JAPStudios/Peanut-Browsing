const test = require('node:test');
const assert = require('node:assert/strict');
const { safeWebUrl, safeBrowserUrl } = require('../src/navigation-policy.cjs');

test('accepts ordinary public web addresses without embedded credentials', () => {
    assert.equal(safeWebUrl('https://example.org/path'), 'https://example.org/path');
    assert.equal(safeWebUrl('http://example.org/'), 'http://example.org/');
    for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.org/']) {
        assert.equal(safeWebUrl(value), null);
    }
});

test('accepts only valid internal authored-website addresses', () => {
    const siteId = '0123456789abcdefabcd';
    assert.equal(
        safeBrowserUrl('peanut-site://' + siteId + '/about/team/'),
        'peanut-site://' + siteId + '/about/team/'
    );
    assert.equal(safeBrowserUrl('https://example.org/'), 'https://example.org/');
    assert.equal(safeBrowserUrl('peanut-site://' + siteId + '/search/?q=peanut'),
        'peanut-site://' + siteId + '/search/?q=peanut');
    for (const value of [
        'peanut-site://invalid/about/',
        'peanut-site://0123456789abcdefabcd/?q=' + 'x'.repeat(2050),
        'peanut-site://user@0123456789abcdefabcd/',
        'peanut-asset://0123456789abcdefabcd/image.png',
        'javascript:alert(1)'
    ]) {
        assert.equal(safeBrowserUrl(value), null);
    }
});
