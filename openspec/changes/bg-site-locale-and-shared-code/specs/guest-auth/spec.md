# guest-auth — Delta Specification

## ADDED Requirements

### Requirement: Shared-code self-registration

When a shared access code is configured, a visitor entering it SHALL be asked for their name and email (no session yet), and submitting those SHALL create a guest (generated personal code, `activated_at` stamped) and start their session. If the email already belongs to a guest, that guest's session SHALL resume instead of creating a duplicate — unless that guest is revoked, in which case registration is rejected. Personal codes (including the admin's) SHALL continue to work unchanged. Registration SHALL be rate-limited like login.

#### Scenario: First login with the shared code

- **WHEN** a new visitor enters the shared code and submits their name and email
- **THEN** a guest is created, a session starts, and the guest appears in the admin panel with that name and email

#### Scenario: Same person, second device

- **WHEN** someone registers with the shared code using an email that already belongs to a guest
- **THEN** they are signed in as that existing guest and no duplicate is created

#### Scenario: Revoked guest cannot re-register

- **WHEN** a revoked guest's email is used to register with the shared code
- **THEN** registration is rejected and no session starts

#### Scenario: Shared code alone grants no session

- **WHEN** the shared code is submitted without completing the name/email step
- **THEN** no session cookie is issued

#### Scenario: Admin logs in normally

- **WHEN** the admin enters their personal code on a shared-code site
- **THEN** they are signed in as admin exactly as before

#### Scenario: Mode is off by default

- **WHEN** no shared code is configured (the Italian site)
- **THEN** entering any non-personal code is rejected exactly as before
