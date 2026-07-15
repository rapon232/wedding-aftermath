# guest-auth Specification

## Purpose
TBD - created by archiving change build-photo-sharing-site. Update Purpose after archive.
## Requirements
### Requirement: Guest login with access code
The system SHALL authenticate guests with a personal access code tied to a display name. No self-registration SHALL exist.

#### Scenario: Successful login
- **WHEN** a guest enters a valid, non-revoked access code on the login page
- **THEN** the system sets a long-lived HttpOnly session cookie and redirects to the gallery

#### Scenario: Invalid code
- **WHEN** a guest enters an unknown or revoked code
- **THEN** the system shows an error and does not create a session

#### Scenario: Session persistence
- **WHEN** a logged-in guest returns within the session lifetime (180 days)
- **THEN** the gallery loads without re-entering the code

### Requirement: All content requires authentication
The system SHALL deny access to all gallery pages, media files, and API endpoints without a valid session, and respond to unauthenticated page requests by redirecting to the login page.

#### Scenario: Unauthenticated access
- **WHEN** a request without a valid session cookie targets any page, media URL, or API endpoint
- **THEN** the system redirects to login (pages) or returns 401 (API/media)

### Requirement: Admin code management
The system SHALL let an admin user generate, list, and revoke guest access codes, each with a guest display name.

#### Scenario: Generate codes
- **WHEN** the admin creates a code for a guest name
- **THEN** a unique human-typable code is generated and shown for sharing

#### Scenario: Revoke code
- **WHEN** the admin revokes a code
- **THEN** existing sessions for that code are invalidated and the code no longer logs in

#### Scenario: Non-admin blocked
- **WHEN** a regular guest calls an admin endpoint
- **THEN** the system returns 403

