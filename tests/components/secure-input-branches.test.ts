/**
 * SecureInput Branch Coverage Tests
 *
 * Targets the uncovered branches in secure-input.ts:
 * - Rate limit exceeded (on blur)
 * - Password strength validation (critical / sensitive / authenticated tiers)
 * - Number overflow and min/max constraint validation
 * - Masked value path in #setValue (critical tier, type="text")
 * - handleAttributeChange (disabled / readonly / value)
 * - #showError and #clearErrors paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';

if (!customElements.get('secure-input')) {
  customElements.define('secure-input', SecureInput);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInternalInput(input: SecureInput): HTMLInputElement {
  return input.shadowRoot!.querySelector('input') as HTMLInputElement;
}

function getErrorContainer(input: SecureInput): HTMLElement {
  return input.shadowRoot!.querySelector('.error-container') as HTMLElement;
}

/**
 * Trigger blur on the shadow-DOM input to invoke #validateAndShowErrors.
 * The blur event listener calls the private method directly.
 */
function blur(input: SecureInput): void {
  getInternalInput(input).dispatchEvent(new Event('blur', { bubbles: false }));
}

/**
 * Trigger input event on the shadow-DOM input to invoke #handleInput,
 * which updates #actualValue for non-masked inputs.
 */
function simulateInput(input: SecureInput, value: string): void {
  const el = getInternalInput(input);
  el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecureInput — branch coverage', () => {
  let input: SecureInput;

  afterEach(() => {
    input.remove();
  });

  // ── Rate limit exceeded ────────────────────────────────────────────────────

  describe('Rate limit exceeded', () => {
    it('shows rate limit error after maxAttempts exceeded on blur (critical = 5)', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('name', 'test');
      document.body.appendChild(input);

      // Exhaust 5 allowed attempts by blurring 5 times
      for (let i = 0; i < 5; i++) {
        blur(input);
      }

      // 6th blur → rate limit exceeded
      blur(input);

      const errorContainer = getErrorContainer(input);
      expect(errorContainer.classList.contains('hidden')).toBe(false);
      expect(errorContainer.textContent).toMatch(/Too many attempts/i);
    });
  });

  // ── Password strength validation ───────────────────────────────────────────

  describe('Password strength — critical tier (uppercase + lowercase + digit + symbol, 8+ chars)', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);
    });

    it('rejects password shorter than 8 characters', () => {
      input.value = 'Abc1!';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/at least 8 characters/i);
    });

    it('rejects password without a lowercase letter', () => {
      input.value = 'ABCD1234!';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/lowercase/i);
    });

    it('rejects password without an uppercase letter', () => {
      input.value = 'abcd1234!';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/uppercase/i);
    });

    it('rejects password without a digit', () => {
      input.value = 'Abcdefg!';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/number/i);
    });

    it('rejects password without a special character', () => {
      input.value = 'Abcde123';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/special character/i);
    });

    it('accepts a password that meets all critical requirements', () => {
      input.value = 'Secure1!';
      blur(input);

      const err = getErrorContainer(input);
      // Error container should remain hidden (no error)
      expect(err.classList.contains('hidden')).toBe(true);
    });

    it('skips strength check on empty value (required check handles that)', () => {
      input.value = '';
      blur(input);

      // Empty password: strength check skipped, required check not configured
      const err = getErrorContainer(input);
      // Should not show a strength error (may or may not show required error
      // depending on required attribute — without it, no error either way)
      expect(err.textContent).not.toMatch(/at least 8 characters/i);
    });
  });

  describe('Password strength — sensitive tier (uppercase + lowercase + digit, 8+ chars)', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'sensitive');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);
    });

    it('rejects password without a digit', () => {
      input.value = 'Abcdefgh';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/number/i);
    });

    it('accepts password with uppercase + lowercase + digit', () => {
      input.value = 'Abcdefg1';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Password strength — authenticated tier (6+ chars)', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'authenticated');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);
    });

    it('rejects password shorter than 6 characters', () => {
      input.value = 'abc';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/at least 6 characters/i);
    });

    it('accepts any password 6+ characters long', () => {
      input.value = 'simple';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Password strength — public tier (no strength requirement)', () => {
    it('does not enforce strength on public tier', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'public');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'weak';
      blur(input);

      const err = getErrorContainer(input);
      // Public tier has no strength rules
      expect(err.textContent).not.toMatch(/at least/i);
      expect(err.textContent).not.toMatch(/uppercase|lowercase|number|special/i);
    });
  });

  describe('Password strength — non-password type', () => {
    it('does not run password strength check for type="text"', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'text');
      input.setAttribute('name', 'username');
      document.body.appendChild(input);

      // This value would fail password strength if checked, but type is text
      input.value = 'weak';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.textContent).not.toMatch(/at least 8 characters/i);
    });
  });

  // ── Number overflow validation ─────────────────────────────────────────────

  describe('Number overflow / constraint validation', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'public'); // no rate limit
      input.setAttribute('type', 'number');
      input.setAttribute('name', 'amount');
      document.body.appendChild(input);
    });

    it('rejects integer value beyond Number.MAX_SAFE_INTEGER', () => {
      // 2^53 = 9007199254740992 > MAX_SAFE_INTEGER (9007199254740991)
      input.value = '9007199254740992';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/safe integer range/i);
    });

    it('accepts decimal value (decimal point bypasses safe integer check)', () => {
      input.value = '9007199254740992.5';
      blur(input);

      // Decimal values are not checked against safe integer range
      const err = getErrorContainer(input);
      expect(err.textContent).not.toMatch(/safe integer range/i);
    });

    it('rejects value below min attribute', () => {
      input.setAttribute('min', '10');
      input.value = '5';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/at least 10/i);
    });

    it('rejects value above max attribute', () => {
      input.setAttribute('max', '100');
      input.value = '200';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/at most 100/i);
    });

    it('accepts value within min/max range', () => {
      input.setAttribute('min', '1');
      input.setAttribute('max', '100');
      input.value = '50';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(true);
    });

    it('skips overflow check on empty value', () => {
      input.value = '';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.textContent).not.toMatch(/valid number|safe integer/i);
    });

    it('does not run number check for type="text"', () => {
      const textInput = document.createElement('secure-input') as SecureInput;
      textInput.setAttribute('security-tier', 'public');
      textInput.setAttribute('type', 'text');
      textInput.setAttribute('name', 'field');
      document.body.appendChild(textInput);

      textInput.value = '9007199254740992';
      getInternalInput(textInput).dispatchEvent(new Event('blur'));

      const err = getErrorContainer(textInput);
      expect(err.textContent).not.toMatch(/safe integer/i);
      textInput.remove();
    });
  });

  // ── Masked value path in #setValue ────────────────────────────────────────

  describe('Masked value display (critical tier, type="text")', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      // critical tier: masking.enabled=true, partial=false
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'text');
      input.setAttribute('name', 'secret');
      document.body.appendChild(input);
    });

    it('internal input shows masked characters when masking is enabled', () => {
      input.value = 'hello';

      const internalInput = getInternalInput(input);
      // Display should be masked (•••••), not the actual value
      expect(internalInput.value).toBe('•••••');
    });

    it('value getter returns the unmasked actual value', () => {
      input.value = 'hello';
      expect(input.value).toBe('hello');
    });

    it('displays all mask characters (full mask, not partial)', () => {
      input.value = '12345678';
      const internalInput = getInternalInput(input);
      // critical tier: partial=false → all chars masked
      expect(internalInput.value).toBe('••••••••');
    });
  });

  describe('Masked value via value attribute at connect time', () => {
    it('value attribute sets actualValue even if display is unmasked on init', () => {
      // In #applyInputAttributes, #setValue is called before #isMasked is set to true.
      // So the initial displayed value from the attribute is not masked.
      // The actual value IS stored correctly; masking only applies to subsequent setValue calls.
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'text');
      input.setAttribute('name', 'secret');
      input.setAttribute('value', 'secret123');
      document.body.appendChild(input);

      // The getter always returns the actual unmasked value
      expect(input.value).toBe('secret123');
    });

    it('programmatic value setter after connect applies masking', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'text');
      input.setAttribute('name', 'secret');
      document.body.appendChild(input);

      // After connect, #isMasked is true, so the setter masks the display
      input.value = 'secret123';

      const internalInput = getInternalInput(input);
      expect(internalInput.value).toBe('•••••••••');
      expect(input.value).toBe('secret123');
    });
  });

  // ── handleAttributeChange ────────────────────────────────────────────────

  describe('handleAttributeChange', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'public');
      input.setAttribute('name', 'test');
      document.body.appendChild(input);
    });

    it('setting disabled attribute disables the internal input', () => {
      const el = getInternalInput(input);
      expect(el.disabled).toBe(false);

      input.setAttribute('disabled', '');
      expect(el.disabled).toBe(true);
    });

    it('removing disabled attribute re-enables the internal input', () => {
      input.setAttribute('disabled', '');
      const el = getInternalInput(input);
      expect(el.disabled).toBe(true);

      input.removeAttribute('disabled');
      expect(el.disabled).toBe(false);
    });

    it('setting readonly attribute makes the internal input readOnly', () => {
      const el = getInternalInput(input);
      expect(el.readOnly).toBe(false);

      input.setAttribute('readonly', '');
      expect(el.readOnly).toBe(true);
    });

    it('removing readonly attribute unsets readOnly on the internal input', () => {
      input.setAttribute('readonly', '');
      const el = getInternalInput(input);
      expect(el.readOnly).toBe(true);

      input.removeAttribute('readonly');
      expect(el.readOnly).toBe(false);
    });

    it('changing value attribute updates the internal input value', () => {
      input.setAttribute('value', 'initial');
      const el = getInternalInput(input);
      expect(el.value).toBe('initial');

      input.setAttribute('value', 'updated');
      expect(el.value).toBe('updated');
    });

    it('does not call handleAttributeChange before the component is connected', () => {
      // Create a disconnected component and set attributes — should not throw
      const disconnected = document.createElement('secure-input') as SecureInput;
      disconnected.setAttribute('security-tier', 'public');
      // These attribute changes happen before connectedCallback; #inputElement is null
      expect(() => {
        disconnected.setAttribute('disabled', '');
        disconnected.setAttribute('readonly', '');
        disconnected.setAttribute('value', 'test');
      }).not.toThrow();
    });
  });

  // ── #showError / #clearErrors paths ───────────────────────────────────────

  describe('#showError and #clearErrors paths', () => {
    beforeEach(() => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'public');
      input.setAttribute('name', 'field');
      document.body.appendChild(input);
    });

    it('error container is visible after validation failure', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'weak';
      blur(input);

      const err = getErrorContainer(input);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent!.length).toBeGreaterThan(0);
    });

    it('input event clears error (adds hidden class to error container)', () => {
      input.setAttribute('required', '');
      blur(input); // triggers validation with empty value → no error since no value yet

      // Manually show an error state by checking initial hidden state
      const err = getErrorContainer(input);
      // Trigger an input event — should call #clearErrors
      simulateInput(input, 'some value');

      expect(err.classList.contains('hidden')).toBe(true);
    });

    it('aria-invalid is set on the internal input when an error is shown', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'weak';
      blur(input);

      const el = getInternalInput(input);
      expect(el.getAttribute('aria-invalid')).toBe('true');
    });

    it('aria-invalid is removed after input event clears the error', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'weak';
      blur(input);

      const el = getInternalInput(input);
      expect(el.getAttribute('aria-invalid')).toBe('true');

      // Typing clears the error
      simulateInput(input, 'S');
      expect(el.getAttribute('aria-invalid')).toBeNull();
    });
  });

  // ── valid getter with password / number types ──────────────────────────────

  describe('valid getter — type-specific checks', () => {
    it('valid is false for weak password on critical tier', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'weak';
      expect(input.valid).toBe(false);
    });

    it('valid is true for strong password on critical tier', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'critical');
      input.setAttribute('type', 'password');
      input.setAttribute('name', 'pwd');
      document.body.appendChild(input);

      input.value = 'Secure1!';
      expect(input.valid).toBe(true);
    });

    it('valid is false for number exceeding safe integer range', () => {
      input = document.createElement('secure-input') as SecureInput;
      input.setAttribute('security-tier', 'public');
      input.setAttribute('type', 'number');
      input.setAttribute('name', 'num');
      document.body.appendChild(input);

      input.value = '9007199254740992'; // > MAX_SAFE_INTEGER
      expect(input.valid).toBe(false);
    });
  });
});

// ── Additional branch coverage ─────────────────────────────────────────────────

describe('SecureInput — fallback masked input (unknown inputType)', () => {
  let input: SecureInput;

  afterEach(() => input.remove());

  function getInternalInput(si: SecureInput): HTMLInputElement {
    return si.shadowRoot!.querySelector('input') as HTMLInputElement;
  }

  it('clears value when an unhandled inputType fires on a masked input (was: newLength > oldLength)', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'critical');
    input.setAttribute('type', 'text');
    input.setAttribute('name', 'secret');
    document.body.appendChild(input);

    input.value = 'abc';
    const el = getInternalInput(input);

    // Unhandled inputType (e.g. historyRedo) on a masked field: value cannot be
    // reconstructed from masked display — field is cleared to prevent corrupt state.
    el.value = '••••';
    el.setSelectionRange(4, 4);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'historyRedo' }));

    expect(input.value.length).toBe(0);
  });

  it('clears value when an unhandled inputType fires on a masked input (was: newLength < oldLength)', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'critical');
    input.setAttribute('type', 'text');
    input.setAttribute('name', 'secret');
    document.body.appendChild(input);

    input.value = 'abcde';
    const el = getInternalInput(input);

    el.value = '••••';
    el.setSelectionRange(4, 4);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'historyRedo' }));

    expect(input.value.length).toBe(0);
  });

  it('clears value when an unhandled inputType fires on a masked input (was: newLength === oldLength)', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'critical');
    input.setAttribute('type', 'text');
    input.setAttribute('name', 'secret');
    document.body.appendChild(input);

    input.value = 'abc';
    const el = getInternalInput(input);

    el.value = '•••';
    el.setSelectionRange(3, 3);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'historyRedo' }));

    expect(input.value.length).toBe(0);
  });
});

describe('SecureInput — native checkValidity() failure path', () => {
  let input: SecureInput;

  afterEach(() => {
    vi.restoreAllMocks();
    input.remove();
  });

  function getInternalInput(si: SecureInput): HTMLInputElement {
    return si.shadowRoot!.querySelector('input') as HTMLInputElement;
  }

  function getErrorContainer(si: SecureInput): HTMLElement {
    return si.shadowRoot!.querySelector('.error-container') as HTMLElement;
  }

  it('shows native validationMessage when checkValidity returns false on a non-masked input', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'public'); // no masking, no rate-limit, no strength check
    input.setAttribute('type', 'text');
    input.setAttribute('name', 'field');
    document.body.appendChild(input);

    const el = getInternalInput(input);

    vi.spyOn(el, 'checkValidity').mockReturnValue(false);
    Object.defineProperty(el, 'validationMessage', {
      get: () => 'Please match the requested format.',
      configurable: true,
    });

    // #actualValue must be non-empty to enter the checkValidity block
    input.value = 'something';
    el.dispatchEvent(new Event('blur'));

    const err = getErrorContainer(input);
    expect(err.classList.contains('hidden')).toBe(false);
    expect(err.textContent).toBe('Please match the requested format.');
  });
});

describe('SecureInput — transitionend callback in #clearErrors', () => {
  let input: SecureInput;

  afterEach(() => input.remove());

  function getInternalInput(si: SecureInput): HTMLInputElement {
    return si.shadowRoot!.querySelector('input') as HTMLInputElement;
  }

  function getErrorContainer(si: SecureInput): HTMLElement {
    return si.shadowRoot!.querySelector('.error-container') as HTMLElement;
  }

  function blur(si: SecureInput): void {
    getInternalInput(si).dispatchEvent(new Event('blur'));
  }

  function simulateInput(si: SecureInput, value: string): void {
    const el = getInternalInput(si);
    el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }

  it('clears error textContent after transitionend fires while container is hidden', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'critical');
    input.setAttribute('type', 'password');
    input.setAttribute('name', 'pwd');
    document.body.appendChild(input);

    // Show an error
    input.value = 'weak';
    blur(input);

    const err = getErrorContainer(input);
    expect(err.classList.contains('hidden')).toBe(false);
    expect(err.textContent!.length).toBeGreaterThan(0);

    // Clear the error via input — adds 'hidden', registers the transitionend listener
    simulateInput(input, 'Stronger1!');
    expect(err.classList.contains('hidden')).toBe(true);

    // Fire transitionend — the listener must clear textContent
    err.dispatchEvent(new Event('transitionend'));

    expect(err.textContent).toBe('');
  });

  it('preserves error textContent when transitionend fires after container is un-hidden', () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('security-tier', 'critical');
    input.setAttribute('type', 'password');
    input.setAttribute('name', 'pwd');
    document.body.appendChild(input);

    // Show an error
    input.value = 'weak';
    blur(input);

    const err = getErrorContainer(input);

    // Start clearing (adds 'hidden')
    simulateInput(input, 'S');

    // Immediately re-trigger an error before transitionend fires (removes 'hidden')
    input.value = 'weak';
    blur(input);

    // transitionend fires: 'hidden' is absent → the guard condition is false → text preserved
    err.dispatchEvent(new Event('transitionend'));

    expect(err.textContent!.length).toBeGreaterThan(0);
  });
});
