# guest-invites

## ADDED Requirements

### Requirement: Create a guest by name and email by hand
When creating a single guest by hand, the admin SHALL be able to supply an email address alongside the name, so that guest can be invited immediately without going through CSV import. Names supplied without an email SHALL still be accepted. Duplicate names (case-insensitive) and duplicate emails SHALL be skipped.

#### Scenario: Create one guest with name and email
- **WHEN** the admin enters a name and an email for a single new guest
- **THEN** the guest is created with a code and that email, and the "Send invite" action becomes available for that guest

#### Scenario: Create guests by name only
- **WHEN** the admin enters one or more names without emails
- **THEN** guests are created with codes and no email, as before

#### Scenario: Duplicate skipped
- **WHEN** the admin adds a name or email that already exists
- **THEN** it is skipped rather than duplicated
