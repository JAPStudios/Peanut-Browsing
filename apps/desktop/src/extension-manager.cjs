'use strict';

function validateExtensionManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('The selected folder does not contain a valid extension manifest.');
    }
    if (![2, 3].includes(manifest.manifest_version)) {
        throw new Error('Only Chromium extension Manifest V2 and V3 are supported.');
    }
    if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 128) {
        throw new Error('The extension manifest must contain a name of 1 to 128 characters.');
    }
    if (typeof manifest.version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
        throw new Error('The extension manifest must contain a valid version number.');
    }
    const permissions = manifest.permissions === undefined ? [] : manifest.permissions;
    const hostPermissions = manifest.host_permissions === undefined ? [] : manifest.host_permissions;
    if (!Array.isArray(permissions) || !permissions.every(value => typeof value === 'string' && value.length <= 256)) {
        throw new Error('The extension permissions list is invalid.');
    }
    if (!Array.isArray(hostPermissions) || !hostPermissions.every(value => typeof value === 'string' && value.length <= 512)) {
        throw new Error('The extension host permissions list is invalid.');
    }
    return {
        name: manifest.name.trim(),
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        permissions: [...new Set(permissions)],
        hostPermissions: [...new Set(hostPermissions)]
    };
}

module.exports = { validateExtensionManifest };
