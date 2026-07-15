# guest-invites

## ADDED Requirements

### Requirement: Guest records carry email, activation, and invite state

The system SHALL store an optional email per guest, stamp the time of a guest's first successful login (activation), and record when an invite email was sent.

#### Scenario: Activation on first login

- **WHEN** a guest logs in for the first time
- **THEN** the system records their activation time, and the guest panel shows a green (activated) vs burgundy (not-yet) indicator per guest

#### Scenario: Invite state visible

- **WHEN** an admin views the guest panel
- **THEN** each guest shows their email and whether an invite has already been sent

### Requirement: Import guests from CSV

The admin SHALL be able to bulk-create guests from a `name,email` CSV. The system SHALL generate a unique access code per guest and SHALL skip rows with no valid email or a duplicate email.

#### Scenario: Import creates codes

- **WHEN** the admin imports a CSV of names and emails
- **THEN** a guest with a generated code is created for each new valid row, and duplicates/invalid rows are skipped and reported

### Requirement: Admin can grant and revoke admin rights

The admin SHALL be able to promote or demote any guest to/from admin, and the system SHALL refuse to remove the last remaining admin.

#### Scenario: Promote and demote

- **WHEN** an admin toggles another guest's admin flag
- **THEN** that guest gains or loses admin rights

#### Scenario: Last admin protected

- **WHEN** an admin tries to demote the only remaining admin
- **THEN** the system refuses with an error

### Requirement: Send an invite email per guest, on demand

The admin SHALL be able to email a single guest their personal access code and sign-in link by clicking a per-row button. Sending SHALL be one-at-a-time (admin controls who and when), SHALL stamp the invite time on success, and SHALL fail clearly if the guest has no email or email is not configured.

#### Scenario: Send one invite

- **WHEN** the admin clicks "Send invite" for a guest with an email
- **THEN** that guest is emailed their code + link, and the row updates to show it was sent

#### Scenario: Guarded sends

- **WHEN** the guest has no email, or the server has no email provider configured
- **THEN** the system returns a clear error and sends nothing

### Requirement: Wedding-styled invite email with a magic link

The invite email SHALL be styled to match the site (card header image, the couple's message, the access code shown large and bold) and SHALL include a one-tap link that logs the guest straight in without typing the code.

#### Scenario: Magic link signs in

- **WHEN** a guest opens the invite's sign-in link
- **THEN** they are logged in automatically and land in the gallery
