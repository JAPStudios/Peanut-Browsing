# SearXNG upstream repository review

The SearXNG GitHub organisation exposes several distinct projects. They are not eight interchangeable browser-engine repositories. The search service currently uses the official SearXNG container image, configured through this directory. The repository review below records which upstream projects belong in the running search path.

| Upstream repository | Licence | Role | Peanut Browsing treatment |
|---|---|---|---|
| https://github.com/searxng/searxng | AGPL-3.0 | Main Python metasearch engine | Used as the search-service container image. Its source is not copied into the Wix or Electron JavaScript code. |
| https://github.com/searxng/botdetection | AGPL-3.0 | Bot-detection methods for Flask applications | Candidate for a later public-service security review. Not yet integrated. |
| https://github.com/searxng/base | BSD-2-Clause | Read-only base-container project | Used transitively by upstream container builds; not a browser feature or separate runtime dependency here. |
| https://github.com/searxng/searxng-docker | AGPL-3.0 | Older Docker deployment repository | Archived and superseded. The current SearXNG installation documentation points to the Compose template in the main repository instead. |
| https://github.com/searxng/searx-space | AGPL-3.0 | Statistics for public SearXNG instances | Separate monitoring/statistics application; not part of local search execution. |
| https://github.com/searxng/searx-instances | LGPL-3.0 | Directory of public SearXNG instances | Potential source for a future public-instance directory or fallback selector. Not yet integrated. |
| https://github.com/searxng/searx-instances-uptime | MIT | Uptime history for public instances | Approximately 3.5 GB in GitHub's reported repository-size field. Do not vendor the complete history into the browser source repository; consume selected status data if a monitoring feature requires it. |
| https://github.com/searxng/searxng.github.io | AGPL-3.0 | Public project website | Project information site, not browser or search-engine runtime code. |

## Integration boundary

The active integration is the SearXNG search service under `services/search/`. The desktop browser talks to that service over its local HTTP endpoint. This keeps the AGPL-licensed search engine in a separate service rather than copying its Python implementation into the Electron application or Wix/Velo source.

The other repositories remain identified as upstream references, not silently merged source. Before adding any of them to a distributed build, review its licence, dependency tree, security model, purpose and compatibility. In particular, the archived deployment repository should not replace the current installation template; the multi-gigabyte uptime history should not be committed wholesale.

SearXNG upstream licence: https://github.com/searxng/searxng/blob/master/LICENSE  
Current container deployment guide: https://docs.searxng.org/admin/installation-docker.html