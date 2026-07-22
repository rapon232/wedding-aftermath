# Tasks: lightbox-close-returns-to-image

## 1. Lightbox → gallery close signal

- [x] 1.1 In `src/lightbox.js`, add an `onClosed` callback to `initLightbox` config (default no-op) and fire `onClosed(list[idx])` at the top of `close()`, before the stage is cleared and `onNavigate(null)` runs
- [x] 1.2 Guard the single-item deep-link view: when the lightbox was opened with the one-item list (no gallery context), `onClosed` still fires but the gallery finds no tile and does nothing — verify no error path

## 2. Gallery scroll-to-tile

- [x] 2.1 In `src/gallery.js`, implement `returnToTile(id)`: query `.cell[data-id]` matches, prefer the tile **outside** the featured/pinned section, `scrollIntoView({ block: 'center' })` (instant), and apply the highlight class
- [x] 2.2 Wire `onClosed` in `initLightbox` config: normal close path calls `returnToTile(item.id)` directly; pin-dirty path stores the id and runs the reload flow first
- [x] 2.3 Pin-dirty path: after `reload()`'s first page renders, loop `loadPage()` (respecting `loadGen` cancellation) until the target `data-id` exists or 10 pages are exhausted, then `returnToTile(id)`; give up silently on exhaustion

## 3. Highlight pulse

- [x] 3.1 Add a `.cell-return` animation in `src/style.css` (~1.2 s accent outline/box-shadow pulse, no layout shift) and remove the class on `animationend`

## 4. Verification

- [x] 4.1 Puppeteer smoke test against the real server (per the browser-smoke-testing recipe): open a tile, navigate several items forward, close — assert the last-viewed tile is within the viewport and roughly centered
- [x] 4.2 Puppeteer: pin an item as admin in the lightbox, close — assert the grid reloaded and the last-viewed tile ends up centered (in-place copy, not the featured one)
- [ ] 4.3 Manual on-phone check after deploy: swipe deep into the gallery, close, confirm you land on the right photo with the pulse; repeat from a `#photo=` deep link to confirm unchanged behavior
