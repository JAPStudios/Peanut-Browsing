const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeImportedPage, fingerprint } = require('../src/page-record.cjs');

function sourcePage(title, html) {
    return {
        url: 'https://example.test/',
        title,
        description: 'Source description',
        html,
        textContent: 'Source text',
        assets: []
    };
}

test('imports a new page with matching source and edited fingerprints', () => {
    const page = mergeImportedPage(null, sourcePage('Original', '<p>Original</p>'));
    assert.equal(page.title, 'Original');
    assert.equal(page.html, '<p>Original</p>');
    assert.equal(page.editedAt, null);
    assert.equal(page.editedHash, page.sourceHash);
    assert.equal(page.sourceUpdatedSinceEdit, false);
});

test('preserves corrections while recording a changed upstream source', () => {
    const original = mergeImportedPage(null, sourcePage('Original', '<p>Original</p>'));
    const edited = {
        ...original,
        title: 'Corrected title',
        html: '<p>Corrected</p>',
        textContent: 'Corrected text',
        editedAt: '2026-11-04T12:00:00.000Z',
        editedHash: fingerprint([
            'Corrected title',
            original.description,
            '<p>Corrected</p>',
            'Corrected text'
        ].join('\n'))
    };

    const updated = mergeImportedPage(edited, sourcePage('Upstream update', '<p>Updated</p>'));
    assert.equal(updated.title, 'Corrected title');
    assert.equal(updated.html, '<p>Corrected</p>');
    assert.equal(updated.sourceTitle, 'Upstream update');
    assert.equal(updated.sourceHtml, '<p>Updated</p>');
    assert.equal(updated.sourceUpdatedSinceEdit, true);
});

test('accepts the latest source after corrections have been restored', () => {
    const original = mergeImportedPage(null, sourcePage('Original', '<p>Original</p>'));
    const restored = {
        ...original,
        editedAt: '2026-11-04T12:00:00.000Z',
        editedHash: original.sourceHash
    };
    const updated = mergeImportedPage(restored, sourcePage('New source', '<p>New source</p>'));
    assert.equal(updated.title, 'New source');
    assert.equal(updated.html, '<p>New source</p>');
    assert.equal(updated.sourceUpdatedSinceEdit, false);
});