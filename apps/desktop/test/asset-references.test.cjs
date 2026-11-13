const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCssAssetReferences } = require('../src/asset-references.cjs');

test('extracts relative, root-relative and protocol-relative CSS assets', () => {
    const css = [
        '@import "./theme.css";',
        '@import url("../layout.css");',
        '.hero { background: url("../images/hero.webp?size=large#top"); }',
        '@font-face { src: url("//fonts.gstatic.com/font.woff2"); }'
    ].join('\n');
    assert.deepEqual(extractCssAssetReferences(css, 'https://site.example/css/main.css'), [
        'https://site.example/css/theme.css',
        'https://site.example/layout.css',
        'https://site.example/images/hero.webp?size=large',
        'https://fonts.gstatic.com/font.woff2'
    ]);
});

test('ignores data, blob, fragment, non-HTTP and credential-bearing references', () => {
    const css = [
        '.a { background: url(data:image/svg+xml,%3Csvg%3E); }',
        '.b { background: url(blob:https://site.example/id); }',
        '.c { mask: url(#shape); }',
        '.d { background: url(javascript:alert(1)); }',
        '.e { background: url(ftp://site.example/file); }',
        '.f { background: url(https://user:secret@site.example/private); }'
    ].join('\n');
    assert.deepEqual(extractCssAssetReferences(css, 'https://site.example/css/main.css'), []);
});

test('deduplicates references and ignores commented-out URLs', () => {
    const css = [
        '/* background: url("/ignored.png"); */',
        '.a { background: url("/image.png"); }',
        '.b { background: url("https://site.example/image.png#section"); }'
    ].join('\n');
    assert.deepEqual(extractCssAssetReferences(css, 'https://site.example/main.css'), [
        'https://site.example/image.png'
    ]);
});

test('enforces a finite reference limit', () => {
    const css = Array.from({ length: 8 }, (_, index) => '.x' + index + '{background:url("/' + index + '.png")}').join('');
    assert.equal(extractCssAssetReferences(css, 'https://site.example/main.css', 3).length, 3);
});

test('preserves raw CSS references alongside their resolved asset URLs', () => {
    const css = '.a{background:url("../images/hero.png")} .b{background:url("/images/hero.png")}';
    assert.deepEqual(extractCssAssetReferencePairs(css, 'https://site.example/css/main.css'), [
        { url: 'https://site.example/images/hero.png', reference: '../images/hero.png' },
        { url: 'https://site.example/images/hero.png', reference: '/images/hero.png' }
    ]);
});

test('extracts responsive image candidates and ignores embedded data URLs', () => {
    assert.deepEqual(extractSrcsetAssetReferences(
        'data:image/svg+xml,%3Csvg%3E 1x, /small.jpg 2x, https://cdn.example/large.jpg 3x',
        'https://site.example/gallery/'
    ), [
        { url: 'https://site.example/small.jpg', reference: '/small.jpg' },
        { url: 'https://cdn.example/large.jpg', reference: 'https://cdn.example/large.jpg' }
    ]);
});
