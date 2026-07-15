# gallery-browse

## ADDED Requirements

### Requirement: Responsive gallery grid
The system SHALL display all media in a responsive thumbnail grid usable on both mobile and desktop, loading thumbnails lazily and paging incrementally so the gallery stays fast with thousands of items.

#### Scenario: Mobile browsing
- **WHEN** a guest opens the gallery on a phone
- **THEN** the grid adapts to the small screen and scrolling loads further items automatically

#### Scenario: Large gallery
- **WHEN** the gallery holds 2000+ items
- **THEN** initial page load requests only the first page of thumbnails

### Requirement: Lightbox viewing and video playback
The system SHALL open media full-screen in a lightbox with next/previous navigation (swipe on touch, arrow keys on desktop). Videos SHALL play in-browser with a poster image and standard controls, supporting seeking.

#### Scenario: Photo lightbox
- **WHEN** a guest taps a photo thumbnail
- **THEN** a full-screen preview opens and swiping/arrow keys move through the gallery in the current sort order

#### Scenario: Video playback
- **WHEN** a guest opens a video item
- **THEN** the video plays in-browser with controls and supports seeking

### Requirement: Sorting and filtering
The system SHALL sort by capture/upload date (newest/oldest) and filter by uploader and by media type (photos/videos). Each item SHALL show who uploaded it and when it was taken.

#### Scenario: Filter by uploader
- **WHEN** a guest filters by a specific uploader
- **THEN** only that uploader's media is shown, in the selected sort order

#### Scenario: Filter by type
- **WHEN** a guest filters to videos only
- **THEN** only videos are shown

#### Scenario: Attribution visible
- **WHEN** a guest views an item in the lightbox
- **THEN** the uploader name and date are displayed

### Requirement: Admin can pin media to the top
The admin SHALL be able to pin and unpin media items. Pinned items SHALL appear first in the gallery for all guests, ahead of the chosen sort order, so the couple can surface the photographers' final photos. Pinned items SHALL be visually marked.

#### Scenario: Pin an item
- **WHEN** the admin pins an item
- **THEN** it moves to a pinned section at the top of the gallery for everyone, marked as pinned

#### Scenario: Unpin an item
- **WHEN** the admin unpins an item
- **THEN** it returns to its normal position in the current sort order

#### Scenario: Non-admin cannot pin
- **WHEN** a non-admin guest attempts to pin or unpin
- **THEN** the system returns 403 and nothing changes

### Requirement: Wedding-themed UI
The gallery SHALL use the wedding visual language of the seating site: cream background, mint/bordeaux accents, DM Serif Display headings, DM Sans body text.

#### Scenario: Consistent theming
- **WHEN** any page renders (login, gallery, lightbox)
- **THEN** it uses the shared palette and typography
