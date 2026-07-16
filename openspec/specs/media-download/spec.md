# media-download Specification

## Purpose

TBD - created by archiving change build-photo-sharing-site. Update Purpose after archive.

## Requirements

### Requirement: Single-file original download

The system SHALL let guests download any item as the original uploaded file, with a filename and Content-Disposition that saves correctly on mobile and desktop. On touch devices with Web Share support, the lightbox Save control SHALL open the native share sheet with the original file (so guests can save straight to their photo library), falling back to the plain download when sharing is unavailable or fails. While the original is being fetched for sharing, the Save control SHALL show determinate progress (a filling pie with a percentage), or an indeterminate spinner when the size is unknown.

#### Scenario: Save to photo library on mobile

- **WHEN** a guest taps Save in the lightbox on a phone that supports file sharing
- **THEN** the native share sheet opens with the original file, offering "Save Image"/"Save Video" into the photo library; if sharing is unavailable or errors, the file downloads as before

#### Scenario: Download original

- **WHEN** a guest taps download on an item
- **THEN** the original file (identical bytes, original format) is saved to their device

### Requirement: Bulk zip download

The system SHALL let guests select multiple items (or choose all) and download them as a single zip archive streamed without buffering the archive in memory or on disk.

#### Scenario: Download selection

- **WHEN** a guest selects several items and chooses "Download selected"
- **THEN** a zip containing the originals streams to their device

#### Scenario: Download everything

- **WHEN** a guest chooses "Download all"
- **THEN** a zip of all originals streams, working for multi-GB galleries
