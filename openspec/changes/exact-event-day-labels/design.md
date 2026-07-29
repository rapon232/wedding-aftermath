# Design: exact-event-day-labels

## Context

`EVENT_DAYS` in `src/gallery.js` is keyed by `Intl` weekday name and consulted for every day header. The wedding weekend was Thu 2026-07-09, Fri 2026-07-10, Sat 2026-07-11 (confirmed from the production media distribution: 160/391/146 photos).

## Goals / Non-Goals

**Goals:** special labels appear on exactly those three dates, evaluated in the event timezone.
**Non-Goals:** making the dates configurable (one-off event app; hardcoding matches the codebase's style).

## Decisions

- Key `EVENT_DAYS` by `YYYY-MM-DD` strings and derive the lookup key with `Intl.DateTimeFormat('en-CA', { timeZone: eventTz, ... })` — `en-CA` formats as `YYYY-MM-DD` natively, and using the event timezone keeps late-night photos (UTC spillover) on the correct local day, consistent with the day-grouping headers themselves.

## Risks / Trade-offs

- [Hardcoded dates] → intrinsic to a single-event app; the timezone still comes from config.
