# Upstream code evaluation

Peanut Browsing may use compatible upstream source code. Do not reject a repository merely because it is another browser, search engine, or website platform. Evaluate useful components individually and integrate them where they improve Peanut Browsing's existing browser, search, importing, or website-authoring capabilities.

Before copying or adapting code, record the exact repository, source path, commit, license, required notices, dependency and runtime requirements, platform support, security implications, and the tests needed to verify the integration. A repository-level license does not necessarily cover every bundled dependency, asset, or submodule. Preserve applicable notices and satisfy copyleft or attribution obligations before distributing a derivative or combined work.

## Evaluated upstream repositories

| Repository | Verified project and license information | Potential use in Peanut Browsing | Integration considerations |
| --- | --- | --- | --- |
| [ardia-browser/ardia](https://github.com/ardia-browser/ardia) | Browser built around a patched Chromium engine with an Expo/React Native macOS shell and a Linux host. Repository license: GPL-3.0. | Browser interaction patterns and individually reviewed browser features, including tab organization, split views, profile handling, extension workflows, and privacy controls. | The repository includes a large patched Chromium engine and native platform code. Identify and assess the exact component and its own license/dependencies before reuse. GPL-3.0 obligations must be evaluated for any copied or adapted component. |
| [mozilla-firefox/firefox](https://github.com/mozilla-firefox/firefox) | Firefox browser source repository. Its top-level LICENSE directs readers to `toolkit/content/license.html` for the applicable licensing conditions. | Browser security architecture, navigation, privacy, accessibility, profile, extension, and testing approaches. | Inspect the relevant source path and its licensing notices before reuse. The complete Firefox engine is not an Electron dependency; a specific component must have a technically and legally compatible integration path. |
| [searxng/searxng](https://github.com/searxng/searxng) | Privacy-oriented metasearch engine. Repository declares AGPL-3.0-or-later. | Search-provider orchestration, engine adapters, result normalization, ranking, and privacy-oriented query handling. | Assess whether a component should be incorporated into the first-party search service or run as a distinct search source. AGPL network-use and distribution obligations require review before modifying or deploying its code. |
| [Shopify/liquid](https://github.com/Shopify/liquid) | Template language and rendering engine. MIT license. | A constrained template language for independently authored websites, reusable layouts, and safe content rendering. | The upstream implementation is Ruby. Assess runtime cost and compatibility before selecting direct use or a compatible implementation. Retain the MIT copyright and permission notice when reusing code. |
| [Squarespace/template-engine](https://github.com/Squarespace/template-engine) | TypeScript port of Squarespace's template compiler. Apache-2.0 license. | Browser-compatible template parsing and compilation for richer website authoring and reusable page themes. | TypeScript is compatible with the existing JavaScript/Node toolchain. Verify the template syntax, compiler dependencies, runtime behavior, and Apache-2.0 notice requirements before integrating selected modules. |
| [torproject/torbrowser-launcher](https://github.com/torproject/torbrowser-launcher) | GNU/Linux launcher that downloads Tor Browser and verifies its signed release. MIT license. | Reference for verified browser downloads, signature validation, and update integrity if a supported Tor Browser workflow is selected. | It is a Linux launcher, not the Tor Browser engine or a cross-platform Electron module. Retain the MIT notice if code is reused. |
| [torproject/tor](https://github.com/torproject/tor) | The GitHub repository states that Tor source development has moved to [GitLab](https://gitlab.torproject.org/tpo/core/tor). | Tor protocol and client integration research for a privacy-network feature. | The GitHub repository is not the current source location. Review the current GitLab source, its license, supported integration interfaces, and security requirements before implementation. |

## Integration policy

- Existing Peanut Browsing functionality remains the integration target. Upstream components are candidates for extending it, not reasons to replace or discard existing first-party work.
- Prefer direct reuse when the source code, license, runtime, platform, and security model are compatible. Port or adapt a component when that is technically justified and its license permits it.
- Keep independently deployable services separate only when their runtime, scaling, security, or license requirements make that the appropriate integration.
- Do not treat a repository's product branding, complete application, or every dependency as a reusable module. Select and verify exact files and commits.
- Add attribution and license records for every incorporated upstream component. Add regression tests and integration tests that exercise the actual Peanut Browsing behavior.
- Update this document when an upstream component is adopted, rejected for a specific evidenced reason, or superseded by a newer source revision.

## First-party search scope

Peanut Browsing's existing search index and gateway remain first-party code. The crawler indexes explicitly submitted public websites, observes robots.txt rules, and applies bounded crawl limits. Evaluating SearXNG does not by itself establish that the current index covers the public web or that a metasearch source has been integrated.
