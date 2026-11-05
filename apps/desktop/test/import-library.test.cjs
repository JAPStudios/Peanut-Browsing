const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    listImportedSites,
    readImportedPage,
    saveImportedPage,
    exportImportedSite,
    createWebsite,
    createWebsitePage
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


test('exports corrected pages with local assets and relative internal links', async t => {
    const { root, siteId, pageId } = await fixture(t);
    const siteDirectory = path.join(root, siteId);
    const aboutId = 'c'.repeat(64);
    const logoName = 'd'.repeat(64) + '.png';
    const cssName = 'e'.repeat(64) + '.css';
    const backgroundName = 'f'.repeat(64) + '.png';
    await fs.mkdir(path.join(siteDirectory, 'assets'), { recursive: true });
    await fs.writeFile(path.join(siteDirectory, 'assets', logoName), Buffer.from('logo'));
    await fs.writeFile(path.join(siteDirectory, 'assets', cssName), 'body { background: url("/assets/background.png"); }');
    await fs.writeFile(path.join(siteDirectory, 'assets', backgroundName), Buffer.from('background'));

    const manifestPath = path.join(siteDirectory, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.assets = [
        { url: 'https://example.test/assets/logo.png', filename: logoName, mimeType: 'image/png' },
        { url: 'https://example.test/assets/site.css', filename: cssName, mimeType: 'text/css' },
        { url: 'https://example.test/assets/background.png', filename: backgroundName, mimeType: 'image/png' }
    ];
    manifest.pages.push({
        id: aboutId,
        filename: aboutId + '.json',
        url: 'https://example.test/about/',
        title: 'About'
    });
    manifest.pageCount = 2;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));

    const home = JSON.parse(await fs.readFile(path.join(siteDirectory, pageId + '.json'), 'utf8'));
    home.html = '<html><head><link rel="stylesheet" href="/assets/site.css"></head><body><a href="/about/">About</a><img src="/assets/logo.png"></body></html>';
    home.assets = [
        { url: 'https://example.test/assets/logo.png', filename: logoName, references: ['/assets/logo.png'] },
        { url: 'https://example.test/assets/site.css', filename: cssName, references: ['/assets/site.css'] }
    ];
    await fs.writeFile(path.join(siteDirectory, pageId + '.json'), JSON.stringify(home));
    await fs.writeFile(path.join(siteDirectory, aboutId + '.json'), JSON.stringify({
        url: 'https://example.test/about/',
        title: 'About',
        html: '<html><body><a href="/">Home</a></body></html>',
        assets: []
    }));

    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-export-test-'));
    t.after(() => fs.rm(destination, { recursive: true, force: true }));
    const result = await exportImportedSite(root, siteId, destination);
    assert.equal(result.status, 'exported');
    assert.equal(result.pageCount, 2);
    assert.equal(result.assetCount, 3);

    const homeHtml = await fs.readFile(path.join(result.directory, 'index.html'), 'utf8');
    assert.match(homeHtml, /href="\.\/about\/index\.html"/);
    assert.ok(homeHtml.includes('assets/' + logoName));
    assert.ok(homeHtml.includes('assets/' + cssName));

    const aboutHtml = await fs.readFile(path.join(result.directory, 'about', 'index.html'), 'utf8');
    assert.match(aboutHtml, /href="\.\.\/index\.html"/);

    const css = await fs.readFile(path.join(result.directory, 'assets', cssName), 'utf8');
    assert.ok(css.includes('url("' + backgroundName + '")'));
    assert.ok((await fs.stat(path.join(result.directory, 'assets', backgroundName))).isFile());
});


test('creates an independent website, adds pages, then exports the authored site', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-author-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));

    const created = await createWebsite(root, { name: 'My Independent Website' });
    assert.match(created.id, /^[a-f0-9]{20}$/);
    assert.match(created.pageId, /^[a-f0-9]{64}$/);
    const firstPage = await readImportedPage(root, created.id, created.pageId);
    assert.equal(firstPage.title, 'My Independent Website');
    assert.ok(firstPage.html.includes('<h1>My Independent Website</h1>'));

    const about = await createWebsitePage(root, { siteId: created.id, path: 'about/team' });
    assert.equal(about.title, 'Team');
    assert.equal(about.pageCount, 2);
    await assert.rejects(
        createWebsitePage(root, { siteId: created.id, path: '../outside' }),
        /letters, numbers and hyphens/i
    );
    await assert.rejects(
        createWebsitePage(root, { siteId: created.id, path: 'about/team' }),
        /already exists/i
    );

    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'peanut-author-export-'));
    t.after(() => fs.rm(destination, { recursive: true, force: true }));
    const exported = await exportImportedSite(root, created.id, destination);
    assert.equal(exported.pageCount, 2);
    assert.ok((await fs.stat(path.join(exported.directory, 'index.html'))).isFile());
    assert.ok((await fs.stat(path.join(exported.directory, 'about', 'team', 'index.html'))).isFile());
});

test('keeps overlapping page saves from sharing a temporary file', async t => {
    const { root, siteId, pageId } = await fixture(t);
    const save = (title, text) => saveImportedPage(root, {
        siteId,
        pageId,
        title,
        description: '',
        html: '<html><body>' + text + '</body></html>',
        textContent: text
    });

    const results = await Promise.all([
        save('First correction', 'First correction'),
        save('Second correction', 'Second correction')
    ]);
    assert.equal(results.length, 2);

    const page = await readImportedPage(root, siteId, pageId);
    assert.ok(['First correction', 'Second correction'].includes(page.title));
    assert.equal(page.textContent, page.title);
    assert.ok(page.html.includes('<body>' + page.title + '</body>'));

    const files = await fs.readdir(path.join(root, siteId));
    assert.equal(files.some(file => file.endsWith('.tmp')), false);
});

test('rejects path traversal identifiers', async t => {
    const { root, pageId } = await fixture(t);
    await assert.rejects(
        readImportedPage(root, '../outside', pageId),
        /identifier is invalid/i
    );
});