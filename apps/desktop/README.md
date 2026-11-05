# Peanut Browsing desktop

The desktop application is a separate Electron browser client inside the Peanut Browsing repository. It is not part of the Wix/Velo site build.

## Development

Requirements: Node.js 20 or newer, npm, plus Docker Desktop for the local search service.

1. Open a terminal in `apps/desktop`.
2. Run `npm install`.
3. Start the search service from `services/search` as documented there.
4. Run `npm start`.

To use a different search service, set `PEANUT_SEARCH_URL` to an HTTP or HTTPS URL containing the literal `{query}` placeholder.

## Current implementation

The initial shell provides multi-tab navigation, an address/search bar, back/forward, reload/stop, persistent browser session storage, HTTP/HTTPS navigation, plus an isolated local browser-chrome renderer. Remote pages do not receive Node.js integration or the privileged preload bridge.

This is an initial desktop client, not a finished browser. Downloads, bookmarks, history management, password management, synchronisation, extension compatibility, tracking protection, accessibility verification, updater, signed installers, macOS testing and Android implementation remain outstanding.