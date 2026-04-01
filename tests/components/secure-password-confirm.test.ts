/**
 * SecurePasswordConfirm — Unit Tests
 *
 * Written BEFORE the implementation (TDD — Red phase).
 * These tests define the expected contract of the component.
 * They will all fail until the implementation is created.
 *
 * TDD cycle:
 *   RED   → these tests fail (no implementation yet)
 *   GREEN → write minimal code to make them pass
 *   REFACTOR → clean up without breaking tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The import below will fail at compile time until the file exists.
// That is intentional — it proves we are in the RED phase.
import { SecurePasswordConfirm } from '../../src/components/secure-password-confirm/secure-password-confirm.js';

if (!customElements.get('secure-password-confirm')) {
  customElements.define('secure-password-confirm', SecurePasswordConfirm);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Simulate a user typing into a native input inside shadow DOM. */
function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: value,
  }));
}

/** Simulate blur (marks confirm field as touched). */
function blurInput(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

/** Simulate focus on an input. */
function focusInput(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SecurePasswordConfirm', () => {
  let el: SecurePasswordConfirm;

  beforeEach(() => {
    el = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
    el.setAttribute('name', 'password');
  });

  afterEach(() => {
    el.remove();
  });

  // ── Initialization ─────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('creates the element', () => {
      document.body.appendChild(el);
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.tagName.toLowerCase()).toBe('secure-password-confirm');
    });

    it('has a shadow root', () => {
      document.body.appendChild(el);
      expect(el.shadowRoot).toBeDefined();
      expect(el.shadowRoot).not.toBeNull();
    });

    it('is always CRITICAL tier', () => {
      document.body.appendChild(el);
      expect(el.securityTier).toBe('critical');
    });

    it('ignores a security-tier attribute set before mount', () => {
      el.setAttribute('security-tier', 'public');
      document.body.appendChild(el);
      expect(el.securityTier).toBe('critical');
    });
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('renders two password inputs', () => {
      const inputs = el.shadowRoot!.querySelectorAll('input[type="password"]');
      expect(inputs.length).toBe(2);
    });

    it('renders a toggle button for each password input', () => {
      const toggles = el.shadowRoot!.querySelectorAll('button.toggle-btn');
      expect(toggles.length).toBe(2);
    });

    it('uses default label "New Password" for the password field', () => {
      const label = el.shadowRoot!.querySelector('[part="password-label"]');
      expect(label?.textContent).toBe('New Password');
    });

    it('uses default label "Confirm Password" for the confirm field', () => {
      const label = el.shadowRoot!.querySelector('[part="confirm-label"]');
      expect(label?.textContent).toBe('Confirm Password');
    });

    it('uses custom password-label attribute', () => {
      el.remove();
      const custom = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      custom.setAttribute('name', 'password');
      custom.setAttribute('password-label', 'New secret');
      document.body.appendChild(custom);
      const label = custom.shadowRoot!.querySelector('[part="password-label"]');
      expect(label?.textContent).toBe('New secret');
      custom.remove();
    });

    it('uses custom confirm-label attribute', () => {
      el.remove();
      const custom = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      custom.setAttribute('name', 'password');
      custom.setAttribute('confirm-label', 'Repeat secret');
      document.body.appendChild(custom);
      const label = custom.shadowRoot!.querySelector('[part="confirm-label"]');
      expect(label?.textContent).toBe('Repeat secret');
      custom.remove();
    });

    it('password input has part="password-input"', () => {
      const input = el.shadowRoot!.querySelector('[part="password-input"]');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).type).toBe('password');
    });

    it('confirm input has part="confirm-input"', () => {
      const input = el.shadowRoot!.querySelector('[part="confirm-input"]');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).type).toBe('password');
    });

    it('both inputs have autocomplete="new-password"', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]');
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]');
      expect(passwordInput?.autocomplete).toBe('new-password');
      expect(confirmInput?.autocomplete).toBe('new-password');
    });

    it('renders a match indicator element', () => {
      const indicator = el.shadowRoot!.querySelector('[part="match-indicator"]');
      expect(indicator).not.toBeNull();
    });

    it('renders error containers for both fields', () => {
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]');
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]');
      expect(passwordError).not.toBeNull();
      expect(confirmError).not.toBeNull();
    });

    it('error containers have role="alert"', () => {
      const errors = el.shadowRoot!.querySelectorAll('[role="alert"]');
      expect(errors.length).toBe(2);
    });

    it('sets aria-required on both inputs when required attribute present', () => {
      el.remove();
      const req = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      req.setAttribute('name', 'password');
      req.setAttribute('required', '');
      document.body.appendChild(req);
      const passwordInput = req.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]');
      const confirmInput = req.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]');
      expect(passwordInput?.getAttribute('aria-required')).toBe('true');
      expect(confirmInput?.getAttribute('aria-required')).toBe('true');
      req.remove();
    });
  });

  // ── Security: tier lock ────────────────────────────────────────────────────

  describe('Security tier lock', () => {
    it('remains CRITICAL if security-tier is changed after mount', () => {
      document.body.appendChild(el);
      el.setAttribute('security-tier', 'public');
      expect(el.securityTier).toBe('critical');
    });
  });

  // ── Show / hide toggle ─────────────────────────────────────────────────────

  describe('Show / hide toggle', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('password toggle changes input type to "text" on first click', () => {
      const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="password-toggle"]')!;
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      toggle.click();
      expect(input.type).toBe('text');
    });

    it('password toggle changes input type back to "password" on second click', () => {
      const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="password-toggle"]')!;
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      toggle.click();
      toggle.click();
      expect(input.type).toBe('password');
    });

    it('confirm toggle changes confirm input type to "text" on first click', () => {
      const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="confirm-toggle"]')!;
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      toggle.click();
      expect(input.type).toBe('text');
    });

    it('confirm toggle changes confirm input back to "password" on second click', () => {
      const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="confirm-toggle"]')!;
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      toggle.click();
      toggle.click();
      expect(input.type).toBe('password');
    });

    it('toggling one field does not affect the other', () => {
      const passwordToggle = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="password-toggle"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      passwordToggle.click();
      expect(confirmInput.type).toBe('password');
    });
  });

  // ── Password input behaviour ───────────────────────────────────────────────

  describe('Password input', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('typing in the password field does not trigger match validation before confirm is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]')!;

      typeInto(passwordInput, 'Secret1!');
      expect(confirmError.classList.contains('hidden')).toBe(true);
    });

    it('dispatches "secure-input" event when typing in password field', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const listener = vi.fn();
      el.addEventListener('secure-input', listener);
      typeInto(passwordInput, 'Secret1!');
      expect(listener).toHaveBeenCalledOnce();
      el.removeEventListener('secure-input', listener);
    });

    it('"secure-input" event detail includes name and field="password"', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      let detail: Record<string, unknown> = {};
      el.addEventListener('secure-input', (e) => {
        detail = (e as CustomEvent).detail as Record<string, unknown>;
      });
      typeInto(passwordInput, 'Secret1!');
      expect(detail['name']).toBe('password');
      expect(detail['field']).toBe('password');
    });

    it('shows password strength error after blurring with a weak password', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;

      typeInto(passwordInput, 'weak');
      blurInput(passwordInput);
      expect(passwordError.classList.contains('hidden')).toBe(false);
      expect(passwordError.textContent).not.toBe('');
    });

    it('clears password strength error after blurring with a strong password', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;

      typeInto(passwordInput, 'weak');
      blurInput(passwordInput);
      expect(passwordError.classList.contains('hidden')).toBe(false);

      typeInto(passwordInput, 'StrongPass1!');
      blurInput(passwordInput);
      expect(passwordError.classList.contains('hidden')).toBe(true);
    });

    it('requires at least 8 characters', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;
      typeInto(passwordInput, 'Sh0rt!');
      blurInput(passwordInput);
      expect(passwordError.textContent).toContain('8');
    });

    it('requires an uppercase letter', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;
      typeInto(passwordInput, 'nouppercase1!');
      blurInput(passwordInput);
      expect(passwordError.textContent?.toLowerCase()).toContain('uppercase');
    });

    it('requires a lowercase letter', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;
      typeInto(passwordInput, 'NOLOWERCASE1!');
      blurInput(passwordInput);
      expect(passwordError.textContent?.toLowerCase()).toContain('lowercase');
    });

    it('requires a number', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;
      typeInto(passwordInput, 'NoNumbers!');
      blurInput(passwordInput);
      expect(passwordError.textContent?.toLowerCase()).toContain('number');
    });

    it('requires a special character', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const passwordError = el.shadowRoot!.querySelector('[part="password-error"]')!;
      typeInto(passwordInput, 'NoSpecial1');
      blurInput(passwordInput);
      expect(passwordError.textContent?.toLowerCase()).toContain('special');
    });
  });

  // ── Match validation ───────────────────────────────────────────────────────

  describe('Match validation', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('does not show confirm error before the confirm field is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'Wrong');
      expect(confirmError.classList.contains('hidden')).toBe(true);
    });

    it('shows mismatch error after confirm is blurred with a different value', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass1!');
      blurInput(confirmInput);

      expect(confirmError.classList.contains('hidden')).toBe(false);
      expect(confirmError.textContent).toContain('do not match');
    });

    it('clears confirm error once passwords match after confirm is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'Wrong');
      blurInput(confirmInput);
      expect(confirmError.classList.contains('hidden')).toBe(false);

      typeInto(confirmInput, 'StrongPass1!');
      expect(confirmError.classList.contains('hidden')).toBe(true);
    });

    it('sets aria-invalid on confirm input when mismatched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass1!');
      blurInput(confirmInput);

      expect(confirmInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('removes aria-invalid from confirm input when passwords match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass1!');
      blurInput(confirmInput);
      typeInto(confirmInput, 'StrongPass1!');

      expect(confirmInput.getAttribute('aria-invalid')).toBeNull();
    });

    it('re-validates on every password keystroke once confirm is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const confirmError = el.shadowRoot!.querySelector('[part="confirm-error"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);
      expect(confirmError.classList.contains('hidden')).toBe(true);

      typeInto(passwordInput, 'DifferentPass2@');
      expect(confirmError.classList.contains('hidden')).toBe(false);
    });
  });

  // ── Events ────────────────────────────────────────────────────────────────

  describe('Events', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('dispatches "secure-password-match" when passwords match after confirm is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const listener = vi.fn();
      el.addEventListener('secure-password-match', listener);

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      expect(listener).toHaveBeenCalledOnce();
      el.removeEventListener('secure-password-match', listener);
    });

    it('"secure-password-match" detail includes name and matched=true', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      let detail: Record<string, unknown> = {};
      el.addEventListener('secure-password-match', (e) => {
        detail = (e as CustomEvent).detail as Record<string, unknown>;
      });

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      expect(detail['name']).toBe('password');
      expect(detail['matched']).toBe(true);
    });

    it('dispatches "secure-password-mismatch" when passwords do not match after confirm touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const listener = vi.fn();
      el.addEventListener('secure-password-mismatch', listener);

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass2@');
      blurInput(confirmInput);

      expect(listener).toHaveBeenCalledOnce();
      el.removeEventListener('secure-password-mismatch', listener);
    });

    it('"secure-password-mismatch" detail includes matched=false', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      let detail: Record<string, unknown> = {};
      el.addEventListener('secure-password-mismatch', (e) => {
        detail = (e as CustomEvent).detail as Record<string, unknown>;
      });

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass2@');
      blurInput(confirmInput);

      expect(detail['matched']).toBe(false);
    });

    it('does NOT dispatch match/mismatch events before confirm is touched', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      const matchListener = vi.fn();
      const mismatchListener = vi.fn();
      el.addEventListener('secure-password-match', matchListener);
      el.addEventListener('secure-password-mismatch', mismatchListener);

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      // No blur — confirm not touched yet

      expect(matchListener).not.toHaveBeenCalled();
      expect(mismatchListener).not.toHaveBeenCalled();

      el.removeEventListener('secure-password-match', matchListener);
      el.removeEventListener('secure-password-mismatch', mismatchListener);
    });

    it('events bubble and are composed', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      let capturedEvent: CustomEvent | null = null;
      document.body.addEventListener('secure-password-match', (e) => {
        capturedEvent = e as CustomEvent;
      });

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent!.bubbles).toBe(true);
      expect(capturedEvent!.composed).toBe(true);
    });

    it('raw password value does not appear in event detail', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      let matchDetail: Record<string, unknown> = {};
      el.addEventListener('secure-password-match', (e) => {
        matchDetail = (e as CustomEvent).detail as Record<string, unknown>;
      });

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      expect(matchDetail['password']).toBeUndefined();
      expect(matchDetail['value']).toBeUndefined();
    });
  });

  // ── getPasswordValue() ─────────────────────────────────────────────────────

  describe('getPasswordValue()', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('returns null when both fields are empty', () => {
      expect(el.getPasswordValue()).toBeNull();
    });

    it('returns null when only the password field has a value', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      expect(el.getPasswordValue()).toBeNull();
    });

    it('returns null when passwords do not match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass2@');
      blurInput(confirmInput);
      expect(el.getPasswordValue()).toBeNull();
    });

    it('returns the password string when both fields match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);
      expect(el.getPasswordValue()).toBe('StrongPass1!');
    });
  });

  // ── valid getter ───────────────────────────────────────────────────────────

  describe('valid getter', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('is false when both fields are empty', () => {
      expect(el.valid).toBe(false);
    });

    it('is false when only password field has a value', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      expect(el.valid).toBe(false);
    });

    it('is false when passwords do not match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass2@');
      blurInput(confirmInput);
      expect(el.valid).toBe(false);
    });

    it('is false when passwords match but are too short', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'Sh0!');
      typeInto(confirmInput, 'Sh0!');
      blurInput(confirmInput);
      expect(el.valid).toBe(false);
    });

    it('is false when passwords match but lack a special character', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'NoSpecial1');
      typeInto(confirmInput, 'NoSpecial1');
      blurInput(confirmInput);
      expect(el.valid).toBe(false);
    });

    it('is true when passwords match and meet all strength requirements', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);
      expect(el.valid).toBe(true);
    });
  });

  // ── name getter ────────────────────────────────────────────────────────────

  describe('name getter', () => {
    it('returns the name attribute value', () => {
      document.body.appendChild(el);
      expect(el.name).toBe('password');
    });

    it('returns empty string when name attribute is not set', () => {
      const noName = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      document.body.appendChild(noName);
      expect(noName.name).toBe('');
      noName.remove();
    });
  });

  // ── Hidden inputs ─────────────────────────────────────────────────────────

  describe('Hidden inputs', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('creates a hidden input in light DOM when name is set', () => {
      const hidden = el.querySelector('input[type="hidden"]');
      expect(hidden).not.toBeNull();
    });

    it('hidden input has the correct name attribute', () => {
      const hidden = el.querySelector<HTMLInputElement>('input[type="hidden"]')!;
      expect(hidden.name).toBe('password');
    });

    it('hidden input value is empty when passwords do not match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'WrongPass2@');
      blurInput(confirmInput);

      const hidden = el.querySelector<HTMLInputElement>('input[type="hidden"]')!;
      expect(hidden.value).toBe('');
    });

    it('hidden input value is the password when passwords match', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      const hidden = el.querySelector<HTMLInputElement>('input[type="hidden"]')!;
      expect(hidden.value).toBe('StrongPass1!');
    });

    it('creates only one hidden input (not one per field)', () => {
      const hiddenInputs = el.querySelectorAll('input[type="hidden"]');
      expect(hiddenInputs.length).toBe(1);
    });

    it('does not create a hidden input when inside secure-form', () => {
      el.remove();
      const form = document.createElement('secure-form');
      const inner = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      inner.setAttribute('name', 'password');
      form.appendChild(inner);
      document.body.appendChild(form);
      inner.connectedCallback();
      const hidden = inner.querySelector('input[type="hidden"]');
      expect(hidden).toBeNull();
      form.remove();
    });

    it('does not create a hidden input when name attribute is absent', () => {
      el.remove();
      const noName = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
      document.body.appendChild(noName);
      const hidden = noName.querySelector('input[type="hidden"]');
      expect(hidden).toBeNull();
      noName.remove();
    });
  });

  // ── Telemetry ─────────────────────────────────────────────────────────────

  describe('Telemetry', () => {
    beforeEach(() => {
      document.body.appendChild(el);
    });

    it('increments focusCount when the password field receives focus', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      focusInput(passwordInput);
      expect(el.getFieldTelemetry().focusCount).toBe(1);
    });

    it('detects paste on the password field', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      passwordInput.value = 'StrongPass1!';
      passwordInput.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: 'StrongPass1!',
      }));
      expect(el.getFieldTelemetry().pasteDetected).toBe(true);
    });

    it('counts corrections on the password field', () => {
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      passwordInput.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
      }));
      expect(el.getFieldTelemetry().corrections).toBeGreaterThan(0);
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe('Cleanup on disconnect', () => {
    it('clears password values from memory on disconnect', () => {
      document.body.appendChild(el);
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);
      expect(el.getPasswordValue()).toBe('StrongPass1!');

      el.remove();
      expect(el.getPasswordValue()).toBeNull();
    });

    it('clears the hidden input value on disconnect', () => {
      document.body.appendChild(el);
      const passwordInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="password-input"]')!;
      const confirmInput = el.shadowRoot!.querySelector<HTMLInputElement>('[part="confirm-input"]')!;

      typeInto(passwordInput, 'StrongPass1!');
      typeInto(confirmInput, 'StrongPass1!');
      blurInput(confirmInput);

      const hidden = el.querySelector<HTMLInputElement>('input[type="hidden"]')!;
      expect(hidden.value).toBe('StrongPass1!');

      el.remove();
      expect(hidden.value).toBe('');
    });
  });
});
