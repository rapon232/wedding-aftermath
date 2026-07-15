# gallery-browse

## MODIFIED Requirements

### Requirement: Lightbox viewing and video playback
The system SHALL open media full-screen in a lightbox with next/previous navigation (swipe on touch, arrow keys on desktop). Videos SHALL play in-browser with a poster image and standard controls, supporting seeking. Navigation controls SHALL reflect the actual bounds of the browsable set: the previous control SHALL be shown only when an earlier item exists, and the next control SHALL be shown only when a later item exists or another page can still be fetched. The prev/next/close controls SHALL be visually centered. Photo zoom (pinch and double-tap) SHALL update smoothly on touch devices.

#### Scenario: No next control at the end of a filtered set
- **WHEN** a guest reaches the last item of a filtered view with no further pages to load
- **THEN** the next control is hidden and only the previous control remains

#### Scenario: No previous control on the first item
- **WHEN** a guest is on the first item of the set
- **THEN** the previous control is hidden

#### Scenario: Smooth zoom
- **WHEN** a guest pinch-zooms or pans a photo on a phone
- **THEN** the image tracks the gesture smoothly without visible jitter

#### Scenario: Photo lightbox
- **WHEN** a guest taps a photo thumbnail
- **THEN** a full-screen preview opens and swiping/arrow keys move through the gallery in the current sort order

#### Scenario: Video playback
- **WHEN** a guest opens a video item
- **THEN** the video plays in-browser with controls and supports seeking

### Requirement: Sorting and filtering
The system SHALL sort by capture/upload date (newest/oldest) and filter by uploader and by media type (photos/videos). Each item SHALL show who uploaded it and when it was taken. In the lightbox, the uploader's name SHALL be an actionable link that filters the gallery to that uploader's media.

#### Scenario: Filter by uploader from the lightbox
- **WHEN** a guest taps the uploader's name shown on an open item
- **THEN** the lightbox closes and the gallery reloads filtered to that uploader's uploads

#### Scenario: Filter by uploader
- **WHEN** a guest filters by a specific uploader
- **THEN** only that uploader's media is shown, in the selected sort order

#### Scenario: Attribution visible
- **WHEN** a guest views an item in the lightbox
- **THEN** the uploader name and date are displayed

## ADDED Requirements

### Requirement: Thumbnail media-type affordance
Video thumbnails SHALL be visually distinguishable from photos by showing the clip duration as a badge in the lower corner of the thumbnail, in addition to a play affordance.

#### Scenario: Video duration badge
- **WHEN** a video whose duration is known appears in the grid
- **THEN** its thumbnail shows a duration badge (e.g. `1:05`) distinguishing it from a photo

### Requirement: Comments panel performance
The comments panel SHALL load a media item's comments only when the panel is opened for that item, not on every navigation, so browsing stays smooth on mobile. The panel's close control SHALL match the rounded style of the other lightbox controls.

#### Scenario: No fetch on every swipe
- **WHEN** a guest swipes through many items with the comments panel closed
- **THEN** no per-item comment requests are made until the panel is opened

#### Scenario: Comments load on open
- **WHEN** a guest opens the comments panel for an item
- **THEN** that item's comments load and display

#### Scenario: Rounded close control
- **WHEN** the comments panel is open
- **THEN** its close button is round, consistent with the other controls
