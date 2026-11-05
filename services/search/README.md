# Peanut Browsing search service

This directory runs the SearXNG metasearch backend used by the Peanut Browsing desktop application. The desktop address bar sends search queries to `http://127.0.0.1:8080/search?q=...`; ordinary website addresses continue to open directly.

## Start

1. Install Docker Desktop or another Docker Compose implementation.
2. Copy `.env.example` to `.env`.
3. Replace `SEARXNG_SECRET` with a long random secret.
4. Run `docker compose up -d` from this directory.
5. Open `http://127.0.0.1:8080` to check the search service.

The service binds to loopback by default. It is not exposed to the local network unless `SEARXNG_HOST` is deliberately changed.

## Configuration

The search configuration inherits SearXNG defaults. It enables HTML results for browser navigation plus JSON results for native result rendering. The service binds to loopback for a single-user desktop deployment, so the SearXNG limiter is disabled: its IP-based bot detection requires correctly configured X-Forwarded-For or X-Real-IP headers from a trusted reverse proxy. Do not expose this instance publicly with the limiter disabled. Valkey remains available in Compose for a future reverse-proxy deployment with the limiter configured.

The desktop application can be pointed at another SearXNG endpoint by setting `PEANUT_SEARCH_URL` to a URL containing the literal `{query}` placeholder.

## Upstream licence

SearXNG is licensed under AGPL-3.0. Preserve its copyright notices, licence text, source attribution, plus the corresponding-source obligations that apply when distributing or operating a modified version as a network service. The upstream Docker image is used here; SearXNG source is not copied into this directory.

Upstream: https://github.com/searxng/searxng  
Licence: https://github.com/searxng/searxng/blob/master/LICENSE  
Deployment guide: https://docs.searxng.org/admin/installation-docker.html