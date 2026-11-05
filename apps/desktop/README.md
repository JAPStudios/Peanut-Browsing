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

The initial shell provides multi-tab navigation, an address/search bar, back/forward, reload/stop, persistent browser session storage, ephemeral private tabs, HTTP/HTTPS navigation, network-level ad/tracker blocking through Ghostery's EasyList/uBlock-compatible engine, plus an isolated local browser-chrome renderer. Filter data is cached in the application profile; the status indicator reports whether protection initialised. Private tabs use a separate in-memory session; their cookies, cache, authentication data and site storage are cleared when the tab closes. Private mode does not conceal the network address or prevent websites from using browser fingerprinting. Tracking protection is not antivirus software; it does not guarantee detection of every tracker or advertisement. Remote pages do not receive Node.js integration or the privileged preload bridge.

The **Import site** control crawls same-origin links from the active page, captures page titles, descriptions, HTML and visible text, then writes a manifest plus individual page records under Electron's application data directory. It currently caps a run at 250 attempted pages. The **Library** control lists imported websites, opens captured pages, then saves edits to page titles, descriptions, HTML source or extracted text. A sandboxed preview allows inspection without executing imported scripts. Imported markup is retained as source data, not executed as a local page.

The importer does not yet download referenced images, stylesheets, fonts or scripts; it does not rewrite or publish the source website. The current editor changes stored source records only.

This is an initial desktop client, not a finished browser. Downloads, bookmarks, history management, password management, synchronisation, extension compatibility, cosmetic ad removal, complete asset migration, a full visual website builder, website publishing, accessibility verification, updater, signed installers, macOS testing and Android implementation remain outstanding.