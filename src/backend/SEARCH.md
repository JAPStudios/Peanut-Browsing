# Peanut Browsing website search

The Wix website search backend is a server-side adapter for the SearXNG service in `services/search/`.

## Wix Secrets Manager configuration

Create this secret in the Peanut Browsing site's Secrets Manager:

- Name: `PEANUT_SEARCH_API_URL`
- Value: the public HTTPS origin of the deployed Peanut Browsing SearXNG instance, such as `https://search.example.org`

The backend appends `/search` and requests SearXNG's JSON format. The SearXNG instance must have JSON enabled in `search.formats`.

Optionally create:

- Name: `PEANUT_SEARCH_API_KEY`
- Value: the gateway key expected by the reverse proxy in the `X-API-Key` request header.

The API key is optional. It is not built-in SearXNG authentication; configure the reverse proxy to validate it if used.

Do not point the Wix site at a loopback, private-network, local, or plain-HTTP address. Do not expose the current local-only Compose configuration publicly: it has the SearXNG limiter disabled. A public deployment needs a trusted reverse proxy, correct client-IP forwarding, rate limiting, TLS, and an appropriately protected upstream.

## Frontend contract

Import `searchWeb` from `backend/webSearch` in Wix page code. Call:

```js
const response = await searchWeb(searchInput, pageNumber);
```

The response has `status`, `query`, `page`, `results`, `resultCount`, `totalResults`, and `hasNextPage`. Each result has `title`, `url`, `displayUrl`, `snippet`, `engine`, and `score`.

Search phrases are limited to 200 characters. Page numbers are limited to 1–20. Safe search is set to moderate. Only HTTP and HTTPS result links are returned; duplicate URLs are removed.

The backend is callable by anonymous visitors. The endpoint URL and optional gateway key remain in backend Secrets Manager and are never returned to the frontend.

## Current integration boundary

The repository currently has no dedicated Wix search-results page or page-element IDs. The backend module is ready for page code to call, but the visible search form and results repeater must be connected to the actual page elements in the Wix Editor before the website's search interface is live. The search service must also be deployed to a public HTTPS host and configured in Secrets Manager.
