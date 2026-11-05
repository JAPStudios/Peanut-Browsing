const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    listImportedSites,
    readImportedPage,
    saveImportedPage
} = require('../src/import-library.cjs');

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-import-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));

    const siteId = 'a'.repeat(20);
    const pageId = 'b'.repeat(64);
    const siteDirectory = path.join(root, siteId);
    await fs.mkdir(siteDirectory, { recursive: true });

    const manifest = {
        websiteUrl: 'https://example.test',
        startUrl: 'https://example.test/',
        importedAt: '2026-11-04T12:00:00.000Z',
        pageCount: 1,
        errors: [],
        pages: [{
            id: pageId,
            filename: pageId + '.json',
            url: 'https://example.test/',
            title: 'Original title'
        }]
    };
    const page = {
        url: 'https://example.test/',
        title: 'Original title',
        description: 'Original description',
        html: '<html><body>Original</body></html>',
        textContent: 'Original',
        sourceTitle: 'Original title',
        sourceDescription: 'Original description',
        sourceHtml: '<html><body>Original</body></html>',
        sourceTextContent: 'Original',
        importedAt: manifest.importedAt
    };
    await fs.writeFile(path.join(siteDirectory, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(siteDirectory, pageId + '.json'), JSON.stringify(page));
    return { root, siteId, pageId };
}

test('lists imported websites from their manifests', async t => {
    const { root, siteId } = await fixture(t);
    const sites = await listImportedSites(root);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].id, siteId);
    assert.equal(sites[0].websiteUrl, 'https://example.test');
    assert.equal(sites[0].pages.length, 1);
});

test('reads a page only when its ID appears in the site manifest', async t => {
    const { root, siteId, pageId } = await fixture(t);
    const page = await readImportedPage(root, siteId, pageId);
    assert.equal(page.title, 'Original title');
    await assert.rejects(
        readImportedPage(root, siteId, 'c'.repeat(64)),
        /not found/i
    );
});

test('saves edited page content and updates the manifest title', async t => {
    const { root, siteId, pageId } = await fixture(t);
    const result = await saveImportedPage(root, {
        siteId,
        pageId,
        title: 'Corrected title',
        description: 'Corrected description',
        html: '<html><body>Corrected</body></html>',
        textContent: 'Corrected'
    });
    assert.equal(result.status, 'saved');
    const page = await readImportedPage(root, siteId, pageId);
    assert.equal(page.title, 'Corrected title');
    assert.equal(page.textContent, 'Corrected');
    assert.equal(page.sourceHtml, '<html><body>Original</body></html>');
    assert.equal(page.sourceTextContent, 'Original');
    assert.match(page.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(page.editedHash, /^[a-f0-9]{64}$/);

    const sites = await listImportedSites(root);
    assert.equal(sites[0].pages[0].title, 'Corrected title');
});

test('rejects path traversal identifiers', async t => {
    const { root, pageId } = await fixture(t);
    await assert.rejects(
        readImportedPage(root, '../outside', pageId),
        /identifier is invalid/i
    );
});