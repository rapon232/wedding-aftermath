# gallery-browse Specification

## Purpose

TBD - created by archiving change build-photo-sharing-site. Update Purpose after archive.

## Requirements

### Requirement: Responsive gallery grid

The system SHALL display all media in a responsive thumbnail grid usable on both mobile and desktop, loading thumbnails lazily and paging incrementally so the gallery stays fast with thousands of items.

#### Scenario: Mobile browsing

- **WHEN** a guest opens the gallery on a phone
- **THEN** the grid adapts to the small screen and scrolling loads further items automatically

#### Scenario: Large gallery

- **WHEN** the gallery holds 2000+ items
- **THEN** initial page load requests only the first page of thumbnails

### Requirement: Lightbox viewing and video playback

The system SHALL open media full-screen in a lightbox with next/previous navigation (swipe on touch, arrow keys on desktop). Videos SHALL play in-browser with a poster image and standard controls, supporting seeking. Navigation controls SHALL reflect the actual bounds of the browsable set: the previous control SHALL be shown only when an earlier item exists, and the next control SHALL be shown only when a later item exists or another page can still be fetched. The prev/next/close controls SHALL be visually centered. Photo zoom (pinch and double-tap) SHALL update smoothly on touch devices and SHALL be focal: pinch zoom SHALL anchor at the touch midpoint and follow it while both fingers move, and double-tap SHALL zoom toward the tapped point. A zoomed photo SHALL NOT be pannable past the viewport edges: overscroll SHALL be attenuated (rubber-band) during the gesture and SHALL animate back within bounds on release; pinching below 1× SHALL be elastic and spring back to fit. The maximum zoom SHALL be 4×. On desktop, trackpad pinch SHALL zoom focally at the cursor (never triggering browser page zoom while the lightbox is open), and a zoomed photo SHALL be pannable by scroll and by mouse drag. Returning to fit (double-tap, double-click, or zooming out) SHALL restore the chrome; zooming in SHALL hide it.

A single tap in the lightbox SHALL toggle an immersive view that hides all chrome (navigation arrows, close control, caption/action bar, unmute control) over a pure-black backdrop; tapping the background SHALL NOT close the lightbox. Immersive state SHALL persist across prev/next navigation and SHALL reset to chrome-visible when the lightbox is reopened; starting a pinch SHALL hide the chrome. The lightbox SHALL close via the close control, the Escape key, or a downward swipe on an unzoomed item that passes a dismiss threshold (springing back otherwise). When the comments panel is open, a tap SHALL close the panel instead of toggling chrome. Video playback interaction SHALL remain owned by the native player controls.

#### Scenario: No next control at the end of a filtered set

- **WHEN** a guest reaches the last item of a filtered view with no further pages to load
- **THEN** the next control is hidden and only the previous control remains

#### Scenario: No previous control on the first item

- **WHEN** a guest is on the first item of the set
- **THEN** the previous control is hidden

#### Scenario: Smooth zoom

- **WHEN** a guest pinch-zooms or pans a photo on a phone
- **THEN** the image tracks the gesture smoothly without visible jitter

#### Scenario: Focal pinch zoom

- **WHEN** a guest pinches outward with both fingers over a detail at the edge of a photo
- **THEN** the photo zooms in anchored at the fingers' midpoint, keeping that detail under the fingers, and moving both fingers together pans the zoomed photo

#### Scenario: Focal double-tap zoom

- **WHEN** a guest double-taps a spot on an unzoomed photo
- **THEN** the photo zooms to 2.5× toward the tapped spot; a second double-tap returns it to fit with the controls visible again

#### Scenario: Desktop trackpad zoom

- **WHEN** a guest pinches on a Mac trackpad over a photo in the lightbox
- **THEN** the photo zooms focally at the cursor without the browser zooming the page, and scroll or mouse drag pans the zoomed photo

#### Scenario: Pan stays in bounds with rubber-band

- **WHEN** a guest pans a zoomed photo past its edge and releases
- **THEN** movement past the edge is attenuated during the drag and the photo animates back so its edge does not rest inside the viewport

#### Scenario: Tap toggles immersive view

- **WHEN** a guest single-taps a photo (or the surrounding background) in the lightbox
- **THEN** all chrome fades out leaving only the media on a black backdrop, and a second single tap brings the chrome back

#### Scenario: Immersive view persists while browsing

- **WHEN** a guest hides the chrome and then swipes to the next photo
- **THEN** the next photo is shown still without chrome, until the guest taps again or reopens the lightbox

#### Scenario: Swipe down to close

- **WHEN** a guest drags an unzoomed photo downward past the dismiss threshold and releases
- **THEN** the lightbox closes; releasing before the threshold springs the photo back without closing

#### Scenario: Background tap does not close

- **WHEN** a guest taps the dark area beside the photo
- **THEN** the lightbox stays open and only the chrome visibility toggles

#### Scenario: Photo lightbox

- **WHEN** a guest taps a photo thumbnail
- **THEN** a full-screen preview opens and swiping/arrow keys move through the gallery in the current sort order

#### Scenario: Video playback

- **WHEN** a guest opens a video item
- **THEN** the video plays in-browser with controls and supports seeking, and taps on the video are handled by the native player controls

### Requirement: Sorting and filtering

The system SHALL sort by capture/upload date (newest/oldest) and filter by uploader and by media type (photos/videos). Each item SHALL show who uploaded it and when it was taken. In the lightbox, the uploader's name SHALL be an actionable link that filters the gallery to that uploader's media.

#### Scenario: Filter by uploader from the lightbox

- **WHEN** a guest taps the uploader's name shown on an open item
- **THEN** the lightbox closes and the gallery reloads filtered to that uploader's uploads

#### Scenario: Filter by uploader

- **WHEN** a guest filters by a specific uploader
- **THEN** only that uploader's media is shown, in the selected sort order

#### Scenario: Filter by type

- **WHEN** a guest filters to videos only
- **THEN** only videos are shown

#### Scenario: Clear filters

- **WHEN** a guest with an active filter or non-default sort taps "Clear filters"
- **THEN** the uploader resets to everyone, the type to all, and the sort to newest first

#### Scenario: Attribution visible

- **WHEN** a guest views an item in the lightbox
- **THEN** the uploader name and date are displayed

### Requirement: Admin can pin media to the top

The admin SHALL be able to pin and unpin media items. Pinned items SHALL appear in a pinned section at the top of the gallery for all guests, as copies: the item SHALL also remain in its normal position in the chosen sort order. Pinned items SHALL be visually marked in both places. Pinning or unpinning from the lightbox SHALL NOT close the lightbox or interrupt browsing — the pin control SHALL animate to its new state and the guest keeps swiping; the gallery grid SHALL reflect the change no later than when the lightbox closes (other guests via the existing live refresh).

#### Scenario: Pin an item

- **WHEN** the admin pins an item from the lightbox
- **THEN** the lightbox stays open on that item with the pin control animated to its pinned state, and the gallery afterwards shows the item both in the pinned section and at its normal position in the sort order

#### Scenario: Unpin an item

- **WHEN** the admin unpins an item
- **THEN** its copy leaves the pinned section and the item remains at its normal position in the current sort order

#### Scenario: Non-admin cannot pin

- **WHEN** a non-admin guest attempts to pin or unpin
- **THEN** the system returns 403 and nothing changes

### Requirement: Wedding-themed UI

The gallery SHALL use the wedding visual language of the seating site: cream background, mint/bordeaux accents, DM Serif Display headings, DM Sans body text.

#### Scenario: Consistent theming

- **WHEN** any page renders (login, gallery, lightbox)
- **THEN** it uses the shared palette and typography

### Requirement: Thumbnail media-type affordance

Video thumbnails SHALL be visually distinguishable from photos by showing the clip duration as a badge in the lower corner of the thumbnail, in addition to a play affordance.

#### Scenario: Video duration badge

- **WHEN** a video whose duration is known appears in the grid
- **THEN** its thumbnail shows a duration badge (e.g. `1:05`) distinguishing it from a photo

### Requirement: Comments panel performance

The comments panel SHALL load a media item's full comment thread only when the panel is opened for that item, not on every navigation, so browsing stays smooth on mobile. The gallery listing SHALL carry a bounded preview (the latest up to three comments per item) so the lightbox overlay needs no per-item requests. The panel's close control SHALL match the rounded style of the other lightbox controls. The empty panel SHALL invite the first comment with "No comments yet — say something sassy ✨".

#### Scenario: No fetch on every swipe

- **WHEN** a guest swipes through many items with the comments panel closed
- **THEN** no per-item comment requests are made until the panel is opened, even while the overlay shows comment previews

#### Scenario: Comments load on open

- **WHEN** a guest opens the comments panel for an item
- **THEN** that item's full comment thread loads and displays

#### Scenario: Rounded close control

- **WHEN** the comments panel is open
- **THEN** its close button is round, consistent with the other controls

#### Scenario: Empty panel invites sass

- **WHEN** a guest opens the comments panel on an item with no comments
- **THEN** it reads "No comments yet — say something sassy ✨"

### Requirement: Per-guest NEW badges

The system SHALL mark each media item as NEW, per guest, until that guest has viewed the item in the lightbox. Viewing an item in the lightbox SHALL record it as seen for that guest and remove its badge from then on; badges SHALL persist across visits until then. A guest's own uploads SHALL never be marked NEW for them. The header new-items count SHALL equal the number of the guest's unseen items (excluding their own uploads). Guests who used the gallery before seen-tracking existed SHALL NOT see items from before their last visit as NEW.

#### Scenario: Badge persists across visits until viewed

- **WHEN** a guest sees a NEW badge on a thumbnail, leaves without opening it, and returns the next day
- **THEN** the thumbnail still shows the NEW badge

#### Scenario: Viewing clears the badge

- **WHEN** a guest opens an item in the lightbox (directly or by swiping to it) and later returns to the grid
- **THEN** that item no longer shows a NEW badge for that guest, while other guests' badges are unaffected

#### Scenario: Own uploads are not new

- **WHEN** a guest uploads media and browses the gallery
- **THEN** their own items never show a NEW badge to them

#### Scenario: Existing guests are grandfathered

- **WHEN** seen-tracking first deploys and a returning guest loads the gallery
- **THEN** only items uploaded after their last visit can appear as NEW, not the whole history

### Requirement: Comment overlay in the lightbox

The lightbox SHALL display the latest comments (up to three) for the current item as a small, translucent overlay at the bottom-left of the photo, so guests see what is being said while swiping. The overlay SHALL NOT intercept pointer or touch input (taps, double-taps, pinches and swipes pass through). It SHALL hide with the rest of the chrome in the immersive view and while the comments panel is open, and SHALL update immediately when the guest posts a comment. Overlay data SHALL come from the gallery listing — displaying it SHALL NOT trigger per-item comment requests while browsing.

#### Scenario: Comments visible while swiping

- **WHEN** a guest swipes to a photo that has comments
- **THEN** the latest comments (up to three, name and text, ellipsized) appear small over the photo's bottom-left corner without any additional network request

#### Scenario: Tap hides the overlay

- **WHEN** a guest single-taps the photo to enter the immersive view
- **THEN** the comment overlay disappears along with the rest of the chrome, and returns when chrome is restored

#### Scenario: Overlay never blocks gestures

- **WHEN** a guest pinches, double-taps or swipes on the area covered by the overlay
- **THEN** the gesture behaves exactly as it would without the overlay

#### Scenario: Posting updates the overlay

- **WHEN** a guest posts a comment from the panel
- **THEN** the overlay shows it as the newest entry once the panel closes
