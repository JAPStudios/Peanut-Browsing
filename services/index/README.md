# Peanut Browsing first-party web index

This is Peanut Browsing's own searchable page index. Search uses SQLite FTS5 with BM25 ranking. The website's search adapter queries this index directly; it does not use external search engines as result providers or fallback sources.

## Capabilities

- Discover sitemap declarations in `robots.txt`, follow nested same-origin sitemap indexes, then crawl explicitly submitted public websites.\n- Stay on each submitted website's origin during sitemap discovery and page crawling.
- Read and obey `robots.txt`; stop if the robots policy cannot be checked.
- Reject local, private, loopback, reserved, credential-bearing, and non-HTTP(S) targets.\n- Pin each outbound connection to a DNS address that was checked as globally routable, preventing a hostname from changing to a private address between validation and connection.
- Limit each crawl to 25 pages, 2 MiB per page, plus bounded extracted text.
- Store page titles, URLs, and page text in SQLite FTS5.
- Rank matching pages using SQLite's BM25 implementation.
- Require the search gateway API key for search and crawl requests.

The crawler reads up to 10 sitemap documents and discovers up to 1,000 same-origin sitemap URLs per submission, then follows links within the submitted website. It still does not automatically discover the entire public web. A website must be submitted as a seed before its pages can appear in search results.

## API

The service listens on port 8081 inside the production Compose network.

- `GET /healthz` — service health and indexed-page count.
- `GET /search?q=<query>&limit=20&offset=0` — first-party index results.
- `POST /crawl` — crawl a seed website. Requires JSON `{"url":"https://example.org","maxPages":10}`.

Search and crawl calls require `X-API-Key` matching `PEANUT_SEARCH_API_KEY`. The public Nginx gateway exposes these as `/index/search` and `/index/crawl`.

## Development tests

Run from this directory:

```sh
python -m unittest -v
```

## Current scope

This is a bounded first-party website index. It does not yet provide continuous whole-web discovery, distributed crawling, link-graph ranking, language-specific analysis, spam classification, or the storage capacity of major commercial search engines.
