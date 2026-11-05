# Peanut Browsing first-party search gateway

The production search gateway exposes only Peanut Browsing's own SQLite FTS5/BM25 index. It does not proxy queries to SearXNG, Google, Bing, or other external search engines.

## Production service

Use `docker-compose.production.yml`. It runs the first-party index service plus an authenticated Nginx gateway on a private Docker bridge network. The index has no published host port. The gateway is bound to `127.0.0.1:8081`; place an HTTPS reverse proxy in front of that loopback port before exposing search publicly.

The gateway requires `X-API-Key`, applies a shared request-rate limit, and exposes:

- `GET /index/search` — query Peanut Browsing's own index.
- `POST /index/crawl` — submit a public website for bounded indexing.
- `GET /healthz` — gateway health.

The first-party index database is stored in the persistent `index-data` volume. Keep that volume backed up.

## Configuration

1. Copy `.env.production.example` to `.env`.
2. Set a long, random `PEANUT_SEARCH_API_KEY`.
3. Start the stack with `docker compose --env-file .env -f docker-compose.production.yml up -d`.
4. Configure a public HTTPS reverse proxy to forward to `http://127.0.0.1:8081`, preserving the `X-API-Key` request header.
5. In Wix Secrets Manager, set `PEANUT_SEARCH_API_URL` to the public HTTPS origin and `PEANUT_SEARCH_API_KEY` to the matching key.

Do not expose the gateway without HTTPS. Do not commit the production `.env` file.

## Index scope

The crawler accepts explicitly submitted public website addresses, checks and obeys `robots.txt`, stays on each submitted website's origin, rejects private/local targets, and limits each crawl to 25 pages. Pages are stored in SQLite FTS5 and ranked with BM25. It is an independent first-party search index, but it is not yet a continuously discovered, web-scale index.
