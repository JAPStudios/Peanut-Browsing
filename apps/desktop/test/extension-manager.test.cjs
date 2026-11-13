const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExtensionManifest } = require('../src/extension-manager.cjs');

test('accepts valid Manifest V2 and V3 extension metadata', () => {
    assert.deepEqual(validateExtensionManifest({
        manifest_version: 2,
        name: 'Legacy extension',
        version: '1.2.3',
        permissions: ['storage', 'tabs']
    }), {
        name: 'Legacy extension',
        version: '1.2.3',
        manifestVersion: 2,
        permissions: ['storage', 'tabs'],
        hostPermissions: []
    });
    assert.deepEqual(validateExtensionManifest({
        manifest_version: 3,
        name: 'Modern extension',
        version: '2.0',
        permissions: ['storage'],
        host_permissions: ['https://example.com/*']
    }), {
        name: 'Modern extension',
        version: '2.0',
        manifestVersion: 3,
        permissions: ['storage'],
        hostPermissions: ['https://example.com/*']
    });
});

test('rejects malformed or unsupported extension manifests', () => {
    assert.throws(() => validateExtensionManifest(null), /valid extension manifest/);
    assert.throws(() => validateExtensionManifest({ manifest_version: 1, name: 'Old', version: '1.0' }), /Manifest V2 and V3/);
    assert.throws(() => validateExtensionManifest({ manifest_version: 3, name: '', version: '1.0' }), /must contain a name/);
    assert.throws(() => validateExtensionManifest({ manifest_version: 3, name: 'Bad version', version: 'latest' }), /valid version number/);
    assert.throws(() => validateExtensionManifest({ manifest_version: 3, name: 'Bad permissions', version: '1.0', permissions: 'tabs' }), /permissions list is invalid/);
});
