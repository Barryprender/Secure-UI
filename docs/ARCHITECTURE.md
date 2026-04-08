# Secure-UI Architecture Documentation

## Overview

Secure-UI is a security-first web component library with a modern, flexible architecture designed for:

- **Progressive Enhancement**: Components work without JavaScript
- **Server-Side Rendering (SSR)**: Pre-render on server for better performance and SEO
- **High Customizability**: CSS design tokens + CSS Parts API
- **Zero Dependencies**: Pure vanilla JavaScript and CSS
- **Security First**: Multi-tier security system with audit logging

## Project Structure

```
secure-ui/
├── src/                        # Source files (TypeScript)
│   ├── components/            # Web Components
│   │   ├── secure-input/
│   │   │   ├── secure-input.ts     # Component logic
│   │   │   └── secure-input.css    # Component styles
│   │   ├── secure-textarea/
│   │   ├── secure-select/
│   │   ├── secure-form/
│   │   ├── secure-file-upload/
│   │   ├── secure-datetime/
│   │   ├── secure-table/
│   │   ├── secure-submit-button/
│   │   ├── secure-card/
│   │   └── secure-telemetry-provider/
│   ├── core/                  # Core utilities
│   │   ├── base-component.ts   # Abstract SecureBaseComponent — extend this
│   │   ├── security-config.ts  # SecurityTier enum + TIER_CONFIG + helpers
│   │   └── types.ts            # All shared TypeScript interfaces
│   └── styles/
│       └── tokens.css         # Design token system
│
├── dist/                      # Production build output (generated)
│   ├── components/           # Components with inlined CSS
│   ├── core/                 # Core utilities
│   ├── styles/              # Design tokens
│   └── index.js             # Main entry point
│
├── build/                    # Build tools
│   ├── css-inliner.js       # Production build script
│   ├── dev-build.js         # Development build script
│   └── README.md
│
├── server/                   # Server-side rendering
│   ├── ssr-server.js        # SSR implementation
│   ├── server.js            # API backend
│   ├── package.json
│   └── SSR-README.md
│
├── examples/                 # Example implementations
│   ├── css-customization.html
│   ├── form-components.html
│   └── ...
│
├── tests/                    # Test suites
│   ├── unit/                # Component unit tests
│   └── security/            # Security tests
│
└── docs/                     # Documentation
    └── customization.md      # Styling guide
```

## Architecture Layers

### 1. Component Layer

**Web Components** (`src/components/`)

Each component is a Custom Element that extends `SecureBaseComponent`:

```
SecureBaseComponent (Abstract)
├── Security tier management (immutable after connectedCallback)
├── Audit logging (secure-audit events)
├── Rate limiting (tier-based per-component limits)
├── Value sanitization (textContent round-trip)
├── Field-level behavioral telemetry (dwell, velocity, corrections, paste, autofill)
└── Shadow DOM setup (closed mode)

↓ Extends

SecureInput, SecureTextarea, SecureSelect, SecureDateTime,
SecureFileUpload, SecureTable, SecureSubmitButton, SecureCard
├── Component-specific rendering
├── Validation logic
├── Event handling
└── Public API (value, valid, name, getFieldTelemetry(), getAuditLog())

SecureTelemetryProvider (extends HTMLElement directly — light DOM)
├── Environmental signal detection (WebDriver, headless, screen size)
├── DOM mutation monitoring (MutationObserver for injected scripts)
├── Pointer and keyboard activity tracking
└── HMAC-SHA-256 envelope signing (SubtleCrypto)
```

**Key Features:**
- **Shadow DOM**: Encapsulation and style isolation
- **Progressive Enhancement**: Native HTML elements as fallback
- **Security Tiers**: PUBLIC, AUTHENTICATED, SENSITIVE, CRITICAL
- **Audit Logging**: All security events logged
- **Rate Limiting**: Protection against brute force

### 2. Styling Layer

**Three-Level Styling System**:

```
Level 1: Design Tokens (tokens.css)
├── Global CSS Custom Properties
├── Color system
├── Spacing scale
├── Typography
└── Component-specific tokens

↓ Used by

Level 2: Component CSS (*.css files)
├── Component structure styles
├── References design tokens
├── State-based styling
└── Security tier styling

↓ Enhanced by

Level 3: CSS Parts API
├── Deep customization access
├── Target internal elements
└── User-defined styles
```

**Example:**

```css
/* Level 1: Design Token */
:root {
  --secure-ui-input-height: 2.5rem;
}

/* Level 2: Component CSS */
.input-field {
  height: var(--secure-ui-input-height);
}

/* Level 3: CSS Parts (User Code) */
secure-input::part(input) {
  height: 3rem; /* Override */
}
```

### 3. Build Layer

**Two output targets, one build command (`npm run build`):**

#### ESM / tree-shakeable output (`dist/components/`, `dist/index.js`)

- One JS file per component, one CSS file per component (copied alongside JS)
- CSS is loaded at runtime via `<link rel="stylesheet">` using `import.meta.url`
- Correct path resolution requires the CSS files to be co-located with the JS (satisfied automatically when consuming from `node_modules` via a dev server, or when the library is served as static files)
- Use via: `import 'secure-ui-components/secure-input'` (individual imports) or `import 'secure-ui-components'` (all components)

#### Self-contained bundle (`dist/secure-ui.bundle.js`)

- All 11 components + base class bundled into a single ESM file
- All CSS inlined as constructable stylesheets (`CSSStyleSheet.replaceSync` / `adoptedStyleSheets`) — no external CSS file requests, no `import.meta.url` path resolution
- Constructable stylesheets are **explicitly exempt** from CSP `style-src 'unsafe-inline'` — that restriction applies only to `<style>` elements and `style=""` attributes
- `addComponentStyles()` auto-detects which mode it is in: CSS text (contains `{`) → `adoptedStyleSheets`; URL → `<link>`
- Use via: `import 'secure-ui-components/bundle'` (any bundler) or `<script type="module" src="...bundle.js">` (vanilla HTML / CDN)

**Build pipeline:**

```
npm run build
  ↓
clean         wipe dist/
build:ts      tsc → dist/ (JS + .d.ts for all files)
build:css     copy component CSS files to dist/components/**/
              copy tokens.css, shared.css, secure-ui.css → dist/styles/
              generate dist/package.json
build:minify  esbuild transform — minify all .js in dist/ in-place
build:bundle  esbuild bundle — src/index.ts → dist/secure-ui.bundle.js
              (inline-css plugin rewrites new URL('./x.css', import.meta.url).href
               to CSS text template literals before bundling)
```

**dist/ layout:**

```
dist/
├── secure-ui.bundle.js        ← single-file, all CSS inlined (./bundle export)
├── index.js / index.d.ts      ← ESM entry (. export)
├── components/
│   └── secure-input/
│       ├── secure-input.js    ← individual component (./secure-input export)
│       └── secure-input.css   ← co-located CSS for link-based injection
├── core/
│   ├── base-component.js
│   └── base.css               ← Shadow DOM base styles
└── styles/
    ├── tokens.css             ← design tokens (./tokens.css export)
    ├── shared.css
    └── secure-ui.css          ← full light-DOM stylesheet (./secure-ui.css export)
```

### 4. Telemetry Layer

**Three-layer behavioral telemetry system:**

```
Layer 1 — Field signals (SecureBaseComponent)
├── Dwell time (focus → first keystroke)
├── Typing velocity (keystrokes/second)
├── Correction count (backspace, delete, undo)
├── Paste detection (insertFromPaste)
├── Autofill detection (insertReplacementText)
├── Focus count
└── Blur-without-change

↓ Aggregated at submission by

Layer 2 — Session risk score (SecureForm)
├── collectTelemetry() — queries getFieldTelemetry() from all child fields
├── computeRiskScore() — 7 additive risk signals, 1 trust signal
├── Risk payload travels as _telemetry alongside form data in a single fetch
└── Events: secure-form-submit + secure-form-success include telemetry

↓ Signed and enriched by

Layer 3 — Environmental signals (SecureTelemetryProvider)
├── WebDriver / headless detection
├── DOM script injection monitoring
├── Devtools open heuristic
├── Screen size anomaly detection
├── Pointer type + mouse movement
└── HMAC-SHA-256 signed envelope injected as telemetry._env
```

### 5. Server Layer

**Server-Side Rendering (SSR)**:

```
Client Request
↓
SSR Server
├── ComponentRenderer
│   ├── renderSecureInput()
│   ├── renderSecureTextarea()
│   ├── renderSecureSelect()
│   └── renderSecureForm()
├── Route Handlers
└── Static File Serving
↓
HTML Response
├── Native HTML elements (work without JS)
├── Web component wrappers
├── Design tokens CSS
└── Component JavaScript (hydration)
↓
Browser
├── Renders immediately
├── Form works without JS
├── JavaScript hydrates
└── Enhanced features activate
```

## Component Lifecycle

### SSR Flow

```
1. Server receives request
   ↓
2. ComponentRenderer.renderSecureInput()
   ├── Generate native <input>
   ├── Wrap in <secure-input>
   ├── Add label, error container
   └── Escape all user content
   ↓
3. Create HTML page
   ├── Include design tokens CSS
   ├── Include component HTML
   └── Include hydration scripts
   ↓
4. Send to browser
   ↓
5. Browser renders immediately
   ├── Native input visible
   ├── Form functional
   └── Accessible to screen readers
   ↓
6. JavaScript loads
   ↓
7. Custom Elements defined
   ↓
8. Components hydrate
   ├── Attach Shadow DOM
   ├── Add event listeners
   ├── Enable validation
   ├── Start audit logging
   └── Activate security features
```

### Client-Only Flow

```
1. Page loads with <secure-input> tag
   ↓
2. customElements.define() registers component
   ↓
3. constructor() called
   ├── Set up Shadow DOM
   ├── Initialize private fields
   └── Call super() (SecureBaseComponent)
   ↓
4. connectedCallback() called
   ├── render() generates DOM
   ├── Apply CSS styles
   ├── Set up event listeners
   ├── Start audit logging
   └── Apply security configuration
   ↓
5. Component ready
   ├── User interaction
   ├── Validation
   ├── Events dispatched
   └── Audit logs created
   ↓
6. disconnectedCallback() (cleanup)
```

## Security Architecture

### Multi-Tier Security System

```
PUBLIC
├── Basic validation
├── Standard rate limiting
└── Minimal audit logging

AUTHENTICATED
├── Enhanced validation
├── Stricter rate limiting
├── Detailed audit logging
└── Special visual indicators

SENSITIVE (PII, Health Data)
├── Strict validation
├── Aggressive rate limiting
├── Comprehensive audit logging
├── Autocomplete disabled
├── Copy/paste monitoring
└── Visual security indicators

CRITICAL (Passwords, Financial)
├── Maximum validation
├── Very aggressive rate limiting
├── Full audit logging
├── Autocomplete disabled
├── Copy/paste blocked
├── Masked by default
└── Strong visual indicators
```

### Security Features

**XSS Prevention:**
- All user input sanitized
- Shadow DOM encapsulation
- Content Security Policy friendly
- No innerHTML usage for user content

**CSRF Protection:**
- Token injection in forms
- Server-side validation
- Automatic token management

**Data Privacy:**
- Masking for sensitive fields
- No autocomplete on sensitive tiers
- Secure value storage
- Privacy-aware audit logs

**Rate Limiting:**
- Per-component rate limits
- Tier-based throttling
- Prevents brute force attacks

## Customization Architecture

### CSS Custom Properties (Variables)

**Global Customization:**

```css
:root {
  /* Override tokens globally */
  --secure-ui-color-primary: #your-brand-color;
  --secure-ui-input-height: 3rem;
}
```

**Component-Specific:**

```css
secure-input {
  /* Override for all inputs */
  --secure-ui-input-border-radius: 12px;
}

#special-input {
  /* Override for one input */
  --secure-ui-input-bg: #f0f0f0;
}
```

### CSS Parts API

**Deep Customization:**

```css
/* Target internal elements */
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

**Available Parts:**
- `container` - Outer wrapper
- `label` - Label element
- `input` / `textarea` / `select` - Form control
- `wrapper` - Control wrapper
- `error` - Error message container
- `security-badge` - Security tier indicator

## Data Flow

### Form Submission Flow

```
User enters data
↓
Input component
├── Sanitize value
├── Validate against rules
├── Apply security tier rules
└── Emit events
↓
Form component
├── Collect all field data
├── Validate form-level rules
├── Check CSRF token
└── Prepare submission
↓
Submit event
├── preventDefault() available
├── Data accessible via getData()
└── Custom handling possible
↓
API call (user's responsibility)
└── Server processes data
```

### Validation Flow

```
User input event
↓
Component validation
├── Check required
├── Check pattern/regex
├── Check min/max length
├── Check type-specific rules
└── Apply tier-specific rules
↓
Show error if invalid
├── Update error container
├── Add error class to input
├── Emit validation event
└── Log audit event
↓
Clear error if valid
├── Remove error message
├── Remove error class
├── Emit validation event
└── Log audit event
```

## Build & Deployment Architecture

### Development Workflow

```
1. Edit source files
   src/components/secure-input/
   ├── secure-input.ts
   └── secure-input.css

2. npm run build (or npm run dev for watch mode)
   - tsc compiles TS → dist/
   - CSS files copied to dist/
   - bundle produced at dist/secure-ui.bundle.js

3. Test via npm run serve → /examples
```

### Consumer Integration

**Option A — Bundle (recommended for all frameworks)**
```
npm install secure-ui-components
↓
import 'secure-ui-components/bundle'   ← one line, all done
@import 'secure-ui-components/tokens.css'  ← optional theming
```

**Option B — Individual ESM imports (tree-shaking)**
```
import 'secure-ui-components/secure-input'
import 'secure-ui-components/secure-form'
...
```
Requires: CSS files co-located with JS at runtime (standard when consuming
from node_modules via Vite/webpack dev server; needs asset config in some
setups).

**Option C — Vanilla HTML / CDN**
```html
<script type="module" src="https://unpkg.com/secure-ui-components/dist/secure-ui.bundle.js"></script>
<link rel="stylesheet" href="https://unpkg.com/secure-ui-components/dist/styles/tokens.css">
```

### SSR Deployment

```
1. Build components
   npm run build

2. Deploy SSR server
   server/ssr-server.js
   ├── Reads from dist/
   ├── Renders components
   └── Serves HTML

3. Client receives
   ├── Complete HTML
   ├── Functional forms
   ├── Hydration scripts
   └── Progressive enhancement
```

## Extension Points

### Creating Custom Components

```javascript
import { SecureBaseComponent } from './core/base-component.js';

export class MyComponent extends SecureBaseComponent {
  render() {
    // Return DOM structure
  }

  // Override methods as needed
  connectedCallback() {
    super.connectedCallback();
    // Custom logic
  }
}

customElements.define('my-component', MyComponent);
```

### Custom Security Tiers

```javascript
// In security-config.js
export const SecurityTiers = {
  // ... existing tiers
  CONFIDENTIAL: {
    name: 'CONFIDENTIAL',
    level: 5,
    validation: { /* rules */ },
    rateLimit: { /* limits */ }
  }
};
```

### Custom Validators

```javascript
class MyInput extends SecureInput {
  validateValue(value) {
    if (!super.validateValue(value)) {
      return false;
    }

    // Custom validation logic
    if (!myCustomCheck(value)) {
      this.#showError('Custom error message');
      return false;
    }

    return true;
  }
}
```

## Performance Considerations

### Bundle Size

**Optimizations:**
- Zero dependencies
- Tree-shakeable exports
- CSS inlining eliminates separate requests
- Minification in production

**Typical Sizes:**
- `secure-ui.bundle.js` — ~151 kB unminified+gzip-ready (all 11 components + inlined CSS)
- Individual components (ESM): secure-input ~3-4 kB, secure-form ~4-5 kB, secure-card ~8-10 kB (gzipped)

### Runtime Performance

**Optimizations:**
- Shadow DOM for style isolation
- Event delegation where possible
- Debounced validation
- Efficient re-rendering
- Lazy initialization

### Network Performance

**SSR Benefits:**
- Single HTML response
- No FOUC (Flash of Unstyled Content)
- Progressive enhancement
- Faster Time to Interactive (TTI)

## Browser Support

- **Modern browsers**: Full support (Chrome, Firefox, Safari, Edge)
- **IE11**: Not supported (uses modern web standards)
- **Progressive enhancement**: Core functionality works without JS

**Required Features:**
- Custom Elements V1
- Shadow DOM V1
- ES6 Modules
- CSS Custom Properties

## Future Architecture Considerations

**Potential Enhancements:**
- React/Vue/Svelte wrappers
- Additional build targets (UMD, CommonJS)
- Advanced CSS optimization (critical CSS extraction)
- Automated accessibility testing
- Performance monitoring integration
- i18n/l10n support
- Theme marketplace
- Server-side telemetry verification SDK

## Design Principles

1. **Security First**: Every decision considers security implications
2. **Progressive Enhancement**: Works without JavaScript
3. **Zero Dependencies**: No external libraries required
4. **Standards-Based**: Use web platform features
5. **Customizable**: Easy to adapt to any design system
6. **Developer Experience**: Simple, intuitive API
7. **Performance**: Fast by default
8. **Accessibility**: WCAG 2.2 AA compliant

## Conclusion

The Secure-UI architecture provides a solid foundation for building secure, performant, and customizable web applications. The combination of:

- **Modern web standards** (Web Components, CSS Custom Properties)
- **Progressive enhancement** (SSR, native HTML fallbacks)
- **Security-first design** (multi-tier system, audit logging)
- **High customizability** (design tokens, CSS Parts API)

...makes it suitable for a wide range of applications, from simple forms to complex enterprise systems.

The architecture is designed to be:
- **Extensible**: Easy to add new components
- **Maintainable**: Clear separation of concerns
- **Performant**: Optimized for production
- **Secure**: Built-in security features
- **Flexible**: Adaptable to different use cases
