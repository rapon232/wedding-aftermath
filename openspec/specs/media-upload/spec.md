# media-upload Specification

## Purpose

TBD - created by archiving change build-photo-sharing-site. Update Purpose after archive.

## Requirements

### Requirement: Multi-file photo and video upload

The system SHALL let authenticated guests upload multiple photos and videos in one action, from mobile (camera roll picker) and desktop (file picker and drag-and-drop). Accepted types SHALL include JPEG, PNG, WebP, GIF, HEIC/HEIF, MP4, MOV; per-file size limit 2 GB.

#### Scenario: Multi-file upload with progress

- **WHEN** a guest selects several files to upload
- **THEN** files upload from a queue with visible per-file progress and a completed/failed status per file

#### Scenario: Unsupported file type

- **WHEN** a guest attempts to upload an unsupported file type
- **THEN** that file is rejected with a clear message and other files continue uploading

#### Scenario: Retry after failure

- **WHEN** a file upload fails (e.g. connection drop)
- **THEN** the guest can retry that file without re-selecting the others

### Requirement: Originals preserved

The system SHALL store the uploaded file byte-for-byte unchanged on NAS storage and record uploader identity, upload time, and capture time (from EXIF metadata when present, otherwise upload time).

#### Scenario: Original integrity

- **WHEN** a file is uploaded and later downloaded as original
- **THEN** its content is identical to what the guest uploaded

#### Scenario: Duplicate upload

- **WHEN** a file whose content hash already exists is uploaded again
- **THEN** the system deduplicates it instead of storing a second copy and reports success

### Requirement: Derived renditions generated on upload

The system SHALL generate a browser-friendly thumbnail and larger preview (WebP) for each photo, including HEIC sources, and a poster image plus thumbnail for each video.

#### Scenario: HEIC photo upload

- **WHEN** a guest uploads an iPhone HEIC photo
- **THEN** the gallery displays WebP thumbnail/preview renditions while the original HEIC remains downloadable

#### Scenario: Processing placeholder

- **WHEN** renditions for a newly uploaded file are not yet generated
- **THEN** the gallery shows a processing placeholder that resolves without a page reload

### Requirement: Guests can delete their own uploads

The system SHALL allow a guest to delete media they uploaded; the admin SHALL be able to delete any media. Deletion removes the original, renditions, and metadata.

#### Scenario: Own deletion

- **WHEN** a guest deletes an item they uploaded
- **THEN** it disappears from the gallery for everyone

#### Scenario: Foreign deletion blocked

- **WHEN** a guest attempts to delete another guest's item
- **THEN** the system returns 403

### Requirement: Video processing and metadata

The system SHALL generate a poster image for each video and extract its duration and capture date. Duration and capture date SHALL be read robustly from the video's metadata, checking both the container (`format`) and the video `stream`, and preferring a capture-date tag that carries a timezone offset (e.g. `com.apple.quicktime.creationdate`) over a bare UTC `creation_time`. A capture date with an explicit offset or `Z` SHALL be trusted as-is; a naive timestamp SHALL be interpreted in the configured event timezone (`EVENT_TZ`). When a probe yields no duration or no capture date, the system SHALL log it rather than fail the upload. When no capture date can be determined, the item SHALL fall back to its upload time.

#### Scenario: Capture date extracted with timezone

- **WHEN** a phone video carrying a timezone-aware creation date is uploaded
- **THEN** its `taken_at` reflects the true capture instant and it sorts and displays by that date, not by upload time

#### Scenario: Duration available for the grid

- **WHEN** a video is processed
- **THEN** its duration is stored and available to show a duration badge in the grid

#### Scenario: Metadata missing

- **WHEN** a video has no readable capture date
- **THEN** the upload still succeeds, the gap is logged, and the item falls back to upload time

### Requirement: Non-destructive video date backfill

The system SHALL provide a one-off maintenance operation that corrects `taken_at` for videos already stored, by re-reading each original's metadata with the same extraction logic. The operation SHALL be file-safe and reversible: it SHALL default to a dry-run that reports intended changes without writing; it SHALL back up the database before applying; it SHALL update only the `taken_at` field and only when a valid capture date is found; and it SHALL never move, rename, re-encode, or delete any media file. Re-running it SHALL be safe (idempotent).

#### Scenario: Dry-run reports changes

- **WHEN** the backfill runs in dry-run mode
- **THEN** it lists each video's current and proposed `taken_at` and writes nothing

#### Scenario: Apply corrects existing videos

- **WHEN** the backfill runs in apply mode after a database backup
- **THEN** videos with a discoverable capture date have `taken_at` updated, files are untouched, and the gallery re-sorts them to their true date

#### Scenario: No valid date leaves the row unchanged

- **WHEN** a video's original yields no valid capture date
- **THEN** its `taken_at` is left unchanged
