# app-shell-delivery — Delta Specification

## ADDED Requirements

### Requirement: Honest cache headers for the app shell

The server SHALL serve HTML entry points with `Cache-Control: no-cache` so browsers and Cloudflare revalidate them on every visit, and SHALL serve content-hashed static assets under `/assets/` with `Cache-Control: public, max-age=31536000, immutable`. This applies to HTML delivered by `express.static` and by the explicit `sendFile` routes (`/` and the SPA catch-all) alike.

#### Scenario: HTML always revalidates

- **WHEN** a client requests `/`, `/index.html`, or `/login.html`
- **THEN** the response carries `Cache-Control: no-cache`, so a returning browser revalidates and receives the current asset references

#### Scenario: Hashed assets cache forever

- **WHEN** a client requests any file under `/assets/`
- **THEN** the response carries `Cache-Control: public, max-age=31536000, immutable`, and the browser never revalidates it for the lifetime of that filename

### Requirement: Page self-recovers from failed shell assets

The gallery and login pages SHALL detect when their stylesheet or main script fails to load (missing after a redeploy, or a transient network/tunnel failure) and SHALL automatically reload the page at most once per browser session to fetch fresh HTML with current asset references.

#### Scenario: Stale HTML references deleted assets

- **WHEN** the page's HTML references an `/assets/` file that returns an error (e.g. 404 after a redeploy)
- **THEN** the page reloads itself automatically once, and the reloaded page renders styled and functional

#### Scenario: No reload loop when the site is down

- **WHEN** asset loading fails and a reload has already been attempted in this browser session
- **THEN** the page does not reload again, and behavior degrades to the current unstyled page rather than an infinite loop

#### Scenario: Recovery re-arms after a successful load

- **WHEN** a page load completes with its stylesheet successfully applied
- **THEN** the once-per-session reload guard is reset, so a future asset failure in the same session can still self-heal
