# #LoveWins. The Aftermath

A small, private photo & video exchange for our wedding guests — served at
`aftermath.mitio.tech`. Guests sign in with a personal code, browse the shared
gallery, upload their own photos/videos, and download originals. All media and
metadata live on the NAS; nothing goes to a third party.

Sibling project to `wedding.mitio.tech` (the seating plan) and deployed the same
way: one Docker container on the Synology NAS behind a Cloudflare tunnel.

## Stack

- **Server**: Node.js + Express (one process, serves API + built frontend)
- **Storage**: originals + derived renditions on disk; metadata in SQLite (WAL) — all under one `DATA_DIR`
- **Media**: `sharp` for thumbnails/previews (HEIC via `heic-convert` fallback), `ffmpeg` for video posters, `exifr` for capture dates
- **Frontend**: vanilla JS + Vite, wedding theme shared with the seating site
- **Auth**: per-guest access codes → signed HttpOnly session cookie (180 days)

## Develop

```bash
npm install
cp .env.example .env      # dev works without editing, but set SESSION_SECRET to silence the warning
npm run dev               # Express :3000 + Vite :5173 (open http://localhost:5173)
```

On first boot an admin guest is created and its access code is printed **once**
to the console. More guest codes are created from the in-app **Guests** panel
(admin only).

Other scripts:

```bash
npm run build   # Vite production build → dist/
npm start       # run the production server (serves dist/)
npm test        # unit + API + security suite (node --test)
```

## Tests

`npm test` boots the real app on ephemeral ports against throwaway data dirs and
runs three suites: **unit** (timezone/EXIF, code generation), **API-integration**
(auth, upload, listing, download, pin), and **security** (SQL injection, path
traversal, authz/IDOR, brute-force throttle, cookie hygiene). Run it as a gate
before every deploy.

## Deploy (Synology NAS + Cloudflare tunnel)

```bash
# on the NAS, in the project directory
cp .env.example .env
#  → set SESSION_SECRET  (openssl rand -hex 32)
#  → set ADMIN_NAME, EVENT_TZ, HOST_PORT, DATA_PATH as needed
docker compose up -d --build
docker compose logs | grep "access code"     # grab the admin code once
```

Then add a Cloudflare tunnel ingress rule mapping
`aftermath.mitio.tech → http://<nas-host>:<HOST_PORT>` and restart `cloudflared`.

**Backups**: everything the site knows lives in the `DATA_PATH` folder
(originals, derived renditions, `db.sqlite`). Back up that one directory.

### Data-safety jobs

Run these on the NAS (or `docker compose exec aftermath …`):

```bash
DATA_DIR=/data node scripts/check-backup.mjs      # alerts if media count/bytes drop unexpectedly
DATA_DIR=/data node scripts/integrity-sweep.mjs   # report DB↔files desyncs (--fix to repair)
```

Suggested cron on the NAS (daily backup verification):

```cron
0 3 * * *  cd /path/to/app && DATA_DIR=/data node scripts/check-backup.mjs >> /var/log/aftermath-backup.log 2>&1
```

An integrity sweep also runs automatically at container start, repairing any
desync left by a crash mid-upload. Point an external uptime monitor
(UptimeRobot, Cloudflare Health Check) at `/api/health` so a crashed container
alerts you — it reports `{ ok, media, uptimeSec, diskFreeGb }`.

Uploads are guarded: they’re refused with a friendly message when the volume is
low on space (`MIN_FREE_BYTES`, default 1 GB) and rate-limited per guest
(`UPLOAD_RATE_MAX` per `UPLOAD_RATE_WINDOW_MIN`, default 400/10 min) so one
person can’t flood the NAS.

### Notes

- **Large videos**: Cloudflare caps request bodies at ~100 MB. The client
  automatically switches to a chunked upload path for files above ~90 MB, so
  guests can upload big phone videos without hitting the limit.
- **Timezone**: the server may run anywhere (e.g. Sofia); photo EXIF times are
  interpreted in `EVENT_TZ` (the wedding's timezone) and displayed in it, so
  everyone sees consistent event-local times.
- **HEIC**: iPhone HEIC/HEIF photos are converted to WebP for display while the
  original stays downloadable.
