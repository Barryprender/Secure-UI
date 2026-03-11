/**
 * SecureSelect Branch Coverage Tests
 *
 * Targets uncovered branches: multiple select paths, rate-limit on blur,
 * handleAttributeChange, value setter with invalid/multi values, valid getter paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureSelect } from '../../src/components/secure-select/secure-select.js';
import { SecureBaseComponent } from '../../src/core/base-component.js';

if (!customElements.get('secure-select')) {
  customElements.define('secure-select', SecureSelect);
}

function appendAndWait(el: HTMLElement): Promise<void> {
  document.body.appendChild(el);
  return new Promise(resolve => queueMicrotask(resolve));
}

describe('SecureSelect branch coverage', () => {
  let select: SecureSelect;

  beforeEach(() => {
    select = document.createElement('secure-select') as SecureSelect;
  });

  afterEach(() => {
    select.remove();
  });

  // ── No-label aria-label fallback ─────────────────────────────────────────
  it('sets aria-label when no label attr but name is set', async () => {
    select.setAttribute('name', 'country');
    await appendAndWait(select);
    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    expect(internalSelect.getAttribute('aria-label')).toBe('country');
  });

  it('omits aria-label when both label and name are absent', async () => {
    await appendAndWait(select);
    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    expect(internalSelect.hasAttribute('aria-label')).toBe(false);
  });

  // ── size attribute ────────────────────────────────────────────────────────
  it('applies size attribute to inner select', async () => {
    select.setAttribute('size', '4');
    await appendAndWait(select);
    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    expect(internalSelect.size).toBe(4);
  });

  // ── handleAttributeChange: disabled toggle ────────────────────────────────
  it('enables/disables inner select via attribute change', async () => {
    await appendAndWait(select);
    select.setAttribute('disabled', '');
    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    expect(internalSelect.disabled).toBe(true);
    select.removeAttribute('disabled');
    expect(internalSelect.disabled).toBe(false);
  });

  it('handleAttributeChange: value attribute change updates inner select', async () => {
    await appendAndWait(select);
    select.addOption('a', 'A');
    select.addOption('b', 'B');
    select.setAttribute('value', 'b');
    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    expect(internalSelect.value).toBe('b');
  });

  it('handleAttributeChange: no-op when value attribute unchanged', async () => {
    await appendAndWait(select);
    select.addOption('x', 'X');
    select.value = 'x';
    // Setting the same value via attribute should not throw
    select.setAttribute('value', 'x');
    expect(select.value).toBe('x');
  });

  // ── value setter: multiple select ─────────────────────────────────────────
  it('multiple value setter selects only valid options', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('opt1', 'Option 1');
    select.addOption('opt2', 'Option 2');
    select.addOption('opt3', 'Option 3');

    select.value = 'opt1, opt3, invalid';

    const selected = select.selectedOptions;
    expect(selected).toContain('opt1');
    expect(selected).toContain('opt3');
    expect(selected).not.toContain('invalid');
  });

  it('multiple value setter clears previous selection', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('opt1', 'Option 1');
    select.addOption('opt2', 'Option 2');

    select.value = 'opt1, opt2';
    select.value = 'opt1';

    const selected = select.selectedOptions;
    expect(selected).toContain('opt1');
    expect(selected).not.toContain('opt2');
  });

  // ── value getter: multiple ────────────────────────────────────────────────
  it('value getter returns comma-separated values for multiple select', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('a', 'A');
    select.addOption('b', 'B');
    select.addOption('c', 'C');

    select.value = 'a, c';

    const val = select.value;
    expect(val).toContain('a');
    expect(val).toContain('c');
  });

  // ── valid getter: multiple paths ──────────────────────────────────────────
  it('valid getter returns false for multiple required with no selection', async () => {
    select.setAttribute('multiple', '');
    select.setAttribute('required', '');
    await appendAndWait(select);
    select.addOption('opt1', 'Option 1');

    expect(select.valid).toBe(false);
  });

  it('valid getter returns true for multiple required with selection', async () => {
    select.setAttribute('multiple', '');
    select.setAttribute('required', '');
    await appendAndWait(select);
    select.addOption('opt1', 'Option 1', true);

    expect(select.valid).toBe(true);
  });

  it('valid getter returns true for non-required single with no value (public tier)', async () => {
    select.setAttribute('security-tier', 'public');
    await appendAndWait(select);
    select.addOption('', 'Please select...');

    expect(select.valid).toBe(true);
  });

  // ── #handleChange: multiple select branches ───────────────────────────────
  it('dispatches secure-select event for multiple select change', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('a', 'A');
    select.addOption('b', 'B');

    const handler = vi.fn();
    select.addEventListener('secure-select', handler);

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    const optA = internalSelect.options[0]!;
    optA.selected = true;
    internalSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(handler).toHaveBeenCalled();
  });

  it('rejects invalid option value in single select change event', async () => {
    await appendAndWait(select);
    select.addOption('valid', 'Valid');

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    // Manually inject an invalid option into the DOM to test rejection
    const badOpt = document.createElement('option');
    badOpt.value = 'injected';
    badOpt.textContent = 'Injected';
    internalSelect.appendChild(badOpt);
    internalSelect.value = 'injected';
    internalSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 20));
    // Invalid option should be rejected; select resets to ''
    expect(internalSelect.value).toBe('');
  });

  it('rejects invalid option value in multiple select change event', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('valid', 'Valid');

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    const badOpt = document.createElement('option');
    badOpt.value = 'injected';
    badOpt.textContent = 'Injected';
    internalSelect.appendChild(badOpt);
    const badOptEl = internalSelect.options[internalSelect.options.length - 1]!;
    badOptEl.selected = true;
    internalSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 20));
    // Error should have been shown; select not dispatched
    const shadowContent = select.shadowRoot?.innerHTML || '';
    expect(shadowContent).toContain('Invalid');
  });

  // ── #validateAndShowErrors: rate limit ───────────────────────────────────
  it('shows rate-limit error when rate limit exceeded on blur', async () => {
    select.setAttribute('security-tier', 'critical');
    await appendAndWait(select);
    select.addOption('a', 'A');

    const spy = vi.spyOn(SecureBaseComponent.prototype as unknown as { checkRateLimit: () => unknown }, 'checkRateLimit')
      .mockReturnValue({ allowed: false, retryAfter: 5000 });

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    internalSelect.dispatchEvent(new Event('blur'));

    await new Promise(resolve => setTimeout(resolve, 20));
    const shadowContent = select.shadowRoot?.innerHTML ?? '';
    expect(shadowContent).toContain('Too many');
    spy.mockRestore();
  });

  // ── #validateAndShowErrors: multiple required ─────────────────────────────
  it('shows error for multiple required with empty selection on blur', async () => {
    select.setAttribute('multiple', '');
    select.setAttribute('required', '');
    await appendAndWait(select);
    select.addOption('opt1', 'Option 1');

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    internalSelect.dispatchEvent(new Event('blur'));

    await new Promise(resolve => setTimeout(resolve, 20));
    const shadowContent = select.shadowRoot?.innerHTML || '';
    expect(shadowContent).toContain('least one');
  });

  // ── #validateAndShowErrors: invalid value in multiple on blur ─────────────
  it('shows error for invalid value in multiple select on blur', async () => {
    select.setAttribute('multiple', '');
    await appendAndWait(select);
    select.addOption('valid', 'Valid');

    const internalSelect = select.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    const badOpt = document.createElement('option');
    badOpt.value = 'hacked';
    badOpt.selected = true;
    internalSelect.appendChild(badOpt);
    internalSelect.dispatchEvent(new Event('blur'));

    await new Promise(resolve => setTimeout(resolve, 20));
    const shadowContent = select.shadowRoot?.innerHTML || '';
    expect(shadowContent).toContain('Invalid');
  });

  // ── removeOption: option not found ────────────────────────────────────────
  it('removeOption is a no-op when option does not exist', async () => {
    await appendAndWait(select);
    select.addOption('a', 'A');
    // Should not throw
    expect(() => select.removeOption('nonexistent')).not.toThrow();
    expect(select.shadowRoot?.querySelector('select')?.options.length).toBe(1);
  });

  // ── #transferOptions: value attr takes precedence over selected ────────────
  it('value attribute takes precedence over selected option in light DOM', async () => {
    select.setAttribute('value', 'ca');
    select.innerHTML = `
      <option value="">Select one</option>
      <option value="us" selected>United States</option>
      <option value="uk">United Kingdom</option>
      <option value="ca">Canada</option>
    `;
    await appendAndWait(select);
    expect(select.value).toBe('ca');
  });

  // ── disconnectedCallback ──────────────────────────────────────────────────
  it('disconnectedCallback does not clear validOptions (reconnect safe)', async () => {
    await appendAndWait(select);
    select.addOption('x', 'X');
    select.remove();
    document.body.appendChild(select);
    // Value should still be settable because validOptions was not cleared
    select.value = 'x';
    expect(select.value).toBe('x');
  });

  // ── no selectElement guard ────────────────────────────────────────────────
  it('addOption is no-op before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(() => unconnected.addOption('a', 'A')).not.toThrow();
  });

  it('removeOption is no-op before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(() => unconnected.removeOption('a')).not.toThrow();
  });

  it('clearOptions is no-op before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(() => unconnected.clearOptions()).not.toThrow();
  });

  it('value getter returns empty string before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(unconnected.value).toBe('');
  });

  it('value setter is no-op before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(() => { unconnected.value = 'x'; }).not.toThrow();
  });

  it('name getter returns empty string before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(unconnected.name).toBe('');
  });

  it('selectedOptions returns empty array before connected', () => {
    const unconnected = document.createElement('secure-select') as SecureSelect;
    expect(unconnected.selectedOptions).toEqual([]);
  });
});
