# AWS Cross-Account Favorites

A browser extension (Manifest V3; Chrome, Edge and Firefox) that replaces the
AWS Management Console's per-account favorites bar with a **consistent,
catalog-driven bar** that syncs across every AWS account and device.

The console's native favorites are stored per IAM identity, so each AWS account
(and each federated role) starts with its own, separate list. This extension
keeps one list in browser sync storage and renders it in every account you sign
in to.

## Features

- **Cross-account + cross-device** via `storage.sync`.
- **Hides the native favorites strip** (only that strip — the primary bar with
  search, region and account menu stays untouched) and renders its own in its place.
- **Service icons** next to names, using the console's own CDN icon assets.
- **Shorthand names** (ECS, SSM, SQS, OpenSearch, Billing, …) — all overridable.
- **Hover submenus** to jump straight to a service's sub-pages (e.g. Systems
  Manager → Parameter Store, Session Manager, Patch Manager).
- **In-console settings dialog** (⚙ on the bar): search the full catalog of
  ~300 services, add/remove, drag to reorder, pick which sub-pages appear on
  hover, rename, toggle icons/shorthand/native-bar, and import/export JSON.

## How it works

- The console ships its **entire service catalog** in page localStorage under
  `cctConfigDataCache` (~300 services with canonical URLs, CDN icon URLs,
  per-region availability, search keywords, sub-routes, and 23 categories). The
  content script reads it (same origin ⇒ shared localStorage), slims it, and
  caches it to `storage.local`. This makes the service picker fully
  data-driven and always current — nothing hardcoded.
- **Sub-pages** come from a **baked-in dataset** (`src/data/subpages.json`,
  ~180 services / ~1,400 sub-pages) built by crawling each service's left
  navigation once, plus the catalog's own `routes`. Baking (rather than reading
  the console at runtime) means no dependency on the console's markup — the
  links are plain URLs that keep working. Three console nav patterns are
  captured: path links (`/ecs/v2/clusters`), bare-hash links
  (`/ec2/home#Instances:`), and collapsible group nodes (expanded before
  scraping). Services not offered in us-east-1 are crawled in a region where
  they are available.
  - The settings picker offers these per service; you choose which appear on hover.
  - **Auto-learn (opt-in, off by default):** scrapes a service's left nav when
    you visit it and caches any new sub-pages — useful for services that show
    an onboarding page (no nav) until they are set up, or for consoles AWS adds
    later. Anything still missing can be added as a **custom** child (label + path).
- Favorites are stored as **origin-relative** console paths. On render, each
  link is rebuilt against the current console `location.origin` (including
  multi-session subdomains) and the region is set to the one currently
  selected (regional services get a `region=` param; global services such as
  IAM and Route 53 are left bare). So a favorite always opens in the current
  AWS account, console session and region — something browser bookmarks can't do.
- The native strip is located structurally: the console header `<nav>` has two
  children (primary bar + favorites strip); only the child that contains the
  favorites `<ol>` is hidden, never one containing the search input.

## Storage model (`storage.sync`)

Per-item, to stay under the 8 KB/item quota even with icons + submenus:

```
settings:v1            -> { hideNativeBar, showIcons, useShorthand }
bar:order              -> string[] of catalog service ids, in display order
bar:item:<serviceId>   -> { id, title?, url?, children: [{label, path}] }
seeded:v2              -> one-time native-favorites migration flag
```

The catalog is cached separately in `storage.local` (`catalog:v1`) since it's
large and per-device.

## Build & test

Requires [Bun](https://bun.sh).

```bash
bun install
bun test        # region rewriting, withRegion, route cleaning, dataset checks, shorthand
bun run build   # outputs ./dist
```

## Install

### Chrome / Edge (unpacked)

1. `bun run build`
2. Open `chrome://extensions` (or `edge://extensions`) and enable Developer mode.
3. **Load unpacked** → select `dist/`.

### Firefox

Release Firefox only installs signed add-ons permanently.

- **Temporary:** `about:debugging#/runtime/this-firefox` → **Load Temporary
  Add-on…** → select `dist/manifest.json` (removed when Firefox restarts).
- **Signed (self-distributed):** create AMO API credentials at
  <https://addons.mozilla.org/developers/addon/api/key/>, export them as
  `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`, then run `bun run sign:firefox`.
  The signed `.xpi` lands in `web-ext-artifacts/`; open it in Firefox to install.
  Bump `version` in `src/manifest.json` before each new signing.

On first run the bar is seeded from the current AWS account's native console
favorites (each matched by canonical URL to a catalog service); after that it's
yours to edit.

## Sync caveat

`storage.sync` syncs through the browser's own account: Chrome via Google,
Edge via Microsoft, Firefox via Firefox Accounts. Different browsers don't
share state — use Export/Import in settings to move a bar between them.

## Regenerating the sub-page dataset

`scripts/crawl.py` visits every console service and scrapes its left nav;
`scripts/postprocess.py` filters it into `src/data/subpages.json`. See the
docstring in `crawl.py` for prerequisites. The post-processing step drops
anything specific to the AWS account used for crawling (resource IDs, resource
names, named dashboards), as well as non-navigation links, call-to-action
buttons and documentation links.

## Layout

```
src/
  manifest.json
  lib/
    catalog.ts     # parse/slim/cache cctConfigDataCache; merge baked+routes children
    store.ts       # settings + per-item bar storage; onStoreChanged
    shorthand.ts   # console label -> short-name map
    region.ts      # region detect / rewrite / withRegion / buildHref
    account.ts     # current AWS account detection
  data/
    subpages.json  # baked sub-page dataset (crawled console left-navs)
  content/
    index.ts       # entry
    bar.ts         # injected bar: icons, shorthand, hover dropdown, hide native
    modal.ts       # in-console settings dialog (shadow DOM)
    seed.ts        # one-time seed from native console favorites
    learn.ts       # opt-in runtime sub-page learner (passive scrape)
scripts/           # dataset crawler + post-processor (not shipped)
tests/             # bun:test
build.ts
```

## License

[Apache-2.0](LICENSE)
