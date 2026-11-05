const crypto = require('node:crypto');

function fingerprint(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function mergeImportedPage(existing, page) {
    const sourceHash = fingerprint([
        page.title,
        page.description,
        page.html,
        page.textContent
    ].join('\n'));
    const wasEdited = Boolean(existing && existing.editedAt &&
        existing.editedHash && existing.editedHash !== existing.sourceHash);

    return {
        ...page,
        sourceTitle: page.title,
        sourceDescription: page.description,
        sourceHtml: page.html,
        sourceTextContent: page.textContent,
        sourceHash,
        title: wasEdited ? existing.title : page.title,
        description: wasEdited ? existing.description : page.description,
        html: wasEdited ? existing.html : page.html,
        textContent: wasEdited ? existing.textContent : page.textContent,
        editedHash: wasEdited ? existing.editedHash : sourceHash,
        editedAt: wasEdited ? existing.editedAt : null,
        sourceUpdatedSinceEdit: Boolean(wasEdited && existing.sourceHash !== sourceHash),
        importedAt: new Date().toISOString()
    };
}

module.exports = { mergeImportedPage, fingerprint };