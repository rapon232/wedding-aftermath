# Tasks — build-photo-sharing-site

## 1. Project Scaffold

- [x] 1.1 Init npm project with Vite + Express + better-sqlite3 + multer + sharp + exifr + archiver + cookie deps; scripts: `dev`, `build`, `start`
- [x] 1.2 Create server skeleton (`server/index.js`): Express app, env config (`PORT`, `SESSION_SECRET`, `DATA_DIR`), serves built frontend, healthcheck route
- [x] 1.3 Create SQLite schema + init module (`server/db.js`): `guests` (id, code, name, is_admin, revoked_at), `media` (id, uploader_id, filename, type, size, sha256, taken_at, uploaded_at, status), WAL mode
- [x] 1.4 Create data-dir layout on boot: `originals/`, `thumbs/`, `previews/`, `posters/`, `db.sqlite`

## 2. Auth (guest-auth)

- [x] 2.1 Session module: signed HttpOnly cookie (180d), auth middleware (401 for API/media, redirect for pages)
- [x] 2.2 `POST /api/login` — code lookup (case/dash-insensitive), reject revoked, set cookie; `POST /api/logout`
- [x] 2.3 `login.html` page — code entry form, wedding theming, error state
- [x] 2.4 Admin endpoints: generate code(s) with guest name, list codes, revoke code (invalidates sessions); admin-only middleware (403)
- [x] 2.5 Bootstrap admin: on first boot with empty DB, print/generate the admin code from env or CLI

## 3. Upload Pipeline (media-upload)

- [x] 3.1 `POST /api/upload` — multer disk storage into `originals/` temp, type allowlist (jpeg/png/webp/gif/heic/heif/mp4/mov), 2 GB cap, sha256 dedupe, insert media row with `status=processing`
- [x] 3.2 Chunked-upload endpoints for files >95 MB (init/append/finish) to stay under the Cloudflare body limit; client picks path by file size
- [x] 3.3 Processing queue (concurrency 2): sharp thumbnail (~400px WebP) + preview (~1600px WebP) incl. HEIC; ffmpeg poster + thumb for videos; EXIF capture date via exifr; mark `status=ready`
- [x] 3.4 `DELETE /api/media/:id` — own uploads or admin; removes files + row
- [x] 3.5 Upload UI: drag-and-drop zone (desktop) + file/camera-roll picker (mobile), client queue with per-file progress, retry per file, processing placeholders that poll until ready (browser-level QA pending in group 4 visual pass)

## 4. Gallery (gallery-browse)

- [x] 4.1 `GET /api/media` — cursor-paged listing with sort (taken/uploaded date asc/desc) and filters (uploader, type); `GET /api/uploaders` for filter dropdown
- [x] 4.2 Authenticated media file routes: thumbs, previews, posters, originals (Range support for video playback)
- [x] 4.3 Gallery grid: responsive CSS grid, lazy thumbnails, IntersectionObserver infinite scroll, sort/filter toolbar synced to URL params
- [x] 4.4 Lightbox: full-screen preview, swipe + arrow-key navigation across current result set, video playback with poster + controls, uploader/date caption, download + delete (own) buttons
- [x] 4.5 Theming: shared stylesheet with seating-site palette (cream/mint/bordeaux), DM Serif Display + DM Sans, header, mobile layout polish

## 5. Downloads (media-download)

- [x] 5.1 Original download with proper filename/Content-Disposition (implemented as `GET /media/file/:id?download=1`)
- [x] 5.2 Selection mode in grid (tap-select, select all) + `POST /api/download` streaming store-only zip via archiver
- [ ] 5.3 Verify multi-GB zip streaming and mobile save behavior (iOS Safari, Android Chrome) — deferred to NAS deploy verification (7.3/7.4)

## 6. Admin UI

- [x] 6.1 Admin panel (visible to admin only): generate codes with names, copyable code list, revoke buttons
- [x] 6.2 Admin delete on any item in gallery/lightbox

## 7. Deployment (deployment)

- [x] 7.1 Multi-stage Dockerfile: Vite build → `node:22-bookworm-slim` runtime with ffmpeg; HEIC handled by pure-JS `heic-convert` fallback (works regardless of libvips build); non-root user. NOTE: HEIC→WebP inside the container still to be confirmed on first NAS build.
- [x] 7.2 `docker-compose.yml`: port mapping, `/data` volume mount, env vars, restart policy; `.env.example` extended with HOST_PORT/DATA_PATH
- [~] 7.3 Docker smoke test: Docker not available on this dev machine. Ran equivalent **production-mode** smoke (NODE_ENV=production, built dist, temp data dir): gate redirect, static serving, Secure cookie, auth gallery, upload→process→ready, TZ, assets — all pass. Full Docker E2E to run on first NAS `up --build`.
- [ ] 7.4 Deploy to NAS: create data share, compose up, add `aftermath.mitio.tech` ingress to cloudflared, verify from phone over cellular (incl. >100 MB video upload)
- [ ] 7.5 Guest onboarding from Joy.com export: parse guest CSV (names + emails), bulk-generate codes, send each guest their personal code + site link by email; export a name→code→email list as fallback

## 8. Tests & Security (hardening)

Automated with Node's built-in test runner (`node --test`) — no new deps. Split into unit, API-integration, and adversarial/security suites; each spins the app against a throwaway temp `DATA_DIR`.

- [x] 8.1 Test harness: helper to boot the app on an ephemeral port with a temp data dir + seeded guests, teardown between suites; `npm test` script
- [x] 8.2 Unit tests: `exifToUtc` (DST, offset tag, malformed), code generate (charset, uniqueness)
- [x] 8.3 API-integration: auth (login/logout/me, revocation kills live session), upload (dedupe, type allowlist, processing→ready), listing (sort/filter/keyset paging correctness), download (ids + all + filters), admin CRUD, pin
- [x] 8.4 Security — injection: SQL injection attempts via login code, `cursor`, `uploader`/`type` filters (parametrized queries neutralize); asserts no error leak / no data leak / table survival
- [x] 8.5 Security — path traversal & file access: `../`, encoded `%2e%2e`, null bytes, non-UUID ids against every `/media/*` route; originals only reachable by valid UUID
- [x] 8.6 Security — authz/IDOR: unauth 401 on all protected routes; non-admin → 403 on admin routes (incl. pin); guest cannot delete another's media; tampered/forged session cookie rejected; chunked-upload session not hijackable across guests
- [x] 8.7 Security — abuse limits: login brute-force throttle (429), oversized JSON body (413), over-declared chunk size rejected; cookie flags (HttpOnly, SameSite) asserted
- [x] 8.8 CI-of-one: `npm test` documented in README; run as a gate before each deploy

## 9. Pinned media (admin curation)

- [x] 9.1 DB: `pinned_at` column on media (nullable); `POST /api/admin/media/:id/pin` with `{pinned}` (admin-only, 403 otherwise)
- [x] 9.2 Listing: pinned items returned as a separate `pinned` set on the first page, ordered by pin time; excluded from the paginated `items` so keyset paging stays intact; totals still count them
- [x] 9.3 Gallery UI: render a "Pinned ✦" section above the grid, pinned cells badged; unified item order keeps lightbox navigation correct
- [x] 9.4 Lightbox: admin-only Pin/Unpin button that toggles state and refreshes the gallery
- [x] 9.5 Cover pinning in the group-8 security tests (non-admin pin → 403) + API test for pinned-set separation
