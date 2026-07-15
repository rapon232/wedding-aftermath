# #LovePortal — The Wedding Aftermath

A small, private photo & video vault for our wedding guests, served at
**`aftermath.mitio.tech`**. Guests sign in with a personal code (or a one-tap
magic link), browse a shared gallery, upload their own photos/videos, react,
comment, and download originals. Everything lives on our Synology NAS behind a
Cloudflare tunnel — no third-party photo host, nothing used to train AI.

Sibling of `wedding.mitio.tech` (the seating plan); deployed the same way.

---

## Features

- **Per-guest access codes** → signed, 180-day session cookie. No self-signup.
- **Magic-link invites** — `/?code=XXXX-XXXX` logs a guest straight in.
- **Upload** photos & videos from phone or desktop: multi-select, drag-and-drop,
  per-file progress, auto-retry, resilient chunked uploads for big videos.
- **Gallery**: responsive grid, lazy thumbnails, infinite scroll, lightbox with
  keyboard/swipe nav + pinch/double-tap zoom, video playback (with a download
  fallback for codecs a browser can't decode).
- **Live updates (SSE)** — new uploads appear on open galleries automatically.
- **Sort/filter** by date, uploader, type; **day-grouped** timeline with event
  labels (White Dinner / Wedding / Pool day).
- **Favorites** (♥) with a "Most loved" view; **comments** per item; a private
  **guestbook** (guests write, only admins read).
- **Admin**: pin photographer shots to the top, delete anything, manage guests,
  **import a CSV**, grant/revoke admin, and **email invites** one-by-one.
- **Timezone-correct**: photo EXIF times shown in the wedding's timezone even
  though the server runs elsewhere.
- **PWA**: installable to the home screen; 🪩 favicon; rich link previews.

---

## Tech stack

| Layer     | Choice                                                            | Why                                                      |
| --------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| Runtime   | **Node.js 22** (ESM)                                              | one language, modern APIs                                |
| HTTP      | **Express 4**                                                     | serves the API _and_ the built frontend from one process |
| DB        | **better-sqlite3** (WAL)                                          | synchronous, zero-ops, single file in the data dir       |
| Images    | **sharp** (+ **heic-convert** fallback)                           | thumbnails/previews, HEIC→WebP                           |
| Video     | **ffmpeg / ffprobe**                                              | poster frames + duration                                 |
| Metadata  | **exifr**                                                         | capture dates (normalized to event tz)                   |
| Uploads   | **multer** (small) + custom chunked endpoint (big)                | Cloudflare 100 MB body limit                             |
| Zip       | **archiver** (store-only, streamed)                               | bulk download without buffering                          |
| Live      | **Server-Sent Events** (plain Express)                            | one-way push; no WS deps; tunnel-friendly                |
| Email     | **Resend** (HTTP API)                                             | verified-domain invites from `mitio@mitio.tech`          |
| Frontend  | **Vanilla JS + Vite**                                             | two pages, no framework; shared wedding theme            |
| Fonts     | self-hosted **DM Serif Display / DM Sans**                        | no external font dependency                              |
| Container | **Docker** (multi-stage, `node:22-bookworm-slim` + ffmpeg + gosu) |                                                          |
| CI/CD     | **GitHub Actions → GHCR**                                         | build image in the cloud; NAS just pulls                 |
| Edge      | **Cloudflare Tunnel** (cloudflared)                               | HTTPS, no exposed ports                                  |

No frontend framework, no ORM, no message broker, no external database — the
whole thing is one Node process + one SQLite file + a folder of media.

---

## Architecture

```
Browser ──HTTPS──▶ Cloudflare Tunnel ──▶ cloudflared (NAS) ──▶ Express :3000 (container)
                                                                   │
                                          ┌────────────────────────┼─────────────────────┐
                                          ▼                        ▼                      ▼
                                    better-sqlite3            /data volume            Resend API
                                    (db.sqlite, WAL)     originals/ thumbs/ …        (invite email)
```

**Server modules** (`server/`):

| File             | Responsibility                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `index.js`       | app wiring, request log, `/api/health`, SSE endpoint, static serving + auth gate                                      |
| `config.js`      | env config (port, secret, data dir, event tz, mail, limits)                                                           |
| `db.js`          | SQLite open, schema, idempotent migrations, code generation, admin bootstrap                                          |
| `auth.js`        | login/logout/session, activation stamp, **all admin guest routes** (list, create, import, make-admin, revoke, invite) |
| `media.js`       | upload (multipart + chunked), dedupe, delete, favorite, pin, media file serving                                       |
| `processing.js`  | async queue: sharp/ffmpeg renditions, EXIF→UTC, broadcast "ready"                                                     |
| `gallery.js`     | keyset-paginated listing (sort/filter/loved/pinned), protected media routes                                           |
| `download.js`    | streamed zip (selection or all), throttled                                                                            |
| `social.js`      | media comments + guestbook notes                                                                                      |
| `email.js`       | Resend send + wedding-styled invite HTML (magic link)                                                                 |
| `events.js`      | SSE client registry + `broadcast()`                                                                                   |
| `maintenance.js` | disk info, integrity sweep, data stats (for the scripts)                                                              |

**Frontend** (`src/`): `main.js` (bootstrap), `gallery.js` (grid + live + filters),
`lightbox.js` (viewer + comments + zoom), `upload.js` (queue), `admin.js` (guest
panel), `notes.js` (guestbook), `login.js` (code + magic link).

**Data model** (`guests`, `media`, `media_reactions`, `media_comments`, `notes`):

- `guests(id, code, name, email, is_admin, revoked_at, created_at, last_seen_at, invited_at, activated_at)`
- `media(id uuid, uploader_id, filename, ext, type, size, sha256 unique, taken_at, uploaded_at, status, width, height, duration_s, pinned_at)`
- reactions/comments/notes reference media/guests with `ON DELETE CASCADE`.

**Data dir** (one backed-up folder): `originals/ thumbs/ previews/ posters/ tmp/ trash/ db.sqlite`.

---

## Develop

```bash
npm install
cp .env.example .env      # set SESSION_SECRET; email vars optional for dev
npm run dev               # Express :3000 + Vite :5173 → open http://localhost:5173
```

First boot prints a one-time **admin code**. More guests come from the in-app
**Guests** panel (create, or Import CSV).

```bash
npm run build            # Vite production build → dist/
npm start                # production server (serves dist/)
npm test                 # unit + API + security + features (node --test, ~60 tests)
```

---

## Environment variables

| Var                                                           | Purpose                                   | Default                             |
| ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| `PORT`                                                        | server port                               | `3000`                              |
| `SESSION_SECRET`                                              | cookie signing (required in prod)         | —                                   |
| `DATA_DIR`                                                    | data dir (container: `/data`)             | `./data`                            |
| `ADMIN_NAME`                                                  | first admin's display name                | `Admin`                             |
| `EVENT_TZ`                                                    | wedding timezone for photo times          | `Europe/Rome`                       |
| `PUBLIC_URL`                                                  | origin for invite links + card image      | `https://aftermath.mitio.tech`      |
| `RESEND_API_KEY`                                              | Resend key (empty → invites disabled)     | —                                   |
| `MAIL_FROM`                                                   | invite From header                        | `Mitio Tech <mitio@mitio.tech>`     |
| `HOST_PORT` / `DATA_PATH`                                     | compose: published port / NAS data folder | `3000` / `./wedding_aftermath_data` |
| `MIN_FREE_BYTES`, `UPLOAD_RATE_MAX`, `UPLOAD_RATE_WINDOW_MIN` | upload guards                             | 1 GB, 400, 10                       |

---

## Deploy (GitHub Actions → GHCR → Synology pull)

The NAS doesn't build; it pulls a prebuilt image.

1. **Push** to GitHub → `.github/workflows/build.yml` builds `linux/amd64` and
   pushes `ghcr.io/<owner>/wedding-aftermath:latest`.
2. Make the GHCR **package public** (or add registry creds in Container Manager).
3. On the NAS, put `docker-compose.prod.yml` + `.env` in the project folder →
   **Container Manager → Project → Create** (or **Action → Build** to update).
4. Add a **Cloudflare tunnel** public hostname `aftermath.mitio.tech → http://<nas>:3000`.
5. Grab the admin code once: `docker compose logs | grep "access code"`.

Full step-by-step (Cloudflare screens, first-run test, troubleshooting) is in
**`DEPLOY.md`**.

### Invite emails (Resend)

resend.com → add `mitio.tech` → add the SPF/DKIM/DMARC records in Cloudflare →
create an API key → set `RESEND_API_KEY` in `.env`. Then, in the Guests panel,
**Import CSV** (`name,email`) and click **Send invite** per guest. Codes never
expire; **Revoke** kills a guest's access immediately.

### Data-safety jobs (run in the container or via cron)

```bash
node scripts/check-backup.mjs      # alerts if media count/bytes drop unexpectedly
node scripts/integrity-sweep.mjs   # report DB↔files desyncs (--fix quarantines orphans)
node scripts/export-all.mjs /path  # dated zip of all originals, for offsite backup
node scripts/reset-admin.mjs       # regenerate the admin code (never delete db.sqlite)
```

Back up the single `DATA_PATH` folder and the whole gallery survives.

---

## Notes

- **Large videos** upload in parallel chunks (Cloudflare caps bodies at ~100 MB).
- **HEIC** iPhone photos display as WebP; originals stay downloadable.
- **Timezone**: EXIF times are interpreted in `EVENT_TZ` and shown in it.
- The boot **integrity sweep** never deletes originals (quarantines to `trash/`)
  and refuses to run if the DB looks empty/mismounted.
