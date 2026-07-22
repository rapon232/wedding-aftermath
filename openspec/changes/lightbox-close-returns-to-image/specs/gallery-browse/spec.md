# gallery-browse — Delta Specification

## ADDED Requirements

### Requirement: Closing the lightbox returns to the last-viewed item

When the lightbox closes from a gallery-opened session, the gallery SHALL scroll the grid tile of the item being viewed at close time into the center of the viewport, instantly (no smooth scrolling), and SHALL briefly highlight that tile so the guest can spot it. For pinned items rendered as two tiles, the in-place (chronological) copy SHALL be targeted, not the featured copy.

#### Scenario: Close after swiping far

- **WHEN** a guest opens a photo, swipes through many items in the lightbox, and closes it
- **THEN** the gallery is scrolled so the last-viewed item's tile is centered in the viewport and briefly highlighted

#### Scenario: Close on a pinned item

- **WHEN** the guest closes the lightbox while viewing an item that is pinned (rendered both in the featured section and in place)
- **THEN** the in-place chronological tile is centered, not the featured copy

#### Scenario: Close after pinning triggered a grid reload

- **WHEN** the guest pinned or unpinned items in the lightbox and then closes it, causing the grid to reload
- **THEN** the gallery loads further pages as needed (bounded) until the last-viewed item's tile exists, then centers and highlights it; if the bound is exhausted the gallery remains at the top without error

#### Scenario: Single-item deep-link view

- **WHEN** the lightbox was opened from a `#photo=` deep link as a one-item view with no corresponding grid tile
- **THEN** closing behaves as before this change, with no scroll adjustment and no error

#### Scenario: Last-viewed item was deleted

- **WHEN** the item being viewed no longer matches any grid tile at close time (e.g. it was just deleted)
- **THEN** the gallery performs no scroll adjustment and no error occurs
