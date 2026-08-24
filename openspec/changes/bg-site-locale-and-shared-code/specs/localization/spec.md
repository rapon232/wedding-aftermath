# localization — Delta Specification

## ADDED Requirements

### Requirement: One codebase builds per-site frontends

The build SHALL produce a complete frontend per site (`dist/en`, `dist/bg`) from one source tree, differing in language of all guest-facing text, page titles and share/OG metadata, event identity (name, special-day labels and dates, date-formatting locale), and site icons/manifest. The server SHALL serve the dist matching its `SITE` configuration, defaulting to `en` so existing deployments are unchanged.

#### Scenario: Bulgarian build

- **WHEN** the BG site serves its pages
- **THEN** all UI text is Bulgarian, the title is `#LoveWins. Споменник ♠`, day headers format in Bulgarian, and 2026-08-08/09 carry the wedding/morning-party labels while other dates are plain

#### Scenario: English build unchanged

- **WHEN** the server runs without a `SITE` value (the Italian deployment)
- **THEN** pages are byte-equivalent in content to the pre-change English site (strings, dates, icons, meta)

#### Scenario: Link preview per site

- **WHEN** a BG gallery link is shared in a chat app
- **THEN** the preview shows the BG title, description, and the BG preview image from `bg.aftermath.mitio.tech`
