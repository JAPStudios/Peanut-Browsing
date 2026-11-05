# Peanut Browsing website search

The published Peanut Browsing Wix site has a site-wide search panel injected as a functional custom embed. The embed submits queries to the site's public Velo HTTP function:

`GET /_functions/peanutSearch?q=<encoded-query>&page=<page-number>`

The function is defined in `src/backend/http-functions.js` as `get_peanutSearch`. The Velo backend files must be present in the connected Wix site's Git Integration repository and published before the endpoint can execute.

## Search service

The Wix backend combines Peanut Browsing's own SQLite FTS5 website index in `services/index/` with the SearXNG metasearch service in `services/search/`. First-party index results are placed before metasearch results. If the first-party index is temporarily unavailable, metasearch remains available. The local desktop profile uses the loopback-only Compose stack. The production profile adds a private SearXNG/Valkey network plus an Nginx gateway.

### Production deployment

1. Provision a server with Docker Engine and the Docker Compose plugin. Keep the server updated.
2. Copy `.env.production.example` to `.env`. Replace both placeholder secrets with independently generated random hexadecimal values (for example, `openssl rand -hex 32`). Never commit `.env`.
3. Start the production stack from this directory:

   `docker compose --env-file .env -f docker-compose.production.yml up -d`

4. Configure a TLS reverse proxy on the host or at the edge to forward the public search hostname to `http://127.0.0.1:8081`. Terminate HTTPS there. Do not expose the gateway port publicly without TLS.
5. The Nginx gateway accepts authenticated `GET /search` and `GET /index/search` requests plus authenticated `POST /index/crawl` requests with the configured `X-API-Key`. It applies a conservative shared rate limit of 2 requests per second with a burst of 10. SearXNG and Valkey are not published on host ports; only the gateway can reach them on the private Compose network.
6. In the Peanut Browsing Wix site's Secrets Manager, create:
   - `PEANUT_SEARCH_API_URL`: the public HTTPS origin, for example `https://search.example.org` (no `/search` suffix).
   - `PEANUT_SEARCH_API_KEY`: the exact value of `PEANUT_SEARCH_API_KEY` from the server's private `.env`. This secret is mandatory; the Wix backend refuses to search without it.
7. Publish the Wix Velo backend. Test `/_functions/peanutSearch?q=peanut&page=1` on the published site and confirm that it returns `status: "ok"` with result records.

The first-party index stores pages submitted through `/index/crawl`; each crawl is limited to 25 pages on one origin, obeys `robots.txt`, rejects private/local targets, and uses SQLite FTS5/BM25 for retrieval. The Wix backend also exposes `indexWebsite(url, maxPages)` in `src/backend/indexedWebsites.jsw`; its permissions restrict invocation to the site owner. This is a first-party site index, not yet a continuously discovered web-scale index. The Nginx gateway's initial rate limit is shared across all Wix backend requests because the single shared API key does not identify individual visitors. Review actual traffic before increasing the limit or introducing per-user credentials. The HTTPS reverse proxy must preserve the `X-API-Key` header. Keep SearXNG's upstream port private.

For a local desktop instance, use `docker-compose.yml` instead. That profile binds SearXNG to loopback and intentionally does not expose it to the network.

## Search request and response

The browser embed calls the same-origin HTTP function. The function calls `searchWeb(query, page)` on the server, keeping the provider address and gateway key in Wix Secrets Manager.

The response has `status`, `query`, `page`, `results`, `resultCount`, `totalResults`, and `hasNextPage`. Each result has `title`, `url`, `displayUrl`, `snippet`, `engine`, and `score`.

Search phrases are limited to 200 characters. Page numbers are limited to 1–20. Safe search is set to moderate. Only HTTP and HTTPS result links are returned; duplicate URLs are removed. Result titles and snippets are inserted as text, not interpreted as HTML.

## Verification status

The search panel custom embed was confirmed enabled through the Wix Custom Embeds API. The repository contains the Wix HTTP function, backend adapter, search helper tests, local SearXNG profile, plus the production gateway profile.

A committed backend file is not proof that Wix has published it. Wix's documented Git Integration workflow uses `wix publish` with the latest commit from `origin/main`. The repository README identifies this repository as connected to the Peanut Browsing Wix site. However, a read-only invocation of the published `peanutSearch` HTTP function returned HTTP 404, so the backend is not yet confirmed live. Wix's Git Integration documentation says `wix publish` can publish the latest commit from `origin/main`; the function must be published before visitor requests can reach it. Live website results remain unverified until the deployed HTTP function returns actual result records using a configured public HTTPS search service.
