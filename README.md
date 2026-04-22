# secure-ui-components

Security-first Web Component library with built-in behavioral telemetry. Zero dependencies.

**[Live Demo](https://barryprender.github.io/Secure-UI/)** — Try all components in your browser.

## Features

- **11 Secure Components** — Input, Textarea, Select, Form, File Upload, DateTime, Table, Submit Button, Card, Password Confirm, Telemetry Provider
- **4-Tier Security System** — `public`, `authenticated`, `sensitive`, `critical`
- **Behavioral Telemetry** — Every field collects typing patterns, paste detection, dwell time, and correction signals automatically
- **Risk Scoring** — `<secure-form>` aggregates field signals into a session-level risk score at submission; per-field warnings surface directly on the offending inputs
- **Injection Detection** — All input fields scan for XSS, script injection, and template injection patterns in real time; fires `secure-threat-detected` with the matched pattern ID; injection attempts **block form submission** with an immediate red-border UI state. This is a UX control and early-warning signal — real XSS prevention requires server-side output encoding and a strict Content Security Policy.
- **CSRF Threat Detection** — `<secure-form>` fires `secure-threat-detected` at submission when a CSRF token is absent on `sensitive` or `critical` tier forms
- **Form UI Feedback** — `<secure-form>` sets `data-state` on itself at key moments: `blocked` (injection detected), `success` (server 2xx, auto-clears after 3 s), `error` (server/network failure); individual fields receive inline error or warning messages
- **Signed Envelopes** — `<secure-telemetry-provider>` detects automation/headless browsers, accumulates threat signals, and signs every submission with HMAC-SHA-256. The signing key is supplied via `setSigningKey()` (preferred) or the `signing-key` HTML attribute (automatically migrated to a private field and removed from the DOM on connect). The signature is tamper-evidence — it raises the cost of casual spoofing but does not constitute cryptographic proof, as the key lives in client-side JS memory.
- **Zero Dependencies** — Pure TypeScript, no runtime dependencies
- **Progressive Enhancement** — All components render meaningful markup and work without JavaScript
- **CSP-Safe** — Bundle mode uses `adoptedStyleSheets` (constructable stylesheets, exempt from `unsafe-inline`); ESM/dev mode uses `<link>` from `'self'`; neither requires `unsafe-inline`
- **SSR Friendly** — Adopts server-rendered markup on upgrade; no document access in constructors
- **Fully Customisable** — CSS Design Tokens + `::part()` API
- **Comprehensive Testing** — 1200 tests, 84%+ branch coverage

---

## Philosophy: Security Telemetry as a First-Class Primitive

Traditional form security stops at validation and CSRF protection. Secure-UI goes further — every form submission carries a behavioral fingerprint that travels alongside the user's data, giving the server the context it needs to distinguish real users from bots and credential stuffers in a single atomic request.

```
Field interaction  →  Behavioral signals  →  Risk score  →  Signed envelope
(SecureBaseComponent)  (SecureForm)           (SecureForm)    (SecureTelemetryProvider)
```

**Layer 1 — Field-level signals** (`SecureBaseComponent`)
Every secure field silently records: dwell time from focus to first keystroke, typing velocity, correction count (backspace/delete), paste detection, autofill detection, focus count, and blur-without-change patterns. On every input event, the raw value is scanned against injection patterns (XSS, script tags, JS protocols, event handlers, template injection, and more) — a `secure-threat-detected` event is dispatched if a match is found, with the matched pattern ID but never the raw value.

**Layer 2 — Session aggregation** (`<secure-form>`)
At submission, the form queries `getFieldTelemetry()` from every child field, produces per-field snapshots, and computes a composite risk score from 0–100. If any injection threat was detected during the session, submission is **blocked** — the form sets `data-state="blocked"` and marks the offending field with an inline error; the `secure-form-submit` event never fires. Non-blocking telemetry signals (bot-like velocity, unfocused fill, paste-only entry, etc.) annotate the specific fields with inline warnings without preventing submission. All detected threats are captured in `SessionTelemetry.detectedThreats`. For `sensitive` and `critical` tiers, a missing CSRF token at submission time triggers a `secure-threat-detected` event. The full telemetry payload (including `detectedThreats`) travels alongside form data in a single `fetch` request as `_telemetry`.

**Layer 3 — Environmental signals** (`<secure-telemetry-provider>`)
An optional overlay that wraps `<secure-form>`. Monitors for WebDriver/headless flags, DOM script injection (via `MutationObserver`), suspicious screen dimensions, and pointer/keyboard activity. Accumulates all `secure-threat-detected` signals from child components during the session into `threatSignals`. Signs the final envelope with HMAC-SHA-256 using a cached `CryptoKey` (imported once per key value, re-imported only on rotation) so the server can detect replay attacks and inspect any injection or CSRF threats that occurred during the session.

**What the server receives (enhanced submission):**

```json
{
  "email": "user@example.com",
  "password": "...",
  "_telemetry": {
    "sessionDuration": 14320,
    "fieldCount": 2,
    "riskScore": 5,
    "riskSignals": [],
    "submittedAt": "2026-03-12T18:30:00.000Z",
    "fields": [
      {
        "fieldName": "email",
        "fieldType": "secure-input",
        "dwell": 420,
        "completionTime": 3100,
        "velocity": 4.2,
        "corrections": 1,
        "pasteDetected": false,
        "autofillDetected": false,
        "focusCount": 1,
        "blurWithoutChange": 0
      }
    ],
    "_env": {
      "nonce": "a3f9...",
      "issuedAt": "2026-03-12T18:30:00.000Z",
      "environment": {
        "webdriverDetected": false,
        "headlessDetected": false,
        "mouseMovementDetected": true,
        "pointerType": "mouse",
        "threatSignals": [
          {
            "fieldName": "comment",
            "threatType": "injection",
            "patternId": "script-tag",
            "tier": "sensitive",
            "timestamp": 1743616200000
          }
        ]
      },
      "signature": "7d3a..."
    }
  }
}
```

**Risk signals**

Signals marked **blocks** prevent submission entirely. All others are non-blocking — they annotate individual fields with inline warnings and appear in `riskSignals` for the server.

| Signal | Condition | Score | Blocking |
|--------|-----------|-------|----------|
| `injection_detected` | Any field fired `secure-threat-detected` with `threatType: 'injection'` | +40 | **yes** |
| `session_too_fast` | Submitted in under 3 s | +30 | no |
| `all_fields_pasted` | All fields pasted, no keystrokes | +25 | no |
| `csrf_token_absent` | CSRF token absent at submission on sensitive/critical tier | +20 | no |
| `field_filled_without_focus` | Any field has `focusCount = 0` | +15 | no |
| `high_velocity_typing` | Any field velocity > 15 ks/s | +15 | no |
| `session_fast` | Submitted in under 8 s | +10 | no |
| `form_probing` | Field focused/blurred > 1× with no input | +10 | no |
| `high_correction_count` | Any field with > 5 corrections | +5 | no |
| `autofill_detected` | All fields autofilled (trust signal) | −10 | no |

---

## Installation

```bash
npm install secure-ui-components
```

---

## Quick Start

### Any bundler (Vite, webpack, Rollup, Angular CLI, Next.js, etc.)

One import registers all 11 components as side effects. No CSS file required — all component styles are inlined in the bundle.

```js
import 'secure-ui-components/bundle';
```

Optionally link the design tokens stylesheet if you want to override theme values:

```js
// In your global CSS / SCSS entry
@import 'secure-ui-components/tokens.css';
```

### Vanilla HTML / CDN

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Optional: design tokens for theming -->
  <link rel="stylesheet" href="https://unpkg.com/secure-ui-components/dist/styles/tokens.css">
</head>
<body>
  <secure-input label="Email" name="email" type="email" required></secure-input>

  <!-- Single script — all components registered, all styles inlined -->
  <script type="module" src="https://unpkg.com/secure-ui-components/dist/secure-ui.bundle.js"></script>
</body>
</html>
```

### Tree-shakeable ESM (advanced)

If you only need specific components and want the smallest possible bundle, import them individually. Note: this approach requires your dev server / CDN to serve the component CSS files alongside the JS (the bundle approach above has no such requirement).

```js
import 'secure-ui-components/secure-input';
import 'secure-ui-components/secure-form';
import 'secure-ui-components/secure-telemetry-provider';
```

---

## Example: Login form with telemetry

```html
<secure-telemetry-provider>
  <secure-form action="/api/login" method="POST" csrf-token="..." use-fetch>
    <secure-input label="Email" name="email" type="email" required security-tier="authenticated"></secure-input>
    <secure-input label="Password" name="password" type="password" required security-tier="critical"></secure-input>
    <secure-submit-button label="Sign in" loading-label="Signing in…"></secure-submit-button>
  </secure-form>
</secure-telemetry-provider>
```

```js
// Supply the HMAC key via JS so it never appears in the DOM
document.querySelector('secure-telemetry-provider').setSigningKey(perSessionKeyFromServer);

document.querySelector('secure-form').addEventListener('secure-form-submit', (e) => {
  const { formData, telemetry } = e.detail;
  console.log('Risk score:', telemetry.riskScore);
  console.log('Risk signals:', telemetry.riskSignals);
});
```

---

## Security Tiers

All components accept a `security-tier` attribute. The default is `critical`.

| Tier | Level | Masking | Autocomplete | Rate Limit | Audit |
|------|-------|---------|--------------|------------|-------|
| `public` | 1 | off | on | off | minimal |
| `authenticated` | 2 | off | on | off | changes + submission |
| `sensitive` | 3 | partial (last 4 chars) | off | 10/min | full |
| `critical` | 4 | full | off | 5/min | full |

```html
<secure-input security-tier="public" label="Username" name="username"></secure-input>
<secure-input security-tier="sensitive" label="Card Number" name="card"></secure-input>
<secure-input security-tier="critical" type="password" label="Password" name="password"></secure-input>
```

The `security-tier` attribute is **immutable after connection** — changes after `connectedCallback` are silently ignored (fail-secure).

---

## Components

### `<secure-input>`

Text input with XSS prevention, masking, password strength validation, rate limiting, and automatic telemetry collection.

**Attributes**

| Attribute | Type | Description |
|-----------|------|-------------|
| `label` | string | Visible field label |
| `name` | string | Form field name |
| `type` | string | Input type — `text`, `password`, `email`, `tel`, `number`, `url`, `search` |
| `placeholder` | string | Placeholder text |
| `required` | boolean | Mark as required |
| `disabled` | boolean | Disable the field |
| `readonly` | boolean | Make read-only |
| `pattern` | string | Regex validation pattern |
| `minlength` | number | Minimum character length |
| `maxlength` | number | Maximum character length |
| `autocomplete` | string | Autocomplete hint (overridden to `off` for sensitive/critical) |
| `value` | string | Initial value |
| `security-tier` | string | `public` \| `authenticated` \| `sensitive` \| `critical` |

**Properties & Methods**

```js
const el = document.querySelector('secure-input');

el.value              // get current value (unmasked)
el.value = 'foo'      // set value programmatically
el.valid              // boolean — passes all validation rules
el.name               // field name string
el.getAuditLog()      // AuditLogEntry[]
el.getFieldTelemetry() // FieldTelemetry — behavioral signals for this field
el.focus()
el.blur()
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-input-change` | `{ name, masked, tier }` — `value` is intentionally absent; read `(event.target as SecureInput).value` directly to avoid broadcasting sensitive data to all page listeners |
| `secure-audit` | `{ event, tier, timestamp, data? }` |
| `secure-threat-detected` | `{ fieldName, threatType: 'injection', patternId, tier, timestamp }` — fired when a known injection pattern is detected in the field value |

**Example**

```html
<secure-input
  label="Password"
  name="password"
  type="password"
  required
  security-tier="critical"
></secure-input>
```

---

### `<secure-textarea>`

Multi-line input with real-time character counter, rate limiting, and automatic telemetry collection.

**Attributes:** `label`, `name`, `placeholder`, `required`, `disabled`, `readonly`, `minlength`, `maxlength`, `rows`, `cols`, `wrap`, `value`, `security-tier`

**Properties & Methods:** `value`, `name`, `valid`, `getAuditLog()`, `getFieldTelemetry()`, `focus()`, `blur()`

**Events:** `secure-textarea-change` → `{ name, value, tier }`

```html
<secure-textarea
  label="Description"
  name="description"
  maxlength="500"
  rows="5"
></secure-textarea>
```

---

### `<secure-select>`

Dropdown with option whitelist validation — prevents value injection. Telemetry collected on `change` events.

**Attributes:** `label`, `name`, `required`, `disabled`, `multiple`, `size`, `value`, `security-tier`

**Properties & Methods**

```js
el.value              // string for single-select; string[] for multi-select
el.selectedOptions    // string[] of selected values
el.valid
el.name
el.addOption(value, text, selected?)
el.removeOption(value)
el.clearOptions()
el.getAuditLog()
el.getFieldTelemetry()
el.focus()
el.blur()
```

**Events:** `secure-select-change` → `{ name, value: string | string[], tier }` — `value` is `string[]` for multi-select, `string` for single

```html
<secure-select label="Country" name="country" required>
  <option value="">Select a country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</secure-select>
```

Light DOM `<option>` children are transferred to the shadow DOM automatically. Only values added via `<option>` or `addOption()` are accepted.

---

### `<secure-form>`

Form container with CSRF protection, field validation, behavioral telemetry aggregation, injection blocking, and optional fetch-enhanced submission.

> `<secure-form>` uses **light DOM** (no Shadow DOM) for native form submission compatibility.

**Injection blocking** — If any child field fires `secure-threat-detected` with `threatType: 'injection'` during the session, `<secure-form>` immediately sets `data-state="blocked"` and marks the offending field with an inline error. Submission is prevented until the form is reset.

**Form state feedback** — `<secure-form>` sets a `data-state` attribute on itself that you can target with CSS:

| `data-state` | When set | Clears |
|---|---|---|
| `blocked` | Injection threat detected | On `reset()` |
| `success` | Server returns 2xx | Automatically after 3 s |
| `error` | Server/network error | On next submission |

The built-in stylesheet applies a coloured `outline` to the inner `<form>` for each state. Override via `secure-form[data-state="success"] .secure-form { outline-color: … }`.

**Risk warnings** — Non-blocking telemetry signals (high velocity, unfocused fill, paste-only, etc.) are surfaced as inline `warning` messages on the specific fields at submission time. Submission still proceeds.

**Attributes**

| Attribute | Description |
|-----------|-------------|
| `action` | Form submission URL |
| `method` | HTTP method (default `POST`) |
| `enctype` | Encoding type |
| `csrf-token` | CSRF token value injected as a hidden field |
| `csrf-field-name` | Hidden field name (default `csrf_token`) |
| `csrf-header-name` | Also send CSRF token in this request header |
| `novalidate` | Disable browser constraint validation |
| `use-fetch` | Enable fetch-based JSON submission instead of native HTML form submission |
| `security-tier` | Security tier |

**Properties & Methods**

```js
el.valid          // true if all secure child fields pass validation
el.securityTier
el.getData()      // { fieldName: value, … } including CSRF token
el.getAuditLog()  // AuditLogEntry[] — form-level audit trail
el.reset()
el.submit()       // programmatic submit (triggers validation + telemetry)
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-form-submit` | `{ formData, telemetry, cancelSubmission() }` — cancelable. Call `e.detail.cancelSubmission()` to abort the library's fetch submission and re-enable the form, or call `e.preventDefault()` (native) to prevent the `fetch` from being sent. |
| `secure-form-success` | `{ status, ok, telemetry }` — only when `use-fetch` is set. `formData` and the raw `Response` are intentionally absent; they must not propagate globally via a bubbling event. |
| `secure-threat-detected` | `{ fieldName, threatType: 'csrf-token-absent', patternId, tier, timestamp }` — fired on `sensitive`/`critical` tiers when CSRF token is absent at submission |

**`telemetry` shape** (`SessionTelemetry`):

```ts
{
  sessionDuration: number;                    // ms from form mount to submission
  fieldCount: number;
  fields: FieldTelemetrySnapshot[];
  riskScore: number;                          // 0–100
  riskSignals: string[];                      // e.g. ['injection_detected', 'session_too_fast']
  submittedAt: string;                        // ISO 8601
  detectedThreats?: ThreatDetectedDetail[];   // injection/csrf threats seen this session; omitted when none
}
```

**Submission modes**

- **Without `use-fetch`** — native browser form submission. Values from shadow DOM inputs are synced to hidden `<input type="hidden">` fields automatically. Telemetry is available in `secure-form-submit` but not sent to the server.
- **With `use-fetch`** — intercepts submit, validates all fields, sends `{ ...formData, _telemetry }` as JSON via `fetch`. Full telemetry payload travels to the server in the same request.

**Example**

```html
<secure-form action="/api/register" method="POST" csrf-token="abc123" use-fetch>
  <secure-input label="Email" name="email" type="email" required></secure-input>
  <secure-input label="Password" name="password" type="password" required security-tier="critical"></secure-input>
  <secure-submit-button label="Register"></secure-submit-button>
</secure-form>
```

```js
form.addEventListener('secure-form-submit', (e) => {
  const { formData, telemetry } = e.detail;

  // Injection attempts are already blocked before this event fires.
  // detectedThreats contains any csrf-token-absent signals that slipped through.
  if (telemetry.detectedThreats?.length) {
    console.warn('Threats recorded this session:', telemetry.detectedThreats);
  }

  // Non-blocking risk warnings — fields are already annotated by the form;
  // you can additionally gate on score server-side.
  analytics.track('form_submit', {
    risk: telemetry.riskScore,
    signals: telemetry.riskSignals,
  });
});
```

---

### `<secure-telemetry-provider>`

Optional overlay that wraps `<secure-form>` to add environmental signals and HMAC-SHA-256 signing to every submission envelope.

> Place this as the outer wrapper. It monitors the entire document for automation markers and DOM tampering during the session.

**Attributes**

| Attribute | Description |
|-----------|-------------|
| `signing-key` | HMAC-SHA-256 key — immediately migrated to a private JS field and **removed from the DOM** in `connectedCallback`. Prefer `setSigningKey()` so the key never appears in the DOM at all. |

**Properties & Methods**

```js
const provider = document.querySelector('secure-telemetry-provider');

provider.setSigningKey(key)      // preferred: supply key via JS, never touches the DOM
provider.collectSignals()        // EnvironmentalSignals — point-in-time snapshot
provider.getEnvironmentalSignals() // alias for collectSignals()
provider.sign(signals)           // Promise<SignedTelemetryEnvelope>
```

**What it detects**

| Signal | Description |
|--------|-------------|
| `webdriverDetected` | `navigator.webdriver` present or truthy |
| `headlessDetected` | `HeadlessChrome` in userAgent or missing `window.chrome` |
| `domMutationDetected` | New `<script>` element injected after page load |
| `injectedScriptCount` | Count of dynamically added `<script>` elements |
| `suspiciousScreenSize` | Screen width or height is zero or < 100px |
| `pointerType` | Last pointer event type: `mouse` \| `touch` \| `pen` \| `none` |
| `mouseMovementDetected` | Any `mousemove` event fired during session |
| `keyboardActivityDetected` | Any `keydown` event fired during session |
| `threatSignals` | Array of `ThreatDetectedDetail` objects accumulated from all `secure-threat-detected` events during the session; `undefined` when no threats were detected |

**How the envelope is injected**

The provider listens for `secure-form-submit` on itself (bubbles from the nested form). It calls `sign()` asynchronously and attaches the result as `detail.telemetry._env`. Since it mutates the same object reference, any handler that awaits a microtask after the event fires will see `_env` populated.

**Signed envelope shape** (`SignedTelemetryEnvelope`):

```ts
{
  nonce: string;                   // 32-char random hex — detect replays
  issuedAt: string;                // ISO 8601
  environment: EnvironmentalSignals;
  signature: string;               // HMAC-SHA-256 hex over nonce.issuedAt.JSON(environment)
}
```

**Security notes**

- The `signing-key` is a *symmetric* secret kept in client-side JS memory. Any same-page XSS or privileged script can read it from the heap and forge arbitrary envelopes. The signature provides tamper-evidence against casual spoofing — it is not cryptographic proof. For stronger guarantees, rotate the key per-session via a server nonce endpoint.
- Prefer `setSigningKey()` over the HTML attribute. If you do use the attribute, the component removes it from the DOM immediately in `connectedCallback` so it cannot be read by `getAttribute()` or devtools after mount.
- The `CryptoKey` is imported once and cached; it is re-imported only when the key value changes via `setSigningKey()`, and cleared on `disconnectedCallback`.
- All signals are heuristic — a determined attacker can spoof them. The value is raising the cost of scripted attacks.
- In non-secure contexts (`http://`) `SubtleCrypto` is unavailable; the signature will be an empty string. The server should treat unsigned envelopes with reduced trust.

**Example**

```html
<secure-telemetry-provider>
  <secure-form action="/api/login" use-fetch csrf-token="...">
    <secure-input label="Email" name="email" type="email" required></secure-input>
    <secure-input label="Password" name="password" type="password" required security-tier="critical"></secure-input>
    <secure-submit-button label="Sign in"></secure-submit-button>
  </secure-form>
</secure-telemetry-provider>
```

```js
// Inject the key via JS — never embed it as a static HTML attribute
document.querySelector('secure-telemetry-provider').setSigningKey(perSessionKeyFromServer);

document.querySelector('secure-form').addEventListener('secure-form-submit', async (e) => {
  const { telemetry } = e.detail;

  // _env is populated async by the provider — wait a microtask
  await Promise.resolve();

  if (telemetry._env) {
    console.log('Nonce:', telemetry._env.nonce);
    console.log('Signature:', telemetry._env.signature);
    // Verify signature server-side with the same key
  }
});
```

---

### `<secure-file-upload>`

Drag-and-drop file upload with content validation and optional malware scan hook.

**Attributes**

| Attribute | Description |
|-----------|-------------|
| `label` | Visible label |
| `name` | Field name |
| `accept` | Accepted MIME types / extensions (e.g. `image/*,.pdf`) |
| `max-size` | Max file size in bytes |
| `multiple` | Allow multiple files |
| `required` | Mark as required |
| `capture` | Camera capture hint |
| `security-tier` | Security tier |

**Size limits by tier (when `max-size` is not set)**

| Tier | Limit |
|------|-------|
| `public` | 20 MB |
| `authenticated` | 10 MB |
| `sensitive` | 5 MB |
| `critical` | 2 MB |

**Properties & Methods**

```js
el.files          // FileList | null
el.valid
el.name
el.hasScanHook    // boolean
el.scanning       // boolean — true while scan hook is running
el.clear()
el.setScanHook(async (file) => { return { valid: true } })
el.getAuditLog()
```

**Scan hook**

```js
upload.setScanHook(async (file) => {
  const result = await myApi.scanFile(file);
  return { valid: result.clean, reason: result.threat };
});
```

**Events:** `secure-file-change` → `{ name, files: File[], tier }`

**Content validation (critical tier):** Magic number verification for JPEG, PNG, and PDF files.

**Filename validation:** Blocks path traversal (e.g. `../`), null bytes, and dangerous config file names.

```html
<secure-file-upload
  label="Upload Document"
  name="document"
  accept="image/*,.pdf"
  max-size="5242880"
  security-tier="sensitive"
></secure-file-upload>
```

---

### `<secure-datetime>`

Date and time picker with format validation, range enforcement, and timezone display.

**Attributes**

| Attribute | Description |
|-----------|-------------|
| `label` | Visible label |
| `name` | Field name |
| `type` | `date` \| `time` \| `datetime-local` \| `month` \| `week` (default `date`) |
| `min` | Minimum date/time (ISO format) |
| `max` | Maximum date/time (ISO format) |
| `step` | Step value |
| `value` | Initial value (ISO format) |
| `required` | Mark as required |
| `disabled` | Disable the field |
| `readonly` | Make read-only |
| `show-timezone` | Display UTC offset alongside the input |
| `security-tier` | Security tier |

**Properties & Methods**

```js
el.value                     // ISO string
el.value = '2025-06-15'      // set value
el.valid
el.name
el.getValueAsDate()          // Date | null
el.setValueFromDate(date)    // accepts Date object, sets formatted value
el.getAuditLog()
el.getFieldTelemetry()
el.focus()
el.blur()
```

**Events:** `secure-datetime-change` → `{ name, value, type, tier }`

**CRITICAL tier:** Year must be between 1900 and 2100.

```html
<secure-datetime
  label="Appointment"
  name="appointment"
  type="datetime-local"
  min="2025-01-01T00:00"
  max="2030-12-31T23:59"
  required
></secure-datetime>
```

---

### `<secure-table>`

Data table with sorting, filtering, pagination, and column-level data masking.

**Properties**

```js
table.data = [
  { id: 1, name: 'Alice', ssn: '123-45-6789' },
];
table.columns = [
  { key: 'id',   label: 'ID',   sortable: true },
  { key: 'name', label: 'Name', sortable: true, filterable: true },
  { key: 'ssn',  label: 'SSN',  tier: 'critical' },  // masked
];
```

**Column definition**

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | Data object key |
| `label` | string | Column header text |
| `sortable` | boolean | Enable click-to-sort |
| `filterable` | boolean | Include in global search |
| `tier` | string | Mask values at this tier level |
| `width` | string | CSS column width |
| `render` | `(value, row, key) => string` | Custom cell renderer — return value is treated as HTML and sanitized before insertion (event handlers and disallowed tags stripped) |

**Column masking**

| Column `tier` | Behaviour |
|---------------|-----------|
| `sensitive` | Last 4 characters visible, rest masked (`••••4567`) |
| `critical` | Fully masked (`••••••••`) |

**Events:** `secure-table-action` → `{ action, …data-attributes }` — fired when an element with `[data-action]` inside a cell is clicked.

**Progressive enhancement:** Place a `<table slot="table">` with `data-key` attributes on `<th>` elements inside `<secure-table>` — the component reads columns and data from the server-rendered markup.

```js
table.columns = [
  {
    key: 'status',
    label: 'Status',
    render: (value) => `<span class="badge">${value}</span>`
  }
];
```

---

### `<secure-card>`

Composite credit card form with a live 3D card preview, automatic card type detection, Luhn validation, expiry checking, and aggregate telemetry across all four fields. All inputs render inside a single closed Shadow DOM.

**Security model:**
- Full PAN and CVC are never included in events, audit logs, or hidden form inputs
- CVC uses native `type="password"` masking — never visible on screen
- Card number is masked to last-4 on blur
- All four inputs use `autocomplete="off"` — browsers must not store or suggest card data (PCI DSS requirement; contradicts browser `cc-*` autocomplete hints)
- Security tier is locked to `critical` and cannot be changed
- All sensitive state is wiped on `disconnectedCallback`
- Telemetry from all four inputs (number, expiry, CVC, name) is aggregated into one composite behavioral fingerprint

> Raw card data must be passed directly to a PCI-compliant payment processor SDK (e.g. Stripe.js, Braintree). Use `getCardData()` for that handoff — never send raw card numbers or CVCs to your own server.

**Attributes**

| Attribute | Type | Description |
|-----------|------|-------------|
| `label` | string | Legend text displayed above the fields |
| `name` | string | Base name for hidden form inputs |
| `show-name` | boolean | Show the optional cardholder name field |
| `disabled` | boolean | Disable all fields |
| `required` | boolean | Mark fields as required |

**Properties & Methods**

```js
const card = document.querySelector('secure-card');

card.valid              // true when all visible fields pass validation
card.cardType           // 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unknown'
card.last4              // last 4 digits — safe to display and log
card.name               // value of the name attribute
card.getCardData()      // { number, expiry, cvc, name } | null — for payment SDK handoff only; requires strict CSP; call once and discard
card.getFieldTelemetry() // composite behavioral signals across all 4 card inputs
card.reset()
card.focus()
card.getAuditLog()
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-card-change` | `{ name, cardType, last4, expiryMonth: number (1–12), expiryYear: number (4-digit, e.g. 2027), cardholderName, valid, tier }` |
| `secure-audit` | `{ event, tier, timestamp, data? }` |

Note: the `secure-card-change` event detail intentionally omits the full PAN and CVC.

**CSS Parts**

| Part | Element |
|------|---------|
| `container` | Outer wrapper |
| `label` | Legend element |
| `wrapper` | Input wrapper (per field group) |
| `number-input` | Card number `<input>` |
| `expiry-input` | Expiry `<input>` |
| `cvc-input` | CVC `<input>` |
| `name-input` | Cardholder name `<input>` |
| `error` | Error message container (per field) |

**Card type detection**

| Type | Detected prefix |
|------|----------------|
| Visa | `4` |
| Mastercard | `51–55`, `2221–2720` |
| Amex | `34`, `37` |
| Discover | `6011`, `65xx` |
| Diners | `300–305`, `36`, `38` |
| JCB | `2131`, `1800`, `35xxx` |

**Form participation**

Three hidden inputs are created in the light DOM:
- `{name}` — last 4 digits only (not full PAN)
- `{name}-expiry` — MM/YY string
- `{name}-holder` — cardholder name

No hidden input is created for CVC.

**Example**

```html
<secure-card name="payment" label="Card details" show-name></secure-card>
```

```js
// When the user clicks Pay — pass directly to your payment SDK
payButton.addEventListener('click', async () => {
  const data = card.getCardData();
  if (!data) return;
  const token = await stripe.createToken({ number: data.number, exp_month: ..., cvc: data.cvc });
  // Send token.id to your server — never data.number or data.cvc
});
```

---

### `<secure-password-confirm>`

Dual-field password entry with real-time match validation, strength indicator, and injection detection on both the password and confirm inputs. Both fields use `type="password"` with autocomplete disabled at `sensitive`/`critical` tiers.

**Attributes**

| Attribute | Description |
|-----------|-------------|
| `label` | Legend displayed above the field group |
| `name` | Base name for the hidden form input |
| `required` | Mark as required |
| `disabled` | Disable both fields |
| `security-tier` | Security tier |

**Properties & Methods**

```js
const el = document.querySelector('secure-password-confirm');

el.valid                   // true when both fields match and pass validation
el.name
el.getPasswordValue()      // string — raw password; use only for form handoff
el.getFieldTelemetry()     // composite FieldTelemetry across both inputs
el.getAuditLog()
el.focus()
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-password-match` | `{ name, matched: true }` — fired when both fields contain the same value |
| `secure-password-mismatch` | `{ name, matched: false }` — fired when the values diverge |
| `secure-threat-detected` | `{ fieldName, threatType: 'injection', patternId, tier, timestamp }` — fired if an injection pattern is typed into either field |

**Form participation**

A hidden `<input type="hidden">` is created in the light DOM, kept in sync with the password value, and cleared on `disconnectedCallback`.

```html
<secure-password-confirm
  label="New password"
  name="password"
  required
  security-tier="critical"
></secure-password-confirm>
```

---

### `<secure-submit-button>`

Accessible submit button with loading state and automatic form-validity gating.

**Attributes:** `label`, `loading-label`, `disabled`, `security-tier`

**Properties**

```js
el.disabled
el.label
el.getAuditLog()
```

**Behaviour**

- For `authenticated`, `sensitive`, and `critical` tiers: button remains disabled until all required `<secure-input>`, `<secure-textarea>`, `<secure-select>`, and `<secure-datetime>` siblings report `valid = true`.
- Shows a spinner and `loading-label` during form submission.
- Rate-limited at `sensitive` / `critical` tiers.

```html
<secure-submit-button label="Submit" loading-label="Submitting…"></secure-submit-button>
```

---

## Injection & CSRF Threat Detection

### Injection detection

Every `<secure-input>`, `<secure-textarea>`, and `<secure-password-confirm>` scans the raw field value on every `input` event against these patterns:

| Pattern ID | What it catches |
|------------|-----------------|
| `script-tag` | `<script` tags |
| `js-protocol` | `javascript:` URIs |
| `event-handler` | Inline event attributes (`onclick=`, `onload=`, etc.) |
| `html-injection` | Injected elements: `<img>`, `<svg>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>` |
| `css-expression` | IE-era `expression()` CSS |
| `vbscript` | `vbscript:` URIs |
| `data-uri-html` | `data:text/html` payloads |
| `template-syntax` | `{{...}}` template injection probes |

Only the **first** matching pattern fires an event per input event to avoid flooding. The raw value is **never** included in the event detail.

When `<secure-form>` receives a `secure-threat-detected` event with `threatType: 'injection'`, it immediately sets `data-state="blocked"` on itself, displays an inline error on the offending field, and **blocks all future submission attempts** until `form.reset()` is called.

```js
document.addEventListener('secure-threat-detected', (e) => {
  const { fieldName, threatType, patternId, tier, timestamp } = e.detail;
  // threatType === 'injection'
  // patternId  === 'script-tag' | 'js-protocol' | ...
  myFraudPipeline.report({ fieldName, patternId, tier });
});
```

### CSRF threat detection

`<secure-form>` fires `secure-threat-detected` at submission time when the form is `sensitive` or `critical` tier and no CSRF token value is present. This is a defence-in-depth signal — the request is still blocked by missing CSRF validation server-side, but the event lets client-side monitoring react immediately.

```js
form.addEventListener('secure-threat-detected', (e) => {
  if (e.detail.threatType === 'csrf-token-absent') {
    console.warn('Submission attempted without CSRF token', e.detail);
  }
});
```

### `ThreatDetectedDetail` shape

```ts
{
  fieldName: string;                           // name attribute of the originating field
  threatType: 'injection' | 'csrf-token-absent';
  patternId: string;                           // e.g. 'script-tag', 'csrf-token-absent'
  tier: 'public' | 'authenticated' | 'sensitive' | 'critical';
  timestamp: number;                           // Unix ms — raw value intentionally absent
}
```

All threat signals detected during a session are collected by `<secure-telemetry-provider>` into `threatSignals` on the signed envelope, so the server receives the full picture in a single request.

---

## Common Attributes

All field components support:

| Attribute | Type | Description |
|-----------|------|-------------|
| `label` | string | Visible field label |
| `name` | string | Form field name |
| `required` | boolean | Mark field as required |
| `disabled` | boolean | Disable the field |
| `readonly` | boolean | Make the field read-only |
| `security-tier` | string | `public` \| `authenticated` \| `sensitive` \| `critical` (default: `critical`) |

## Common Properties & Methods

All field components expose these in addition to component-specific methods:

```js
el.value               // get/set current value
el.valid               // boolean — passes all validation rules
el.name                // field name string
el.securityTier        // current security tier
el.getAuditLog()       // AuditLogEntry[]
el.getFieldTelemetry() // FieldTelemetry — behavioral signals (no raw values)
el.reportError(message, variant?)  // show a form-level error ('error') or warning ('warning') on this field
el.clearExternalError()            // clear a message set by reportError()
el.focus()
el.blur()
```

**`FieldTelemetry` shape:**

```ts
{
  dwell: number;              // ms from focus to first keystroke
  completionTime: number;     // ms from first keystroke to blur
  velocity: number;           // keystrokes per second
  corrections: number;        // backspace / delete event count
  pasteDetected: boolean;
  autofillDetected: boolean;
  focusCount: number;
  blurWithoutChange: number;  // focused but left without typing
}
```

## Common Events

| Event | Fired by | Detail |
|-------|----------|--------|
| `secure-input-change` | `<secure-input>` | `{ name, masked, tier }` — `value` is intentionally absent; read `(e.target as SecureInput).value` to avoid broadcasting sensitive data to all listeners |
| `secure-textarea-change` | `<secure-textarea>` | `{ name, value, tier }` |
| `secure-select-change` | `<secure-select>` | `{ name, value: string \| string[], tier }` |
| `secure-datetime-change` | `<secure-datetime>` | `{ name, value, type, tier }` |
| `secure-file-change` | `<secure-file-upload>` | `{ name, files, tier }` |
| `secure-card-change` | `<secure-card>` | `{ name, cardType, last4, expiryMonth, expiryYear, cardholderName, valid, tier }` |
| `secure-form-submit` | `<secure-form>` | `{ formData, telemetry, cancelSubmission() }` — call `cancelSubmission()` to abort the fetch and re-enable the form |
| `secure-form-success` | `<secure-form>` | `{ status: number, ok: boolean, telemetry }` — `formData` and the raw `Response` are intentionally absent |
| `secure-table-action` | `<secure-table>` | `{ action, …data-attributes }` |
| `secure-audit` | all components | `{ event, tier, timestamp, data? }` |
| `secure-threat-detected` | `<secure-input>`, `<secure-textarea>`, `<secure-password-confirm>`, `<secure-form>` | `{ fieldName, threatType, patternId, tier, timestamp }` |

---

## Customisation

### CSS Design Tokens

Override tokens at `:root` to theme all components globally:

```css
:root {
  --secure-ui-color-primary: #6366f1;
  --secure-ui-input-border-radius: 8px;
  --secure-ui-font-family-base: 'Inter', sans-serif;
}
```

### CSS Parts API

Style internal elements directly:

```css
secure-input::part(label) {
  font-weight: 700;
  text-transform: uppercase;
}

secure-input::part(input) {
  font-family: monospace;
}

secure-input::part(error) {
  background: #ffe0e0;
  padding: 0.5rem;
}
```

**Available parts on all components:** `container`, `label`, `wrapper`, `input` / `textarea` / `select`, `error`

See the [Customization Guide](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/customization.md) for a full token reference.

---

## Per-Component Imports

Import only what you need:

```js
import 'secure-ui-components/secure-input';
import 'secure-ui-components/secure-textarea';
import 'secure-ui-components/secure-select';
import 'secure-ui-components/secure-form';
import 'secure-ui-components/secure-file-upload';
import 'secure-ui-components/secure-datetime';
import 'secure-ui-components/secure-table';
import 'secure-ui-components/secure-card';
import 'secure-ui-components/secure-password-confirm';
import 'secure-ui-components/secure-telemetry-provider';
```

Or import everything at once:

```js
import 'secure-ui-components';
```

---

## Testing

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

---

## Documentation

- [Customization Guide](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/customization.md)
- [Architecture](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/ARCHITECTURE.md)
- [Live Demo](https://barryprender.github.io/Secure-UI/)

---

## Contributing

Contributions are welcome. Please see the main repository for guidelines.

## License

MIT — see LICENSE file for details.

## Links

- [GitHub Repository](https://github.com/Barryprender/Secure-UI)
- [npm Package](https://www.npmjs.com/package/secure-ui-components)
- [Live Demo](https://barryprender.github.io/Secure-UI/)
- [Issue Tracker](https://github.com/Barryprender/Secure-UI/issues)
