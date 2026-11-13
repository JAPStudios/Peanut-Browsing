# Peanut Browsing browser code

The files in this directory contain browser-related code and its automated tests.

## Development

Requirements: Node.js 20 or newer, npm.

1. Open a terminal in this directory.
2. Run `npm install`.
3. Start the search service from `services/search` as documented there.
4. Run `npm test` to execute the tests.
5. Run `npm start` to run the current browser client.

The default search destination is Peanut Browsing's published Wix HTTP search endpoint. It queries Peanut Browsing's first-party index. To use another Peanut Browsing search deployment, set `PEANUT_SEARCH_URL` to its HTTP or HTTPS search URL containing the literal `{query}` placeholder. Search requests are fetched by the browser's main process and displayed in a local results page. Direct HTTP and HTTPS addresses continue to navigate normally.

## Existing browser functions

The current code includes multi-tab navigation, an address/search bar, back and forward navigation, reload and stop controls, persistent browser session storage, private tabs, HTTP/HTTPS navigation, ad and tracker filtering, bookmarks, browsing history, downloads, and a local results page. Private tabs use a separate in-memory session; their cookies, cache, authentication data, and site storage are cleared when the tab closes. Private mode does not conceal the network address or prevent browser fingerprinting. Tracking protection is not antivirus software and does not guarantee detection of every tracker or advertisement.

## Website importing and local website work

The **Import site** control reads sitemap declarations from `robots.txt`, follows nested XML sitemap indexes, then crawls same-origin links from the active page. It captures page titles, descriptions, HTML, visible text, plus same-origin images, stylesheets, scripts, and fonts. A limited set of third-party asset hosts is also accepted after public-address validation. The importer writes a manifest, individual page records, and an asset directory under the application's data directory.

A run is capped at 250 attempted pages, 300 assets overall, 2 MiB per asset, and 50 MiB of assets overall. Import targets must resolve to public IP addresses; local, private, reserved, and literal-IP targets are rejected.

The **Library** control includes page editing tools for headings, subheadings, paragraphs, quotations, bullet lists, callouts, dividers, text links, external buttons, and images with alternative text. Link, button and image addresses must use public HTTP/HTTPS URLs without embedded credentials. Text and attributes are HTML-escaped before insertion. The current code can create independent local websites from five starter layouts and four site-wide design themes (Light, Midnight, Warm editorial and Forest), add nested pages that inherit the selected theme, edit page titles and descriptions, edit HTML source or extracted text, list imported websites, open captured pages, and save corrections. A sandboxed preview allows inspection without executing imported scripts. Static export creates portable files with relative links between captured pages and local copies of captured assets; it does not publish a website to a public host.

Captured HTML asset references are rewritten to the local archive. CSS-referenced images, fonts, and nested stylesheets are discovered recursively within the existing host, asset-count, and byte limits. Unavailable or unsupported resources may still load from their original HTTPS addresses. Reimporting a site refreshes captured source while preserving edited pages; the editor flags upstream changes and provides a control to load the latest source before saving. The current editor changes stored page records.

The importer does not capture arbitrary cross-origin resources, fully migrate dynamic website behavior, or publish the source website. Static export rewrites links between captured pages and references to captured assets; uncaptured dependencies remain unresolved.

## Current gaps recorded in the source documentation

The repository's existing notes identify advanced history management, password management, synchronization, extension compatibility, cosmetic ad removal, complete asset migration, a full visual website builder, website publishing, accessibility verification, automatic updates, signed installers, and platform testing as areas not yet completed. These notes describe recorded work status, not requirements inferred from the directory name or current code choices.
