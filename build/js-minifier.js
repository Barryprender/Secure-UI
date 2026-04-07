/**
 * JS Minifier Build Tool
 *
 * Walks dist/ and minifies every .js file in-place using esbuild's transform API.
 * Runs after tsc + css-inliner so the dist tree already exists.
 *
 * Usage:
 *   node build/js-minifier.js
 */

import { transform } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

async function* walkJs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield fullPath;
    }
  }
}

async function minifyFile(filePath) {
  const source = await fs.readFile(filePath, 'utf-8');
  const { code } = await transform(source, {
    minify: true,
    format: 'esm',
    target: 'es2022',
  });
  await fs.writeFile(filePath, code, 'utf-8');
}

async function minify() {
  console.log('🗜️  Minifying JS files in dist/...\n');
  const startTime = Date.now();
  let count = 0;

  for await (const filePath of walkJs(DIST_DIR)) {
    await minifyFile(filePath);
    console.log(`   ✅ ${path.relative(DIST_DIR, filePath)}`);
    count++;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨ Minified ${count} files in ${duration}s`);
}

minify().catch(err => {
  console.error('\n❌ Minification failed:', err);
  process.exit(1);
});
