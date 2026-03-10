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
    base-component.ts   # Abstract SecureBaseComponent — extend this
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
  styles/
    tokens.css          # Design token custom properties (:root + :host)
    shared.css          # Shared light-DOM styles
    secure-ui.css       # Public entry stylesheet
  index.ts              # Library entry point
```

## Web Component Rules

### Class structure
- All components extend `SecureBaseComponent` from `src/core/base-component.ts`
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

### Custom Events
- All events use `CustomEvent` with a typed `detail` — see `src/core/types.ts` for event detail interfaces
- Always set `{ bubbles: true, composed: true }` so events cross shadow boundaries
- Naming convention: `secure-<action>` (e.g. `secure-input`, `secure-change`, `secure-audit`)

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
6. Register: `customElements.define('secure-<name>', SecureName)`
7. Export from `src/index.ts`
8. Add event detail interface to `src/core/types.ts`

## Build

```bash
npm run build   # production — CSS inlined, output to dist/
npm run dev     # dev server — raw src served, no build step
```

Production build (`build/css-inliner.js`) reads each component's `.css` file, minifies it, and replaces the `<link>` injection with an inlined `CSSStyleSheet` — no source changes required.

## Accessibility Baseline (WCAG 2.2 AA)

- All form controls have associated `<label>` (via `for`/`id` or wrapper)
- Error containers use `role="alert"` + `aria-live="polite"`
- Invalid inputs get `aria-invalid="true"` and `aria-describedby` pointing to the error container
- Required inputs get `aria-required="true"`
- Security badges and decorative elements get `aria-hidden="true"`
- Never remove focus outline — enhance it with `outline-offset` and `box-shadow`
