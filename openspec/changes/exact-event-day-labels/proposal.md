# Proposal: exact-event-day-labels

## Why

The gallery's day headers decorate the wedding weekend ("🕊️ White Dinner Day", "💍 Wedding Day", "✨ Pool Day") by **weekday name** — so every Thursday/Friday/Saturday forever gets a special label. Photos taken on 2026-07-23 (a Thursday) are already mislabeled "White Dinner Day". Only the actual dates — 2026-07-09/10/11 — are special.

## What Changes

- `eventLabel()` in `src/gallery.js` matches the calendar date in the event timezone (`YYYY-MM-DD`) against the three literal wedding dates instead of the weekday name. All other days render as plain day headers.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none — no spec defines day-header decoration; this corrects an implementation to its obvious intent -->

## Impact

- `src/gallery.js` only (the `EVENT_DAYS` map and `eventLabel()`); no server, API, or data changes.
