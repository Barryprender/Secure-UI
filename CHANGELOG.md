# Changelog

All notable changes to `secure-ui-components` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
