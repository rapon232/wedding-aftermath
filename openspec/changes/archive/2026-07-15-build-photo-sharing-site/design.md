# Design — build-photo-sharing-site

## Context

Private photo/video exchange site for ~65 wedding guests at `aftermath.mitio.tech`. The owner already runs `wedding.mitio.tech` (a Vite + Express seating app) as a Docker container on a Synology NAS behind a Cloudflare tunnel, and wants the same operational model with media stored on the NAS. This is a personal, non-product deployment — simplicity and speed-to-deploy beat scalability and polish of internals. Visual language should follow the seating site: cream/mint/bordeaux palette, `DM Serif Display` + `DM Sans`, card-based layout.

## Goals / Non-Goals

**Goals:**

- Deploy ASAP: one container, one compose file, one tunnel hostname.
- Guests upload originals (photos + videos) easily from phone or desktop.
- Pretty, fast gallery on mobile and desktop; sort/filter by date, uploader, type.
- Original-quality downloads (single + bulk zip).
- Per-guest identity via generated access codes; zero self-service signup.
- All media and metadata live on the NAS filesystem (easy to back up: one folder).

**Non-Goals:**

- Not a product: no multi-event support, no email flows, no password reset, no rate limiting beyond basics.
- No transcoding pipeline (videos are served as uploaded; posters only).
- No face detection, albums, comments, or reactions (can come later).
- No horizontal scaling, S3, or CDN storage.

## Decisions

### D1: Stack — single Node.js (Express) app + vanilla JS/Vite frontend, SQLite metadata

**Choice:** One Express server that serves both the API and the built frontend (exactly like the seating site), `better-sqlite3` for metadata, media as plain files on a mounted NAS volume.

**Why:** Matches the proven wedding.mitio.tech pattern and the owner's familiarity; a single process/container with no DB server is the simplest thing that can work. SQLite is ideal at this scale (65 users, thousands of items) and lives in the same backed-up data folder. Vanilla JS keeps build tooling to Vite only.

**Alternatives considered:**

- _Off-the-shelf (Immich/PhotoPrism/Chevereto):_ fastest to run but can't deliver the custom wedding-themed UI, per-guest codes, or the curated simplicity wanted; heavier ops (Immich needs Postgres + Redis + ML containers).
- _Next.js/React:_ more capable but more moving parts and build complexity than needed for one gallery page + one login page.
- _JSON file persistence (like seating site):_ too fragile for concurrent uploads and thousands of rows; SQLite is the same ops footprint with real transactions.

### D2: Auth — per-guest access codes + signed session cookie

**Choice:** Admin generates one short human-typable code per guest (e.g. `MITA-7F3K`), each tied to a display name. Guest enters code once; server sets a long-lived (180-day) HttpOnly signed cookie. Admin role is a flag on the owner's code. Codes can be revoked.

**Why:** No passwords to manage or reset for 65 non-technical guests; one code fits on a WhatsApp message. Uploader identity ("who uploaded what") falls out of the session. Cloudflare tunnel already gives TLS.

**Alternatives considered:**

- _Shared single password:_ simplest but loses per-uploader attribution (a hard requirement).
- _Username+password per guest:_ double the friction and support burden for zero gain.
- _Cloudflare Access:_ offloads auth but requires managing 65 emails and breaks in-app identity.

### D3: Media pipeline — originals untouched; derived thumbnails + previews

**Choice:** Store the uploaded original byte-for-byte at `data/media/originals/`. On upload, generate with `sharp`: a ~400px thumbnail (WebP) and a ~1600px preview (WebP) for the lightbox. For videos, extract a poster frame + thumbnail with `ffmpeg` (via `ffmpeg-static` or the distro package in Docker). HEIC/HEIF originals get their derived WebP versions via `sharp` (libvips with HEIF support in the Docker image); browsers get WebP, downloads get the original HEIC. Capture date read from EXIF (`exifr`) at upload, falling back to upload time.

**Why:** Guests care about originals; browsers need small fast images. Grid loads thumbnails only → gallery stays fast on mobile even with 2000+ items. Videos play natively via HTTP Range requests (Express static handles this) — modern phones record H.264/HEVC MP4 which plays directly in browsers; no transcoding needed for a private site.

**Timezone handling:** the server runs in Sofia but the wedding was in Sicily. Photo EXIF datetimes are timezone-naive wall-clock; video `creation_time` is UTC. All `taken_at` values are normalized to true UTC at processing: EXIF times are interpreted using the camera-recorded `OffsetTimeOriginal` when present, otherwise assumed to be in `EVENT_TZ` (env, default `Europe/Rome`, DST-correct). The UI displays all times in `EVENT_TZ` so every guest sees consistent event-local times.

**Alternatives considered:**

- _On-the-fly resizing:_ simpler storage but repeated CPU cost on a NAS-class CPU; pre-generating at upload is once per file.
- _Client-side resize before upload:_ loses the original, which defeats the purpose.

### D4: Upload UX — chunk-free multipart with per-file progress, background-safe

**Choice:** Standard `multipart/form-data` uploads via `fetch` with per-file progress, files sent sequentially from a client-side queue (parallelism 2). Server uses `multer` (disk storage straight to the NAS volume, then processed). Accept large files (up to ~2 GB per file for videos). Failed files can be retried individually; already-uploaded files are deduplicated by content hash (SHA-256) so re-sending is safe.

**Why:** True resumable/chunked upload protocols (tus) are overkill; a queued retry-per-file model covers flaky phone connections with 10% of the complexity. Hash dedupe makes retries and double-taps idempotent.

**Alternatives considered:**

- _tus/resumable chunks:_ better for >2 GB files on bad networks, but adds a protocol dependency; can be added later without schema changes.

### D5: Bulk download — streaming zip

**Choice:** `archiver` streams a zip of selected media IDs (or all) directly to the response — no temp files, no memory buffering; store-only (no compression) since media is already compressed.

**Why:** NAS disk stays clean, works for multi-GB selections, trivially implemented.

### D6: Deployment — one Docker image, compose on NAS, Cloudflare tunnel hostname

**Choice:** Multi-stage Dockerfile (build frontend with Vite → runtime image `node:22-slim` with ffmpeg + libvips-heif). `docker-compose.yml` mounts `/volume1/<share>/aftermath-data:/data` (originals, derived, sqlite). Config via env: `PORT`, `SESSION_SECRET`, `DATA_DIR`. Cloudflare tunnel config gets one new ingress rule `aftermath.mitio.tech → http://localhost:<port>`.

**Why:** Identical mental model to the existing setup; the entire site's state is one folder on the NAS (already covered by NAS backups).

**Rollback:** stop container / redeploy previous image; data folder is append-mostly and safe across versions.

### D7: Frontend structure — two pages, no framework

**Choice:** `login.html` (code entry) + `index.html` (gallery + upload + admin panel for the owner). Vanilla JS modules, CSS custom properties reusing the seating-site palette. Gallery uses CSS grid masonry-style layout with `loading="lazy"` thumbnails and an IntersectionObserver-paged API (`?cursor=`). Lightbox with keyboard/swipe navigation, `<video controls>` playback. Sort/filter state in URL query params.

**Why:** Matches owner's existing codebase style; two static pages keep everything debuggable.

## Risks / Trade-offs

- **[HEIC decode support in sharp varies by build]** → Base image installs libvips with HEIF; test with a real iPhone HEIC in CI-of-one before launch. Fallback: `heic-convert` pure-JS package for the rare failure.
- **[Large video uploads through Cloudflare tunnel]** → Cloudflare free plan caps request body at ~100 MB per request. Mitigation: uploads >95 MB are sent in chunks by the client and reassembled server-side (simple ordered-chunk endpoint, not full tus); alternatively guests can be told to use Wi-Fi and the direct NAS LAN URL. Decide at implementation; chunked-append endpoint is ~40 lines.
- **[NAS CPU is weak for thumbnailing bursts]** → Process uploads in a small in-process queue (concurrency 1-2); UI shows "processing" placeholder until derived files exist.
- **[Session cookie shared via link leaks]** → Cookies are HttpOnly/SameSite=Lax; codes revocable; worst case exposure is a private wedding gallery, accepted risk.
- **[Single SQLite writer]** → Fine at this scale; WAL mode enabled; all writes go through one process.
- **[Cross-ecosystem video codecs]** iPhones record HEVC (H.265); Android/desktop Chrome can't always decode it in `<video>`. → No transcoding (non-goal on NAS hardware); instead the lightbox catches the decode error and shows the poster + a "Download video" prompt, so the clip is never lost. Same-ecosystem playback (uploaded and viewed on similar phones) works directly. Video served with explicit content types (mp4/quicktime/m4v) + HTTP Range for Android seeking.
- **[No virus scanning of uploads]** → Only invited guests upload; files are served with correct content-types and `Content-Disposition` on download; images re-encoded for display. Accepted risk.

## Migration Plan

Greenfield — no migration. Launch steps:

1. Build image, run locally with a temp data dir, smoke-test upload/browse/download on phone + desktop.
2. Copy compose file to NAS, create data share, `docker compose up -d`.
3. Add `aftermath.mitio.tech` ingress to the existing `cloudflared` config, restart tunnel.
4. Generate guest codes (admin CLI/panel), send codes to guests.

## Open Questions

- Cloudflare 100 MB body limit: confirm plan limits and whether chunked upload endpoint is needed at launch (likely yes for videos).
- Should guests be able to delete their _own_ uploads? (Cheap to add; assumed yes, admin can delete anything.)
- Max upload size cap per file (default proposal: 2 GB).
