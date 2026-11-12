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
