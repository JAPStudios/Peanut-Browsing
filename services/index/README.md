# Peanut Browsing first-party web index

This service is Peanut Browsing's own searchable page index. It complements the SearXNG metasearch adapter; it is not yet a web-scale index of the public internet.

## Capabilities

- Crawl an explicitly submitted public website, staying on that site's origin.
- Read and obey `robots.txt`; stop if the robots policy cannot be checked.
- Reject local, private, loopback, reserved, credential-bearing, and non-HTTP(S) targets.
- Limit each crawl to 25 pages, 2 MiB per page, plus bounded extracted text.
- Store page titles, URLs, and text in SQLite FTS5.
- Rank matching pages with SQLite's BM25 implementation.
- Require the search gateway's API key for search and crawl requests.

The crawler does not follow links to other domains. A website must be submitted as a seed before its pages can appear in the first-party index.

## API

The service listens on port 8081 inside the production Compose network.

- `GET /healthz` — service health and indexed-page count.
- `GET /search?q=<query>&limit=20&offset=0` — first-party index results.
- `POST /crawl` — crawl a seed website. Requires JSON `{"url":"https://example.org","maxPages":10}`.

Search and crawl calls require `X-API-Key` matching `PEANUT_SEARCH_API_KEY`. The public Nginx gateway exposes these as `/index/search` and `/index/crawl`, behind the same API-key check and request-rate limit as metasearch.

Example crawl request from an authorized administrative environment:

```sh
curl --fail-with-body \
  -H "X-API-Key: $PEANUT_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.org","maxPages":10}' \
  https://search.example.org/index/crawl
```

## Development tests

Run from this directory:

```sh
python -m unittest -v
```

## Current scope

This is a focused first-party website index with a bounded, same-origin crawler. It does not yet provide continuous whole-web discovery, distributed crawling, link-graph ranking, language-specific analysis, spam classification, or the storage capacity of major commercial search engines.
