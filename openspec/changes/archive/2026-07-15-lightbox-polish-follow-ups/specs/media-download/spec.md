# media-download Delta Spec

Already synced to the main spec in place (retrospective record).

## MODIFIED Requirements

### Requirement: Single-file original download

The system SHALL let guests download any item as the original uploaded file, with a filename and Content-Disposition that saves correctly on mobile and desktop. On touch devices with Web Share support, the lightbox Save control SHALL open the native share sheet with the original file (so guests can save straight to their photo library), falling back to the plain download when sharing is unavailable or fails.

#### Scenario: Save to photo library on mobile

- **WHEN** a guest taps Save in the lightbox on a phone that supports file sharing
- **THEN** the native share sheet opens with the original file, offering "Save Image"/"Save Video" into the photo library; if sharing is unavailable or errors, the file downloads as before

#### Scenario: Download original

- **WHEN** a guest taps download on an item
- **THEN** the original file (identical bytes, original format) is saved to their device
