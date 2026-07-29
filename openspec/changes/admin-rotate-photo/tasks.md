# Tasks: admin-rotate-photo

## 1. Server

- [x] 1.1 `server/db.js`: `ensureColumn` migration for `media.rev INTEGER NOT NULL DEFAULT 0`
- [x] 1.2 `server/processing.js`: export `photoRenditions`
- [x] 1.3 `server/media.js`: `POST /api/admin/media/:id/rotate` — eligibility checks (photo, ready, jpg/jpeg/png/webp), two-pass sharp rewrite to temp + rename, regenerate renditions, update width/height/size and bump rev, return `{ok, width, height, rev}`
- [x] 1.4 `server/gallery.js` + `server/media.js`: include `m.rev` in the listing and single-item SELECTs

## 2. Client

- [x] 2.1 `src/lightbox.js`: rotate button (admin-only, eligible photos only) next to pin; handler POSTs, mutates item, re-renders stage, fires `onRotated`
- [x] 2.2 `src/gallery.js`: append `?v=<rev>` to thumb URLs when `rev > 0`; wire `onRotated` to refresh that item's grid thumbnails; lightbox preview/file URLs get the same busting

## 3. Verification

- [x] 3.1 Black-box test (`test/rotate.test.mjs`): upload a 400×300 JPEG → admin rotate → dims become 300×400 and rev=1; four rotations restore 400×300; non-admin gets 403; second admin rotate returns rev=2
- [x] 3.2 `npm test` + `npm run build` green; puppeteer or manual check that the lightbox button rotates the visible image
