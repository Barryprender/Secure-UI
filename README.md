# @secure-ui/components

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

Clone the repository and build from source:

```bash
git clone https://github.com/Barryprender/Secure-UI.git
cd Secure-UI/secure-ui-components
npm install
npm run build
```

## 🚀 Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Include design tokens (optional but recommended) -->
  <link rel="stylesheet" href="dist/styles/tokens.css">
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
    import { SecureInput } from './dist/components/secure-input/secure-input.js';
    customElements.define('secure-input', SecureInput);
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

See `docs/customization.md` for complete styling guide with examples.

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

- [Customization Guide](./docs/customization.md) - Complete styling guide
- [Architecture](./docs/ARCHITECTURE.md) - Technical architecture details

## 🛠️ Building

```bash
# Build for production
npm run build

# Build for development (dynamic CSS loading)
npm run build:dev
```

## 📝 API Reference

### Common Properties

All components support:

- `label` - Field label text
- `name` - Form field name
- `required` - Boolean for required validation
- `disabled` - Boolean for disabled state
- `readonly` - Boolean for readonly state
- `security-tier` - Security level (public, authenticated, sensitive, critical)

### Common Methods

- `getValue()` - Get component value
- `setValue(value)` - Set component value
- `clear()` - Clear component value
- `validate()` - Validate component
- `getAuditLog()` - Get security audit logs

### Common Events

- `secure-input` - Input value changed
- `secure-textarea` - Textarea value changed
- `secure-select` - Select value changed
- `secure-datetime` - DateTime value changed
- `secure-file-upload` - File upload completed
- `secure-form-submit` - Form pre-submit (cancelable)
- `secure-form-success` - Form submission succeeded
- `secure-audit` - Security event logged (all components)
- `table-action` - Table row action triggered

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
