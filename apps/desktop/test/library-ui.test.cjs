const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('every Library DOM lookup has a matching HTML element', async () => {
    const sourceDirectory = path.join(__dirname, '..', 'src');
    const [html, javascript] = await Promise.all([
        fs.readFile(path.join(sourceDirectory, 'library.html'), 'utf8'),
        fs.readFile(path.join(sourceDirectory, 'library.js'), 'utf8')
    ]);
    const availableIds = new Set(
        Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1])
    );
    const requestedIds = Array.from(
        javascript.matchAll(/document\.getElementById\(["']([^"']+)["']\)/g),
        match => match[1]
    );
    const missingIds = [...new Set(requestedIds.filter(id => !availableIds.has(id)))];
    assert.deepEqual(missingIds, [], 'Library JavaScript references missing HTML elements');
});
