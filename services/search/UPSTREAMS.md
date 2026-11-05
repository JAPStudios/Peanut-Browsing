# Independent search implementation

Peanut Browsing's search system is developed as Peanut Browsing software. Its search path uses the first-party index service and does not depend on, wrap, embed, proxy through, or incorporate source code from competing search engines or browser products.

## First-party architecture

- The website search adapter sends requests to Peanut Browsing's authenticated search gateway.
- The gateway forwards requests to Peanut Browsing's own index service.
- The index service crawls explicitly submitted public websites, observes each site's robots.txt policy, and stays within the submitted site's origin.
- SQLite FTS5 stores searchable page content and BM25 ranks matching pages.
- Search results identify the engine as Peanut Index.

## Development boundary

Competitor repositories and products are not implementation dependencies. Their source code, product interfaces, browser engines, search backends, proprietary datasets, and branding must not be copied into Peanut Browsing.

Peanut Browsing functionality is to be designed, implemented, tested, documented, and maintained within its own repository. Existing first-party modules should be extended rather than replaced with a competing product or a wrapper around one.

## Current search scope

The first-party crawler indexes pages from explicitly submitted public websites. It reads declared sitemaps, follows same-origin links, respects robots.txt, rejects private or reserved network targets, and applies bounded crawl and content limits.

This is not yet continuous discovery of the entire public web. The production search gateway requires HTTPS reverse-proxy infrastructure before public deployment. These are Peanut Browsing implementation and deployment tasks, not reasons to import another search engine.
