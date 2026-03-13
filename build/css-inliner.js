/**
 * CSS Copy Build Tool
 *
 * Previously this script inlined CSS into component JS via replaceSync(), which
 * triggers CSP violations when style-src lacks 'unsafe-inline'.
 *
 * Now it copies each component's CSS file to dist so components can load styles
 * via <link rel="stylesheet"> using import.meta.url — fully CSP-safe.
 *
 * Usage:
 *   node build/css-inliner.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Component configuration
 */
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
  'secure-telemetry-provider'
];

/**
 * Copy a component's CSS file from src to dist.
 * Components reference the CSS via import.meta.url so it must sit alongside
 * the compiled JS in dist/components/<name>/<name>.css.
 * @param {string} componentName - Name of the component
 */
async function processComponent(componentName) {
  console.log(`📦 Processing ${componentName}...`);

  const srcCssPath = path.join(ROOT_DIR, 'src', 'components', componentName, `${componentName}.css`);
  const distDir = path.join(ROOT_DIR, 'dist', 'components', componentName);
  const distCssPath = path.join(distDir, `${componentName}.css`);

  try {
    await fs.access(srcCssPath);
  } catch {
    console.log(`   ⏭️  No CSS file found at ${srcCssPath}, skipping...`);
    return;
  }

  await fs.mkdir(distDir, { recursive: true });
  await fs.copyFile(srcCssPath, distCssPath);

  console.log(`   ✅ Copied ${componentName}.css to dist`);
}

/**
 * Copy design tokens and core CSS to dist
 */
async function copyDesignTokens() {
  console.log(`📋 Copying design tokens and core CSS...`);

  // tokens.css
  const tokensPath = path.join(ROOT_DIR, 'src', 'styles', 'tokens.css');
  const distStylesDir = path.join(ROOT_DIR, 'dist', 'styles');
  await fs.mkdir(distStylesDir, { recursive: true });
  await fs.copyFile(tokensPath, path.join(distStylesDir, 'tokens.css'));

  // base.css — shared Shadow DOM styles referenced via import.meta.url in base-component.js
  const baseCssPath = path.join(ROOT_DIR, 'src', 'core', 'base.css');
  const distCoreDir = path.join(ROOT_DIR, 'dist', 'core');
  await fs.mkdir(distCoreDir, { recursive: true });
  await fs.copyFile(baseCssPath, path.join(distCoreDir, 'base.css'));

  console.log(`   ✅ Design tokens and base.css copied to dist`);
}

/**
 * Generate package.json for dist
 */
async function generateDistPackageJson() {
  console.log(`📦 Generating package.json for dist...`);

  const srcPackageJsonPath = path.join(ROOT_DIR, 'package.json');
  const distPackageJsonPath = path.join(ROOT_DIR, 'dist', 'package.json');

  const srcPackageJson = JSON.parse(await fs.readFile(srcPackageJsonPath, 'utf-8'));

  // Create dist package.json with updated paths
  const distPackageJson = {
    ...srcPackageJson,
    main: './index.js',
    module: './index.js',
    type: 'module',
    exports: {}
  };

  // Update export paths
  distPackageJson.exports['.'] = './index.js';

  COMPONENTS.forEach(component => {
    distPackageJson.exports[`./${component}`] = `./components/${component}/${component}.js`;
  });

  distPackageJson.exports['./base-component'] = './core/base-component.js';
  distPackageJson.exports['./security-config'] = './core/security-config.js';
  distPackageJson.exports['./tokens.css'] = './styles/tokens.css';

  await fs.writeFile(distPackageJsonPath, JSON.stringify(distPackageJson, null, 2), 'utf-8');

  console.log(`   ✅ package.json generated`);
}

/**
 * Main build function
 */
async function build() {
  console.log('🏗️  Starting CSS inlining build process...\n');

  const startTime = Date.now();

  try {
    // Process all components
    for (const component of COMPONENTS) {
      await processComponent(component);
    }

    console.log('');

    // Copy supporting files
    await copyDesignTokens();
    await generateDistPackageJson();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✨ Build completed successfully!');
    console.log(`⏱️  Total time: ${duration}s`);
    console.log(`📁 Output directory: ${path.join(ROOT_DIR, 'dist')}`);

  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
