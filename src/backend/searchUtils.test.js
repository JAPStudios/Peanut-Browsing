import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchUrl, normalizeSearchResults, validateSearchEndpoint, validateSearchRequest } from './searchUtils.js';

test('normalizes search phrases and validates page numbers', () => {
    assert.deepEqual(validateSearchRequest('  peanut   browsing ', 2), { query: 'peanut browsing', page: 2 });
    assert.throws(() => validateSearchRequest('   ', 1), /between 1 and 200 characters/);
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

test('builds a SearXNG JSON search request with safe search enabled', () => {
    const url = buildSearchUrl('https://search.example.org/', 'peanut browsing', 3);
    assert.equal(url.href, 'https://search.example.org/search?q=peanut+browsing&format=json&pageno=3&safesearch=1&language=en');
});

test('normalizes, deduplicates and filters unsafe search results', () => {
    const results = normalizeSearchResults([
        { title: 'Peanut Browsing', url: 'https://example.org/page#section', content: 'A result', engine: 'engine-a', score: 2 },
        { title: 'Duplicate', url: 'https://example.org/page', content: 'Duplicate result' },
        { title: 'Unsafe', url: 'javascript:alert(1)' },
        { title: 'Credentials', url: 'https://user:pass@example.org/' },
        { title: '', url: 'https://second.example/path', content: 'Second result' }
    ]);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
        title: 'Peanut Browsing', url: 'https://example.org/page', displayUrl: 'example.org/page',
        snippet: 'A result', engine: 'engine-a', score: 2
    });
    assert.equal(results[1].title, 'second.example');
});
