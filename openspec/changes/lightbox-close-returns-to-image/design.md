# Design: lightbox-close-returns-to-image

## Context

Current mechanics (all in `src/`):

- Opening the lightbox adds `body.lightbox-open` (`overflow: hidden`, wrapper `visibility: hidden`) — body scroll position is *preserved*, but preserved at the tile the guest **opened**, not the one they swiped to. Swiping in the lightbox calls `loadMore` → `loadPage()`, which appends the corresponding tiles to the grid, so by close time the last-viewed tile usually *is* in the DOM already.
- `close()` (lightbox.js:907) calls `onNavigate(null)`, which clears the `#photo=` hash and — if `pinnedDirty` — calls `reload()`, wiping the grid and refetching page 1 (gallery.js:137). That path genuinely lands the guest at the top.
- Tiles carry `data-id` and `data-index`. Since the pin-in-place-with-copies change, a pinned item renders as **two** tiles with the same `data-id`: one in the featured section, one in place chronologically.
- `maybeOpenFromHash` can open a **one-item lightbox** for a deep-linked photo not in the loaded list; that view has no corresponding tile.

```
close() ──► onNavigate(null) ──► pinnedDirty? ──yes──► reload() ─► page 1 only
                │                                                (target tile may
                │ no                                              not exist yet)
                ▼
        grid untouched — last-viewed tile usually already in DOM
        (loadMore appended its page during swiping)
```

## Goals / Non-Goals

**Goals:**

- Every normal close lands the guest with the last-viewed item centered in the viewport, visually flagged for a moment.
- Works identically for all close paths (✕ button, Escape, swipe-down, backdrop rules) — they all funnel through `close()`.
- Pin-dirty reload no longer loses the guest's place.

**Non-Goals:**

- Restoring scroll position across page reloads/revisits (different feature).
- Returning to a tile from the single-item deep-link view (no grid context exists; close keeps today's behavior).
- Touching the SSE live-refresh behavior.

## Decisions

### 1. Deliver the last-viewed item through the existing `onNavigate(null)` close signal → widen to `onClosed(item)`

`close()` already tells the gallery it closed via `onNavigate(null)`. Rather than overloading that null with extra meaning, add an explicit `onClosed(lastItem)` callback fired from `close()` (before `onNavigate(null)` clears the hash). Gallery owns all scroll behavior; lightbox stays scroll-ignorant. Alternative — lightbox scrolls the grid itself — rejected: lightbox has no knowledge of pinned-copy tiles or reload timing.

### 2. Tile selection: prefer the in-place copy

`grid().querySelectorAll('.cell[data-id="<id>"]')` may match two tiles for pinned items. Choose the one **not** inside the featured/pinned section (falls back to the first match). The guest was browsing chronologically; centering the featured copy at the top would recreate the "lost my place" feeling.

### 3. Scroll mechanics: instant `scrollIntoView({ block: 'center' })` while the overlay still covers the page

Scroll synchronously inside `close()`, *after* `body.lightbox-open` is removed (window scrolling is a no-op while the body has `overflow: hidden`) but in the same task as the overlay hiding — the browser paints once, so the guest never sees the jump: the gallery is simply "already there" when it reappears. `behavior: 'smooth'` is explicitly avoided — animating a multi-thousand-pixel scroll is disorienting and fights iOS momentum scrolling.

### 4. Highlight pulse

Add a `.cell-return` class to the target tile applying a short (~1.2 s) box-shadow/outline pulse animation, removed on `animationend`. Uses the existing theme accent. Purely cosmetic affordance; no layout shift.

### 5. Pin-dirty path: page-until-found, bounded

When `pinnedDirty` forces `reload()`, the target tile may be pages deep. After the first page renders, if the target `data-id` is absent and `nextCursor` exists, keep calling `loadPage()` until the tile appears — bounded at **10 pages** to cap worst-case fetch bursts; on exhaustion, give up silently (guest is at top, same as today). The lightbox navigated within the same filtered list, so the item is reachable under the current filters in practice. Reuses `loadGen` semantics so a concurrent user-initiated reload cancels the hunt.

## Risks / Trade-offs

- [Sort is "Most loved" and a fav changed mid-lightbox → item's position may shift after pin-dirty reload] → We center whatever tile matches the id, wherever it now is; correctness over stability.
- [Page-until-found may fetch several pages on slow connections] → Bounded at 10; each page is a light JSON + thumb lazy-load; acceptable for an admin-heavy path (pinning is admin-only).
- [Deleted-in-lightbox as final action → target id no longer exists] → `onClosed` receives the *current* item after deletion advances the index (`close()` is called when the list empties); if the id matches no tile, do nothing.
- [Centering fights the browser's own scroll anchoring] → Scroll runs once, synchronously on close, after any reload rendering; no ongoing tug-of-war.

## Migration Plan

Frontend-only change inside the existing bundle; normal redeploy, instant rollback via revert. No data or API surface.

## Open Questions

None.
