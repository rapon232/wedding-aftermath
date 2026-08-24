# Tasks: bg-site-locale-and-shared-code

## 1. Locale infrastructure

- [x] 1.1 `src/i18n/en.js` + `src/i18n/bg.js` (strings + site config: title, OG meta, publicUrl, Intl locale, special-day map, lang, suit symbol) and `src/site.js` selecting by `VITE_SITE`
- [x] 1.2 Vite plugin resolving `%%path%%` placeholders in HTML (dev + build); `scripts/build-sites.mjs` building `dist/en` + `dist/bg` and overlaying `branding/bg/`; `package.json` build script
- [x] 1.3 Sweep `index.html` + `login.html`: all visible text and meta → placeholders; `lang` attr per site
- [x] 1.4 Sweep `src/*.js` guest-facing strings → `SITE.t.*` (incl. pluralized banner/pill); date formatters use the site Intl locale; `EVENT_DAYS` moves into site config
- [x] 1.5 Bulgarian translations, length-matched to the UI

## 2. Shared-code auth

- [x] 2.1 `server/config.js`: `SITE`, `SHARED_CODE` (normalized), per-site `distDir`, per-site server message map
- [x] 2.2 `server/auth.js`: login falls through to `{needProfile:true}` on shared-code match; `POST /api/register` (throttled; email match → resume, revoked → 403, new → insert with generated code + `activated_at`); `authMode` in `/api/me`; email index in `server/db.js`
- [x] 2.3 `login.html`/`src/login.js`: two-step card (code → name+email); errors localized
- [x] 2.4 `src/admin.js`: hide invite-email controls when `authMode === 'shared'`

## 3. Branding assets

- [x] 3.1 Spade icon set in `branding/bg/` (favicon.svg + PNG sizes + manifest with Споменник), bordeaux palette matching the heart set; og-image.jpg already in place

## 4. Deployment

- [x] 4.1 `docker-compose.bg.yml` template (SITE=bg, SHARED_CODE, port 3001, own DATA_PATH + SESSION_SECRET, Europe/Sofia, PUBLIC_URL=https://bg.aftermath.mitio.tech, no Resend); Dockerfile needs no change (build emits both dists)

## 5. Verification

- [x] 5.1 `test/shared-code.test.mjs`: shared code → needProfile without session; register creates guest visible to admin; same email resumes same id; revoked email 403; bad email 400; wrong code 401; admin personal code works; mode off → old behavior
- [x] 5.2 Full suite + both builds green; BG dist contains Споменник/spade assets, EN dist unchanged
- [x] 5.3 Puppeteer smoke on the BG build: two-step login flow end-to-end; toolbar strings don't overflow/wrap at 390px
- [x] 5.4 Code review pass; fix findings
