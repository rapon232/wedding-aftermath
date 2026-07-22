# Tasks: fix-stale-asset-blank-page

## 1. Self-healing guard

- [x] 1.1 Add an inline non-module `<script>` to the `<head>` of `index.html`: capture-phase `error` listener that triggers on failed `/assets/` LINK/SCRIPT loads, plus a `window.load` check that `/assets/style-*.css` is present in `document.styleSheets`; on failure reload once, guarded by a `sessionStorage` flag; clear the flag on a successful styled load
- [x] 1.2 Add the same guard to `login.html` (it loads the same hashed style/script pattern)
- [x] 1.3 Confirm with `npm run build` that Vite preserves the inline script verbatim in `dist/index.html` and `dist/login.html`

## 2. Cache headers

- [x] 2.1 In `server/index.js`, pass `setHeaders` to `express.static(config.distDir)`: `/assets/` paths get `Cache-Control: public, max-age=31536000, immutable`; `.html` paths get `Cache-Control: no-cache`
- [x] 2.2 Set `Cache-Control: no-cache` on the two explicit `sendFile` HTML routes (the `/` login-or-gallery pick and the SPA catch-all)

## 3. Verification

- [x] 3.1 Local: `curl -sI` the production build — `/` and `/login.html` show `no-cache`; an `/assets/*.css` file shows `immutable`
- [x] 3.2 Local: simulate the failure (serve HTML referencing a nonexistent `/assets/` hash, e.g. via the puppeteer smoke-test setup) — page reloads exactly once, and does not loop when the asset stays missing
- [ ] 3.3 Deploy to the NAS, then confirm on a real phone that a normal visit works and repeat visits still load fast (assets from cache)
