# deployment — Delta Specification

## ADDED Requirements

### Requirement: One image, two isolated site deployments

The single container image SHALL serve either site by environment (`SITE`, `SHARED_CODE`, `EVENT_TZ`, `PUBLIC_URL`, `SESSION_SECRET`, data volume). The Bulgarian deployment SHALL run as its own container on its own host port with its own data volume and session secret, reached via `bg.aftermath.mitio.tech` through the existing Cloudflare tunnel. The two sites SHALL share no data.

#### Scenario: BG deployment

- **WHEN** the BG compose project starts with `SITE=bg`, `SHARED_CODE`, `EVENT_TZ=Europe/Sofia`, and its own volume
- **THEN** `bg.aftermath.mitio.tech` serves the Bulgarian site with shared-code login, and the Italian site is unaffected

#### Scenario: Image upgrade covers both

- **WHEN** a new image is published and both containers re-pull
- **THEN** both sites run the new code with their own language, config, and data
