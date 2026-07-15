# Design: lightbox-polish-follow-ups

Retrospective — decisions as implemented (commits `0eae4ba..8eafda8`).

## Context

`native-lightbox-gestures` shipped focal touch gestures, immersive mode, and swipe-down-to-close. Real-device use on Mac and iPhone surfaced desktop and polish gaps; each fix landed as its own commit with smoke-test coverage.

## Goals / Non-Goals

**Goals:** make desktop zoom feel native, fix the tween and hairline bugs, route mobile Save toward the photo library, unify the action row with the chrome's design language, unglue the mobile header.

**Non-Goals:** momentum panning, video zoom, any server/API changes, lint tooling.

## Decisions

- **D1 — Desktop pinch via ctrl+wheel + gesture events, gated by touch support.** Chrome/Firefox deliver trackpad pinch as `wheel` with `ctrlKey`; Safari delivers `gesturestart/change/end`. Gesture handlers attach only when `!('ontouchstart' in window)` because iOS fires them alongside touch events and the pinch would double-apply. Both funnel into one `desktopZoom(x, y, factor)` using the same focal anchor formula as touch, hard-clamped (no rubber — there is no release moment on a wheel stream). `preventDefault` on ctrl+wheel at both the image and overlay stops browser page zoom while the lightbox is open.
- **D2 — Desktop pan: plain wheel + mouse drag.** Wheel-zoom alone leaves desktop users stranded on a clamped centre; two-finger scroll pans (clamped), mouse drag pans with the touch rubber-band + `settle()`. A drag's trailing `click` is suppressed via a 50ms timestamp window so it cannot toggle immersive.
- **D3 — Chrome restore only on true return-to-fit.** `setImmersive(false)` runs on double-tap/double-click reset and when a gesture ends at/under scale 1 — but not in `settle()` for a plain tap (scale already 1), which would fight the tap-toggle. Caught by a smoke assertion.
- **D4 — Tween survival.** Double-tap zoom-in uses `cubic-bezier(.34, 1.56, .64, 1)` (easeOutBack). Two same-frame killers fixed: the touchstart fall-through into pan-arming (`smooth(false)`) and the tap's own touchend running `settle()` (`smooth(true)` swapped the curve). Early-return plus a `tapZoomed` flag skip both; the smoke test asserts the springy transition survives to paint.
- **D5 — Hairline: hide what peeks instead of patching seams.** Third iOS compositing-seam variant in this codebase. While open: `body.lightbox-open .wrapper { visibility: hidden }` (keeps layout + scroll position) and body background matches the lightbox, so any seam anywhere renders dark-on-dark.
- **D6 — Save via Web Share.** Browsers cannot write to the photo library; `navigator.share({ files })` opens the sheet with "Save Image/Video". Gated on touch + `canShare`; original fetched as a File ("Saving…" label meanwhile); `AbortError` (user cancelled) is a no-op; anything else falls back to the download URL. Known caveat: very large videos may exceed Safari's transient-activation window → fallback download.
- **D7 — One icon language for the action row.** The chrome (close/prev/next) already used frosted glass + 2px stroke SVGs; the action row's emoji and yellow pin broke it. All five actions became full glass pills (radius 999px, backdrop blur) with feather/lucide-style stroke icons. States from the palette only: faved = blush-filled heart (`--bordeaux-pale`) over bordeaux-tinted glass; pinned = mint tint + ring (`--mint*` — the site's curation accent, echoing the toolbar). Delete keeps soft rose text, now distinct from faved. The unmute pill joined the language (line speaker icon, flex-centred).
- **D8 — Header grid.** ≤640px the four header buttons become a full-width `repeat(2, 1fr)` grid with centred, nowrap labels — flex min-width kept the old row from shrinking and it overflowed the viewport edge.

## Risks / Trade-offs

- [Safari desktop `gesturechange` path unverified in CI] → Chromium ctrl+wheel path smoke-tested; gesture path is the same math, needs one manual Safari pinch.
- [Share-sheet Save costs one extra tap vs direct save] → platform limit; the sheet is the only route into the photo library from the web.
- [Swipe-down dismissal now reveals plain dark instead of the gallery] → consequence of D5; judged cleaner.
- [Emulated backdrop-blur rendering differs slightly from device] → screenshots reviewed; final look confirmed on device by the user.
