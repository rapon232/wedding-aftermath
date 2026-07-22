# Proposal: lightbox-close-returns-to-image

## Why

Closing the lightbox strands guests: the grid sits wherever it was when they *opened* it — potentially hundreds of photos behind the image they swiped to — and if they pinned/unpinned anything, the close-triggered grid reload dumps them at the very top. In a gallery of many hundreds of items, guests lose their place and have to hunt for where they were.

## What Changes

- On lightbox close, the gallery scrolls the tile of the **last-viewed** item into the center of the viewport (instant, not smooth — the lightbox overlay hides the jump), with a brief highlight pulse so the eye lands on the right tile.
- When an item is pinned it exists as two tiles (featured copy + in-place copy); the scroll targets the **in-place** copy, matching the guest's browsing position.
- The pin-dirty close path (grid `reload()` on close) additionally pages the grid forward until the target tile exists, bounded best-effort, then centers it.
- The single-item deep-link view (opened from a `#photo=` link with no grid context) has no tile to return to — close behaves as today.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `gallery-browse`: adds a requirement that closing the lightbox returns the guest to the last-viewed item in the grid (new concern — existing lightbox requirements unchanged).

## Impact

- `src/lightbox.js`: `close()` reports the current item to the gallery (new `onClosed(item)` callback or via the existing `onNavigate(null)` path carrying the last item).
- `src/gallery.js`: new scroll-to-tile logic on close; the `pinnedDirty` reload path gains a "page until found, then center" step.
- `src/style.css`: a short highlight-pulse animation for the target tile.
- No server, API, or data changes.
