import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchServiceUrl, normalizeSearchResults, normalizeTotalResults, validatePublicWebsiteUrl, validateSearchEndpoint, validateSearchRequest } from './searchUtils.js';

test('normalizes search phrases and validates page numbers', () => {
    assert.deepEqual(validateSearchRequest('  peanut   browsing ', 2), { query: 'peanut browsing', page: 2 });
    assert.deepEqual(validateSearchRequest('peanut', '2'), { query: 'peanut', page: 2 });
    for (const invalidPage of ['1e1', '0x10', '01', '1.5', '2junk', '', null, [], {}]) {
        assert.throws(() => validateSearchRequest('peanut', invalidPage), /outside the supported range/);
    }
    assert.throws(() => validateSearchRequest('   ', 1), /between 1 and 200 characters/);
    assert.throws(() => validateSearchRequest('x + -', 1), /at least one search term/);
    assert.throws(() => validateSearchRequest('__', 1), /at least one search term/);
    assert.throws(() => validateSearchRequest('peanut', 0), /outside the supported range/);
    assert.throws(() => validateSearchRequest('peanut', 21), /outside the supported range/);
});

test('accepts only public HTTPS search-service endpoints', () => {
    assert.equal(validateSearchEndpoint('https://search.example.org').hostname, 'search.example.org');
    for (const endpoint of ['http://search.example.org', 'https://localhost', 'https://search.local',
        'https://127.0.0.1', 'https://192.168.1.10', 'https://user:pass@search.example.org']) {
        assert.throws(() => validateSearchEndpoint(endpoint), /public HTTPS/);
    }
});

test('builds first-party routes while preserving an optional gateway path', () => {
    assert.equal(buildSearchServiceUrl(validateSearchEndpoint('https://search.example.org'), 'search').href,
        'https://search.example.org/index/search');
    assert.equal(buildSearchServiceUrl(validateSearchEndpoint('https://example.org/peanut/api/'), 'search').href,
        'https://example.org/peanut/api/index/search');
    assert.equal(buildSearchServiceUrl(validateSearchEndpoint('https://example.org/peanut/api?ignored=yes#fragment'), 'crawl').href,
        'https://example.org/peanut/api/index/crawl');
    assert.throws(() => buildSearchServiceUrl(validateSearchEndpoint('https://search.example.org'), 'admin'));
});

test('normalizes, deduplicates and filters unsafe search results', () => {
    const results = normalizeSearchResults([
        { title: 'Peanut Browsing', url: 'https://example.org/page#section', content: 'A result', engine: 'engine-a', score: 2 },
        { title: 'Duplicate', url: 'https://example.org/page', content: 'Duplicate result' },
        { title: 'Unsafe', url: 'javascript:alert(1)' },
        { title: 'Credentials', url: 'https://user:pass@example.org/' },
        { title: 'Loopback', url: 'http://127.0.0.1/admin' },
        { title: 'Private network', url: 'http://192.168.1.10/' },
        { title: 'Local hostname', url: 'https://printer.local/' },
        { title: '', url: 'https://second.example/path', content: 'Second result' }
    ]);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
        title: 'Peanut Browsing', url: 'https://example.org/page', displayUrl: 'example.org/page',
        snippet: 'A result', engine: 'engine-a', score: 2
    });
    assert.equal(results[1].title, 'second.example');
});

test('preserves unknown result totals instead of treating null as zero', () => {
    assert.equal(normalizeTotalResults(null), null);
    assert.equal(normalizeTotalResults(undefined), null);
    assert.equal(normalizeTotalResults('not-a-number'), null);
    assert.equal(normalizeTotalResults(0), 0);
    assert.equal(normalizeTotalResults('42'), 42);
    assert.equal(normalizeTotalResults(-1), null);
});

test('rejects non-public IPv4 ranges when validating submitted websites', () => {
    for (const address of [
        'http://0.1.2.3', 'http://10.0.0.1', 'http://100.64.0.1',
        'http://127.0.0.1', 'http://169.254.1.1', 'http://172.16.0.1',
        'http://192.0.0.8', 'http://192.0.2.1', 'http://192.168.1.1',
        'http://198.18.0.1', 'http://198.51.100.1', 'http://203.0.113.1',
        'http://224.0.0.1', 'http://240.0.0.1', 'http://[::1]/'
    ]) assert.throws(() => validatePublicWebsiteUrl(address), /Only public HTTP or HTTPS/);
    assert.equal(validatePublicWebsiteUrl('https://example.org/page#section'), 'https://example.org/page');
    assert.equal(validatePublicWebsiteUrl('http://8.8.8.8/'), 'http://8.8.8.8/');
    assert.equal(validatePublicWebsiteUrl('http://192.0.1.1/'), 'http://192.0.1.1/');
});

test('rejects non-public IPv4 ranges for the configured search service', () => {
    for (const address of [
        'https://100.64.0.1', 'https://192.0.2.1', 'https://198.18.0.1',
        'https://198.51.100.1', 'https://203.0.113.1', 'https://224.0.0.1'
    ]) assert.throws(() => validateSearchEndpoint(address), /public HTTPS/);
});

test('keeps website indexing owner-only while allowing public search', async () => {
    const { readFile } = await import('node:fs/promises');
    const permissions = JSON.parse(await readFile(new URL('./permissions.json', import.meta.url), 'utf8'));
    const methods = permissions['web-methods'];
    const indexing = methods['backend/indexedWebsites.jsw'].indexWebsite;
    const searching = methods['backend/webSearch.jsw'].searchWeb;
    assert.equal(indexing.siteOwner.invoke, true);
    assert.equal(indexing.siteMember.invoke, false);
    assert.equal(indexing.anonymous.invoke, false);
    assert.equal(searching.anonymous.invoke, true);
});
