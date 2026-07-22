# Proposal: fix-stale-asset-blank-page

## Why

Guests who return to the site after a day or more sometimes get an unstyled, bare-HTML page stuck on "Loading…" and have to refresh manually. The cause: their browser holds a cached (or resumed-tab) `index.html` that references content-hashed Vite assets (`assets/main-<hash>.js`, `assets/style-<hash>.css`) which no longer exist after a redeploy — and mobile Safari never retries a failed `<link>`/`<script>` load. Every redeploy plants this landmine for any phone holding yesterday's HTML, and guests won't know a refresh fixes it; they'll assume the site is broken.

## What Changes

- Add a small inline self-healing guard to `index.html` (and `login.html` if it shares the same asset pattern): when the stylesheet or main script fails to load, reload the page once. A `sessionStorage` flag prevents reload loops when the site is genuinely down.
- Serve honest cache headers from `express.static` in `server/index.js`: HTML entry points get `no-cache` (always revalidate), content-hashed `/assets/*` files get `max-age=31536000, immutable`. Today no explicit policy is set, so phones and Cloudflare guess — and iOS guesses badly. Side benefit: hashed assets stop being revalidated on every visit, so repeat opens get faster.
- No changes to the build, the Docker image, or how deploys work.

## Capabilities

### New Capabilities

- `app-shell-delivery`: how the frontend shell (HTML entry points and hashed static assets) is cached and how the page recovers when a referenced asset fails to load.

### Modified Capabilities

<!-- none — no existing spec's requirements change -->

## Impact

- `index.html` (and `login.html`): one small inline `<script>` in `<head>`; `onerror` hooks on the CSS/JS tags Vite emits (or a load-check fallback, since Vite rewrites these tags at build time).
- `server/index.js`: the `express.static(config.distDir)` call gains `setHeaders`/`maxAge` options; a few lines.
- No API, database, or deployment changes. Behavior for guests with fresh HTML is unchanged.
- Risk is low: the guard reloads at most once per browser session; cache headers only state what is already true of the build artifacts.
