# secure-ui-components

Security-first web component library with zero dependencies.

**[Live Demo](https://barryprender.github.io/Secure-UI/)** — Try all components in your browser.

## 🔒 Features

- **8 Secure Components**: Input, Textarea, Select, Form, File Upload, DateTime, Table, Submit Button
- **4-Tier Security System**: PUBLIC, AUTHENTICATED, SENSITIVE, CRITICAL
- **Progressive Enhancement**: Works without JavaScript
- **Zero Dependencies**: Pure TypeScript, no runtime dependencies
- **Fully Customizable**: CSS Design Tokens + CSS Parts API
- **SSR Friendly**: Components render meaningful markup without JavaScript
- **Comprehensive Testing**: Unit tests and security tests included

## 📦 Installation

```bash
npm install secure-ui-components
```

## 🚀 Quick Start

### Bundler (Vite, Webpack, Rollup, etc.)

Import the components you need — each import auto-registers its custom element:

```js
import 'secure-ui-components/secure-input';
import 'secure-ui-components/secure-form';
```

Then use them in your HTML:

```html
<secure-input
  label="Email Address"
  name="email"
  type="email"
  required
  security-tier="authenticated"
></secure-input>
```

### CDN / Vanilla HTML (no bundler)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/secure-ui-components/dist/styles/tokens.css">
</head>
<body>
  <secure-input
    label="Email Address"
    name="email"
    type="email"
    required
    security-tier="authenticated"
  ></secure-input>

  <script type="module">
    import 'https://unpkg.com/secure-ui-components/dist/index.js';
  </script>
</body>
</html>
```

## 🧩 Available Components

### SecureInput
Text input with security features and validation.

```html
<secure-input
  label="Password"
  name="password"
  type="password"
  required
  security-tier="critical"
></secure-input>
```

### SecureTextarea
Multi-line text input with character counting.

```html
<secure-textarea
  label="Description"
  name="description"
  rows="5"
  maxlength="500"
></secure-textarea>
```

### SecureSelect
Dropdown select with XSS prevention.

```html
<secure-select
  label="Country"
  name="country"
  required
>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</secure-select>
```

### SecureForm
Form container with CSRF protection.

```html
<secure-form
  action="/api/submit"
  method="post"
  csrf-token="your-token"
  security-tier="sensitive"
>
  <!-- Your form fields here -->
</secure-form>
```

### SecureFileUpload
File upload with drag-drop and validation.

```html
<secure-file-upload
  label="Upload Document"
  name="document"
  accept="image/*,.pdf"
  max-size="5242880"
></secure-file-upload>
```

### SecureDateTime
Date and time picker with range validation.

```html
<secure-datetime
  label="Birth Date"
  name="birthdate"
  type="date"
  min="1900-01-01"
  max="2025-12-31"
></secure-datetime>
```

### SecureSubmitButton
Accessible submit button with loading state and security integration.

```html
<secure-submit-button label="Submit"></secure-submit-button>
```

### SecureTable
Data table with sorting, filtering, and pagination.

```javascript
const table = document.querySelector('secure-table');
table.data = [
  { id: 1, name: 'John', email: 'john@example.com' },
  { id: 2, name: 'Jane', email: 'jane@example.com' }
];
table.columns = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'Name', sortable: true, filterable: true },
  { key: 'email', label: 'Email', sortable: true, tier: 'sensitive' }
];
```

## 🎨 Customization

### Using Design Tokens

```css
:root {
  /* Override global colors */
  --secure-ui-color-primary: #your-brand-color;
  --secure-ui-input-border-radius: 8px;
  --secure-ui-font-family-base: 'Your Font', sans-serif;
}
```

### Using CSS Parts API

```css
/* Style internal elements */
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

See the [Customization Guide](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/customization.md) for a complete styling guide with examples.

## 🔐 Security Tiers

```html
<!-- PUBLIC: Basic validation -->
<secure-input security-tier="public"></secure-input>

<!-- AUTHENTICATED: Enhanced validation, detailed logging -->
<secure-input security-tier="authenticated"></secure-input>

<!-- SENSITIVE: Strict validation, autocomplete disabled -->
<secure-input security-tier="sensitive"></secure-input>

<!-- CRITICAL: Maximum security, masking, rate limiting -->
<secure-input security-tier="critical" type="password"></secure-input>
```

## 🧪 Testing

All components include comprehensive tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## 📖 Documentation

- [Customization Guide](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/customization.md) - Complete styling guide
- [Architecture](https://github.com/Barryprender/Secure-UI/blob/main/secure-ui-components/docs/ARCHITECTURE.md) - Technical architecture details

## 📝 API Reference

### Common Attributes

All components support:

| Attribute | Type | Description |
|-----------|------|-------------|
| `label` | `string` | Visible field label |
| `name` | `string` | Form field name |
| `required` | `boolean` | Mark field as required |
| `disabled` | `boolean` | Disable the field |
| `readonly` | `boolean` | Make the field read-only |
| `security-tier` | `string` | Security level: `public`, `authenticated`, `sensitive`, `critical` (default: `critical`) |

### Common Properties / Methods

```js
const el = document.querySelector('secure-input');

el.value          // get current value (unmasked)
el.value = 'foo'  // set value programmatically
el.valid          // boolean — passes all validation rules
el.name           // field name string
el.getAuditLog()  // returns array of security audit log entries
```

`secure-file-upload` also exposes:

```js
el.files          // FileList | null
el.clear()        // clear selected files
el.hasScanHook    // boolean
el.scanning       // boolean — true while scan hook is running
el.setScanHook(async (file) => { return { valid: true } })
```

### Common Events

| Event | Fired by | Detail |
|-------|----------|--------|
| `secure-input` | `secure-input` | `{ name, value, masked, tier }` |
| `secure-textarea` | `secure-textarea` | `{ name, value, tier }` |
| `secure-select` | `secure-select` | `{ name, value, tier }` |
| `secure-datetime` | `secure-datetime` | `{ name, value, type, tier }` |
| `secure-file-upload` | `secure-file-upload` | `{ name, files, tier }` |
| `secure-form-submit` | `secure-form` | `{ formData, formElement, preventDefault }` |
| `secure-form-success` | `secure-form` | `{ formData, response }` |
| `secure-audit` | all components | `{ event, tier, timestamp, … }` |
| `table-action` | `secure-table` | `{ action, row }` |

## 🤝 Contributing

Contributions are welcome! Please see the main repository for guidelines.

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Links

- [GitHub Repository](https://github.com/Barryprender/Secure-UI)
- [Live Demo](https://barryprender.github.io/Secure-UI/)

## 🆘 Support

- [Issue Tracker](https://github.com/Barryprender/Secure-UI/issues)
- [Discussions](https://github.com/Barryprender/Secure-UI/discussions)
