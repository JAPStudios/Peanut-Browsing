# Desktop third-party notices

Peanut Browsing desktop uses the following third-party components:

| Component | Version range | Licence | Purpose |
|---|---:|---|---|
| Electron | 36.x | MIT | Chromium-based desktop runtime |
| electron-builder | 26.x | MIT | Desktop packaging |
| @ghostery/adblocker-electron | 2.20.x | MPL-2.0 | Network request filtering for ads and trackers |
| cross-fetch | 4.x | MIT | Fetch implementation used to obtain filter lists |

The ad/tracker engine loads EasyList, EasyPrivacy and uBlock Origin filter subscriptions through the Ghostery adblocker package. The current integration enables network filtering; cosmetic page-element removal is disabled. Filter-list content remains subject to its own upstream terms.

SearXNG is a separate search service under AGPL-3.0. Its upstream notice and integration boundary are documented in [the search service upstream register](../../services/search/UPSTREAMS.md).

Upstream notices:
- https://github.com/electron/electron
- https://github.com/electron-userland/electron-builder
- https://github.com/ghostery/adblocker
- https://github.com/lquixada/cross-fetch