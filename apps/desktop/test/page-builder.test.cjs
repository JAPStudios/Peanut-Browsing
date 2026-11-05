const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentBlock, insertContentBlock } = require('../src/page-builder.cjs');

test('creates escaped headings, paragraphs, quotes and lists', () => {
    assert.equal(createContentBlock({ type: 'heading', text: '<script>bad</script>' }),
        '<h2>&lt;script&gt;bad&lt;/script&gt;</h2>');
    assert.equal(createContentBlock({ type: 'paragraph', text: 'First\nSecond' }),
        '<p>First<br>Second</p>');
    assert.equal(createContentBlock({ type: 'quote', text: 'A quote' }),
        '<blockquote><p>A quote</p></blockquote>');
    assert.equal(createContentBlock({ type: 'list', text: 'One\nTwo' }),
        '<ul><li>One</li><li>Two</li></ul>');
});

test('creates links only for safe HTTP and HTTPS addresses', () => {
    assert.equal(createContentBlock({ type: 'link', text: 'Read more', url: 'https://example.test/a?x=1&y=2' }),
        '<p><a href="https://example.test/a?x=1&amp;y=2">Read more</a></p>');
    assert.throws(() => createContentBlock({ type: 'link', text: 'Bad', url: 'javascript:alert(1)' }), /HTTP or HTTPS/);
    assert.throws(() => createContentBlock({ type: 'link', text: 'Bad', url: 'https://user:pass@example.test' }), /embedded credentials/);
});

test('inserts blocks inside the main content before the closing tag', () => {
    assert.equal(insertContentBlock('<main><h1>Home</h1></main>', '<p>About</p>'),
        '<main><h1>Home</h1><p>About</p>\n</main>');
    assert.equal(insertContentBlock('<body>Home</body>', '<p>About</p>'),
        '<body>Home<p>About</p>\n</body>');
});
