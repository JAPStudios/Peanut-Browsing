# Peanut Browsing website search

The published Peanut Browsing Wix site has a site-wide search panel injected as a functional custom embed. The embed submits queries to the site's public Velo HTTP function:

`GET /_functions/peanutSearch?q=<encoded-query>&page=<page-number>`

Wix documents this production URL pattern for public HTTP functions on free sites. The function is defined in `src/backend/http-functions.js` as `get_peanutSearch`. The Wix site must have this backend file plus its imported modules published before the endpoint can execute.

## Search provider configuration

The Wix backend is an adapter for the SearXNG service in `services/search/`.

Create this secret in the Peanut Browsing site's Secrets Manager:

- Name: `PEANUT_SEARCH_API_URL`
- Value: the public HTTPS origin of the deployed Peanut Browsing SearXNG instance, such as `https://search.example.org`

The backend appends `/search` and requests SearXNG's JSON format. The SearXNG instance must have JSON enabled in `search.formats`.

Optionally create:

- Name: `PEANUT_SEARCH_API_KEY`
- Value: the gateway key expected by the reverse proxy in the `X-API-Key` request header.

The API key is optional. It is not built-in SearXNG authentication; configure the reverse proxy to validate it if used.

Do not point the Wix site at a loopback, private-network, local, or plain-HTTP address. Do not expose the current local-only Compose configuration publicly: it has the SearXNG limiter disabled. A public deployment needs a trusted reverse proxy, correct client-IP forwarding, rate limiting, TLS, and an appropriately protected upstream.

## Request and response contract

The browser embed requests the same-origin HTTP function. The function calls `searchWeb(query, page)` on the server, keeping the provider address and optional gateway key in Wix Secrets Manager.

The response has `status`, `query`, `page`, `results`, `resultCount`, `totalResults`, and `hasNextPage`. Each result has `title`, `url`, `displayUrl`, `snippet`, `engine`, and `score`.

Search phrases are limited to 200 characters. Page numbers are limited to 1–20. Safe search is set to moderate. Only HTTP and HTTPS result links are returned; duplicate URLs are removed. Result titles and snippets are inserted as text, not interpreted as HTML.

## Deployment and verification status

The search panel embed is installed on the published Wix site and was confirmed enabled through the Wix Custom Embeds API. The repository contains the HTTP function plus its backend adapter. GitHub Actions validates JavaScript syntax and helper tests.

The Wix Editor site is not confirmed as connected to the `JAPStudios/Peanut-Browsing` GitHub repository. Wix's documented Git Integration setup creates a separate site repository and requires connecting it from the Editor; committing to this project repository alone does not publish Velo code to the site. The HTTP function must therefore be published through the site's actual Velo deployment workflow before it can serve visitor requests.

Live search results are not yet verified. The site also needs a publicly reachable, rate-limited HTTPS SearXNG deployment and the `PEANUT_SEARCH_API_URL` secret. Do not report search as operational until the published HTTP function returns real result records for a test query.
