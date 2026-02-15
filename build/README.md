# Build System Documentation

This directory contains build tools for the Secure-UI component library.

## Overview

The build system handles CSS inlining and preparation of components for different deployment scenarios:

1. **Development Mode**: CSS files loaded dynamically for fast iteration
2. **Production Mode**: CSS inlined into JavaScript for optimal performance

## Build Scripts

### `css-inliner.js`

**Production build script** that inlines CSS into component JavaScript files.

**What it does:**
- Reads CSS files for each component
- Minifies the CSS (removes comments, whitespace, etc.)
- Inlines CSS into component JavaScript files
- Creates optimized `dist/` directory
- Generates production-ready package.json

**Usage:**
```bash
npm run build
```

**Output:**
- `dist/components/` - Components with inlined CSS
- `dist/core/` - Core utilities
- `dist/styles/tokens.css` - Design tokens
- `dist/index.js` - Main entry point
- `dist/package.json` - Production package configuration

### `dev-build.js`

**Development build script** that sets up components to load CSS dynamically.

**What it does:**
- Modifies components to fetch CSS files at runtime
- Enables hot-reloading of CSS changes
- Faster iteration during development

**Usage:**
```bash
npm run build:dev
```

**Note:** This is optional for development. You can also work directly with the source files.

## NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "dev": "python -m http.server 8000",
    "build": "node build/css-inliner.js",
    "build:dev": "node build/dev-build.js"
  }
}
```

## Build Process Flow

### Development Workflow

```
1. Edit component CSS in src/components/[component]/[component].css
2. Edit component JS in src/components/[component]/[component].js
3. View changes immediately (CSS loaded dynamically)
4. No build step required
```

### Production Workflow

```
1. Develop and test components
2. Run: npm run build
3. Build system processes all components
4. CSS is minified and inlined
5. Output generated in dist/ directory
6. Deploy dist/ directory to production
```

## Server-Side Rendering (SSR)

For SSR scenarios:

1. **Use production build**: Components have CSS inlined, no separate fetch needed
2. **Include design tokens**: Link `tokens.css` in your HTML `<head>`
3. **Pre-render HTML**: Server generates complete component HTML
4. **Hydration**: Client-side JavaScript enhances pre-rendered HTML

### SSR Example

```javascript
// Server-side (Node.js)
import { SecureInput } from './dist/components/secure-input/secure-input.js';

// Create component instance
const input = new SecureInput();
input.setAttribute('label', 'Username');
input.setAttribute('name', 'username');

// Render to string (simplified)
const html = input.renderToString(); // Custom SSR method

// Send to client
res.send(`
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/styles/tokens.css">
</head>
<body>
  ${html}
  <script type="module">
    // Hydrate component on client
    import { SecureInput } from '/components/secure-input/secure-input.js';
    customElements.define('secure-input', SecureInput);
  </script>
</body>
</html>
`);
```

## CSS Minification

The build system includes basic CSS minification:

- Removes comments (`/* ... */`)
- Removes newlines and extra whitespace
- Removes spaces around special characters
- Removes trailing semicolons

For more advanced optimization, consider integrating:
- [cssnano](https://cssnano.co/)
- [clean-css](https://github.com/clean-css/clean-css)
- [PostCSS](https://postcss.org/)

## Directory Structure

```
build/
├── css-inliner.js      # Production build script
├── dev-build.js        # Development build script
└── README.md           # This file

dist/                   # Production build output (generated)
├── components/
│   ├── secure-input/
│   │   └── secure-input.js
│   ├── secure-textarea/
│   └── ...
├── core/
│   ├── base-component.js
│   └── security-config.js
├── styles/
│   └── tokens.css
├── index.js
└── package.json

src/                    # Source files
├── components/
│   ├── secure-input/
│   │   ├── secure-input.js
│   │   └── secure-input.css   # Separate CSS file
│   └── ...
├── core/
└── styles/
    └── tokens.css
```

## Build Configuration

### Adding New Components

When adding a new component, update the `COMPONENTS` array in both build scripts:

```javascript
const COMPONENTS = [
  'secure-input',
  'secure-textarea',
  'secure-select',
  'secure-form',
  'secure-file-upload',
  'secure-datetime',
  'secure-table',
  'your-new-component'  // Add here
];
```

### Customizing Build Output

Modify `css-inliner.js` to change:
- CSS minification rules
- Output directory structure
- Package.json generation
- File copying logic

## Performance Considerations

### Why Inline CSS?

**Pros:**
- ✅ Single HTTP request per component
- ✅ No FOUC (Flash of Unstyled Content)
- ✅ Better for SSR scenarios
- ✅ Easier deployment (fewer files)
- ✅ Works offline immediately

**Cons:**
- ❌ Larger JavaScript bundle size
- ❌ CSS not separately cacheable
- ❌ Longer initial parse time

### When to Use Each Mode

**Use Inlined CSS (Production) when:**
- Server-side rendering
- Progressive web apps
- Offline-first applications
- Deployment to CDN
- Minimum HTTP requests needed

**Use External CSS (Development) when:**
- Rapid development iteration
- Debugging styles
- Testing different themes
- CSS hot-reloading desired

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Test

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm run build
      - run: npm test
      - uses: actions/upload-artifact@v2
        with:
          name: dist
          path: dist/
```

## Troubleshooting

### CSS Not Inlining

**Problem**: Build completes but CSS not inlined.

**Solution:**
1. Check component has `#getComponentStyles()` method
2. Verify CSS file exists at expected path
3. Check file naming matches component name
4. Review build script output for errors

### Build Fails with Module Error

**Problem**: `Cannot find module` error.

**Solution:**
1. Ensure `"type": "module"` in package.json
2. Use `.js` extension in build scripts
3. Check Node.js version (14+ required for ESM)

### CSS Changes Not Reflected

**Problem**: CSS changes don't appear after rebuild.

**Solution:**
1. Clear browser cache
2. Check you're looking at dist/ files, not src/
3. Verify build script ran successfully
4. Check console for 404 errors

## Future Enhancements

Planned improvements for the build system:

- [ ] Source map generation
- [ ] Advanced CSS optimization (cssnano)
- [ ] TypeScript definitions generation
- [ ] Automatic component documentation
- [ ] Bundle size analysis
- [ ] Tree shaking for unused CSS
- [ ] Critical CSS extraction
- [ ] PostCSS integration for autoprefixing

## Contributing

When modifying build scripts:

1. Test with all components
2. Verify both dev and production modes
3. Check SSR compatibility
4. Update this documentation
5. Add error handling for edge cases
