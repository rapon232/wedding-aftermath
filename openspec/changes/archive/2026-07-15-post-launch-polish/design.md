# Design — post-launch-polish

## Overriding constraint: live data

The app is in production with real guest uploads. Every decision below is additive and non-destructive. No schema migrations are needed (all columns already exist). The only write to existing data is the video `taken_at` backfill, designed to be reversible-by-backup and file-safe.

## Video metadata — grounded in a real device file

Probing a real upload, `IMG_6970.MOV` (iPhone 17 Pro Max), shows the capture metadata **is present and correct** in the file:

```
format.duration                        = 65.2267            (→ duration_s = 65)
format.tags.creation_time              = 2026-07-11T19:01:14Z     (UTC instant)
format.tags.com.apple.quicktime.creationdate = 2026-07-11T21:01:14+0200  (true local, WITH offset)
stream[0].duration                     = 65.2267            (also present on the stream)
stream[0].tags.creation_time           = 2026-07-11T19:01:14Z
```

Implications:

1. The file is not the problem — the couple's phones record both duration and a timezone-correct capture date. So a video showing its **upload** date means the extracted value isn't being applied in production (either the deployed code that processed it didn't extract, or the probe isn't landing on the NAS). This is confirmed by the reported missing duration badge — the same probe feeds `duration_s`.
2. `com.apple.quicktime.creationdate` is the best source: it carries the real local wall-clock **and** the UTC offset (`+0200`), so it needs no `EVENT_TZ` guessing. Prefer it; fall back to `format`/`stream` `creation_time` (UTC `Z`); only if a value is naive (no offset/Z) interpret it in `EVENT_TZ` via the existing `wallClockToUtc`.
3. Read from **both** `format` and `stream` (`-show_entries format=duration:format_tags:stream=duration:stream_tags`) so containers that only populate one still yield data.
4. Stop swallowing probe errors silently — log when a probe returns no duration/date, so production gaps are visible.

### Why the backfill is the actual fix for what the user sees

The already-uploaded videos have `taken_at = upload time` baked in. Re-processing won't touch `status='ready'` rows, so a one-off backfill that **re-probes the originals** and updates `taken_at` is what corrects the live gallery. Because it re-runs the corrected extraction, it fixes those videos regardless of *why* they were wrong originally.

### Backfill safety (file integrity)

```
ffprobe        → READ-ONLY (opens file to read metadata; cannot modify it)
db.sqlite      → backed up to db.sqlite.bak-<date> before any write
--dry-run      → default; prints old→new per video, writes nothing
apply          → UPDATE media.taken_at only when a valid date is found; else skip
NEVER          → move / rename / re-encode / delete originals, posters, thumbs, previews
resort         → automatic; gallery already ORDER BYs taken_at, no file movement
```

A quick production diagnostic settles whether the *parser* also needs deploying vs. only the backfill: in the container, run the probe on one uploaded original and `SELECT status, duration_s, taken_at, uploaded_at FROM media WHERE type='video'`. Either way the parser hardening + backfill together are correct.

## Lightbox navigation bounds

Root cause: `lightbox.js` shows the next arrow when `opts.loadMore` merely *exists* (always a function → always truthy). Replace with a `hasMore()` predicate returning `!!nextCursor`. Prev shows for `idx > 0`; next shows for `idx < list.length-1 || hasMore()`. Fixes the dead end-arrow in filtered and unfiltered views alike.

## Smooth zoom

`setupZoom` writes `img.style.transform` on every `touchmove`. Coalesce into one `requestAnimationFrame` per frame, add `will-change: transform` while zoomed, and apply a transition only on release/reset. Keep swipe-nav suppressed while zoomed.

## Comments panel

Two fixes: (1) load comments **lazily** — only when the panel opens for an item — instead of on every navigation (the per-swipe fetch is the phone hang); the count badge stays cheap since the listing already returns `comment_count`. (2) Round `.lb-comments-close` (currently `30×30` with no radius).

## Explicitly rejected

- **Communal favorite hearts.** Considered making the heart pink whenever `fav_count > 0`. Decision: **keep personal semantics** (pink = the current guest favorited it). No change to favorite rendering.

## Add guest by name + email

`POST /api/admin/guests` currently ignores email. Extend it to accept an optional `email` for a single-guest create (reuse `isEmail`, dedupe by email + name like the import route). The multi-name textarea keeps working (names without email allowed). The panel gains an inline name + email field so an invite can be sent immediately without CSV.
