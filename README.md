# Peanut Browsing

This repository contains Peanut Browsing's Wix/Velo website code, first-party search index, website-importing and correction tools, independent website-creation tools, and browser code.

## Repository contents

- `src/`: Wix/Velo website code connected to the existing Peanut Browsing site.
- `apps/desktop/`: existing browser code, including navigation, importing, correction, independent website creation, preview, and export.
- `services/index/`: first-party web crawler and SQLite FTS5/BM25 search index.
- `services/search/`: authenticated gateway for the first-party index.

The crawler starts from explicitly submitted public websites, follows eligible public links across origins, applies each origin's `robots.txt` rules, and enforces bounded crawl limits. The index is not yet a continuously discovered, web-scale index of the public internet.

## Existing Wix site

The repository is connected to the existing Peanut Browsing Wix site through Git Integration. The site is published and Velo is enabled. Committing backend code does not by itself prove that Wix has published the corresponding HTTP function; the published endpoint must be tested.

## Website importing and creation

The existing code includes website importing, imported-page correction, independent website creation, preview, and static export. These capabilities are not complete merely because their code exists. Importing and correction still require end-to-end verification, safe handling of imported markup and assets, reliable preservation of page structure and behavior, and a usable interface on the intended product surface. Static export does not itself publish a site to a public domain or provide public hosting.

## First-party search service

The Wix backend search adapter calls Peanut Browsing's own index service through an authenticated gateway. The crawler stores extracted titles, URLs, and text in SQLite FTS5 and ranks results with BM25. It indexes submitted seed websites rather than continuously discovering the entire public web.

The production gateway requires a reachable public HTTPS deployment, a persistent index database, and the two Wix Secrets Manager values documented in `src/backend/SEARCH.md`. The Wix HTTP function and real indexed search results must be verified on the published site before first-party search can be considered operational.
