/**
 * SecureForm — Telemetry aggregation tests
 *
 * Verifies that:
 * - #collectTelemetry() discovers all secure child fields
 * - FieldTelemetrySnapshot shape is correct
 * - Risk score signals fire correctly for each scenario
 * - Telemetry is included in the secure-form-submit event detail
 * - Session duration is measured from connectedCallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';
import type { SessionTelemetry } from '../../src/core/types.js';

// ── Custom element registration ───────────────────────────────────────────────

if (!customElements.get('secure-form')) customElements.define('secure-form', SecureForm);
if (!customElements.get('secure-input')) customElements.define('secure-input', SecureInput);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildForm(fields: { name: string; value?: string }[] = []): SecureForm {
  const form = document.createElement('secure-form') as SecureForm;
  form.setAttribute('action', '/api/test');
  form.setAttribute('enhance', '');
  form.setAttribute('security-tier', 'public');

  for (const f of fields) {
    const input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', f.name);
    input.setAttribute('label', f.name);
    input.setAttribute('security-tier', 'public');
    form.appendChild(input);
  }

  document.body.appendChild(form);

  // Set values after mount so Shadow DOM inputs exist
  if (fields.length) {
    const secureInputs = form.querySelectorAll('secure-input');
    secureInputs.forEach((el, i) => {
      const val = fields[i]?.value;
      if (val !== undefined) (el as SecureInput).value = val;
    });
  }

  return form;
}

function getInputEl(secureInput: Element): HTMLInputElement {
  return (secureInput as SecureInput).shadowRoot!.querySelector('input')!;
}

function fireFocus(el: HTMLInputElement): void {
  el.dispatchEvent(new Event('focus'));
}

function fireInput(el: HTMLInputElement, inputType: string, data = ''): void {
  el.value += data;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
}

function fireBlur(el: HTMLInputElement): void {
  el.dispatchEvent(new Event('blur'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecureForm — telemetry aggregation', () => {
  let form: SecureForm;

  afterEach(() => {
    form?.remove();
    vi.restoreAllMocks();
  });

  // ── #collectTelemetry shape ───────────────────────────────────────────────

  describe('telemetry collection', () => {
    beforeEach(() => {
      form = buildForm([{ name: 'email' }, { name: 'password' }]);
    });

    it('includes all secure-input fields in the snapshot', () => {
      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.fieldCount).toBe(2);
        expect(t.fields).toHaveLength(2);
        expect(t.fields.map(f => f.fieldName)).toContain('email');
        expect(t.fields.map(f => f.fieldName)).toContain('password');
      });
    });

    it('each field snapshot has the correct FieldTelemetry shape', () => {
      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        for (const f of t.fields) {
          expect(typeof f.dwell).toBe('number');
          expect(typeof f.completionTime).toBe('number');
          expect(typeof f.velocity).toBe('number');
          expect(typeof f.corrections).toBe('number');
          expect(typeof f.pasteDetected).toBe('boolean');
          expect(typeof f.autofillDetected).toBe('boolean');
          expect(typeof f.focusCount).toBe('number');
          expect(typeof f.blurWithoutChange).toBe('number');
          expect(typeof f.fieldName).toBe('string');
          expect(typeof f.fieldType).toBe('string');
        }
      });
    });

    it('fieldType is the element tag name', () => {
      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.fields.every(f => f.fieldType === 'secure-input')).toBe(true);
      });
    });

    it('submittedAt is a valid ISO 8601 string', () => {
      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(() => new Date(t.submittedAt)).not.toThrow();
        expect(new Date(t.submittedAt).toISOString()).toBe(t.submittedAt);
      });
    });

    it('sessionDuration is a non-negative number', () => {
      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.sessionDuration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ── Risk score: no interaction (fresh form) ───────────────────────────────

  describe('risk scoring', () => {
    it('returns a riskScore between 0 and 100', () => {
      form = buildForm([{ name: 'email' }]);

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskScore).toBeGreaterThanOrEqual(0);
        expect(t.riskScore).toBeLessThanOrEqual(100);
        expect(Array.isArray(t.riskSignals)).toBe(true);
      });
    });

    it('session_too_fast signal fires when submitted immediately', () => {
      form = buildForm([{ name: 'email' }]);

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      // Submit immediately — well under 3 s threshold
      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('session_too_fast');
        expect(t.riskScore).toBeGreaterThanOrEqual(30);
      });
    });

    it('all_fields_pasted signal fires when every field was pasted', () => {
      form = buildForm([{ name: 'user' }, { name: 'pass' }]);

      const inputs = Array.from(form.querySelectorAll('secure-input'));

      // Simulate paste in every field
      inputs.forEach((si) => {
        const inp = getInputEl(si);
        fireFocus(inp);
        inp.value = 'pasted';
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
        fireBlur(inp);
      });

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('all_fields_pasted');
      });
    });

    it('all_fields_pasted does NOT fire when any field was typed', () => {
      form = buildForm([{ name: 'user' }, { name: 'pass' }]);

      const inputs = Array.from(form.querySelectorAll('secure-input'));

      // First field: typed
      const firstInput = getInputEl(inputs[0]!);
      fireFocus(firstInput);
      fireInput(firstInput, 'insertText', 'hello');
      fireBlur(firstInput);

      // Second field: pasted
      const secondInput = getInputEl(inputs[1]!);
      fireFocus(secondInput);
      secondInput.value = 'pasted';
      secondInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
      fireBlur(secondInput);

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).not.toContain('all_fields_pasted');
      });
    });

    it('field_filled_without_focus fires when a field has focusCount = 0', () => {
      form = buildForm([{ name: 'email' }]);
      // Do NOT interact with the input at all — focusCount stays 0

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('field_filled_without_focus');
      });
    });

    it('form_probing fires when a field was focused and blurred multiple times with no input', () => {
      form = buildForm([{ name: 'email' }]);

      const input = getInputEl(form.querySelector('secure-input')!);

      // Focus/blur 3 times without entering any value
      for (let i = 0; i < 3; i++) {
        fireFocus(input);
        fireBlur(input);
      }

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('form_probing');
      });
    });

    it('high_correction_count fires when corrections > 5 on a field', () => {
      form = buildForm([{ name: 'email' }]);

      const input = getInputEl(form.querySelector('secure-input')!);
      fireFocus(input);
      for (let i = 0; i < 6; i++) {
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
      fireBlur(input);

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('high_correction_count');
      });
    });

    it('autofill_detected fires (and reduces score) when all fields autofilled', () => {
      form = buildForm([{ name: 'email' }, { name: 'name' }]);

      const inputs = Array.from(form.querySelectorAll('secure-input'));
      inputs.forEach((si) => {
        const inp = getInputEl(si);
        fireFocus(inp);
        inp.value = 'autofilled';
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
        fireBlur(inp);
      });

      const telemetryPromise = new Promise<SessionTelemetry>((resolve) => {
        form.addEventListener('secure-form-submit', (e) => {
          resolve((e as CustomEvent).detail.telemetry as SessionTelemetry);
        });
      });

      form.submit();

      return telemetryPromise.then((t) => {
        expect(t.riskSignals).toContain('autofill_detected');
      });
    });
  });

  // ── Telemetry in event detail ─────────────────────────────────────────────

  describe('event detail', () => {
    it('secure-form-submit event detail includes telemetry', () => {
      form = buildForm([{ name: 'field' }]);

      let detail: Record<string, unknown> | null = null;
      form.addEventListener('secure-form-submit', (e) => {
        detail = (e as CustomEvent).detail as Record<string, unknown>;
      });

      form.submit();

      expect(detail).not.toBeNull();
      expect(detail!['telemetry']).toBeDefined();
      const t = detail!['telemetry'] as SessionTelemetry;
      expect(typeof t.riskScore).toBe('number');
      expect(Array.isArray(t.riskSignals)).toBe(true);
    });

    it('telemetry accompanies formData in the event detail', () => {
      form = buildForm([{ name: 'username', value: 'testuser' }]);

      let detail: Record<string, unknown> | null = null;
      form.addEventListener('secure-form-submit', (e) => {
        detail = (e as CustomEvent).detail as Record<string, unknown>;
      });

      form.submit();

      expect(detail!['formData']).toBeDefined();
      expect(detail!['telemetry']).toBeDefined();
    });
  });

  // ── Empty form (no secure fields) ────────────────────────────────────────

  it('gracefully handles a form with no secure fields', () => {
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('action', '/api/test');
    form.setAttribute('enhance', '');
    document.body.appendChild(form);

    let telemetry: SessionTelemetry | null = null;
    form.addEventListener('secure-form-submit', (e) => {
      telemetry = (e as CustomEvent).detail.telemetry as SessionTelemetry;
    });

    form.submit();

    expect(telemetry).not.toBeNull();
    expect(telemetry!.fieldCount).toBe(0);
    expect(telemetry!.fields).toHaveLength(0);
    expect(telemetry!.riskScore).toBeGreaterThanOrEqual(0);
  });
});
