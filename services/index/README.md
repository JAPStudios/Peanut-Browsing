# Peanut Browsing first-party web index

This is Peanut Browsing's own searchable page index. Search uses SQLite FTS5 with BM25 ranking. The website's search adapter queries this index directly; it does not use external search engines as result providers or fallback sources.

## Capabilities

- Discover sitemap declarations in `robots.txt` and follow nested same-origin sitemap indexes for each submitted seed.
- Follow ordinary links to other public websites, applying a separately retrieved `robots.txt` policy and crawl delay to each origin.
- Restrict each individual page fetch and redirect to its current origin; skip an origin when its robots policy cannot be checked.
- Limit each origin to three page visits per crawl and apply a global per-crawl page limit.
- Reject local, private, loopback, reserved, credential-bearing, and non-HTTP(S) targets.
- Pin each outbound connection to a DNS address that was checked as globally routable, preventing a hostname from changing to a private address between validation and connection.
- Limit each crawl to 25 pages, 2 MiB per page, plus bounded extracted text.
- Store page titles, URLs, and page text in SQLite FTS5.
- Rank matching pages using SQLite's BM25 implementation.
- Require the search gateway API key for search and crawl requests.

The crawler reads up to 10 sitemap documents and discovers up to 1,000 same-origin sitemap URLs per submitted seed. It can then follow public links across origins, subject to per-origin robots policies, crawl delays and page limits. Discovery remains seed-driven: it does not yet continuously discover the entire public web.

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
