/**
 * Accessibility Tests
 *
 * Verifies WCAG 2.2 AA compliance for all Secure-UI components using axe-core.
 * Tests run against rendered shadow-host elements in the light DOM.
 *
 * Note: axe-core does not pierce closed Shadow DOM, so these tests validate
 * the host element's landmark, ARIA, and focusability contracts. Per-component
 * unit tests cover internal shadow DOM ARIA attributes.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';

import { SecureInput } from '../../src/components/secure-input/secure-input.js';
import { SecureTextarea } from '../../src/components/secure-textarea/secure-textarea.js';
import { SecureSelect } from '../../src/components/secure-select/secure-select.js';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureFileUpload } from '../../src/components/secure-file-upload/secure-file-upload.js';
import { SecureDatetime } from '../../src/components/secure-datetime/secure-datetime.js';
import { SecureTable } from '../../src/components/secure-table/secure-table.js';
import { SecureSubmitButton } from '../../src/components/secure-submit-button/secure-submit-button.js';

// Register all components
const components: [string, CustomElementConstructor][] = [
  ['secure-input', SecureInput],
  ['secure-textarea', SecureTextarea],
  ['secure-select', SecureSelect],
  ['secure-form', SecureForm],
  ['secure-file-upload', SecureFileUpload],
  ['secure-datetime', SecureDatetime],
  ['secure-table', SecureTable],
  ['secure-submit-button', SecureSubmitButton],
];
for (const [tag, ctor] of components) {
  if (!customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

/**
 * Run axe on the document body and return only critical/serious violations.
 * Filters out rules that do not apply in a headless test environment
 * (color-contrast requires computed styles unavailable in happy-dom).
 */
async function getViolations(element: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(element, {
    rules: {
      'color-contrast': { enabled: false }, // requires computed styles
      'region': { enabled: false },          // happy-dom has no landmark context
    },
  });
  return results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

describe('Accessibility — secure-input', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with label', async () => {
    const el = document.createElement('secure-input') as SecureInput;
    el.setAttribute('label', 'Username');
    el.setAttribute('name', 'username');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });

  it('has no critical/serious axe violations — required state', async () => {
    const el = document.createElement('secure-input') as SecureInput;
    el.setAttribute('label', 'Email');
    el.setAttribute('name', 'email');
    el.setAttribute('type', 'email');
    el.setAttribute('required', '');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });

  it('has no critical/serious axe violations — disabled state', async () => {
    const el = document.createElement('secure-input') as SecureInput;
    el.setAttribute('label', 'Username');
    el.setAttribute('name', 'username');
    el.setAttribute('disabled', '');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-textarea', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with label', async () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    el.setAttribute('label', 'Message');
    el.setAttribute('name', 'message');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-select', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with label and options', async () => {
    const el = document.createElement('secure-select') as SecureSelect;
    el.setAttribute('label', 'Country');
    el.setAttribute('name', 'country');
    el.setAttribute('security-tier', 'public');
    el.setAttribute('options', JSON.stringify([
      { value: 'us', label: 'United States' },
      { value: 'gb', label: 'United Kingdom' },
    ]));
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-file-upload', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with label', async () => {
    const el = document.createElement('secure-file-upload') as SecureFileUpload;
    el.setAttribute('label', 'Upload document');
    el.setAttribute('name', 'document');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-datetime', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations — date type', async () => {
    const el = document.createElement('secure-datetime') as SecureDatetime;
    el.setAttribute('label', 'Date of birth');
    el.setAttribute('name', 'dob');
    el.setAttribute('type', 'date');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-submit-button', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations — default state', async () => {
    const el = document.createElement('secure-submit-button') as SecureSubmitButton;
    el.setAttribute('label', 'Submit');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });

  it('has no critical/serious axe violations — disabled state', async () => {
    const el = document.createElement('secure-submit-button') as SecureSubmitButton;
    el.setAttribute('label', 'Submit');
    el.setAttribute('disabled', '');
    el.setAttribute('security-tier', 'public');
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-table', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with data', async () => {
    const el = document.createElement('secure-table') as SecureTable;
    el.setAttribute('caption', 'User list');
    el.setAttribute('security-tier', 'public');
    el.columns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'email', label: 'Email' },
    ];
    el.data = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
    ];
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });

  it('has no critical/serious axe violations — empty state', async () => {
    const el = document.createElement('secure-table') as SecureTable;
    el.setAttribute('caption', 'Empty table');
    el.setAttribute('security-tier', 'public');
    el.columns = [{ key: 'name', label: 'Name' }];
    el.data = [];
    container.appendChild(el);
    await new Promise(r => setTimeout(r, 50));
    expect(await getViolations(container)).toHaveLength(0);
  });
});

describe('Accessibility — secure-form', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('has no critical/serious axe violations with inputs', async () => {
    const formEl = document.createElement('secure-form') as SecureForm;
    formEl.setAttribute('security-tier', 'public');

    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('label', 'Name');
    input.setAttribute('name', 'name');
    input.setAttribute('security-tier', 'public');
    formEl.appendChild(input);

    const submit = document.createElement('secure-submit-button') as SecureSubmitButton;
    submit.setAttribute('label', 'Submit');
    submit.setAttribute('security-tier', 'public');
    formEl.appendChild(submit);

    container.appendChild(formEl);
    await new Promise(r => setTimeout(r, 100));
    expect(await getViolations(container)).toHaveLength(0);
  });
});
