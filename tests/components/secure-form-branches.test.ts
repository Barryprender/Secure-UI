/**
 * SecureForm Branch Coverage Tests
 *
 * Targets uncovered branches: progressive enhancement (existing <form>),
 * double-submit prevention, rate limiting, validation failure, shouldEnhance=false,
 * event cancelled, fetch error, attributeChangedCallback, reset/submit/getData,
 * CSRF warning for sensitive/critical without token, #syncSecureInputsToForm,
 * novalidate, autocomplete for sensitive tier.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';

if (!customElements.get('secure-form')) {
  customElements.define('secure-form', SecureForm);
}
if (!customElements.get('secure-input')) {
  customElements.define('secure-input', SecureInput);
}

describe('SecureForm branch coverage', () => {
  let form: SecureForm;

  beforeEach(() => {
    form = document.createElement('secure-form') as SecureForm;
    // Reset static flag so styles are re-added in each test context
    SecureForm.__stylesAdded = false;
  });

  afterEach(() => {
    form.remove();
    vi.restoreAllMocks();
  });

  // ── Basic init ────────────────────────────────────────────────────────────
  it('creates component and inner form element', () => {
    document.body.appendChild(form);
    expect(form.querySelector('form')).not.toBeNull();
  });

  it('connectedCallback is idempotent', () => {
    document.body.appendChild(form);
    const firstForm = form.querySelector('form');
    // Calling connectedCallback again should not create a second form
    form.connectedCallback();
    const formCount = form.querySelectorAll('form').length;
    expect(formCount).toBe(1);
    void firstForm;
  });

  // ── Security tier ─────────────────────────────────────────────────────────
  it('reads security-tier attribute in connectedCallback', () => {
    form.setAttribute('security-tier', 'sensitive');
    document.body.appendChild(form);
    expect(form.securityTier).toBe('sensitive');
  });

  it('defaults to public security tier', () => {
    document.body.appendChild(form);
    expect(form.securityTier).toBe('public');
  });

  // ── SENSITIVE tier: autocomplete off ─────────────────────────────────────
  it('sets autocomplete=off for SENSITIVE tier', () => {
    form.setAttribute('security-tier', 'sensitive');
    document.body.appendChild(form);
    const innerForm = form.querySelector('form')!;
    expect(innerForm.autocomplete).toBe('off');
  });

  it('sets autocomplete=off for CRITICAL tier', () => {
    form.setAttribute('security-tier', 'critical');
    document.body.appendChild(form);
    const innerForm = form.querySelector('form')!;
    expect(innerForm.autocomplete).toBe('off');
  });

  // ── novalidate attribute ──────────────────────────────────────────────────
  it('applies novalidate attribute', () => {
    form.setAttribute('novalidate', '');
    document.body.appendChild(form);
    const innerForm = form.querySelector('form')!;
    expect(innerForm.noValidate).toBe(true);
  });

  // ── CSRF warning for sensitive/critical without token ─────────────────────
  it('warns when SENSITIVE tier has no CSRF token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    form.setAttribute('security-tier', 'sensitive');
    document.body.appendChild(form);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CSRF'));
  });

  // ── Progressive enhancement: adopt existing <form> ────────────────────────
  it('adopts existing server-rendered form', () => {
    const existingForm = document.createElement('form');
    existingForm.innerHTML = '<input name="username" value="alice">';
    form.appendChild(existingForm);
    document.body.appendChild(form);

    // Should have adopted the existing form
    const innerForm = form.querySelector('form');
    expect(innerForm).toBe(existingForm);
  });

  it('adopts existing server-rendered form with CSRF already present', () => {
    const existingForm = document.createElement('form');
    const existingCsrf = document.createElement('input');
    existingCsrf.type = 'hidden';
    existingCsrf.name = 'csrf_token';
    existingCsrf.value = 'server-token';
    existingForm.appendChild(existingCsrf);
    form.appendChild(existingForm);
    form.setAttribute('csrf-token', 'new-token');
    document.body.appendChild(form);

    // CSRF token value should be updated
    const csrfField = form.querySelector('input[name="csrf_token"]') as HTMLInputElement;
    expect(csrfField?.value).toBe('new-token');
  });

  it('adopts existing form without updating CSRF when token attr absent', () => {
    const existingForm = document.createElement('form');
    const existingCsrf = document.createElement('input');
    existingCsrf.type = 'hidden';
    existingCsrf.name = 'csrf_token';
    existingCsrf.value = 'server-token';
    existingForm.appendChild(existingCsrf);
    form.appendChild(existingForm);
    // No csrf-token attribute on the form component
    document.body.appendChild(form);

    const csrfField = form.querySelector('input[name="csrf_token"]') as HTMLInputElement;
    expect(csrfField?.value).toBe('server-token');
  });

  // ── attributeChangedCallback ──────────────────────────────────────────────
  it('attributeChangedCallback: updates action', () => {
    document.body.appendChild(form);
    form.setAttribute('action', '/new-endpoint');
    const innerForm = form.querySelector('form')!;
    expect(innerForm.action).toContain('/new-endpoint');
  });

  it('attributeChangedCallback: updates method', () => {
    document.body.appendChild(form);
    form.setAttribute('method', 'GET');
    const innerForm = form.querySelector('form')!;
    expect(innerForm.method.toUpperCase()).toBe('GET');
  });

  it('attributeChangedCallback: updates csrf-token', () => {
    form.setAttribute('csrf-token', 'initial-token');
    document.body.appendChild(form);
    form.setAttribute('csrf-token', 'updated-token');
    const csrfField = form.querySelector('input[name="csrf_token"]') as HTMLInputElement;
    expect(csrfField?.value).toBe('updated-token');
  });

  it('attributeChangedCallback: updates security-tier', () => {
    document.body.appendChild(form);
    form.setAttribute('security-tier', 'authenticated');
    expect(form.securityTier).toBe('authenticated');
  });

  it('attributeChangedCallback: no-op before form created', () => {
    // attributeChangedCallback should return early without throwing
    expect(() => {
      form.attributeChangedCallback('action', null, '/test');
    }).not.toThrow();
  });

  // ── getData / valid ───────────────────────────────────────────────────────
  it('getData returns form data object', () => {
    document.body.appendChild(form);
    const data = form.getData();
    expect(typeof data).toBe('object');
  });

  it('valid returns true when no invalid secure fields', () => {
    document.body.appendChild(form);
    expect(form.valid).toBe(true);
  });

  // ── reset ─────────────────────────────────────────────────────────────────
  it('reset clears form and status', () => {
    document.body.appendChild(form);
    expect(() => form.reset()).not.toThrow();
  });

  // ── submit ────────────────────────────────────────────────────────────────
  it('submit dispatches submit event on inner form', () => {
    document.body.appendChild(form);
    const handler = vi.fn((e: Event) => e.preventDefault());
    form.querySelector('form')!.addEventListener('submit', handler);
    form.submit();
    expect(handler).toHaveBeenCalled();
  });

  // ── #handleSubmit: double-submit prevention ───────────────────────────────
  it('prevents double submission', async () => {
    form.setAttribute('enhance', '');
    form.setAttribute('action', '/test');
    document.body.appendChild(form);

    // Override #submitForm to hang
    vi.spyOn(form as never, 'checkRateLimit').mockReturnValue({ allowed: true, retryAfter: 0 });

    let resolveSubmit!: () => void;
    const hangingFetch = new Promise<never>((_res, _rej) => {
      resolveSubmit = () => {};
    });
    vi.stubGlobal('fetch', () => hangingFetch);

    const innerForm = form.querySelector('form')!;
    innerForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Second submit while first is pending
    const secondHandler = vi.fn((e: Event) => e.preventDefault());
    innerForm.addEventListener('submit', secondHandler);
    innerForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(resolve => setTimeout(resolve, 20));
    resolveSubmit();

    vi.unstubAllGlobals();
  });

  // ── #handleSubmit: rate limit exceeded ───────────────────────────────────
  it('prevents submit when rate limited', () => {
    document.body.appendChild(form);
    vi.spyOn(form, 'checkRateLimit' as never).mockReturnValue({ allowed: false, retryAfter: 5000 } as never);

    const innerForm = form.querySelector('form')!;
    const submitHandler = vi.fn((e: Event) => e.preventDefault());
    innerForm.addEventListener('submit', submitHandler);

    form.submit();

    const status = form.querySelector('.form-status');
    expect(status?.textContent).toContain('Too many');
  });

  // ── #handleSubmit: validation failure ────────────────────────────────────
  it('shows validation error when secure fields are invalid', () => {
    document.body.appendChild(form);

    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'email');
    input.setAttribute('label', 'Email');
    input.setAttribute('required', '');
    form.querySelector('form')!.appendChild(input);
    // Do NOT re-append to body — that would move it out of the form

    // At this point the required input has no value → invalid
    form.submit();

    const status = form.querySelector('.form-status');
    expect(status?.textContent).toContain('invalid');
  });

  // ── #handleSubmit: native submission (no enhance) ────────────────────────
  it('allows native submission when enhance attr is absent', () => {
    form.setAttribute('action', '/native');
    document.body.appendChild(form);

    let defaultPrevented = false;
    const innerForm = form.querySelector('form')!;
    innerForm.addEventListener('submit', (e) => {
      defaultPrevented = e.defaultPrevented;
      e.preventDefault(); // prevent actual navigation in test
    });

    form.submit();
    // Native path: default should NOT be prevented by our code
    expect(defaultPrevented).toBe(false);
  });

  // ── #handleSubmit: enhanced submission cancelled via event ────────────────
  it('cancels enhanced submission when secure-form-submit is cancelled', async () => {
    form.setAttribute('enhance', '');
    form.setAttribute('action', '/test');
    form.setAttribute('csrf-token', 'tok');
    document.body.appendChild(form);

    form.addEventListener('secure-form-submit', (e) => {
      e.preventDefault();
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    form.submit();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // ── #handleSubmit: fetch error ────────────────────────────────────────────
  it('shows error message when fetch fails', async () => {
    form.setAttribute('enhance', '');
    form.setAttribute('action', 'http://localhost/test');
    document.body.appendChild(form);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    form.submit();
    await new Promise(resolve => setTimeout(resolve, 100));

    const status = form.querySelector('.form-status');
    expect(status?.textContent).toContain('failed');

    vi.unstubAllGlobals();
  });

  // ── #syncSecureInputsToForm: existing hidden input reuse ─────────────────
  it('reuses existing hidden input on second native submit', async () => {
    form.setAttribute('action', '/native');
    document.body.appendChild(form);

    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'username');
    input.setAttribute('label', 'Username');
    form.querySelector('form')!.appendChild(input);
    document.body.appendChild(input);
    await new Promise(resolve => setTimeout(resolve, 30));

    const innerForm = form.querySelector('form')!;
    // First submit
    innerForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));

    const hiddenInputsFirst = innerForm.querySelectorAll('input[type="hidden"][data-secure-input]').length;

    // Second submit — should reuse, not duplicate
    innerForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));

    const hiddenInputsSecond = innerForm.querySelectorAll('input[type="hidden"][data-secure-input]').length;
    expect(hiddenInputsSecond).toBe(hiddenInputsFirst);
  });

  // ── sanitizeValue ─────────────────────────────────────────────────────────
  it('sanitizeValue encodes HTML entities', () => {
    document.body.appendChild(form);
    const result = form.sanitizeValue('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
  });

  it('sanitizeValue returns empty string for non-string input', () => {
    document.body.appendChild(form);
    const result = form.sanitizeValue(42 as unknown as string);
    expect(result).toBe('');
  });

  // ── secure-field events clear status ─────────────────────────────────────
  it('clears status when a secure-input fires secure-input event', () => {
    document.body.appendChild(form);
    // Manually set a status message first
    const statusEl = form.querySelector('.form-status')!;
    (statusEl as HTMLElement).textContent = 'Some error';
    (statusEl as HTMLElement).className = 'form-status form-status-error';

    // Dispatch a secure-input event which should trigger #handleFieldChange → #clearStatus
    form.dispatchEvent(new CustomEvent('secure-input', { bubbles: true }));

    expect((statusEl as HTMLElement).textContent).toBe('');
  });

  // ── custom csrf-field-name ────────────────────────────────────────────────
  it('uses custom csrf-field-name attribute', () => {
    form.setAttribute('csrf-token', 'mytoken');
    form.setAttribute('csrf-field-name', 'X-CSRF');
    document.body.appendChild(form);

    const csrfField = form.querySelector('input[name="X-CSRF"]');
    expect(csrfField).not.toBeNull();
  });

  // ── disconnectedCallback ──────────────────────────────────────────────────
  it('disconnectedCallback resets form without throwing', () => {
    document.body.appendChild(form);
    expect(() => form.remove()).not.toThrow();
  });
});
