# gallery-browse Delta Spec

Already synced to the main spec in place (retrospective record).

## MODIFIED Requirements

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
