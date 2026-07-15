# Tasks — post-launch-polish

> Live system with real guest data. Additive-only, non-destructive. Back up `db.sqlite` before the backfill.

## 1. Lightbox navigation bounds (gallery-browse)

- [x] 1.1 Replace the `opts.loadMore`-existence check with a `hasMore()` predicate (is there another page, i.e. `nextCursor` non-null) passed from `gallery.js`
- [x] 1.2 `lb-prev` visible only when `idx > 0`; `lb-next` visible only when `idx < list.length-1 || hasMore()`
- [x] 1.3 Verify with an uploader filter that yields a small set: no ghost next arrow on the last item; no ghost prev on the first

## 2. Lightbox control centering (gallery-browse)

- [x] 2.1 Center the prev/next/close glyphs (replace `‹ › ✕` text with inline SVG icons, or lock `line-height:1` + flex centering) so they sit dead-center in the round buttons
- [x] 2.2 Center the prev/next buttons relative to the media stage (account for the caption bar) so they read as vertically centered
- [x] 2.3 Check on mobile + desktop, including notch/safe-area

## 3. Smooth pinch/pan zoom (gallery-browse)

- [x] 3.1 In `setupZoom`, coalesce `transform` writes into a single `requestAnimationFrame` (drop redundant writes per touch event)
- [x] 3.2 Add `will-change: transform` while zoomed; remove it when reset
- [x] 3.3 Apply a short transition only on release/reset (not during the gesture)
- [x] 3.4 Confirm swipe-to-navigate still suppresses while zoomed

## 4. Uploader name → filter link (gallery-browse)

- [x] 4.1 Render `.lb-by` as a button/link carrying `uploader_id`
- [x] 4.2 On click: close the lightbox, set the gallery uploader filter, sync URL, reload
- [x] 4.3 Ensure the resulting filtered lightbox uses the corrected nav bounds from group 1

## 5. Comments panel smoothness (gallery-browse)

- [x] 5.1 Load comments lazily — only when the panel is first opened for an item, not on every navigation; keep the count badge cheap (already returned by the listing)
- [x] 5.2 Cache/clear per-item so switching items doesn't refetch needlessly or show stale comments
- [x] 5.3 Round the `.lb-comments-close` button (border-radius: 50%), matching the other round controls
- [x] 5.4 Verify no jank/hang when opening/closing the panel repeatedly on a phone

## 6. Video metadata extraction (media-upload)

- [ ] 6.1 Run `ffprobe` on a real phone video (from the user) to confirm where duration + creation date live (format vs stream, which tag, timezone)
- [ ] 6.2 Probe `format` **and** `stream` entries; take duration from whichever is present
- [ ] 6.3 Read capture date from `format_tags.creation_time`, `stream_tags.creation_time`, and `com.apple.quicktime.creationdate`; prefer the tag that carries a timezone offset
- [ ] 6.4 Timezone handling: trust an explicit offset/`Z`; interpret a naive timestamp in `EVENT_TZ` (reuse the photo path's `wallClockToUtc`)
- [ ] 6.5 Log (not swallow) when a probe yields no duration/date, so gaps are visible in logs
- [ ] 6.6 Confirm the thumbnail duration badge now renders (listing already returns `duration_s`)

## 7. Video taken_at backfill (media-upload) — non-destructive

- [ ] 7.1 One-off script: iterate `type='video'` rows; re-probe each original with the group-6 logic (read-only)
- [ ] 7.2 `--dry-run` (default): print `filename: old taken_at → new taken_at` for each, write nothing
- [ ] 7.3 Backup: copy `db.sqlite` → `db.sqlite.bak-<date>` before any write
- [ ] 7.4 Apply mode: `UPDATE media SET taken_at = ? WHERE id = ?` only when a valid capture date is found; skip otherwise. Never touch originals/posters/thumbs/previews
- [ ] 7.5 Idempotent + safe to re-run; log a summary (updated / skipped / unchanged)
- [ ] 7.6 Verify gallery re-sorts videos to their true date after apply (no file moves)

## 8. Add guest by name + email (guest-invites)

- [ ] 8.1 Extend `POST /api/admin/guests` to accept an optional `email` for a single-guest create (validate with the existing `isEmail`, dedupe by email + name)
- [ ] 8.2 Admin panel: an inline name + email input for adding one guest, so an invite can be sent immediately without CSV
- [ ] 8.3 Keep the existing multi-name textarea working (names without email still allowed)
- [ ] 8.4 After creating with an email, the row's "Send invite" button is available

## 9. Validation & deploy

- [ ] 9.1 `npm run build` clean; existing test suite green; add/adjust tests where practical (nav-bounds predicate, create-with-email)
- [ ] 9.2 Verify no secrets in tracked files before each commit
- [ ] 9.3 Deploy via GHCR pull → Container Manager recreate; then run the backfill dry-run, review, and apply
