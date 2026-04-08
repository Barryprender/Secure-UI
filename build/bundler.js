/**
 * Bundle Build Tool
 *
 * Produces dist/secure-ui.bundle.js — a single self-contained file with all
 * components registered and all CSS inlined as constructable stylesheets.
 *
 * Why constructable stylesheets are CSP-safe:
 *   CSSStyleSheet.replaceSync() / adoptedStyleSheets are NOT subject to the
 *   style-src 'unsafe-inline' restriction. That restriction applies only to
 *   <style> elements and inline style="" attributes.
 *
 * Usage:
 *   node build/bundler.js
 */

import { build } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

/**
 * esbuild plugin: replace every `new URL('./foo.css', import.meta.url).href`
 * expression in TypeScript source files with the inlined CSS text as a template
 * literal. addComponentStyles() detects CSS text via the presence of `{` and
 * routes it through adoptedStyleSheets instead of <link>.
 */
const inlineCssPlugin = {
  name: 'inline-css',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let source = await fs.readFile(args.path, 'utf-8');
      const dir = path.dirname(args.path);

      // Match: new URL('./anything.css', import.meta.url).href
      const urlPattern = /new URL\(['"](\.[^'"]+\.css)['"]\s*,\s*import\.meta\.url\)\.href/g;

      const replacements = [];
      let match;
      while ((match = urlPattern.exec(source)) !== null) {
        replacements.push({ full: match[0], cssFile: match[1], index: match.index });
      }

      for (const { full, cssFile } of replacements) {
        const cssAbsPath = path.resolve(dir, cssFile);
        let cssText;
        try {
          cssText = await fs.readFile(cssAbsPath, 'utf-8');
        } catch {
          console.warn(`   ⚠️  CSS file not found: ${cssAbsPath} — leaving URL as-is`);
          continue;
        }

        // Strip comments and collapse whitespace for a compact inline payload.
        const minified = cssText
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Escape backticks and template literal delimiters so the string is
        // safely embeddable as a JS template literal.
        const escaped = minified
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$\{/g, '\\${');

        source = source.replaceAll(full, `\`${escaped}\``);
      }

      return { contents: source, loader: 'ts' };
    });
  }
};

async function bundle() {
  console.log('📦 Building secure-ui.bundle.js...\n');
  const startTime = Date.now();

  const outfile = path.join(ROOT_DIR, 'dist', 'secure-ui.bundle.js');

  await build({
    entryPoints: [path.join(SRC_DIR, 'index.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    outfile,
    minify: true,
    plugins: [inlineCssPlugin],
    // Suppress the import.meta.url warning — we intentionally handle it in the plugin.
    logOverride: {
      'ignored-bare-identifier': 'silent',
    },
  });

  const stat = await fs.stat(outfile);
  const kb = (stat.size / 1024).toFixed(1);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`   ✅ dist/secure-ui.bundle.js (${kb} kB)`);
  console.log(`\n✨ Bundle completed in ${duration}s`);
}

bundle().catch(err => {
  console.error('\n❌ Bundle failed:', err);
  process.exit(1);
});
