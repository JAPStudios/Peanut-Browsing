# Peanut Browsing first-party search

The website search adapter is implemented. A working published search requires the Velo backend to be published, both required Wix secrets to be configured and the first-party gateway to be reachable over HTTPS. Those production conditions have not been verified.

The Velo backend defines this intended HTTP route:

`GET /_functions/peanutSearch?q=<encoded-query>&page=<page-number>`

The function is defined in `src/backend/http-functions.js`. Its availability on the published site has not been verified. The Velo backend files must be present in the connected Wix site's Git Integration repository and published before the route can execute.

## First-party index service

The search adapter calls the authenticated gateway route `GET /index/search`. The gateway forwards that request to `services/index/server.py`, which queries Peanut Browsing's SQLite FTS5 database and ranks results with BM25.

The Wix backend reads two required Wix Secrets Manager values:

- `PEANUT_SEARCH_API_URL`: public HTTPS base address of the Peanut Browsing index gateway. An optional reverse-proxy path prefix is supported.
- `PEANUT_SEARCH_API_KEY`: the gateway key matching the first-party index service.

If the configured index service is unreachable, the search request returns an explicit error.

## Indexing websites

The index crawler accepts explicitly submitted public seed addresses. It checks each origin's `robots.txt`, follows eligible public links across origins, rejects private/local targets, limits each crawl to 25 pages and stores extracted titles, URLs and text in SQLite FTS5. Sitemap discovery is restricted to the submitted seed's origin. Search uses BM25 ranking.

The crawler does not yet discover the entire public web automatically. Pages appear only after their website has been submitted for indexing. It is therefore an independent first-party search engine foundation, not yet a comprehensive web-scale search index.

The owner-only Wix web module `src/backend/indexedWebsites.jsw` exposes `indexWebsite(url, maxPages)` for submitting a website to the crawler after the gateway and Wix secrets are configured.


## Current connection state

A read-only check of the existing Peanut Browsing Wix site's Secrets Manager returned an empty list. Neither `PEANUT_SEARCH_API_URL` nor `PEANUT_SEARCH_API_KEY` is currently configured there. The published search route therefore cannot connect to the first-party gateway until both values are configured. No secret values were retrieved or changed.

## Production deployment

The production Docker Compose stack includes the first-party index service and authenticated Nginx gateway. Its public gateway port is bound to loopback and must sit behind an HTTPS reverse proxy. The gateway API key is required for search and crawl requests. Keep the index database volume persistent.

Publish the Wix Velo backend after connecting the Git Integration repository. Then verify the public HTTP function returns `status: "ok"` and result records for a query against an indexed website. A committed backend file is not proof that Wix has published the route.

## Response

The HTTP function returns `status`, `query`, `page`, `results`, `resultCount`, `totalResults`, and `hasNextPage`. Each result contains `title`, `url`, `displayUrl`, `snippet`, `engine`, and `score`.

Queries are limited to 200 characters; page numbers are limited to 1–20. Only HTTP and HTTPS result links are returned. Duplicate URLs are removed. Titles and snippets are rendered as text, not HTML.

Search terms separated by spaces must all match. Use `OR` between alternatives. Double quotes request an exact phrase, for example `peanut browser`, `peanut OR browser`, or `"peanut browsing"`.

## Verification

The repository contains the first-party index implementation and Wix HTTP-function adapter. The production route is not verified live until the Wix backend is published, the gateway is reachable over HTTPS, both Wix secrets are set, and a real search request returns indexed results.
