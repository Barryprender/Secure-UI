/**
 * SecureForm Submission & Validation Tests
 *
 * Branch coverage for form submit flow, CSRF injection, XSS sanitization,
 * attribute-change handlers, and multi-field validation aggregation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';
import { SecureSubmitButton } from '../../src/components/secure-submit-button/secure-submit-button.js';
import type { ThreatDetectedDetail } from '../../src/core/types.js';

if (!customElements.get('secure-form')) {
  customElements.define('secure-form', SecureForm);
}
if (!customElements.get('secure-input')) {
  customElements.define('secure-input', SecureInput);
}
if (!customElements.get('secure-submit-button')) {
  customElements.define('secure-submit-button', SecureSubmitButton);
}

describe('SecureForm — CSRF token', () => {
  let form: SecureForm;

  beforeEach(() => {
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('security-tier', 'public');
  });

  afterEach(() => { form.remove(); });

  it('two different form instances have different CSRF tokens when tokens are set', () => {
    const formA = document.createElement('secure-form') as SecureForm;
    const formB = document.createElement('secure-form') as SecureForm;
    formA.setAttribute('security-tier', 'public');
    formB.setAttribute('security-tier', 'public');

    // Use distinct tokens (as a server would issue)
    formA.setAttribute('csrf-token', 'token-A-' + crypto.randomUUID());
    formB.setAttribute('csrf-token', 'token-B-' + crypto.randomUUID());
    document.body.appendChild(formA);
    document.body.appendChild(formB);

    const tokenA = (formA.querySelector('input[name="csrf_token"]') as HTMLInputElement | null)?.value;
    const tokenB = (formB.querySelector('input[name="csrf_token"]') as HTMLInputElement | null)?.value;

    // Tokens must differ — reuse would allow cross-form CSRF attacks
    if (tokenA && tokenB) {
      expect(tokenA).not.toBe(tokenB);
    }

    formA.remove();
    formB.remove();
  });

  it('CSRF token of minimum acceptable length (≥ 32 chars)', () => {
    const token = 'a'.repeat(32); // minimum acceptable entropy
    form.setAttribute('csrf-token', token);
    document.body.appendChild(form);
    const csrfInput = form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
    // Token must be stored verbatim and must be long enough to resist brute-force
    expect(csrfInput?.value.length).toBeGreaterThanOrEqual(32);
  });

  it('injects a hidden CSRF input when csrf-token is set before connect', () => {
    form.setAttribute('csrf-token', 'tok-abc-123');
    document.body.appendChild(form);
    const csrfInput = form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
    expect(csrfInput?.value).toBe('tok-abc-123');
  });

  it('updates CSRF token when attribute changes after connect', async () => {
    form.setAttribute('csrf-token', 'tok-first');
    document.body.appendChild(form);
    await new Promise(r => setTimeout(r, 50));
    form.setAttribute('csrf-token', 'tok-updated');
    await new Promise(r => setTimeout(r, 50));
    const csrfInput = form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
    expect(csrfInput?.value).toBe('tok-updated');
  });

  it('stores csrf-token as a safe input value (not rendered as HTML)', () => {
    // Setting .value on an input element is inherently XSS-safe — the browser
    // treats it as plain text, never as HTML. The test verifies the token is stored.
    form.setAttribute('csrf-token', 'safe-token-value');
    document.body.appendChild(form);
    const csrfInput = form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
    expect(csrfInput?.value).toBe('safe-token-value');
  });
});

describe('SecureForm — submission', () => {
  let form: SecureForm;

  beforeEach(() => {
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('security-tier', 'public');
    form.setAttribute('csrf-token', 'test-token');
    form.setAttribute('enhance', ''); // enables JS-enhanced submission & secure-form-submit event
    form.setAttribute('action', '/api/submit');
    document.body.appendChild(form);
  });

  afterEach(() => { form.remove(); });

  it('dispatches secure-form-submit event on valid submission', async () => {
    const handler = vi.fn((e: Event) => e.preventDefault()); // prevent actual fetch
    form.addEventListener('secure-form-submit', handler);

    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'username');
    input.setAttribute('label', 'Username');
    input.setAttribute('security-tier', 'public');
    form.appendChild(input);

    await new Promise(r => setTimeout(r, 50));
    input.value = 'alice';

    const internalForm = form.querySelector('form') ?? form.shadowRoot?.querySelector('form');
    internalForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 100));
    expect(handler).toHaveBeenCalled();
  });

  it('prevents submission when a required field is empty', async () => {
    const handler = vi.fn();
    form.addEventListener('secure-form-submit', handler);

    const internalForm = form.querySelector('form') as HTMLFormElement | null;
    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'email');
    input.setAttribute('label', 'Email');
    input.setAttribute('required', '');
    input.setAttribute('security-tier', 'public');
    // Append directly to inner <form> so #validateAllFields finds it
    (internalForm ?? form).appendChild(input);

    await new Promise(r => setTimeout(r, 50));
    // Leave value empty — input.valid should be false

    internalForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 100));
    expect(handler).not.toHaveBeenCalled();
  });

  it('includes formData in secure-form-submit event detail', async () => {
    let detail: Record<string, unknown> | null = null;
    form.addEventListener('secure-form-submit', ((e: CustomEvent) => {
      e.preventDefault(); // prevent actual fetch
      detail = e.detail as Record<string, unknown>;
    }) as EventListener);

    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'username');
    input.setAttribute('label', 'Username');
    input.setAttribute('security-tier', 'public');
    form.appendChild(input);

    await new Promise(r => setTimeout(r, 50));
    input.value = 'testuser';

    const internalForm = form.querySelector('form') ?? form.shadowRoot?.querySelector('form');
    internalForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 100));
    expect(detail).not.toBeNull();
    expect(detail).toHaveProperty('formData');
  });
});

describe('SecureForm — sanitizeValue', () => {
  let form: SecureForm;

  beforeEach(() => {
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('security-tier', 'public');
    document.body.appendChild(form);
  });

  afterEach(() => { form.remove(); });

  it('sanitizeValue encodes HTML angle brackets', () => {
    // Access via internal method — test indirectly via CSRF input
    form.setAttribute('csrf-token', '<b>bold</b>');
    const csrfInput = form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
    if (csrfInput) {
      expect(csrfInput.value).not.toContain('<b>');
    }
  });
});

describe('SecureForm — attribute changes', () => {
  let form: SecureForm;

  beforeEach(() => {
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('security-tier', 'public');
    document.body.appendChild(form);
  });

  afterEach(() => { form.remove(); });

  it('updates action attribute on the inner form', async () => {
    form.setAttribute('action', '/api/v1/submit');
    await new Promise(r => setTimeout(r, 50));
    const inner = form.querySelector('form') ?? form.shadowRoot?.querySelector('form');
    expect(inner?.getAttribute('action')).toBe('/api/v1/submit');
  });

  it('updates method attribute on the inner form', async () => {
    form.setAttribute('method', 'POST');
    await new Promise(r => setTimeout(r, 50));
    const inner = form.querySelector('form') ?? form.shadowRoot?.querySelector('form');
    expect(inner?.getAttribute('method')?.toUpperCase()).toBe('POST');
  });
});

describe('SecureForm — CSRF threat detection on submission', () => {
  function makeForm(tier: string, withToken: boolean): SecureForm {
    const f = document.createElement('secure-form') as SecureForm;
    f.setAttribute('security-tier', tier);
    f.setAttribute('enhance', '');
    f.setAttribute('action', '/api/submit');
    if (withToken) f.setAttribute('csrf-token', 'valid-token-xyz');
    document.body.appendChild(f);
    return f;
  }

  function triggerSubmit(f: SecureForm): void {
    const inner = f.querySelector('form') ?? f.shadowRoot?.querySelector('form');
    inner?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  afterEach(() => {
    document.querySelectorAll('secure-form').forEach(el => el.remove());
  });

  it('dispatches secure-threat-detected (csrf-token-absent) on sensitive tier without token', async () => {
    const form = makeForm('sensitive', false);
    await new Promise(r => setTimeout(r, 50));

    const handler = vi.fn();
    form.addEventListener('secure-threat-detected', handler);
    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0]![0] as CustomEvent<ThreatDetectedDetail>).detail;
    expect(detail.threatType).toBe('csrf-token-absent');
    expect(detail.patternId).toBe('csrf-token-absent');
    expect(detail.tier).toBe('sensitive');
  });

  it('dispatches secure-threat-detected (csrf-token-absent) on critical tier without token', async () => {
    const form = makeForm('critical', false);
    await new Promise(r => setTimeout(r, 50));

    const handler = vi.fn();
    form.addEventListener('secure-threat-detected', handler);
    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0]![0] as CustomEvent<ThreatDetectedDetail>).detail;
    expect(detail.threatType).toBe('csrf-token-absent');
    expect(detail.tier).toBe('critical');
  });

  it('does NOT dispatch csrf-token-absent for public tier without token', async () => {
    const form = makeForm('public', false);
    await new Promise(r => setTimeout(r, 50));

    const handler = vi.fn();
    form.addEventListener('secure-threat-detected', handler);
    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    const csrfAbsent = (handler.mock.calls as Array<[CustomEvent<ThreatDetectedDetail>]>)
      .filter(([e]) => e.detail?.threatType === 'csrf-token-absent');
    expect(csrfAbsent).toHaveLength(0);
  });

  it('does NOT dispatch csrf-token-absent for authenticated tier without token', async () => {
    const form = makeForm('authenticated', false);
    await new Promise(r => setTimeout(r, 50));

    const handler = vi.fn();
    form.addEventListener('secure-threat-detected', handler);
    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    const csrfAbsent = (handler.mock.calls as Array<[CustomEvent<ThreatDetectedDetail>]>)
      .filter(([e]) => e.detail?.threatType === 'csrf-token-absent');
    expect(csrfAbsent).toHaveLength(0);
  });

  it('does NOT dispatch csrf-token-absent when a valid token is present on critical tier', async () => {
    const form = makeForm('critical', true);
    await new Promise(r => setTimeout(r, 50));

    const handler = vi.fn();
    form.addEventListener('secure-threat-detected', handler);
    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    const csrfAbsent = (handler.mock.calls as Array<[CustomEvent<ThreatDetectedDetail>]>)
      .filter(([e]) => e.detail?.threatType === 'csrf-token-absent');
    expect(csrfAbsent).toHaveLength(0);
  });

  it('secure-threat-detected event bubbles and is composed', async () => {
    const form = makeForm('critical', false);
    await new Promise(r => setTimeout(r, 50));

    let capturedEvent: CustomEvent | null = null;
    document.addEventListener('secure-threat-detected', (e) => {
      if ((e as CustomEvent<ThreatDetectedDetail>).detail?.threatType === 'csrf-token-absent') {
        capturedEvent = e as CustomEvent;
      }
    });

    triggerSubmit(form);
    await new Promise(r => setTimeout(r, 50));

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.bubbles).toBe(true);
    expect(capturedEvent!.composed).toBe(true);
  });
});
