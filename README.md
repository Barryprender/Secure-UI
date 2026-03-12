# secure-ui-components

Security-first Web Component library with zero dependencies.

**[Live Demo](https://barryprender.github.io/Secure-UI/)** — Try all components in your browser.

## Features

- **8 Secure Components** — Input, Textarea, Select, Form, File Upload, DateTime, Table, Submit Button
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

**Available parts on all components:** `container`, `label`, `wrapper`, `input` / `textarea` / `select`, `error`, `security-badge`

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
