# media-download

## ADDED Requirements

### Requirement: Single-file original download
The system SHALL let guests download any item as the original uploaded file, with a filename and Content-Disposition that saves correctly on mobile and desktop.

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
