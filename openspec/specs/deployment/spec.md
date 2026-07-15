# deployment Specification

## Purpose

TBD - created by archiving change build-photo-sharing-site. Update Purpose after archive.

## Requirements

### Requirement: Single-container Docker deployment

The system SHALL run as one Docker container (Node.js app with ffmpeg and HEIF-capable image processing included) started via docker compose on the Synology NAS, configured entirely through environment variables (port, session secret, data directory).

#### Scenario: Fresh deploy

- **WHEN** `docker compose up -d` runs on the NAS with a mounted data volume
- **THEN** the site is fully functional with no other services required

### Requirement: All state on one NAS volume

The system SHALL keep all persistent state — originals, derived renditions, and the SQLite database — under a single mounted data directory so backup equals copying one folder.

#### Scenario: Container recreation

- **WHEN** the container is destroyed and recreated against the same data volume
- **THEN** all media, users, and sessions survive

### Requirement: Served via Cloudflare tunnel at aftermath.mitio.tech

The system SHALL be reachable at `https://aftermath.mitio.tech` through the existing Cloudflare tunnel, with no NAS port exposed directly to the internet. Uploads SHALL work within Cloudflare's per-request body limits (chunking client-side if a file exceeds them).

#### Scenario: Public access

- **WHEN** a guest opens aftermath.mitio.tech from anywhere
- **THEN** the site loads over HTTPS via the tunnel

#### Scenario: Large video through tunnel

- **WHEN** a guest uploads a video larger than Cloudflare's per-request body limit
- **THEN** the upload still completes successfully
