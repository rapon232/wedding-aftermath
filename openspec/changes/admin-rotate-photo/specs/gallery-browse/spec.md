# gallery-browse — Delta Specification

## ADDED Requirements

### Requirement: Admin can permanently rotate a photo

The lightbox SHALL offer admins a single rotate control on eligible photos (JPEG/PNG/WebP/HEIC originals, processing complete). Each activation SHALL rotate the stored original 90° clockwise, regenerate the thumbnail and preview renditions, and update the item's dimensions — the change is permanent and applies to what every guest sees and downloads. Rotating a HEIC SHALL convert the original to a high-quality JPEG (its stored extension and download filename change accordingly). Cached copies in browsers SHALL be bypassed after a rotation. Non-admins SHALL NOT see the control, and the endpoint SHALL reject them.

#### Scenario: Rotate a sideways photo

- **WHEN** an admin taps the rotate control on a photo in the lightbox
- **THEN** the photo re-renders rotated 90° clockwise in the lightbox and its grid thumbnails, and subsequent downloads serve the rotated original

#### Scenario: Full turn

- **WHEN** an admin taps rotate four times on the same photo
- **THEN** the photo displays in its original orientation again

#### Scenario: Rotate a HEIC film scan

- **WHEN** an admin taps the rotate control on a photo whose original is HEIC
- **THEN** the photo re-renders rotated, its original is now a JPEG, and its download filename ends in `.jpg`

#### Scenario: Ineligible media

- **WHEN** the lightbox shows a video or a GIF
- **THEN** the rotate control is not shown, and a direct API call returns an error without modifying anything

#### Scenario: Non-admin cannot rotate

- **WHEN** a non-admin guest calls the rotate endpoint
- **THEN** the request is rejected and the media is unchanged
