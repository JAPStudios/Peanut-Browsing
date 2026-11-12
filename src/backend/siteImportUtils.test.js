import assert from 'node:assert/strict';
import test from 'node:test';
import { attribute, collectLinks, decodeHtml, metaContent } from './siteImportUtils.js';

test('decodes supported named, decimal and hexadecimal HTML entities', () => {
    assert.equal(
        decodeHtml('A &amp; B &quot;C&quot; &#39;D&#39; &lt;x&gt; &#x1F600;'),
        'A & B "C" \'D\' <x> 😀'
    );
});

test('replaces invalid numeric character references without throwing', () => {
    assert.equal(decodeHtml('&#0; &#xD800; &#1114112; &#x110000;'), '� � � �');
});

test('decodes attribute values and supports quoted and unquoted attributes', () => {
    assert.equal(attribute('<a href="/search?a=1&amp;b=2">', 'href'), '/search?a=1&b=2');
    assert.equal(attribute('<html lang=en>', 'lang'), 'en');
    assert.equal(attribute('<a title="A &quot;quote&quot;">', 'title'), 'A "quote"');
    assert.equal(attribute('<a href="/one">', 'title'), null);
});

test('extracts metadata by attribute name and value', () => {
    const html = '<meta property="og:description" content="A &amp; B">';
    assert.equal(metaContent(html, 'property', 'og:description'), 'A & B');
    assert.equal(metaContent(html, 'name', 'description'), null);
});

test('collects safe HTTP links, removes fragments and rejects credential-bearing URLs', () => {
    const html = [
        '<a href="/one#top">One</a>',
        '<a href="/one">Duplicate</a>',
        '<a href="https://user:secret@example.com/private">Credentials</a>',
        '<a href="https://outside.example/path">External</a>',
        '<a href="javascript:alert(1)">Script</a>',
        '<a href="mailto:test@example.com">Mail</a>',
        '<a href="data:text/html,hello">Data</a>',
        '<a href="ftp://example.com/file">FTP</a>'
    ].join('');
    const links = collectLinks(html, new URL('https://example.com/start'));
    assert.deepEqual(links, [
        { url: 'https://example.com/one', sameOrigin: true },
        { url: 'https://outside.example/path', sameOrigin: false }
    ]);
});
