# Customizing Secure-UI Components

Secure-UI components are designed to be highly customizable through multiple layers of styling APIs.

## Table of Contents

1. [CSS Custom Properties (Design Tokens)](#css-custom-properties)
2. [CSS Parts API](#css-parts-api)
3. [Component-Specific Classes](#component-specific-classes)
4. [Examples](#examples)

---

## CSS Custom Properties (Design Tokens)

The easiest way to customize Secure-UI components globally is through CSS Custom Properties (variables). All components use a comprehensive design token system defined in `src/styles/tokens.css`.

### Global Customization

Override design tokens at the `:root` level to affect all components:

```css
:root {
  /* Override color scheme */
  --secure-ui-color-primary: #your-brand-color;
  --secure-ui-color-success: #your-success-color;
  --secure-ui-color-error: #your-error-color;

  /* Override spacing */
  --secure-ui-space-4: 1.5rem; /* Adjust form gaps */

  /* Override typography */
  --secure-ui-font-family-base: 'Your Custom Font', sans-serif;
  --secure-ui-font-size-base: 18px; /* Make everything larger */

  /* Override input appearance */
  --secure-ui-input-border-radius: 12px; /* More rounded inputs */
  --secure-ui-input-border-width: 3px; /* Thicker borders */
}
```

### Per-Component Customization

Target specific component instances using CSS selectors:

```css
/* Customize all secure-input components */
secure-input {
  --secure-ui-input-height: 3rem;
  --secure-ui-input-border-radius: 8px;
}

/* Customize a specific input */
#username-input {
  --secure-ui-input-bg: #f0f0f0;
  --secure-ui-input-border-color: #333;
}

/* Customize by security tier */
secure-input[security-tier="critical"] {
  --secure-ui-input-border-width: 4px;
}
```

### Available Design Tokens

#### Colors

```css
/* Security Tier Colors */
--secure-ui-tier-public: #e0e0e0;
--secure-ui-tier-authenticated: #2196F3;
--secure-ui-tier-sensitive: #FF9800;
--secure-ui-tier-critical: #F44336;

/* Semantic Colors */
--secure-ui-color-primary: #667eea;
--secure-ui-color-success: #10b981;
--secure-ui-color-warning: #f59e0b;
--secure-ui-color-error: #ef4444;
--secure-ui-color-info: #3b82f6;

/* Text Colors */
--secure-ui-color-text-primary: #1f2937;
--secure-ui-color-text-secondary: #6b7280;
--secure-ui-color-text-disabled: #9ca3af;

/* Background Colors */
--secure-ui-color-bg-primary: #ffffff;
--secure-ui-color-bg-secondary: #f9fafb;
--secure-ui-color-bg-tertiary: #f3f4f6;

/* Border Colors */
--secure-ui-color-border: #d1d5db;
--secure-ui-color-border-hover: #9ca3af;
--secure-ui-color-border-focus: #3b82f6;
```

#### Spacing

```css
--secure-ui-space-1: 0.25rem;   /* 4px */
--secure-ui-space-2: 0.5rem;    /* 8px */
--secure-ui-space-3: 0.75rem;   /* 12px */
--secure-ui-space-4: 1rem;      /* 16px */
--secure-ui-space-5: 1.25rem;   /* 20px */
--secure-ui-space-6: 1.5rem;    /* 24px */
--secure-ui-space-8: 2rem;      /* 32px */
```

#### Typography

```css
/* Font Sizes */
--secure-ui-font-size-xs: 0.75rem;    /* 12px */
--secure-ui-font-size-sm: 0.875rem;   /* 14px */
--secure-ui-font-size-base: 1rem;     /* 16px */
--secure-ui-font-size-lg: 1.125rem;   /* 18px */
--secure-ui-font-size-xl: 1.25rem;    /* 20px */

/* Font Weights */
--secure-ui-font-weight-normal: 400;
--secure-ui-font-weight-medium: 500;
--secure-ui-font-weight-semibold: 600;
--secure-ui-font-weight-bold: 700;
```

#### Component-Specific Tokens

```css
/* Input Components */
--secure-ui-input-height: 2.5rem;
--secure-ui-input-padding-x: 0.75rem;
--secure-ui-input-padding-y: 0.5rem;
--secure-ui-input-font-size: 0.875rem;
--secure-ui-input-border-width: 2px;
--secure-ui-input-border-radius: 6px;
--secure-ui-input-border-color: #d1d5db;

/* Button Components */
--secure-ui-button-height: 2.5rem;
--secure-ui-button-padding-x: 1rem;
--secure-ui-button-border-radius: 6px;

/* Form Components */
--secure-ui-form-gap: 1rem;
```

---

## CSS Parts API

For deep customization of component internals, use the CSS Parts API. This allows you to style specific internal elements of Shadow DOM components.

### Available Parts

#### secure-input

```css
/* Parts available */
secure-input::part(container)      /* Outer container */
secure-input::part(label)          /* Label element */
secure-input::part(label-suffix)   /* Optional/Required suffix */
secure-input::part(security-badge) /* Security tier badge */
secure-input::part(wrapper)        /* Input wrapper */
secure-input::part(input)          /* The actual input field */
secure-input::part(error)          /* Error message container */
```

#### secure-textarea

```css
secure-textarea::part(container)
secure-textarea::part(label)
secure-textarea::part(label-suffix)
secure-textarea::part(security-badge)
secure-textarea::part(wrapper)
secure-textarea::part(textarea)
secure-textarea::part(char-count)
secure-textarea::part(error)
```

#### secure-select

```css
secure-select::part(container)
secure-select::part(label)
secure-select::part(label-suffix)
secure-select::part(security-badge)
secure-select::part(wrapper)
secure-select::part(select)
secure-select::part(error)
```

#### secure-form

```css
secure-form::part(form)
secure-form::part(header)
secure-form::part(title)
secure-form::part(description)
secure-form::part(actions)
secure-form::part(submit-button)
secure-form::part(reset-button)
secure-form::part(error-summary)
```

#### secure-file-upload

```css
secure-file-upload::part(container)
secure-file-upload::part(label)
secure-file-upload::part(upload-area)
secure-file-upload::part(upload-icon)
secure-file-upload::part(file-list)
secure-file-upload::part(file-item)
secure-file-upload::part(remove-button)
secure-file-upload::part(progress-bar)
secure-file-upload::part(error)
```

#### secure-datetime

```css
secure-datetime::part(container)
secure-datetime::part(label)
secure-datetime::part(wrapper)
secure-datetime::part(input)
secure-datetime::part(range-display)
secure-datetime::part(error)
```

#### secure-table

```css
secure-table::part(container)
secure-table::part(header)
secure-table::part(search-input)
secure-table::part(table)
secure-table::part(pagination)
secure-table::part(pagination-button)
```

### Using CSS Parts

```css
/* Style the input field directly */
secure-input::part(input) {
  font-family: monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* Style the label */
secure-input::part(label) {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Style error messages */
secure-input::part(error) {
  font-style: italic;
  padding: 0.5rem;
  background-color: rgba(255, 0, 0, 0.1);
  border-left: 3px solid red;
}

/* Customize security badge */
secure-input::part(security-badge) {
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  padding: 0.25rem 0.75rem;
}

/* Style specific component instances */
#password-input::part(input) {
  border: 3px solid #f44336;
  background-color: #fff3f3;
}

/* Combine with pseudo-classes */
secure-input:focus-within::part(label) {
  color: var(--secure-ui-color-primary);
  transform: translateY(-2px);
  transition: all 0.2s;
}
```

---

## Component-Specific Classes

Each component uses consistent, semantic class names that can be targeted when needed.

### Common Classes

```css
.input-container      /* Main container for all input-like components */
.label                /* Label element */
.label-suffix         /* Optional/Required indicator */
.security-badge       /* Security tier badge */
.input-field          /* The actual input/textarea/select element */
.error-container      /* Error message container */
```

### State Classes

```css
.error                /* Applied when validation fails */
.valid                /* Applied when validation passes */
.disabled             /* Applied when component is disabled */
.readonly             /* Applied when component is readonly */
.masked               /* Applied when input is masked */
```

---

## Examples

### Example 1: Brand-Specific Theme

```css
:root {
  /* Your brand colors */
  --secure-ui-color-primary: #0066cc;
  --secure-ui-color-success: #00cc66;
  --secure-ui-color-error: #cc0000;

  /* Your brand typography */
  --secure-ui-font-family-base: 'Inter', 'Helvetica Neue', sans-serif;
  --secure-ui-font-size-base: 16px;

  /* Your brand spacing */
  --secure-ui-input-height: 48px;
  --secure-ui-input-border-radius: 8px;
  --secure-ui-form-gap: 24px;
}

/* Brand-specific styling */
secure-input::part(input),
secure-select::part(select),
secure-textarea::part(textarea) {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

secure-input::part(label),
secure-select::part(label),
secure-textarea::part(label) {
  font-weight: 600;
  color: #333;
}
```

### Example 2: Material Design Style

```css
:root {
  --secure-ui-color-primary: #6200ee;
  --secure-ui-color-error: #b00020;
  --secure-ui-input-border-radius: 4px;
  --secure-ui-input-border-width: 1px;
  --secure-ui-shadow-focus: 0 0 0 2px rgba(98, 0, 238, 0.2);
}

secure-input::part(input) {
  border-bottom-width: 2px;
  border-top: none;
  border-left: none;
  border-right: none;
  border-radius: 0;
  background-color: transparent;
}

secure-input::part(label) {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
```

### Example 3: Minimal/Clean Style

```css
:root {
  --secure-ui-input-border-color: transparent;
  --secure-ui-input-bg: #f5f5f5;
  --secure-ui-input-border-radius: 12px;
  --secure-ui-input-height: 56px;
  --secure-ui-input-padding-x: 1.5rem;
}

secure-input::part(input):focus {
  background-color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

secure-input::part(label) {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

/* Hide security badges for cleaner look */
secure-input::part(security-badge),
secure-select::part(security-badge),
secure-textarea::part(security-badge) {
  display: none;
}
```

### Example 4: High-Contrast Accessibility Theme

```css
:root {
  --secure-ui-color-text-primary: #000;
  --secure-ui-color-bg-primary: #fff;
  --secure-ui-input-border-color: #000;
  --secure-ui-input-border-width: 3px;
  --secure-ui-color-border-focus: #0000ff;
  --secure-ui-color-error: #ff0000;
}

secure-input::part(input),
secure-select::part(select),
secure-textarea::part(textarea) {
  font-size: 18px;
  font-weight: 600;
}

secure-input::part(label),
secure-select::part(label),
secure-textarea::part(label) {
  font-size: 18px;
  font-weight: 700;
}

secure-input::part(input):focus,
secure-select::part(select):focus,
secure-textarea::part(textarea):focus {
  outline: 3px solid #0000ff;
  outline-offset: 2px;
}
```

### Example 5: Per-Instance Customization

```html
<style>
  /* Style a specific input differently */
  #special-input {
    --secure-ui-input-border-color: gold;
  }

  #special-input::part(input) {
    background: linear-gradient(to right, #fff, #fffacd);
    font-weight: bold;
  }

  #special-input::part(label) {
    color: #b8860b;
    font-variant: small-caps;
  }
</style>

<secure-input
  id="special-input"
  label="VIP Field"
  name="special"
></secure-input>
```

---

## Best Practices

1. **Start with Design Tokens**: Use CSS Custom Properties for global theming before reaching for CSS Parts.

2. **Maintain Accessibility**: When customizing, ensure sufficient color contrast and focus indicators.

3. **Test All States**: Verify your customizations work with all states (focus, error, disabled, readonly).

4. **Respect Security Indicators**: Be careful when hiding or significantly altering security tier indicators.

5. **Use Specificity Wisely**: Target specific components or instances rather than overly broad selectors.

6. **Dark Mode Support**: Remember to handle both light and dark modes:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --secure-ui-color-text-primary: #f9fafb;
    --secure-ui-color-bg-primary: #1f2937;
    --secure-ui-input-bg: #374151;
  }
}
```

7. **Progressive Enhancement**: Ensure customizations degrade gracefully if CSS fails to load.

---

## Advanced: Runtime Customization

You can also customize components programmatically using JavaScript:

```javascript
// Set CSS variables at runtime
const input = document.querySelector('secure-input');
input.style.setProperty('--secure-ui-input-border-color', '#ff0000');

// Apply entire themes
function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

const darkTheme = {
  '--secure-ui-color-bg-primary': '#1a1a1a',
  '--secure-ui-color-text-primary': '#ffffff',
  '--secure-ui-input-bg': '#2a2a2a',
  // ... more properties
};

applyTheme(darkTheme);
```
