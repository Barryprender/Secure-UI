# Changelog

All notable changes to `secure-ui-components` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] — 2026-03-13

### Added

#### New Components
- **SecureCard** — Payment card input with PAN masking, Luhn validation, card brand detection (Visa, Mastercard, Amex, Discover), expiry/CVC fields, and critical-tier defaults.
- **SecureTelemetryProvider** — Optional wrapper component that enriches form submissions with a signed environmental signals envelope. Detects automation/headless browsers, DOM script injection, devtools open state, suspicious screen sizes, pointer type, mouse movement, and keyboard activity.

#### Behavioral Telemetry System
- **Field-level telemetry** (`SecureBaseComponent`) — All input components now track: dwell time, completion time, typing velocity (keystrokes/sec), correction count, paste detection (`insertFromPaste`), autofill detection (`insertReplacementText`), focus count, and blur-without-change.
- **Session-level aggregation** (`SecureForm`) — `secure-form-submit` and `secure-form-success` events now include a `telemetry: SessionTelemetry` payload with per-field snapshots and a computed risk score (0–100).
- **Risk scoring engine** — 7 additive signals: `session_too_fast` (+30), `session_fast` (+10), `all_fields_pasted` (+25), `high_velocity_typing` (+15), `field_filled_without_focus` (+15), `form_probing` (+10), `high_correction_count` (+5); autofill bonus (−10). Capped at 100.
- **Environmental signals** (`SecureTelemetryProvider`) — On `secure-form-submit`, collects a point-in-time snapshot of browser environment signals and attaches a HMAC-SHA-256 signed envelope (`_env`) to `detail.telemetry`.
- **Submission payload** — Form submissions now send `{ ...formData, _telemetry: SessionTelemetry }` as a single JSON body.

#### New Types (`src/core/types.ts`)
- `FieldTelemetryState`, `FieldTelemetry`, `FieldTelemetrySnapshot`, `SessionTelemetry`
- `EnvironmentalSignals`, `SignedTelemetryEnvelope`
- `SecureFormSubmitEventDetail` and `SecureFormSuccessEventDetail` updated to include `telemetry: SessionTelemetry`

### Fixed
- Corrected `package.json` exports map — `secure-card`, `secure-submit-button`, and `secure-telemetry-provider` were missing per-component named exports.
- Build script now copies `secure-card.css` and `secure-telemetry-provider` to `dist/` (previously `secure-card.css` was not copied, breaking production styles).
- `dist/package.json` export key `./tokens` corrected to `./tokens.css` to match `package.json`.

### Tests
- 869 tests across 23 test files, all passing.
- New test files: `tests/core/telemetry.test.ts` (19 tests), `tests/components/secure-form-telemetry.test.ts` (16 tests), `tests/components/secure-telemetry-provider.test.ts` (20 tests).
- Global coverage: 92.58% statements, 80.37% branches, 94.04% functions, 93.63% lines.

---

## [0.1.0-beta.1] — 2026-03-10

Initial public beta release.

### Components

- **SecureInput** — Text input with XSS prevention, password strength meter, masking for critical tier, rate limiting, and audit logging.
- **SecureTextarea** — Multi-line input with character counting, sanitization, and audit logging.
- **SecureSelect** — Dropdown with option value validation (whitelist), XSS prevention on option text/values, and multi-select support.
- **SecureForm** — Form container with CSRF token injection, progressive enhancement (adopts server-rendered `<form>`), rate-limited submission, and native + fetch-enhanced submit modes.
- **SecureFileUpload** — Drag-and-drop file upload with magic-number content validation, dangerous filename rejection, malware scan hook (`setScanHook`), and file size/type enforcement.
- **SecureDateTime** — Date/time picker with format validation, min/max range enforcement, year-range limits for critical tier, and timezone display.
- **SecureTable** — Data table with sorting, filtering, pagination, per-column security tier masking (sensitive/critical), XSS-safe cell rendering, and progressive enhancement from slotted server-rendered markup.
- **SecureSubmitButton** — Accessible submit button with loading state, disabled-during-submission guard, and security tier integration.

### Security

- 4-tier security system: `public`, `authenticated`, `sensitive`, `critical`
- XSS prevention via `div.textContent` round-trip sanitization (no `innerHTML` with user input)
- CSRF token injection with configurable field name and header name
- Rate limiting on all interactive components at `sensitive` and `critical` tiers
- Autocomplete disabled at `sensitive` and `critical` tiers
- Comprehensive audit log (`getAuditLog()`) on all components
- `secure-audit` event dispatched on all security-relevant actions
- SVG icon construction via `createElementNS` (CSP-safe, no `innerHTML`)
- Styles via `adoptedStyleSheets` (CSP-safe, no `<style>` injection)

### Accessibility

- WCAG 2.2 AA compliant
- `aria-invalid`, `aria-required`, `aria-describedby` wiring on all inputs
- `aria-label` fallback from `name` attribute when no visible label is provided
- `aria-sort` on sortable table headers
- `role="alert"` on all error containers (no conflicting `aria-live`)
- Focus indicators meet WCAG 2.4.7 including forced-colors mode
- `:focus-within` ring on file-upload drop zone
- Decorative emoji/icons hidden from accessibility tree

### Developer Experience

- Zero runtime dependencies — pure TypeScript
- ES module output with named per-component exports
- Full TypeScript declarations (`.d.ts`) included
- CSS design tokens at `:root` for global theming
- `::part()` API for styling internal elements
- Progressive enhancement: all components render meaningful markup without JavaScript
- SSR-friendly (no document access in constructors)
- Comprehensive test suite: 689 tests, 80%+ branch coverage

[0.1.0-beta.1]: https://github.com/Barryprender/Secure-UI/releases/tag/v0.1.0-beta.1
