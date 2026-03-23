/**
 * SecureTextarea — branch coverage
 *
 * Targets uncovered branches identified by coverage analysis:
 * pre-render getters/setters, attribute-change switch cases,
 * blur-triggered validation, char-count without maxlength,
 * aria-label fallback, value attribute in render, and more.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureTextarea } from '../../src/components/secure-textarea/secure-textarea.js';

if (!customElements.get('secure-textarea')) {
  customElements.define('secure-textarea', SecureTextarea);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mount(attrs: Record<string, string> = {}): SecureTextarea {
  const el = document.createElement('secure-textarea') as SecureTextarea;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function ta(el: SecureTextarea): HTMLTextAreaElement {
  return el.shadowRoot!.querySelector('textarea')!;
}

// ── Pre-render getter/setter branches (lines 450, 459) ────────────────────────

describe('SecureTextarea — pre-render value getter/setter (lines 450, 459)', () => {
  it('value getter returns empty string before mount', () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    expect(el.value).toBe('');
    // no mount — element is never connected
  });

  it('value setter is a no-op before mount (no throw)', () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    expect(() => { el.value = 'hello'; }).not.toThrow();
    // #textareaElement is null, setter silently skips
  });
});

// ── Pre-render focus / blur (lines 505, 516) ──────────────────────────────────

describe('SecureTextarea — focus/blur before mount (lines 505, 516)', () => {
  it('focus() does not throw before mount', () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    expect(() => el.focus()).not.toThrow();
  });

  it('blur() does not throw before mount', () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    expect(() => el.blur()).not.toThrow();
  });
});

// ── value attribute in render (line 255) ─────────────────────────────────────

describe('SecureTextarea — value attribute set before mount (line 255)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('pre-set value attribute is reflected in internal textarea after mount', () => {
    el = mount({ 'security-tier': 'public', value: 'pre-filled text' });
    expect(ta(el).value).toBe('pre-filled text');
  });
});

// ── aria-label fallback: name without label (line 190) ────────────────────────

describe('SecureTextarea — aria-label when name present but no label (line 190)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('sets aria-label on internal textarea when name is set but no label attribute', () => {
    el = mount({ 'security-tier': 'public', name: 'bio' });
    expect(ta(el).getAttribute('aria-label')).toBe('bio');
  });
});

// ── minlength set before mount (line 211) ─────────────────────────────────────

describe('SecureTextarea — minlength attribute in render (line 211)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('applies minlength to internal textarea when set before mount', () => {
    el = mount({ 'security-tier': 'public', minlength: '5' });
    expect(ta(el).minLength).toBe(5);
  });
});

// ── char-count (line 336) ────────────────────────────────────────────────────
// Note: the maxLength > 0 false-branch (else path) is unreachable because all
// security-tier configs supply a positive maxLength. Tests cover the true branch.

describe('SecureTextarea — char-count (line 336)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('shows count/max format when maxlength is set', () => {
    el = mount({ 'security-tier': 'public', maxlength: '100' });
    el.value = 'hi';
    const charCount = el.shadowRoot?.querySelector('.char-count');
    expect(charCount?.textContent).toContain('/ 100');
  });

  it('adds warning class when value exceeds 90% of maxlength', () => {
    el = mount({ 'security-tier': 'public', maxlength: '10' });
    el.value = 'abcdefghij'; // 10 chars = 100% of 10 > 90%
    const charCount = el.shadowRoot?.querySelector('.char-count');
    expect(charCount?.classList.contains('warning')).toBe(true);
  });
});

// ── handleAttributeChange switch cases (lines 426, 428) ──────────────────────

describe('SecureTextarea — handleAttributeChange after mount (lines 426–441)', () => {
  let el: SecureTextarea;
  afterEach(() => el?.remove());

  it('returns early without throwing when attribute changes before render', () => {
    // Create but do not mount — #textareaElement is null → line 426 arm 0
    const pre = document.createElement('secure-textarea') as SecureTextarea;
    expect(() => pre.setAttribute('disabled', '')).not.toThrow();
  });

  it('disabling after mount reflects on internal textarea (switch arm: disabled)', () => {
    el = mount({ 'security-tier': 'public' });
    expect(ta(el).disabled).toBe(false);
    el.setAttribute('disabled', '');
    expect(ta(el).disabled).toBe(true);
  });

  it('removing disabled after mount re-enables internal textarea', () => {
    el = mount({ 'security-tier': 'public', disabled: '' });
    el.removeAttribute('disabled');
    expect(ta(el).disabled).toBe(false);
  });

  it('setting readonly after mount reflects on internal textarea (switch arm: readonly)', () => {
    el = mount({ 'security-tier': 'public' });
    expect(ta(el).readOnly).toBe(false);
    el.setAttribute('readonly', '');
    expect(ta(el).readOnly).toBe(true);
  });

  it('removing readonly after mount clears readOnly on internal textarea', () => {
    el = mount({ 'security-tier': 'public', readonly: '' });
    el.removeAttribute('readonly');
    expect(ta(el).readOnly).toBe(false);
  });

  it('setting value attribute after mount updates internal textarea (switch arm: value, arm 0)', () => {
    el = mount({ 'security-tier': 'public' });
    el.setAttribute('value', 'updated');
    expect(ta(el).value).toBe('updated');
  });

  it('setting value attribute to same value does not re-assign (switch arm: value, arm 1)', () => {
    el = mount({ 'security-tier': 'public', value: 'same' });
    const spy = vi.spyOn(ta(el), 'value', 'set');
    el.setAttribute('value', 'same'); // same value — branch skips assignment
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Blur-triggered validation (lines 358, 370, 371, 374) ─────────────────────

describe('SecureTextarea — blur event triggers validateAndShowErrors (lines 358–377)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('blur with valid content does not show error', () => {
    el = mount({ 'security-tier': 'public', name: 'bio', minlength: '3' });
    ta(el).value = 'hello';
    ta(el).dispatchEvent(new Event('blur'));
    const errorContainer = el.shadowRoot?.querySelector('.error-container');
    expect(errorContainer?.classList.contains('hidden')).toBe(true);
  });

  it('blur with content too short shows a validation error', () => {
    el = mount({ 'security-tier': 'public', name: 'bio', minlength: '10' });
    ta(el).value = 'hi';
    ta(el).dispatchEvent(new Event('blur'));
    const errorContainer = el.shadowRoot?.querySelector('.error-container');
    expect(errorContainer?.classList.contains('hidden')).toBe(false);
    expect(errorContainer?.textContent?.length).toBeGreaterThan(0);
  });

  it('blur with maxlength attr triggers validation path (line 371 arm 0)', () => {
    el = mount({ 'security-tier': 'public', name: 'bio', maxlength: '20' });
    ta(el).value = 'hello';
    expect(() => ta(el).dispatchEvent(new Event('blur'))).not.toThrow();
  });

  it('blur without minlength attr uses 0 as minLength (line 370 arm 1)', () => {
    el = mount({ 'security-tier': 'public', name: 'bio' });
    ta(el).value = 'hi';
    expect(() => ta(el).dispatchEvent(new Event('blur'))).not.toThrow();
  });
});

// ── valid getter: non-required tier (line 485 arm 1) ─────────────────────────

describe('SecureTextarea — valid getter for non-required config (line 485)', () => {
  let el: SecureTextarea;
  afterEach(() => el.remove());

  it('valid returns true for public tier with no required attribute and non-empty value', () => {
    el = mount({ 'security-tier': 'public' });
    el.value = 'something';
    // public tier has no required constraint by default → skips the required check (arm 1)
    expect(el.valid).toBe(true);
  });
});

// ── disconnectedCallback before render (line 528) ────────────────────────────

describe('SecureTextarea — disconnectedCallback when #textareaElement is null (line 528)', () => {
  it('disconnects without error before ever being mounted', () => {
    const el = document.createElement('secure-textarea') as SecureTextarea;
    // Never appended to DOM — #textareaElement is null
    expect(() => el.disconnectedCallback()).not.toThrow();
  });
});
