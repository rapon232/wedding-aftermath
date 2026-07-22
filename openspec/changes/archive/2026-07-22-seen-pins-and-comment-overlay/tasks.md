# Tasks: seen-pins-and-comment-overlay

## 1. Seen tracking (server)

- [x] 1.1 `media_seen` table (media_id, guest_id, seen_at; PK media_id+guest_id) in server/db.js, with one-time grandfather seeding: for each guest with `last_seen_at`, mark all ready media with `uploaded_at <= last_seen_at` as seen
- [x] 1.2 `POST /api/media/:id/seen` in server/social.js — validated id, `INSERT OR IGNORE`, 204; no admin requirement
- [x] 1.3 Listing gains `seen` flag (EXISTS subquery on media_seen for the current guest) in server/gallery.js cols; `newCount` becomes the count of unseen, not-own, ready media
- [x] 1.4 Tests: seen endpoint idempotency + auth, `seen` flag in listing per guest, newCount definition, grandfathering seed

## 2. Seen tracking (client)

- [x] 2.1 main.js onNavigate handler POSTs seen (fire-and-forget) with a session-scope dedupe Set; lightbox change not needed beyond the existing callback
- [x] 2.2 `isNew()` in src/gallery.js becomes `!item.seen && item.uploader_id !== me.id`; badge and header count render from the new data

## 3. Pin in place

- [x] 3.1 Remove `'m.pinned_at IS NULL'` from listFilters in server/gallery.js so originals stay in the paged stream; pinned section (`body.pinned`) unchanged; test pinned-item-appears-in-both
- [x] 3.2 Audit duplicate-id handling in src/gallery.js (removeItem, fav/comment badge sync, deep-links) so both the pinned copy and the original update together
- [x] 3.3 Lightbox togglePin: no close, no immediate reload — update `item.pinned_at` locally, flip `.active` + aria-label, play a short scale-settle animation on the button (reduced-motion safe)
- [x] 3.4 `onPinned` semantics: gallery marks itself dirty and reloads when the lightbox closes (`onNavigate(null)`), deduped against the SSE-refresh pill path

## 4. Comment overlay

- [x] 4.1 Listing attaches `comments_preview` (latest ≤3 comments: guest_name + body truncated ~140 chars) via one batched query per page in server/gallery.js, for paged rows and `body.pinned`; test shape and cap
- [x] 4.2 Lightbox renders `div.lb-live` bottom-left (pointer-events none, up to 3 single-line rows, serif italic name + translucent body, text-shadow/scrim, older rows slightly faded); re-renders on show()
- [x] 4.3 Overlay hides in `lb-immersive` and while the comments panel is open; posting a comment updates `comments_preview` and the overlay immediately
- [x] 4.4 Empty-panel copy → "No comments yet — say something sassy ✨"

## 5. Verification

- [x] 5.1 `npm test`, `npm run build`, `npm run format:check` green; extend the mobile smoke: NEW badge clears after lightbox view, pin keeps the lightbox open with button state change, overlay visible with preview data / hidden in immersive, gestures unaffected over the overlay
- [x] 5.2 On-device pass (iPhone): badges persist across reload until viewed, pin lerp feel, overlay legibility over bright photos — verified through a week of daily real-world use on the live site
