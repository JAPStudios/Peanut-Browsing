const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSearchPayload } = require('../src/search-page.cjs');

test('normalizes first-party search results and removes duplicates', () => {
    const result = normalizeSearchPayload('  peanut   browsing ', {
        status: 'ok',
        totalResults: 2,
        hasNextPage: false,
        results: [
            { title: 'Peanut Browsing', url: 'https://example.org/page#top', snippet: 'First result' },
            { title: 'Duplicate', url: 'https://example.org/page', snippet: 'Duplicate' },
            { title: 'Second', url: 'https://example.net/', snippet: 'Second result' }
        ]
    });
    assert.equal(result.query, 'peanut browsing');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].url, 'https://example.org/page');
    assert.equal(result.results[0].title, 'Peanut Browsing');
    assert.equal(result.results[1].displayUrl, 'example.net/');
    assert.equal(result.totalResults, 2);
});

test('rejects malformed search responses and unsafe result destinations', () => {
    assert.throws(() => normalizeSearchPayload('peanut', null), /invalid search response/i);
    const result = normalizeSearchPayload('peanut', {
        status: 'ok',
        results: [
            { title: 'Script', url: 'javascript:alert(1)' },
            { title: 'Credentials', url: 'https://user:pass@example.org/' },
            { title: 'Valid', url: 'https://example.org/' }
        ]
    });
    assert.deepEqual(result.results.map(item => item.title), ['Valid']);
});

test('bounds result count and text fields', () => {
    const result = normalizeSearchPayload('peanut', {
        status: 'ok',
        totalResults: 'not-a-number',
        results: Array.from({ length: 30 }, (_, index) => ({
            title: 'T'.repeat(600),
            url: 'https://example.org/' + index,
            snippet: 'S'.repeat(2000)
        }))
    });
    assert.equal(result.results.length, 20);
    assert.equal(result.results[0].title.length, 500);
    assert.equal(result.results[0].snippet.length, 1600);
    assert.equal(result.totalResults, null);
});

test('rejects empty and overlong queries', () => {
    assert.throws(() => normalizeSearchPayload('  ', { status: 'ok', results: [] }));
    assert.throws(() => normalizeSearchPayload('x'.repeat(201), { status: 'ok', results: [] }));
});

test('parses only valid internal search-page navigation requests', () => {
    const { parseSearchNavigation } = require('../src/search-page.cjs');
    assert.deepEqual(
        parseSearchNavigation('peanut-search://results/?q=peanut%20browsing&page=2'),
        { query: 'peanut browsing', page: 2 }
    );
    assert.deepEqual(
        parseSearchNavigation('peanut-search://results/?q=peanut'),
        { query: 'peanut', page: 1 }
    );
    for (const value of [
        'https://example.org/',
        'peanut-search://other/?q=peanut',
        'peanut-search://results/?q=&page=1',
        'peanut-search://results/?q=peanut&page=21',
        'peanut-search://results/?q=peanut&page=1&page=2',
        'peanut-search://results/?q=peanut&q=other&page=1'
    ]) {
        assert.equal(parseSearchNavigation(value), null);
    }
});
