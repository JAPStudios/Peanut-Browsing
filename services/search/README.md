# Peanut Browsing search services

Peanut Browsing's search layer combines two sources:

- A first-party website index in `services/index/`, using a bounded same-origin crawler, `robots.txt`, SQLite FTS5, and BM25 ranking.
- SearXNG metasearch, which queries its configured upstream search engines.

The Wix website backend combines first-party index results with SearXNG results. The first-party index is populated by authenticated crawl requests; it is not yet a continuously discovered, web-scale index of the public internet.

## Local desktop service

This directory runs the SearXNG metasearch backend used by the Peanut Browsing desktop application. The desktop address bar sends search queries to `http://127.0.0.1:8080/search?q=...`; ordinary website addresses continue to open directly.

1. Install Docker Desktop or another Docker Compose implementation.
2. Copy `.env.example` to `.env`.
3. Replace `SEARXNG_SECRET` with a long random secret.
4. Run `docker compose up -d` from this directory.
5. Open `http://127.0.0.1:8080` to check the search service.

The service binds to loopback by default. It is not exposed to the local network unless `SEARXNG_HOST` is deliberately changed.

## Production website service

Use `docker-compose.production.yml` for the Wix website integration. It runs SearXNG, the first-party index, Valkey, plus an Nginx gateway on one Docker bridge network. The SearXNG, index, and Valkey containers have no published host ports. Only the gateway is published, bound to `127.0.0.1:8081`; put a TLS reverse proxy in front of that port.

Follow `src/backend/SEARCH.md` for environment variables, API-key configuration, deployment, plus the Wix Secrets Manager settings. The gateway requires `X-API-Key`, rate-limits requests, and routes `/search`, `/index/search`, and `/index/crawl`. Never expose the gateway publicly without TLS.

## SearXNG configuration

The SearXNG configuration inherits upstream defaults. It enables HTML results for browser navigation plus JSON results for native result rendering. The local desktop profile binds to loopback for a single-user deployment, so the SearXNG limiter is disabled. Do not expose that local-only profile publicly.

The desktop application can be pointed at another SearXNG endpoint by setting `PEANUT_SEARCH_URL` to a URL containing the literal `{query}` placeholder.

## Upstream licence

SearXNG is licensed under AGPL-3.0. Preserve its copyright notices, licence text, source attribution, plus the corresponding-source obligations that apply when distributing or operating a modified version as a network service. The upstream Docker image is used here; SearXNG source is not copied into this directory.

Upstream: https://github.com/searxng/searxng  
Licence: https://github.com/searxng/searxng/blob/master/LICENSE  
Deployment guide: https://docs.searxng.org/admin/installation-docker.html
