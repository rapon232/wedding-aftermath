# Design: fix-stale-asset-blank-page

## Context

Vite builds the frontend with content-hashed filenames and injects the tags into `dist/index.html` / `dist/login.html` at build time (e.g. `<script type="module" crossorigin src="/assets/main-CTbuK7CX.js">`). Each `docker compose up --build` replaces `dist/` wholesale, so old hashes stop existing. The Express server serves everything with default caching behavior: `express.static(config.distDir)` (server/index.js:98) and two `res.sendFile` routes for `/` and the SPA catch-all — no explicit `Cache-Control` anywhere for the shell.

Result: a phone that resumes a day-old tab or revalidates lazily can render HTML whose CSS/JS are 404s, and mobile Safari never retries a failed `<link>`/`<script>` — the guest sees an unstyled page stuck on "Loading…" until they manually refresh.

Constraints:

- The site is live with real guests; the change must be small and safe.
- Source `index.html`/`login.html` don't contain the hashed tags (Vite adds them), so the recovery hook can't be an `onerror` attribute on those tags — it must detect failures generically.
- Everything flows through a Cloudflare tunnel; Cloudflare caches `.css`/`.js` by extension, so honest headers also make CF behave correctly (long-cache assets, never-cache HTML).

## Goals / Non-Goals

**Goals:**

- A guest who lands on stale HTML gets a styled, working page without manual intervention.
- Browsers and Cloudflare cache exactly what is safe to cache: hashed assets forever, HTML never.
- Zero change to build tooling, Docker image, or deploy procedure.

**Non-Goals:**

- Offline support / service worker (disproportionate failure surface for a site with weeks of life left).
- Keeping historical asset bundles across deploys (infra change; headers + guard make it unnecessary).
- Fixing the transition for phones that cached HTML *before* this change ships — they may hit the bare page one final time (the old HTML has no guard); after that, no-cache HTML prevents recurrence.

## Decisions

### 1. Detection: capture-phase error listener + load-time stylesheet check

An inline **non-module** `<script>` in the `<head>` of both source HTML files (Vite preserves inline scripts verbatim):

- `window.addEventListener('error', handler, true)` — resource load errors don't bubble, but they *are* observable in the capture phase. Handler triggers when `e.target` is a `LINK`/`SCRIPT` whose URL contains `/assets/`.
- Belt-and-suspenders on `window.load`: if no `document.styleSheets` entry points at `/assets/style-*.css`, treat it as a failure too (covers resumed tabs where the error event fired before listeners existed).

Alternative considered: `onerror` attributes on the asset tags — rejected because Vite generates those tags; we'd need a build plugin to decorate them. The generic listener needs no build changes.

### 2. Recovery: reload once per session, sessionStorage-guarded

On detection, set `sessionStorage['shell-reloaded'] = '1'` and call `location.reload()`. If the flag is already set, do nothing — a genuinely down site (e.g. tunnel 502) degrades to today's behavior instead of a reload loop. The flag is cleared on a successful load (styles present), so a *later* deploy in the same session can still self-heal.

Alternative considered: cache-busting query-param navigation (`location.replace(path + '?v=' + ts)`) — rejected; once HTML is `no-cache`, a plain reload fetches fresh HTML, and query-param URLs pollute history/shared links.

### 3. Cache headers: state what is already true

- `/assets/*` (content-hashed by construction): `Cache-Control: public, max-age=31536000, immutable`.
- `*.html` — both via `express.static` and the two `sendFile` routes (`/` login-or-gallery pick, SPA catch-all): `Cache-Control: no-cache` (revalidate every time; the HTML is ~10 KB, and ETag/304 makes revalidation nearly free).
- Everything else (fonts, icons, og-image): leave defaults; not implicated in the bug.

Implemented via the `setHeaders` option of `express.static` plus explicit `res.set` on the two `sendFile` routes.

## Risks / Trade-offs

- [Reload fires on a transient network blip at tab-resume] → That's desirable: one automatic reload is exactly the manual fix, executed faster than the guest can notice. The session flag caps it at one.
- [Site truly down → guard reloads once, page still broken] → Same end state as today, one extra request; acceptable.
- [Phones holding pre-change HTML] → Old HTML lacks the guard; they can hit the bare page once more after the *next* deploy. One-time transition cost; nothing to do.
- [Cloudflare serves a cached old asset after deploy] → Harmless in the failure direction: old CSS/JS still render the old-but-working page for stale HTML; fresh HTML references new hashes which miss CF cache and hit origin.
- [`no-cache` HTML adds a revalidation round-trip per visit] → ~10 KB doc, 304 path; imperceptible over the tunnel.

## Migration Plan

Normal redeploy (`git pull && docker compose up -d --build` on the NAS). No data or config changes. Rollback = revert the commit and redeploy. Verify per tasks.md (curl header checks + simulated asset 404 + real phone).

## Open Questions

None — behavior is fully specified in specs/app-shell-delivery/spec.md.
