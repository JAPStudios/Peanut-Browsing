const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProfileStore, normalizeUrl } = require('../src/profile-store.cjs');

async function createStore(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-profile-test-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = createProfileStore(path.join(directory, 'profile.json'));
    await store.load();
    return store;
}

test('normalizes HTTP URLs and rejects executable schemes', () => {
    assert.equal(normalizeUrl('https://example.test/page#section'), 'https://example.test/page');
    assert.equal(normalizeUrl('javascript:alert(1)'), null);
    assert.equal(normalizeUrl('file:///tmp/page.html'), null);
    assert.equal(normalizeUrl('peanut-site://0123456789abcdefabcd/about/'), 'peanut-site://0123456789abcdefabcd/about/');
    assert.equal(normalizeUrl('peanut-site://invalid/about/'), null);
    assert.equal(normalizeUrl('peanut-site://0123456789abcdefabcd/?q=blocked'), null);
});

test('records normal browsing history but excludes private tabs', async t => {
    const store = await createStore(t);
    await store.recordVisit('https://example.test/', 'Example', true);
    assert.equal(store.getState().history.length, 0);

    await store.recordVisit('https://example.test/', 'Example', false);
    assert.equal(store.getState().history.length, 1);
    assert.equal(store.getState().history[0].title, 'Example');
});

test('toggles bookmarks and persists them across store instances', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-profile-persist-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const filePath = path.join(directory, 'profile.json');
    const first = createProfileStore(filePath);
    await first.load();

    assert.equal(await first.toggleBookmark('https://example.test/', 'Example'), true);
    const second = createProfileStore(filePath);
    await second.load();
    assert.equal(second.getState().bookmarks.length, 1);
    assert.equal(await second.toggleBookmark('https://example.test/', 'Example'), false);
    assert.equal(second.getState().bookmarks.length, 0);
});

test('clears browsing history without removing bookmarks', async t => {
    const store = await createStore(t);
    await store.recordVisit('https://example.test/', 'Example');
    await store.toggleBookmark('https://example.test/', 'Example');
    await store.clearHistory();

    assert.equal(store.getState().history.length, 0);
    assert.equal(store.getState().bookmarks.length, 1);
});