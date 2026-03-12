# secure-ui-components

Security-first Web Component library with zero dependencies.

**[Live Demo](https://barryprender.github.io/Secure-UI/)** — Try all components in your browser.

## Features

- **9 Secure Components** — Input, Textarea, Select, Form, File Upload, DateTime, Table, Submit Button, Card
- **4-Tier Security System** — `public`, `authenticated`, `sensitive`, `critical`
- **Zero Dependencies** — Pure TypeScript, no runtime dependencies
- **Progressive Enhancement** — All components render meaningful markup and work without JavaScript
- **CSP-Safe** — Styles loaded via `<link>` from `'self'`; no `unsafe-inline` required
- **SSR Friendly** — Adopts server-rendered markup on upgrade; no document access in constructors
- **Fully Customisable** — CSS Design Tokens + `::part()` API
- **Comprehensive Testing** — 689 tests, 80%+ branch coverage

---

## Installation

```bash
npm install secure-ui-components
```

---

## Quick Start

### Bundler (Vite, Webpack, Rollup)

```js
import 'secure-ui-components/secure-input';
import 'secure-ui-components/secure-form';
```

```html
<secure-input
  label="Email"
  name="email"
  type="email"
  required
  security-tier="authenticated"
></secure-input>
```

### CDN / Vanilla HTML

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/secure-ui-components/dist/styles/tokens.css">
</head>
<body>
  <secure-input label="Email" name="email" type="email" required></secure-input>

  <script type="module">
    import 'https://unpkg.com/secure-ui-components/dist/index.js';
  </script>
</body>
</html>
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

Text input with XSS prevention, masking, password strength validation, and rate limiting.

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

el.value          // get current value (unmasked)
el.value = 'foo'  // set value programmatically
el.valid          // boolean — passes all validation rules
el.name           // field name string
el.getAuditLog()  // array of audit log entries
el.clearAuditLog()
el.focus()
el.blur()
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-input` | `{ name, value, masked, tier }` |
| `secure-audit` | `{ event, tier, timestamp, … }` |

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

Multi-line input with real-time character counter and rate limiting.

**Attributes:** `label`, `name`, `placeholder`, `required`, `disabled`, `readonly`, `minlength`, `maxlength`, `rows`, `cols`, `wrap`, `value`, `security-tier`

**Properties & Methods:** `value`, `name`, `valid`, `getAuditLog()`, `clearAuditLog()`, `focus()`, `blur()`

**Events:** `secure-textarea` → `{ name, value, tier }`

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

Dropdown with option whitelist validation — prevents value injection.

**Attributes:** `label`, `name`, `required`, `disabled`, `multiple`, `size`, `value`, `security-tier`

**Properties & Methods**

```js
el.value              // current value (comma-separated for multiple)
el.selectedOptions    // string[] of selected values
el.valid
el.name
el.addOption(value, text, selected?)
el.removeOption(value)
el.clearOptions()
el.getAuditLog()
el.focus()
el.blur()
```

**Events:** `secure-select` → `{ name, value, tier }`

```html
<secure-select label="Country" name="country" required>
  <option value="">Select a country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</secure-select>
```

Light DOM `<option>` children are transferred to the shadow DOM automatically. Only values added via `<option>` or `addOption()` are accepted — attempts to set an arbitrary value are rejected.

---

### `<secure-form>`

Form container with CSRF protection, field validation, and optional fetch-enhanced submission.

> `<secure-form>` uses **light DOM** (no Shadow DOM) for native form submission compatibility.

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
| `enhance` | Enable fetch-based JSON submission instead of native |
| `security-tier` | Security tier |

**Properties & Methods**

```js
el.valid          // true if all secure child fields pass validation
el.securityTier
el.getData()      // { fieldName: value, … } including CSRF token
el.reset()
el.submit()       // programmatic submit (triggers validation)
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-form-submit` | `{ formData, formElement, preventDefault() }` — cancelable |
| `secure-form-success` | `{ formData, response }` — only fired when `enhance` is set |

**Submission modes**

- **Without `enhance`** — native browser form submission. Values from shadow DOM inputs are synced to hidden `<input type="hidden">` fields automatically.
- **With `enhance`** — intercepts submit, validates all fields, sends JSON via `fetch`. Dispatches `secure-form-submit` (cancelable) then `secure-form-success` on success.

**Example**

```html
<secure-form action="/api/register" method="POST" csrf-token="abc123" enhance>
  <secure-input label="Email" name="email" type="email" required></secure-input>
  <secure-input label="Password" name="password" type="password" required security-tier="critical"></secure-input>
  <secure-submit-button label="Register"></secure-submit-button>
</secure-form>
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

**Events:** `secure-file-upload` → `{ name, files: File[], tier }`

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
el.focus()
el.blur()
```

**Events:** `secure-datetime` → `{ name, value, type, tier }`

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
| `render` | `(value, row, key) => string` | Custom cell renderer |

**Column masking**

| Column `tier` | Behaviour |
|---------------|-----------|
| `sensitive` | Last 4 characters visible, rest masked (`••••4567`) |
| `critical` | Fully masked (`••••••••`) |

**Events:** `table-action` → `{ action, …data-attributes }` — fired when an element with `[data-action]` inside a cell is clicked.

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

Composite credit card form with a live 3D card preview, automatic card type detection, Luhn validation, and expiry checking. All four fields (number, expiry, CVC, name) render inside a single closed Shadow DOM.

**Security model:**
- Full PAN and CVC are never included in events, audit logs, or hidden form inputs
- CVC uses native `type="password"` masking — never visible on screen
- Card number is masked to last-4 on blur
- Security tier is locked to `critical` and cannot be changed
- All sensitive state is wiped on `disconnectedCallback`

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

card.valid          // true when all visible fields pass validation
card.cardType       // 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unknown'
card.last4          // last 4 digits — safe to display and log
card.name           // value of the name attribute

// For payment SDK tokenisation only — returns null if form is not valid
card.getCardData()  // { number, expiry, cvc, name } | null

card.reset()        // clears all fields and state
card.focus()        // focuses the card number input
card.getAuditLog()
```

**Events**

| Event | Detail |
|-------|--------|
| `secure-card` | `{ name, cardType, last4, expiryMonth, expiryYear, cardholderName, valid, tier }` |
| `secure-audit` | `{ event, tier, timestamp, … }` |

Note: the `secure-card` event detail intentionally omits the full PAN and CVC.

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

The card brand is detected automatically from the number prefix as you type. The 3D card visual updates its gradient and brand label accordingly.

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
<secure-card
  name="payment"
  label="Card details"
  show-name
></secure-card>
```

```js
card.addEventListener('secure-card', e => {
  console.log(e.detail.cardType, e.detail.last4, e.detail.valid);
});

// When the user clicks Pay — pass directly to your payment SDK
payButton.addEventListener('click', async () => {
  const data = card.getCardData();
  if (!data) return;
  const token = await stripe.createToken({ number: data.number, exp_month: ..., cvc: data.cvc });
  // Send token.id to your server — never data.number or data.cvc
});
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

## Common Attributes

All components support:

| Attribute | Type | Description |
|-----------|------|-------------|
| `label` | string | Visible field label |
| `name` | string | Form field name |
| `required` | boolean | Mark field as required |
| `disabled` | boolean | Disable the field |
| `readonly` | boolean | Make the field read-only |
| `security-tier` | string | `public` \| `authenticated` \| `sensitive` \| `critical` (default: `critical`) |

## Common Properties & Methods

```js
el.value          // get/set current value
el.valid          // boolean — passes all validation rules
el.name           // field name string
el.securityTier   // current security tier
el.getAuditLog()  // AuditLogEntry[]
el.clearAuditLog()
el.focus()
el.blur()
```

## Common Events

| Event | Fired by | Detail |
|-------|----------|--------|
| `secure-input` | `<secure-input>` | `{ name, value, masked, tier }` |
| `secure-textarea` | `<secure-textarea>` | `{ name, value, tier }` |
| `secure-select` | `<secure-select>` | `{ name, value, tier }` |
| `secure-datetime` | `<secure-datetime>` | `{ name, value, type, tier }` |
| `secure-file-upload` | `<secure-file-upload>` | `{ name, files, tier }` |
| `secure-form-submit` | `<secure-form>` | `{ formData, formElement, preventDefault() }` |
| `secure-form-success` | `<secure-form>` | `{ formData, response }` |
| `secure-card` | `<secure-card>` | `{ name, cardType, last4, expiryMonth, expiryYear, cardholderName, valid, tier }` |
| `secure-audit` | all components | `{ event, tier, timestamp, … }` |
| `table-action` | `<secure-table>` | `{ action, row }` |

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
