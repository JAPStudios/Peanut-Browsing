# Peanut Browsing

This repository contains Peanut Browsing's Wix/Velo website code, a separate desktop browser application, and Peanut Browsing's first-party search index.

## Components

- `src/`: Wix/Velo website code connected to the existing Peanut Browsing site.
- `apps/desktop/`: Electron desktop browser with multi-tab navigation, first-party search, website importing, an imported-page correction library, independent website creation, local previews, and static website export.
- `services/index/`: Peanut Browsing's own bounded web crawler and SQLite FTS5/BM25 search index.
- `services/search/`: authenticated Nginx gateway for the first-party index.
- `.github/workflows/peanut-desktop-syntax.yml`: source checks, tests, container build, and production gateway configuration validation.

The website search adapter queries only the first-party Peanut Browsing index. It does not forward queries to SearXNG, Google, Bing, or another external search engine. The desktop results page supports bounded previous/next pagination and renders backend errors explicitly. The crawler currently indexes explicitly submitted public websites, follows links within each submitted website, and obeys `robots.txt`. It is not yet a continuously discovered web-scale index of the public internet.

## Wix site development

This repository is connected to the existing Peanut Browsing Wix site through Git Integration. The site tracks the repository's default branch. Committing backend code does not by itself prove that Wix has published the corresponding HTTP function; the published endpoint must be tested.

The Wix CLI supports local development and publishing from a terminal. See [Wix CLI documentation](https://dev.wix.com/docs/wix-cli/command-reference/introduction).

## Desktop development

The desktop application has its own package. Its development requirements are Node.js 20 or newer, npm, and Electron's supported build environment. Run the desktop tests from `apps/desktop/` with `npm test`.

## Independent website creation

The desktop library can create a local website, add pages, edit page markup and text, preview authored pages inside Peanut Browsing, and export the result as a static website. Authored pages use the internal `peanut-site://` address scheme and are stored in the desktop application's local data directory. Export creates ordinary HTML files and captured assets in a folder selected by the user. Creating or exporting a site does not publish it to a public domain or provide public hosting.

## First-party search service

The production search stack runs the Peanut Browsing index service behind an authenticated Nginx gateway. It does not include an external metasearch engine. The gateway is bound to loopback and must sit behind HTTPS reverse proxy infrastructure before public use. See `src/backend/SEARCH.md` for the Wix integration contract and deployment requirements.
