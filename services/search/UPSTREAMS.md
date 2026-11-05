# Search upstream review

Peanut Browsing's production search path is first-party. It does not execute SearXNG, call external search engines, or proxy visitor queries to public metasearch instances.

The requested upstream organisations are potential sources for selectively adopting compatible capabilities. Their repositories must be assessed individually for purpose, licence, dependencies, security posture, maintenance status, and architectural fit. A GitHub organisation is not a single software package, and its repositories cannot safely be bulk-imported as one unit.

## SearXNG review

The SearXNG project is a metasearch engine that aggregates results from external search providers. That model does not meet Peanut Browsing's current first-party search requirement. Consequently, SearXNG is not part of the production search stack, desktop default search path, or Wix search adapter.

The previous local SearXNG Compose configuration and its instance settings have been removed from the active project. The SearXNG organisation remains an upstream research reference only. No SearXNG source code is represented as integrated into Peanut Browsing.

## Integration policy

For every candidate repository, record:
- the exact repository and upstream commit or release;
- the applicable licence and required notices;
- the feature being adopted and where it belongs in Peanut Browsing;
- runtime and development dependencies;
- security implications and maintenance status;
- modifications made locally, with attribution and tests.

Only compatible, legally reusable components should be incorporated. Unrelated products, demo applications, public-instance directories, deployment infrastructure and historical datasets should not be copied merely because they belong to a requested organisation.
