# gallery-browse Delta Spec

## ADDED Requirements

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

## MODIFIED Requirements

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
