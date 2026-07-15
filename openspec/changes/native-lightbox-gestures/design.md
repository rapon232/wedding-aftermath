# Design: native-lightbox-gestures

## Context

`src/lightbox.js` (~460 lines) owns the full-screen viewer. Gesture handling today:

- `setupZoom(img)` (lines 117–186) implements pinch and double-tap zoom with `transform: translate(tx,ty) scale(s)` on the `<img>`, batching writes via `requestAnimationFrame` and toggling a `.18s` transition (`smooth()`) for discrete jumps vs. live gestures. During a pinch only `scale` changes — `tx/ty` are untouched — so zoom is anchored to the image center. One-finger pan works only after the pinch ends. Pan is unclamped (photo can leave the viewport entirely). Double-tap sets `scale = 2.5` around the center. `zoomed` (module flag) suppresses swipe navigation while > 1×.
- A tap on the overlay background or `.lb-stage` closes the lightbox (or first closes the comments panel). A tap on the photo itself does nothing. Double-tap detection is a 300 ms `lastTap` timer inside `setupZoom`.
- Swipe left/right on the overlay navigates (`touchstart`/`touchend` delta > 48 px), disabled while zoomed or comments are open.

The repo has no formatter; Prettier with `printWidth 110, singleQuote` rewrites 32 files (defaults would rewrite 40 and fight the existing style). All decisions below were confirmed with the user during exploration.

## Goals / Non-Goals

**Goals:**

- Pinch zoom anchored at the finger midpoint, with two-finger pan while pinching (iPhone Photos feel).
- Focal double-tap zoom (2.5× toward the tap point); max scale stays 4.
- Pan clamped to the viewport with rubber-band overscroll and animated snap-back; elastic sub-1× pinch.
- Single tap toggles all chrome (immersive mode) on a pure-black backdrop; swipe-down closes the lightbox.
- Prettier as devDependency; one-time repo-wide reformat landed as its own commit before the feature work.

**Non-Goals:**

- No momentum/inertia panning (flick-and-glide) — clamp + rubber-band only.
- No zoom for videos; native controls keep handling video interaction.
- No desktop scroll-wheel/trackpad zoom (double-click zoom already exists and stays).
- No lint tooling (ESLint etc.) — formatting only.
- No changes to navigation, comments, favorites, pin, or download behavior beyond chrome visibility.

## Decisions

### D1: Rewrite the coordinate math inside `setupZoom`, keep its structure

The rAF write-batching and `smooth()` transition toggling already solve the jitter problem (spec: "Smooth zoom") and stay as-is. Only the gesture math changes. Alternative — adopting a gesture library (e.g. @use-gesture, hammer.js) — rejected: the site is dependency-light vanilla JS and the math is ~40 lines.

### D2: Focal-zoom math relative to the image center

With `transform: translate(tx,ty) scale(s)` and default transform-origin (element center), keeping image point under screen point `M` fixed while scale goes `s → s'`:

```
tx' = Mx − (s'/s)·(Mx − tx)
ty' = My − (s'/s)·(My − ty)
```

where `M` is measured relative to the image's untransformed center (`getBoundingClientRect()` of the stage/img at scale-reset gives the reference frame). During a pinch, `M` is the live touch midpoint; each `touchmove` also adds the midpoint delta `(M' − M)` to `tx/ty` (two-finger pan). Double-tap reuses the same formula with the tap point as `M`, `s' = 2.5`. Zoom-out to ≤ 1 resets `tx = ty = 0`.

### D3: Clamping with rubber-band, applied on release

- **Clamp bounds**: at scale `s`, the photo's rendered half-size beyond the viewport is `max(0, (s·w − vw)/2)` horizontally (same for y). `tx/ty` are clamped to ±that.
- **During the gesture**: movement past a bound is allowed but attenuated (excess multiplied by ~0.3) — the rubber-band feel.
- **On `touchend`**: if out of bounds, `smooth(true)` + snap to the clamped position. If `scale < 1` (elastic under-pinch, floored at 0.9), spring back to `scale = 1, tx = ty = 0`.

Alternative — hard clamping during the gesture — rejected per user decision (rubber-band explicitly wanted).

### D4: Immersive mode as an overlay CSS class

A module flag + `overlay.classList.toggle('lb-immersive')`. CSS hides `.lb-btn` (close/prev/next), `.lb-caption`, and `.lb-unmute` (opacity + `pointer-events: none`, short fade) and sets a pure-black backdrop. This keeps show()/navigation logic untouched — visibility rules like "hide next at the end" continue to operate under the class. State persists across `step()` (not reset in `show()`), resets to chrome-visible in `openLightbox()`. Starting a two-finger touch enters immersive. Videos: the class hides our chrome the same way, but no tap-toggle is attached to the video element — native controls own taps on it; a tap on the background around a video still toggles.

### D5: Single-tap detection debounced against double-tap, in one place

Tap handling moves to a single stage-level handler: on a clean tap (no move > ~10 px, single finger, short duration), wait 300 ms; if a second tap lands in that window it's the double-tap (zoom), otherwise toggle immersive. The existing `lastTap` logic in `setupZoom` folds into this handler so photo-taps and background-taps behave identically. With comments open, a tap still closes the panel first (existing rule, kept). The overlay `click`-to-close handler is removed.

### D6: Swipe-down-to-close with drag feedback

On a single-finger vertical drag starting unzoomed (`scale === 1`): translate the stage content with the finger, fade the backdrop proportionally, and on release close if the drag exceeded ~25% of viewport height (else spring back). Vertical intent is decided by initial direction (|dy| > |dx| within the first ~10 px) so it doesn't fight horizontal swipe-nav. Disabled while zoomed or while the comments panel is open. Esc and the X button remain.

### D7: Prettier lands first as an isolated commit

`prettier@^3` devDependency; `.prettierrc` `{ "printWidth": 110, "singleQuote": true }`; `.prettierignore` with `dist/`, `data/`, `node_modules/`, `package-lock.json`; scripts `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. One commit contains config + reformat of everything; `.git-blame-ignore-revs` records that commit's hash (requires a follow-up amend or second tiny commit, since the hash isn't known until committed — use the second-commit approach, no history rewriting). Feature work starts only after this lands, keeping its diff clean.

## Risks / Trade-offs

- [Losing tap-background-to-close breaks a learned habit] → Swipe-down-to-close plus the always-available X/Esc replace it; this matches the iOS convention guests already know.
- [300 ms tap debounce makes chrome toggle feel slightly delayed] → Inherent to double-tap coexistence; iOS has the same delay. Keep the window tight (300 ms) and animate the chrome fade so it feels intentional.
- [Gesture regressions are easy to introduce and hard to unit-test] → Manual on-device verification checklist in tasks (iPhone Safari + Android Chrome); the math is kept in small pure helpers (`clampPan`, `focalAdjust`) that unit tests in `test/unit.test.mjs` can cover if extracted — extraction is optional, checklist is mandatory.
- [Repo-wide reformat pollutes `git blame`] → `.git-blame-ignore-revs` + standalone commit; GitHub honors the file automatically, local git needs `blame.ignoreRevsFile` config (documented in README is unnecessary — note in commit message instead).
- [Swipe-down vs. vertical pan conflict when zoomed] → Swipe-down only arms at `scale === 1`; when zoomed, vertical drags are pans.
- [Video element swallows taps] → Accepted: native controls are the better UX for video; our chrome still hides/shows via background taps and the immersive class.
