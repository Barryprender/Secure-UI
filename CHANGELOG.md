# Changelog

All notable changes to `secure-ui-components` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] — 2026-05-26

### Breaking Changes

- **`SecureBaseComponent.shadowRoot` removed** — The public override of `Element.shadowRoot` has been renamed to `protected root`. External callers now correctly receive `null` from `Element.shadowRoot` (the expected behaviour for closed shadow DOMs). Internal subclasses use `this.root` instead.
- **`secure-textarea-change` detail: `value` removed** — Raw field values must not propagate via bubbling composed events. Read `(event.target as SecureTextarea).value` directly.
- **`secure-datetime-change` detail: `value` removed** — Same rationale. Read from element.
- **`secure-file-change` detail: `files` changed** — Was `File[]`; now `ReadonlyArray<SecureFileMeta>` (`{ name, size, type }`). Raw `File` objects (which expose `.arrayBuffer()` / `.text()`) must not be accessible to intercepting scripts. Read `(event.target as SecureFileUpload).files` directly.
- **`secure-form-submit` detail: `formData` removed** — Credentials and PII must not travel in a bubbling composed event readable by any page script. Read field values directly from component instances.
- **`secure-card-change` detail: `cardholderName` removed** — PII; combined with `last4` + expiry it partially identifies a card. Use `getCardData()` for SDK handoff.
- **`secure-password-confirm`: event renamed** — No longer dispatches `secure-input-change`. Now dispatches `secure-password-confirm-change` with detail `{ name, tier }`. The old event carried an undocumented `field` property and used the wrong event name.
- **`SECURITY_HEADERS['X-XSS-Protection']` removed** — The header is deprecated and removed from all modern browsers; setting it to `1; mode=block` increases attack surface via legacy browser quirks. Strict CSP is the correct mitigation.
- **`SecureForm` now blocks CSRF-absent submissions** — Previously fired a `secure-threat-detected` event but still allowed submission to proceed. Now calls `event.preventDefault()` and shows an error when a `sensitive`/`critical` form has no CSRF token.
- **`SecureForm` HTTP method validation** — `GET`, `HEAD`, and other non-body methods are rejected and default to `POST`. Accepting GET would put form data in the URL, exposing credentials to server logs and browser history.
- **`SecureForm` fetch mode changed** — `mode: 'cors'` → `mode: 'same-origin'` (action URLs are already validated to same-origin; the mode is now explicit).

### Fixed

- **Closed shadow DOM was publicly accessible** — The `shadowRoot` getter override meant any external script could access the live shadow root. Now correctly returns `null` via `Element.shadowRoot`.
- **`attributeChangedCallback` infinite recursion** — Calling `setAttribute('security-tier', oldValue)` from within the callback re-triggered it with swapped arguments. The revert call has been removed; the internal `#securityTier` field is already immutable.
- **`sanitizeValue()` double-encoding** — Previously returned `div.innerHTML` (HTML entities). When assigned to `.textContent`, `option.value`, `.name`, etc., entities appeared literally (e.g. `Tom &amp; Jerry`). Now strips null bytes and control characters only and returns plain text. XSS protection for all current call sites comes from DOM property assignment, not encoding.
- **`SecureForm#collectFormData` data corruption** — `sanitizeValue()` (which returned HTML-encoded strings) was applied to field values before JSON-serialising to the server. HTML entities in a JSON body were sent to the server verbatim. Fixed by removing the encode step.
- **`cancelSubmission()` had no effect** — The callback set `#isSubmitting = false` but the check was `if (!shouldContinue)` which only tested `event.preventDefault()`. Added a `submissionCancelled` flag checked independently after event dispatch.
- **SVG in file-upload extension map** — `.svg` → `image/svg+xml` removed from `#extensionToMimeType`. SVG files can contain `<script>` elements and event handlers; accepting them without server-side sanitisation is a stored XSS vector.
- **`#knownScripts` stale on reconnect** (`SecureTelemetryProvider`) — The script snapshot was not cleared in `disconnectedCallback`. Scripts injected between disconnect and reconnect would be treated as pre-existing and go undetected. Now cleared on disconnect.
- **All `this.shadowRoot` references in components** — `SecureCard`, `SecureTable`, and telemetry methods in `SecureBaseComponent` were using the now-removed public getter. Updated to use `this.root` (protected) or `this.#shadow` (private field) directly.

### Added

- **`SecureFileMeta` type** — New exported interface `{ readonly name: string; readonly size: number; readonly type: string }` used in `SecureFileChangeDetail.files`.
- **`SecurePasswordConfirmChangeDetail` type** — New exported interface `{ name: string; tier: SecurityTierValue }` for the `secure-password-confirm-change` event.

### Tests

- 1207 tests across 27 test files, all passing.
- Updated assertions to match new event contracts and shadow DOM access pattern.
- Added CSRF-blocking and method-validation coverage.

---

## [Unreleased] — 0.3.x

### Added

- **`SecureForm` injection blocking** — If any child field fires `secure-threat-detected` with `threatType: 'injection'` during a session, form submission is now blocked entirely. The form sets `data-state="blocked"`, the offending field receives an inline error via the new `reportError()` API, and `secure-form-submit` is never dispatched. Resets cleanly via `form.reset()`.
- **`SecureForm` form state feedback** — `<secure-form>` now sets a `data-state` attribute (`blocked` / `success` / `error`) on submission lifecycle events. The built-in stylesheet applies a coloured `outline` to the inner `<form>` for each state; `success` auto-clears after 3 s. Override via `secure-form[data-state="..."] .secure-form`.
- **Non-blocking risk warnings on fields** — At submission, `<secure-form>` calls `reportError(message, 'warning')` on each field whose telemetry snapshot triggers a risk signal (`field_filled_without_focus`, `high_velocity_typing`, `all_fields_pasted`, `form_probing`, `high_correction_count`). Submission still proceeds; the server receives the full telemetry.
- **`SessionTelemetry.detectedThreats`** (`types.ts`) — New optional field on `SessionTelemetry`. Populated with all `ThreatDetectedDetail` records collected during the session; omitted when no threats occurred. Travels to the server in `_telemetry`.
- **New risk signals** — `injection_detected` (+40, blocks) and `csrf_token_absent` (+20, non-blocking) added to `#computeRiskScore`.
- **`SecureBaseComponent.reportError(message, variant?)` / `clearExternalError()`** — New public methods on all field components. Allow `<secure-form>` (and user code) to surface form-level error or warning messages on individual fields without disturbing the field's own validation state. Uses a dedicated `.external-error` slot in the shadow DOM so the field's `#clearErrors()` does not clobber these messages.
- **`.external-error` CSS class** (`base.css`) — Styles for the external error slot: red for `variant="error"`, amber for `variant="warning"`, using `color-mix()` tints of the existing `--secure-ui-color-error` / `--secure-ui-color-warning` tokens.

### Tests

- 1197 tests across 27 test files, all passing (up from 1182).
- New coverage: `reportError`/`clearExternalError` API, `connectedCallback` idempotency, injection blocking, form state transitions, risk warning field annotation, rate-limit exceeded and window-reset paths.
- All per-file and global coverage thresholds pass.

---

## [0.1.1] — 2026-03-13

### Added

#### New Components
- **SecureCard** — Payment card input with PAN masking, Luhn validation, card brand detection (Visa, Mastercard, Amex, Discover), expiry/CVC fields, and critical-tier defaults.
- **SecureTelemetryProvider** — Optional wrapper component that enriches form submissions with a signed environmental signals envelope. Detects automation/headless browsers, DOM script injection, suspicious screen sizes, pointer type, mouse movement, and keyboard activity.

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
