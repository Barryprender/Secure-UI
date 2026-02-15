/**
 * CSS Inliner Build Tool
 *
 * This script reads CSS files and inlines them into component JavaScript files
 * for optimal performance in server-side rendering scenarios.
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
  'secure-submit-button'
];

/**
 * Read CSS file and return minified content
 * @param {string} cssPath - Path to CSS file
 * @returns {Promise<string>} Minified CSS content
 */
async function readAndMinifyCSS(cssPath) {
  try {
    const css = await fs.readFile(cssPath, 'utf-8');

    // Basic CSS minification
    const minified = css
      // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove newlines
      .replace(/\n/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove spaces around special characters
      .replace(/\s*([{}:;,>+~])\s*/g, '$1')
      // Remove trailing semicolons
      .replace(/;}/g, '}')
      .trim();

    return minified;
  } catch (error) {
    console.warn(`⚠️  CSS file not found: ${cssPath}`);
    return '';
  }
}

/**
 * Generate CSS loader code for a component
 * @param {string} css - CSS content
 * @returns {string} JavaScript code to load CSS
 */
function generateCSSLoaderCode(css) {
  // Escape backticks and dollar signs in CSS
  const escapedCSS = css.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `
  /**
   * Get component styles
   * @private
   * @returns {string} Component CSS
   */
  #getComponentStyles() {
    return \`${escapedCSS}\`;
  }`;
}

/**
 * Process a single component
 * @param {string} componentName - Name of the component
 */
async function processComponent(componentName) {
  console.log(`📦 Processing ${componentName}...`);

  // CSS is read from src (not compiled by tsc)
  const cssPath = path.join(ROOT_DIR, 'src', 'components', componentName, `${componentName}.css`);
  // JS is read from dist (compiled by tsc)
  const distDir = path.join(ROOT_DIR, 'dist', 'components', componentName);
  const distJsPath = path.join(distDir, `${componentName}.js`);

  // Read CSS file
  const css = await readAndMinifyCSS(cssPath);

  if (!css) {
    console.log(`   ⏭️  No CSS file found, skipping...`);
    return;
  }

  // Read compiled JavaScript file from dist
  let jsContent;
  try {
    jsContent = await fs.readFile(distJsPath, 'utf-8');
  } catch (error) {
    console.error(`   ❌ Failed to read ${distJsPath} (run tsc first)`);
    return;
  }

  // Check if component already has #getComponentStyles method
  const hasStylesMethod = jsContent.includes('#getComponentStyles()');

  if (!hasStylesMethod) {
    console.log(`   ⚠️  Component does not have #getComponentStyles() method`);
    console.log(`   📝 Adding method to component...`);

    // Find the end of the class definition
    const classMatch = jsContent.match(/export class \w+ extends \w+ {/);
    if (!classMatch) {
      console.error(`   ❌ Could not find class definition`);
      return;
    }

    // Insert the styles method after the class opening
    const insertPosition = classMatch.index + classMatch[0].length;
    const cssLoaderCode = generateCSSLoaderCode(css);
    jsContent = jsContent.slice(0, insertPosition) + cssLoaderCode + jsContent.slice(insertPosition);
  } else {
    // Replace existing method with inlined CSS
    const methodRegex = /#getComponentStyles\(\)\s*{[^}]*return\s*`[^`]*`\s*;?\s*}/;
    const cssLoaderCode = generateCSSLoaderCode(css).trim();
    jsContent = jsContent.replace(methodRegex, cssLoaderCode);
  }

  // Write processed file back to dist
  await fs.writeFile(distJsPath, jsContent, 'utf-8');

  console.log(`   ✅ Inlined ${css.length} bytes of CSS`);
}

/**
 * Copy design tokens to dist
 */
async function copyDesignTokens() {
  console.log(`📋 Copying design tokens...`);

  const tokensPath = path.join(ROOT_DIR, 'src', 'styles', 'tokens.css');
  const distStylesDir = path.join(ROOT_DIR, 'dist', 'styles');
  const distTokensPath = path.join(distStylesDir, 'tokens.css');

  await fs.mkdir(distStylesDir, { recursive: true });
  await fs.copyFile(tokensPath, distTokensPath);

  console.log(`   ✅ Design tokens copied to dist`);
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
  distPackageJson.exports['./tokens'] = './styles/tokens.css';

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
