# Secure-UI Components — Project Instructions

## Project Identity

This is **Secure-UI**: a zero-dependency, security-first Web Component library built with native HTML, CSS, and TypeScript. No frameworks, no build-time transforms beyond TypeScript compilation.

## Stack

- **Language**: TypeScript (strict mode, ES modules, `.js` extensions in imports)
- **Styling**: Vanilla CSS — Shadow DOM encapsulation, CSS Custom Properties, `<link>` injection
- **Components**: Custom Elements V1 / Shadow DOM V1 — no frameworks
- **Build**: `build/css-inliner.js` (production), dev mode uses raw file serving
- **Server**: Express (`server/`) for SSR and API

## Source Layout

```
src/
  core/
    base-component.ts   # Abstract SecureBaseComponent — internal only, do NOT extend externally
    security-config.ts  # SecurityTier enum + TIER_CONFIG + helpers
    types.ts            # All shared TypeScript interfaces
    base.css            # Shadow DOM base styles (loaded via <link>)
  components/
    secure-input/       # secure-input.ts + secure-input.css
    secure-textarea/
    secure-select/
    secure-form/
    secure-file-upload/
    secure-datetime/
    secure-table/
    secure-submit-button/
    secure-card/        # composite credit card form — locked to CRITICAL tier
    secure-telemetry-provider/  # light DOM overlay — extends HTMLElement directly
  styles/
    tokens.css          # Design token custom properties (:root + :host)
    shared.css          # Shared light-DOM styles
    secure-ui.css       # Public entry stylesheet
  index.ts              # Library entry point
```

## Web Component Rules

### Class structure
- All field components extend `SecureBaseComponent` from `src/core/base-component.ts`
- **Exception**: `SecureTelemetryProvider` extends `HTMLElement` directly — it is a light-DOM orchestration layer, not a form field, and must not inherit shadow DOM or security-tier machinery from `SecureBaseComponent`
- **Exception**: `SecureCard` is locked to `CRITICAL` tier unconditionally — do not expose `security-tier` as a configurable attribute; reject any attempt to change it
- **Exception**: `SecurePasswordConfirm` is locked to `CRITICAL` tier unconditionally — silently removes any `security-tier` attribute set before mount and warns if a non-critical tier is attempted
- **`SecureBaseComponent` is NOT exported** — extension is intentionally unsupported. Security invariants (closed shadow DOM, tier immutability, sanitization order) are too easy to break via subclassing. Consumers who need custom components should wrap a `<secure-input>` (or other component) inside their own custom element rather than extending the base class.
- Private fields use ES2022 `#field` syntax — never `_field` or `private` keyword alone
- `static get observedAttributes()` must spread `...super.observedAttributes`
- Override `protected render(): DocumentFragment | HTMLElement | null` — never touch `connectedCallback` directly unless you need to bypass the base render (see `secure-table` pattern)
- Override `protected handleAttributeChange()` for reactive attribute updates
- Call `this.addComponentStyles(new URL('./my-component.css', import.meta.url).href)` inside `render()` to inject component CSS
- Register with `customElements.define('secure-foo', SecureFoo)` at the bottom of the file

### Shadow DOM
- Shadow root is **closed** (`mode: 'closed'`) — access it only via `this.shadowRoot` (the protected getter on base class)
- Never use `innerHTML` with unsanitised strings; use `document.createElement` + `.textContent`
- All user-visible strings pass through `this.sanitizeValue()` before being set as `textContent`
- Styles are injected via `<link rel="stylesheet">` pointing to `'self'` — **never** `adoptedStyleSheets` with inline strings (breaks strict CSP `style-src 'self'`)

### Progressive Enhancement / Form Participation
- Shadow DOM inputs cannot participate in native `<form>` submission — create a hidden `<input type="hidden">` in the **light DOM** and keep it in sync
- If the component is nested inside `<secure-form>`, skip the hidden input — `secure-form` handles it
- Server-rendered native fallback inputs (for no-JS) must be neutralised on upgrade: remove `name`, `required`, `minlength`, `maxlength`, `pattern`; set `tabindex="-1"` and `aria-hidden="true"`

### CSS Parts API
Every component must expose named `part` attributes on key internal elements:
- `part="container"` — outer wrapper
- `part="label"` — `<label>` element
- `part="wrapper"` — input/control wrapper
- `part="input"` / `part="textarea"` / `part="select"` — the native form control
- `part="error"` — error message container
- `part="security-badge"` — tier badge

**Exception — `SecureCard`**: uses field-specific part names instead of a generic `part="input"`:
`number-input`, `expiry-input`, `cvc-input`, `name-input` (one per card field).

**Exception — `SecureTelemetryProvider`**: renders no visual elements; exposes no CSS parts.

### Custom Events
- All events use `CustomEvent` with a typed `detail` — see `src/core/types.ts` for event detail interfaces
- Always set `{ bubbles: true, composed: true }` so events cross shadow boundaries
- Naming convention: `secure-<component>-change` for value events (e.g. `secure-input-change`, `secure-select-change`); `secure-<component>-<verb>` for lifecycle events (e.g. `secure-form-submit`, `secure-form-success`, `secure-table-action`); `secure-audit` and `secure-threat-detected` are global signals

**Sensitive data must NOT appear in event details** — events bubble and compose across shadow boundaries; any page script can intercept them:
- `secure-input-change` detail: `{ name, masked, tier }` — **no `value` field**; callers read `(e.target as SecureInput).value` directly
- `secure-form-success` detail: `{ status: number, ok: boolean, telemetry }` — **no `formData`, no `Response`**; raw response body and form values must not propagate globally

## Security Architecture

### Tiers (defined in `security-config.ts`)
| Tier | Level | Masking | Autocomplete | Rate Limit | Audit |
|------|-------|---------|--------------|------------|-------|
| `public` | 1 | off | on | off | minimal |
| `authenticated` | 2 | off | on | off | changes + submission |
| `sensitive` | 3 | partial | off | 10/min | full |
| `critical` | 4 | full | off | 5/min | full |

### Fail-secure default
- Default tier is `CRITICAL`. If `security-tier` attribute is invalid or absent, the base class stays at CRITICAL
- `security-tier` is **immutable** after `connectedCallback` — reject changes via `attributeChangedCallback`

### Sanitization
- `this.sanitizeValue(str)` uses a temporary `div.textContent` round-trip — use it for every attribute value rendered as text
- Never set `innerHTML` from user-controlled content
- Use `document.createElement` + property assignment for all DOM construction

### Rate limiting
- `checkRateLimit()` in `SecureBaseComponent` is a **client-side hint only** — it resets on every page reload and can be bypassed trivially
- It is a UX friction mechanism, not a security control; server-side rate limiting is mandatory
- Same applies to `SecureForm.checkRateLimit()` — annotate with `⚠ DEPLOYMENT REQUIREMENT` comments when touching

### Injection detection
- `detectInjection()` in `SecureBaseComponent` is a **UX control and early-warning signal**, not an XSS prevention mechanism
- It fires `secure-threat-detected` and blocks form submission in the browser — motivated attackers bypass it by submitting via `fetch`/`curl` directly
- Real XSS prevention: server-side output encoding + strict Content Security Policy (`script-src 'self'`, no `unsafe-inline`)

### `SecureForm` specifics
- Default `security-tier` is `CRITICAL` (fail-secure) — changing this default requires explicit justification
- `action` URL is validated before assignment: only same-origin URLs and relative paths are accepted; cross-origin or non-http/https URLs are rejected with a warning audit event (`form_action_rejected`)
- CSS selector injection: `csrfFieldName` and `name` values used in `querySelectorAll` must be wrapped with `CSS.escape()` — already done; do not revert
- `SecureForm` audit log: real implementation (dispatches `secure-audit`, maintains in-memory capped log); not a stub

### Behavioral Telemetry
`SecureBaseComponent` provides field-level telemetry hooks that all field components must call:
- `this.recordTelemetryFocus()` — call from the field's `focus` event listener
- `this.recordTelemetryInput(event)` — call from the field's `input` event listener (detects velocity, corrections, paste, autofill)
- `this.recordTelemetryBlur()` — call from the field's `blur` event listener
- `this.getFieldTelemetry()` — public method; returns `FieldTelemetry` (no raw values — safe to log/transmit)

`SecureForm` aggregates telemetry from all child fields at submission via `getFieldTelemetry()` and computes a composite risk score. **Do not replicate this logic in individual components.**

`SecureTelemetryProvider` adds environmental signals (WebDriver, headless, DOM injection, screen size, pointer/keyboard activity) and signs the final envelope with HMAC-SHA-256 via SubtleCrypto.

**Signing key handling:**
- Preferred API: `provider.setSigningKey(key)` — key is stored in `#signingKey` private field only, never touches the DOM
- HTML attribute fallback: if `signing-key` is present in markup, `connectedCallback` reads it, stores it in `#signingKey`, and immediately calls `this.removeAttribute('signing-key')` — the attribute is not in `observedAttributes` and is never readable after mount
- `disconnectedCallback` zeroes `#signingKey` and clears the cached `CryptoKey`
- The signature is tamper-evidence, not cryptographic proof — the key lives in JS heap memory and can be read by same-page XSS. Rotate per-session via a server nonce endpoint.

### PCI Considerations (`SecureCard`)
- Full PAN and CVC must **never** appear in: `CustomEvent` detail, audit log entries, or hidden `<input>` elements
- Only `last4` and card type are safe to log or include in events
- `getCardData()` is the sole accessor for raw card data — it exists only for direct handoff to a PCI-compliant payment SDK; requires a strict CSP; return value must be used once then discarded (do not store in JS variables longer than the handoff call)
- Hidden inputs in the light DOM carry: `{name}` (last-4 only), `{name}-expiry`, `{name}-holder` — no CVC hidden input
- All four card inputs use `autocomplete="off"` — do not change to `cc-number/cc-exp/cc-csc/cc-name`; those values instruct browsers to store card data, which violates PCI DSS

## CSS Rules

### Design Tokens
All tokens live in `src/styles/tokens.css` under the `--secure-ui-*` namespace at `:root` / `:host`.
- **Add** new tokens there first, then reference them in component CSS
- **Never** hard-code pixel values or hex colours directly in component CSS if a token already exists
- Token categories: colors, spacing (`--secure-ui-space-*`), typography, borders, shadows, transitions, z-index, component-specific

### Component CSS
- Selectors are scoped to Shadow DOM — no need for BEM prefixes
- Use `var(--secure-ui-*)` tokens for all values
- Dark mode: override tokens inside `@media (prefers-color-scheme: dark)` — tokens.css already handles most; components only need overrides for bespoke properties
- Reduced motion: tokens.css sets all transition durations to `0ms` under `prefers-reduced-motion: reduce` — components get this for free
- Logical properties (`margin-inline`, `padding-block`, etc.) for i18n layouts

### What NOT to do
- No `@import` inside Shadow DOM stylesheets — use `<link>` injection from the component TS
- No `!important` unless overriding a browser UA style
- No inline `style=""` attributes except for dynamic values that cannot be expressed as custom properties
- No vendor prefixes (check caniuse — they're not needed for the supported browsers)

## TypeScript Rules

- `strict: true` is assumed — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as well
- All imports use `.js` extension (ES module resolution for native browser + Node ESM)
- New event detail types go in `src/core/types.ts`
- New component attribute types should be expressed as string literals or `boolean` (attribute presence)
- No `any` — use `unknown` and narrow

## Adding a New Component

1. Create `src/components/secure-<name>/secure-<name>.ts` and `secure-<name>.css`
2. Extend `SecureBaseComponent`, implement `protected render()`
3. Declare `static get observedAttributes()` spreading `...super.observedAttributes`
4. Expose CSS `part` attributes on all key elements
5. Inject styles via `this.addComponentStyles(new URL('./secure-<name>.css', import.meta.url).href)`
6. If the component is a field (has user input): wire up `recordTelemetryFocus()`, `recordTelemetryInput(event)`, and `recordTelemetryBlur()` in the corresponding DOM event listeners
7. Register: `customElements.define('secure-<name>', SecureName)`
8. Export from `src/index.ts`
9. Add event detail interface to `src/core/types.ts`
10. Add `'secure-<name>'` to the `COMPONENTS` array in `build/css-inliner.js`
11. Add a named export entry in `package.json` under `"exports"` following the existing pattern

## Build & Scripts

```bash
npm run build         # clean → tsc → css-inliner → dist/
npm run dev           # build then serve with --watch (live reload)
npm run typecheck     # tsc --noEmit (no output, type errors only)
npm run lint          # eslint src/ tests/
npm run lint:fix      # eslint --fix
npm test              # vitest run (single pass)
npm run test:watch    # vitest (watch mode)
npm run test:coverage # vitest --coverage
npm run size          # size-limit against dist/ (requires build first)
npm run audit:check   # npm audit --audit-level=high
npm run test:e2e      # build:ts then playwright test (headless)
```

Production build pipeline: `clean` wipes `dist/`, `build:ts` runs `tsc`, `build:css` runs `build/css-inliner.js` which reads each component's `.css` file, minifies it, and replaces the `<link>` injection with an inlined `CSSStyleSheet`. No manual source changes required.

`prepublishOnly` runs `lint → typecheck → test → build` — all must pass before `npm publish`.

## Accessibility Baseline (WCAG 2.2 AA)

- All form controls have associated `<label>` (via `for`/`id` or wrapper)
- Error containers use `role="alert"` + `aria-live="polite"`
- Invalid inputs get `aria-invalid="true"` and `aria-describedby` pointing to the error container
- Required inputs get `aria-required="true"`
- Security badges and decorative elements get `aria-hidden="true"`
- Never remove focus outline — enhance it with `outline-offset` and `box-shadow`
