/**
 * Development Build Tool
 *
 * This script updates components to dynamically load CSS files
 * for development without inlining (for faster iteration).
 *
 * Usage:
 *   node build/dev-build.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const COMPONENTS = [
  'secure-input',
  'secure-textarea',
  'secure-select',
  'secure-form',
  'secure-file-upload',
  'secure-datetime',
  'secure-table'
];

/**
 * Generate CSS loader code that fetches CSS file
 * @param {string} componentName - Name of the component
 * @returns {string} JavaScript code to load CSS
 */
function generateDevCSSLoaderCode(componentName) {
  return `
  /**
   * Get component styles (Development mode - loads from file)
   * @private
   * @returns {Promise<string>} Component CSS
   */
  async #getComponentStyles() {
    try {
      const cssPath = new URL('./${componentName}.css', import.meta.url);
      const response = await fetch(cssPath);
      return await response.text();
    } catch (error) {
      console.error('Failed to load CSS:', error);
      return '';
    }
  }`;
}

/**
 * Process component for dev mode
 */
async function processComponent(componentName) {
  console.log(`🔧 Setting up ${componentName} for development...`);

  // Read compiled JS from dist (after tsc)
  const distDir = path.join(ROOT_DIR, 'dist', 'components', componentName);
  const jsPath = path.join(distDir, `${componentName}.js`);

  let jsContent;
  try {
    jsContent = await fs.readFile(jsPath, 'utf-8');
  } catch (error) {
    console.error(`   ❌ Failed to read ${jsPath} (run tsc first)`);
    return;
  }

  // Check if component has #getComponentStyles method
  const hasStylesMethod = jsContent.includes('#getComponentStyles()');

  if (!hasStylesMethod) {
    console.log(`   ⚠️  Component does not have #getComponentStyles() method, skipping...`);
    return;
  }

  // Replace with dev loader
  const methodRegex = /#getComponentStyles\(\)\s*{[^}]*return\s*`[^`]*`\s*;?\s*}/;
  const devLoader = generateDevCSSLoaderCode(componentName).trim();
  jsContent = jsContent.replace(methodRegex, devLoader);

  await fs.writeFile(jsPath, jsContent, 'utf-8');

  console.log(`   ✅ Dev loader added`);
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Setting up development mode...\n');

  for (const component of COMPONENTS) {
    await processComponent(component);
  }

  console.log('\n✅ Development setup complete!');
  console.log('💡 CSS files will now be loaded dynamically from separate files.');
}

main();
