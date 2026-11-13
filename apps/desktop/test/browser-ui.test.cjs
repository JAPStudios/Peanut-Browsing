const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('browser tabs use keyboard-operable tab semantics and a real close button', async () => {
    const sourceDirectory = path.join(__dirname, '..', 'src', 'renderer');
    const [html, javascript, styles, main] = await Promise.all([
        fs.readFile(path.join(sourceDirectory, 'index.html'), 'utf8'),
        fs.readFile(path.join(sourceDirectory, 'app.js'), 'utf8'),
        fs.readFile(path.join(sourceDirectory, 'styles.css'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8')
    ]);
    assert.match(html, /id="tabs"[^>]*role="group"/);
    const makeTab = javascript.slice(
        javascript.indexOf('function makeTab('),
        javascript.indexOf('\nfunction render(', javascript.indexOf('function makeTab('))
    );
    assert.match(makeTab, /createElement\('div'\)/);
    assert.match(makeTab, /setAttribute\('aria-pressed'/);
    assert.match(makeTab, /className = 'tab-select'/);
    assert.match(makeTab, /ArrowRight/);
    assert.match(makeTab, /ArrowLeft/);
    assert.match(makeTab, /event\.key === 'Home'/);
    assert.match(makeTab, /event\.key === 'End'/);
    assert.equal((makeTab.match(/createElement\('button'\)/g) || []).length, 2);
    assert.doesNotMatch(makeTab, /setAttribute\('role', 'button'\)/);
    assert.match(styles, /\.tab-select:focus-visible/);
    assert.match(styles, /\.close-tab:focus-visible/);
    assert.match(javascript, /const focusedTabId = document\.activeElement/);
    assert.match(javascript, /activeTab\.focus\(\)/);
    assert.match(makeTab, /close\.dataset\.focusTabId/);
    assert.match(main, /input\.control && key === 'tab'/);
    assert.match(main, /cycleTabs\(input\.shift \? -1 : 1\)/);
});
