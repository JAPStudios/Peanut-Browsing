const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('browser tabs use keyboard-operable tab semantics and a real close button', async () => {
    const sourceDirectory = path.join(__dirname, '..', 'src', 'renderer');
    const [html, javascript, styles] = await Promise.all([
        fs.readFile(path.join(sourceDirectory, 'index.html'), 'utf8'),
        fs.readFile(path.join(sourceDirectory, 'app.js'), 'utf8'),
        fs.readFile(path.join(sourceDirectory, 'styles.css'), 'utf8')
    ]);
    assert.match(html, /id="tabs"[^>]*role="tablist"/);
    const makeTab = javascript.slice(
        javascript.indexOf('function makeTab('),
        javascript.indexOf('\nfunction render(', javascript.indexOf('function makeTab('))
    );
    assert.match(makeTab, /createElement\('div'\)/);
    assert.match(makeTab, /setAttribute\('role', 'tab'\)/);
    assert.match(makeTab, /setAttribute\('tabindex'/);
    assert.match(makeTab, /ArrowRight/);
    assert.match(makeTab, /ArrowLeft/);
    assert.match(makeTab, /event\.key === 'Home'/);
    assert.match(makeTab, /event\.key === 'End'/);
    assert.match(makeTab, /createElement\('button'\)/);
    assert.doesNotMatch(makeTab, /setAttribute\('role', 'button'\)/);
    assert.match(styles, /\.tab:focus-visible/);
    assert.match(styles, /\.close-tab:focus-visible/);
    assert.match(javascript, /const focusedTabId = document\\.activeElement/);
    assert.match(javascript, /activeTab\\.focus\\(\\)/);
    assert.match(makeTab, /close\\.dataset\\.focusTabId/);
});
