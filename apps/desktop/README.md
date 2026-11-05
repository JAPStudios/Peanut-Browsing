# Peanut Browsing desktop

The desktop application is a separate Electron browser client inside the Peanut Browsing repository. It is not part of the Wix/Velo site build.

## Development

Requirements: Node.js 20 or newer, npm, plus Docker Desktop for the local search service.

1. Open a terminal in `apps/desktop`.
2. Run `npm install`.
3. Start the search service from `services/search` as documented there.
4. Run `npm test` to execute the desktop unit tests.
5. Run `npm start`.

To use a different search service, set `PEANUT_SEARCH_URL` to an HTTP or HTTPS URL containing the literal `{query}` placeholder.

## Current implementation

The initial shell provides multi-tab navigation, an address/search bar, back/forward, reload/stop, persistent browser session storage, ephemeral private tabs, HTTP/HTTPS navigation, network-level ad/tracker blocking through Ghostery's EasyList/uBlock-compatible engine, plus an isolated local browser-chrome renderer. Filter data is cached in the application profile; the status indicator reports whether protection initialised. Private tabs use a separate in-memory session; their cookies, cache, authentication data and site storage are cleared when the tab closes. Private mode does not conceal the network address or prevent websites from using browser fingerprinting. Tracking protection is not antivirus software; it does not guarantee detection of every tracker or advertisement. Remote pages do not receive Node.js integration or the privileged preload bridge.

The **Import site** control reads the site's `robots.txt` sitemap declarations, follows nested XML sitemap indexes, then crawls same-origin links from the active page. It captures page titles, descriptions, HTML, visible text, plus same-origin images, stylesheets, scripts and fonts. HTTPS assets from allowlisted Wix, WordPress, Shopify, Squarespace, Webflow, Google Fonts and common CDN hosts are also accepted after public-address validation. It writes a manifest, individual page records and an asset directory under Electron's application data directory. A run is capped at 250 attempted pages, 300 assets total, 2 MiB per asset, 50 MiB of assets overall. Import targets must resolve to public IP addresses; local, private, reserved and literal-IP targets are rejected. The **Library** control accepts batches of up to 10 website addresses, lists imported websites, opens captured pages, saves edits to page titles, descriptions, HTML source or extracted text. A selected website can be exported to a new local folder as a static site, with relative links between captured pages plus local copies of captured assets. A sandboxed preview allows inspection without executing imported scripts. Captured HTML asset references are rewritten to the local archive; uncaptured nested CSS resources may still load from their original HTTPS addresses. Bookmarks plus recent browsing history are saved in the local browser profile; private tabs are excluded from both. Downloads use the native save dialog with progress reporting; files saved from private tabs remain on disk after the tab closes. Imported markup is retained as source data, not executed as a local page.

The importer captures same-origin assets plus a limited allowlist of third-party assets. It does not capture arbitrary cross-origin resources, fully migrate dynamic site behavior, or publish the source website. Static export rewrites links between captured pages plus references to captured assets; uncaptured dependencies remain unresolved. Reimporting a site refreshes its captured source while preserving edited pages; the editor flags upstream changes, with a control to load the latest source before saving. The current editor changes stored source records only.

This is an initial desktop client, not a finished browser. Advanced history management, password management, synchronisation, extension compatibility, cosmetic ad removal, complete asset migration, a full visual website builder, website publishing, accessibility verification, updater, signed installers, macOS testing and Android implementation remain outstanding.