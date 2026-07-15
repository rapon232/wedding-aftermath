# media-upload

## ADDED Requirements

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
