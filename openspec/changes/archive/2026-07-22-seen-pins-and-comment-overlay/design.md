# Design: seen-pins-and-comment-overlay

## Context

- **NEW badges** are time-based: `isNew()` (src/gallery.js:422) compares `uploaded_at` to `me.lastSeen`, so every badge disappears on the guest's next visit regardless of what they viewed. The header `newCount` (server/gallery.js:127) uses the same definition.
- **Pinning** (`POST /api/admin/media/:id/pin`, server/media.js:294) sets `pinned_at` and broadcasts SSE `refresh`. The gallery's paged list excludes pinned items (`m.pinned_at IS NULL`, server/gallery.js:60); the first page carries `body.pinned` rendered as a separate "✦ Pinned" section. The lightbox `togglePin` closes the lightbox and `onPinned()` reloads the gallery.
- **Comments** are lazy: the listing carries only `comment_count`; bodies are fetched when the panel opens. The gallery-browse spec explicitly requires _no comment fetch on every swipe_ (it janked mobile before).
- The SSE handler defers refreshes while `body.lightbox-open` (shows the live pill instead of yanking the grid).

## Goals / Non-Goals

**Goals:** per-guest per-item NEW persistence with grandfathering; pin-in-place from the lightbox with the original staying in the sort; latest-comments overlay on the photo without per-swipe fetches; the sassy empty-panel copy.

**Non-Goals:** read-receipts UI (who saw what is not surfaced to anyone); unpinning flows beyond the existing toggle; full live comment streaming (overlay updates come from listing data + own posts, plus whatever the existing refresh already does); overlay on videos is included only where it doesn't fight native controls (it doesn't — it's pointer-transparent).

## Decisions

### D1 — `media_seen` table, written from the lightbox's navigate hook

`CREATE TABLE IF NOT EXISTS media_seen (media_id TEXT, guest_id TEXT, seen_at TEXT, PRIMARY KEY (media_id, guest_id))` in server/db.js alongside the existing migrations. The lightbox already calls `onNavigate(item)` for every item shown — main.js's handler additionally fires `POST /api/media/:id/seen` (fire-and-forget; a session-scope `Set` dedupes repeats so swiping back and forth doesn't re-POST). `INSERT OR IGNORE` makes it idempotent server-side. Endpoint lives in server/social.js next to reactions/comments. Alternative — batching into one periodic POST — rejected: one tiny insert per first-view is well within this app's traffic, and immediate writes survive tab closes.

### D2 — Grandfather at migration time, not at query time

One-time seeding when the table is first created: for every guest with `last_seen_at`, insert seen rows for all ready media with `uploaded_at <= last_seen_at`. This reproduces the old semantics ("you've been here; the past isn't new") in data, keeping the listing query a plain `EXISTS`. Query-time OR-conditions against `last_seen_at` forever were rejected — they'd freeze the meaning of `last_seen_at`, which keeps updating.

### D3 — `seen` flag and badge

Listing `cols` gains `EXISTS(SELECT 1 FROM media_seen s WHERE s.media_id = m.id AND s.guest_id = ?) AS seen` (guest id is already the first bound param pattern — this adds a second). Client `isNew(item)` becomes `!item.seen && item.uploader_id !== me.id`. `newCount` switches to counting unseen, not-own, ready media. `last_seen_at` keeps its other uses untouched.

### D4 — Originals stay in the stream; pinned section holds copies

Drop `'m.pinned_at IS NULL'` from `listFilters`. `body.pinned` is unchanged. The same id may now appear twice in the rendered grid (pinned copy + chronological original) — cells are index-based (`dataset.index`), so lightbox opening, deletion sync (`removeItem` walks all matching cells), and fav updates already tolerate duplicates; verify `removeItem`/fav-sync update _all_ cells for an id, not just the first. Both copies get the `.pinned` ring.

### D5 — Pin from the lightbox: local flip + deferred grid reload

`togglePin` no longer closes: on 200 it sets `item.pinned_at` locally, updates the button (`.active`, aria-label), and plays a brief scale-settle animation (the "lerp": ~1 → 1.15 → 1 with the mint state fading in; honors reduced-motion). `onPinned` semantics change from "reload now" to "mark dirty": gallery sets a flag and reloads when the lightbox closes (`onNavigate(null)` is the existing close signal). The SSE `refresh` broadcast still updates other clients; for the pinning admin the SSE path is already deferred-while-open, and the dirty-flag reload covers them at close. Double reload (pill + flag) is debounced by the existing `liveTimer`/reload structure.

### D6 — Overlay data rides in the listing (no per-swipe fetch)

`server/gallery.js` attaches `comments_preview` — the latest up to 3 comments (`guest_name`, `body`) per item — via one batched query per page: `SELECT ... FROM media_comments WHERE media_id IN (page ids) ORDER BY created_at DESC` grouped in JS, capped at 3 per id (page size is bounded, so this stays one small indexed query; a correlated `json_group_array` subquery was the alternative — the batched query is plainer SQL and easier to cap). Applied to both the paged rows and `body.pinned`. The lightbox renders the overlay from `item.comments_preview`; posting a comment unshifts into it (and renderComments already updates counts); the panel's full thread remains lazy exactly as before.

### D7 — Overlay presentation

A `div.lb-live` absolutely positioned bottom-left above the caption bar, `pointer-events: none` (taps, double-taps, pinches and swipes pass through untouched). Up to 3 rows, each one line: serif italic guest name in cream, body in translucent cream, ellipsized (`max-width` ~70vw). Text-shadow/scrim for legibility over bright photos — no boxed background, it should read like live-chat captions, not a panel. It is chrome: `lb-immersive` hides it with everything else (existing rule extends), and it hides while the comments panel is open. Newest at the bottom, oldest fading slightly (opacity step per row) — the "live" feel.

### D8 — Copy

`'No comments yet — say something sweet ♥'` → `'No comments yet — say something sassy ✨'` (src/lightbox.js renderComments).

## Risks / Trade-offs

- [Seen writes add a request per first-view] → tiny INSERT OR IGNORE, deduped client-side; acceptable at wedding-gallery scale.
- [Duplicate ids in the grid could confuse id-keyed updates] → audit `removeItem`, fav/comment badge sync, and `#photo` deep-links to handle multiple cells per id; deep-link opens the first (chronological behavior preserved via index).
- [Listing payload grows with 3 comments × page] → bodies are capped at 1000 chars but typical comments are short; preview could truncate server-side to ~140 chars per comment to bound the page.
- [Overlay over busy photos can be unreadable] → text-shadow + gradient scrim at the photo's bottom edge; small font keeps it subordinate.
- [Admin's grid reload on close discards scroll position] → reload() already preserves filters; scroll stays where the guest was — same behavior as today's post-pin reload, minus the surprise mid-viewing.
