# Tasks: exact-event-day-labels

## 1. Fix

- [x] 1.1 `src/gallery.js`: re-key `EVENT_DAYS` by `YYYY-MM-DD` (2026-07-09/10/11) and change `eventLabel()` to format the date with `en-CA` in the event timezone

## 2. Verification

- [x] 2.1 Sanity-check `eventLabel` mapping: the three wedding dates decorate, 2026-07-23 (Thursday) does not; `npm run build` green
