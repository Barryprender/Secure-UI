/**
 * Build artifact tests — validate that dist/ contains the correct files
 * and that the bundle was produced correctly.
 *
 * These tests run against the compiled output in dist/ and are intentionally
 * separate from the unit/component test suite. They require a prior build
 * (`npm run build`) and will skip automatically if dist/ does not exist so
 * that a clean clone does not fail on `npm test`.
 *
 * Run explicitly after a build:
 *   npm run test:build
 *
 * Also executed by prepublishOnly after `npm run build`.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const BUNDLE = path.join(DIST, 'secure-ui.bundle.js');

const COMPONENTS = [
  'secure-input',
  'secure-textarea',
  'secure-select',
  'secure-form',
  'secure-file-upload',
  'secure-datetime',
  'secure-table',
  'secure-submit-button',
  'secure-card',
  'secure-telemetry-provider',
  'secure-password-confirm',
] as const;

// Components that have no CSS file (light-DOM / no shadow styles)
const COMPONENTS_WITHOUT_CSS = new Set(['secure-telemetry-provider']);

const distExists = fs.existsSync(DIST);

// ─── Bundle file ──────────────────────────────────────────────────────────────

describe('dist/secure-ui.bundle.js', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  let bundle: string;

  beforeAll(() => {
    bundle = fs.readFileSync(BUNDLE, 'utf-8');
  });

  it('exists and is non-empty', () => {
    expect(fs.existsSync(BUNDLE)).toBe(true);
    expect(fs.statSync(BUNDLE).size).toBeGreaterThan(0);
  });

  it('is larger than 100 kB (all components + CSS inlined)', () => {
    const sizeKb = fs.statSync(BUNDLE).size / 1024;
    expect(sizeKb).toBeGreaterThan(100);
  });

  it.each(COMPONENTS)('registers custom element: %s', (name) => {
    expect(bundle).toContain(`"${name}"`);
  });

  it('uses adoptedStyleSheets for CSS injection (bundle mode)', () => {
    expect(bundle).toContain('adoptedStyleSheets');
  });

  it('does not contain unresolved import.meta.url CSS paths', () => {
    // CSS URLs should all have been replaced by the inline-css plugin.
    // The pattern new URL("./x.css", import.meta.url) must not appear.
    expect(bundle).not.toMatch(/new URL\(["'][^"']+\.css["'],\s*import\.meta\.url\)/);
  });

  it('contains inlined CSS text (spot-check for known selector)', () => {
    // base.css contains :host — confirms base styles were inlined
    expect(bundle).toContain(':host');
  });

  it('contains the CSSStyleSheet constructor call (constructable stylesheet path)', () => {
    expect(bundle).toContain('CSSStyleSheet');
  });

  it('is valid ESM (starts with or contains import/export or is a self-contained IIFE)', () => {
    // esbuild produces ESM — should not have require() calls
    expect(bundle).not.toMatch(/\brequire\s*\(/);
  });
});

// ─── ESM per-component files ───────────────────────────────────────────────────

describe('dist/components — per-component JS files', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  it.each(COMPONENTS)('dist/components/%s.js exists', (name) => {
    const file = path.join(DIST, 'components', name, `${name}.js`);
    expect(fs.existsSync(file), `missing: ${file}`).toBe(true);
  });
});

describe('dist/components — per-component CSS files', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  const componentsWithCss = COMPONENTS.filter(n => !COMPONENTS_WITHOUT_CSS.has(n));

  it.each(componentsWithCss)('dist/components/%s.css exists', (name) => {
    const file = path.join(DIST, 'components', name, `${name}.css`);
    expect(fs.existsSync(file), `missing: ${file}`).toBe(true);
  });

  it('secure-telemetry-provider has no CSS file (light-DOM, no shadow styles)', () => {
    const file = path.join(DIST, 'components', 'secure-telemetry-provider', 'secure-telemetry-provider.css');
    expect(fs.existsSync(file)).toBe(false);
  });
});

// ─── Stylesheets ───────────────────────────────────────────────────────────────

describe('dist/styles — public stylesheets', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  it.each(['tokens.css', 'secure-ui.css', 'shared.css'])('dist/styles/%s exists', (file) => {
    expect(fs.existsSync(path.join(DIST, 'styles', file))).toBe(true);
  });

  it('dist/core/base.css exists', () => {
    expect(fs.existsSync(path.join(DIST, 'core', 'base.css'))).toBe(true);
  });

  it('tokens.css contains --secure-ui- custom properties', () => {
    const tokens = fs.readFileSync(path.join(DIST, 'styles', 'tokens.css'), 'utf-8');
    expect(tokens).toContain('--secure-ui-');
  });
});

// ─── ESM entry point ───────────────────────────────────────────────────────────

describe('dist/index.js', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  it('exists', () => {
    expect(fs.existsSync(path.join(DIST, 'index.js'))).toBe(true);
  });

  it('dist/index.d.ts exists', () => {
    expect(fs.existsSync(path.join(DIST, 'index.d.ts'))).toBe(true);
  });
});

// ─── dist/package.json exports ─────────────────────────────────────────────────

describe('dist/package.json — exports map', () => {
  if (!distExists) {
    it.skip('dist/ not found — run `npm run build` first', () => {});
    return;
  }

  let pkg: Record<string, unknown>;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(DIST, 'package.json'), 'utf-8'));
  });

  it('exports . (main ESM entry)', () => {
    expect((pkg.exports as Record<string, unknown>)?.['.'])
      .toMatch(/index\.js/);
  });

  it('exports ./bundle pointing to secure-ui.bundle.js', () => {
    expect((pkg.exports as Record<string, unknown>)?.['./bundle'])
      .toMatch(/secure-ui\.bundle\.js/);
  });

  it('exports ./tokens.css', () => {
    expect((pkg.exports as Record<string, unknown>)?.['./tokens.css'])
      .toMatch(/tokens\.css/);
  });

  it('exports ./secure-ui.css', () => {
    expect((pkg.exports as Record<string, unknown>)?.['./secure-ui.css'])
      .toMatch(/secure-ui\.css/);
  });

  it.each(COMPONENTS)('exports package entry: ./%s', (name) => {
    expect((pkg.exports as Record<string, unknown>)?.[`./${name}`]).toBeDefined();
  });
});
