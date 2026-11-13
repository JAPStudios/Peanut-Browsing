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
    assert.equal(createContentBlock({ type: 'link', text: 'Read more', url: 'https://example.com/a?x=1&y=2' }),
        '<p><a href="https://example.com/a?x=1&amp;y=2">Read more</a></p>');
    assert.throws(() => createContentBlock({ type: 'link', text: 'Bad', url: 'javascript:alert(1)' }), /HTTP or HTTPS/);
    assert.throws(() => createContentBlock({ type: 'link', text: 'Bad', url: 'https://user:pass@example.com' }), /embedded credentials/);
});

test('inserts blocks inside the main content before the closing tag', () => {
    assert.equal(insertContentBlock('<main><h1>Home</h1></main>', '<p>About</p>'),
        '<main><h1>Home</h1><p>About</p>\n</main>');
    assert.equal(insertContentBlock('<body>Home</body>', '<p>About</p>'),
        '<body>Home<p>About</p>\n</body>');
});

test('creates image blocks with escaped alternative text and safe public addresses', () => {
    assert.equal(
        createContentBlock({ type: 'image', text: '<A landscape>', url: 'https://images.example.com/photo.png?size=large&fit=cover' }),
        '<figure class="peanut-image"><img src="https://images.example.com/photo.png?size=large&amp;fit=cover" alt="&lt;A landscape&gt;" loading="lazy" decoding="async"></figure>'
    );
    assert.throws(() => createContentBlock({ type: 'image', text: 'Private', url: 'http://127.0.0.1/image.png' }), /public HTTP or HTTPS/);
    assert.throws(() => createContentBlock({ type: 'image', text: 'Unsafe', url: 'javascript:alert(1)' }), /HTTP or HTTPS/);
});

test('creates callouts, dividers and accessible external buttons', () => {
    assert.equal(createContentBlock({ type: 'callout', text: 'Important\nInformation' }),
        '<aside class="peanut-callout"><p>Important<br>Information</p></aside>');
    assert.equal(createContentBlock({ type: 'divider' }), '<hr class="peanut-divider">');
    assert.equal(createContentBlock({ type: 'button', text: 'Visit', url: 'https://example.com/path' }),
        '<p class="peanut-button-row"><a class="peanut-button" href="https://example.com/path" target="_blank" rel="noopener noreferrer">Visit</a></p>');
    assert.throws(() => createContentBlock({ type: 'button', text: 'Visit', url: 'https://user:pass@example.com' }), /embedded credentials/);
});
