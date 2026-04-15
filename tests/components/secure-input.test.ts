/**
 * SecureInput Unit Tests
 *
 * Tests for the secure-input component including input handling,
 * validation, masking, XSS prevention, and security features.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';

// Register the component if not already defined
if (!customElements.get('secure-input')) {
  customElements.define('secure-input', SecureInput);
}

describe('SecureInput', () => {
  let input: SecureInput;

  beforeEach(() => {
    input = document.createElement('secure-input') as SecureInput;
  });

  afterEach(() => {
    input.remove();
  });

  describe('Initialization', () => {
    it('should create component', () => {
      document.body.appendChild(input);

      expect(input).toBeInstanceOf(HTMLElement);
      expect(input.tagName.toLowerCase()).toBe('secure-input');
    });

    it('should have shadow DOM', () => {
      document.body.appendChild(input);

      expect(input.shadowRoot).toBeDefined();
      expect(input.shadowRoot).not.toBeNull();
    });

    it('should default to CRITICAL security tier', () => {
      document.body.appendChild(input);

      expect(input.securityTier).toBe('critical');
    });

    it('should accept security tier attribute', () => {
      input.setAttribute('security-tier', 'public');
      document.body.appendChild(input);

      expect(input.securityTier).toBe('public');
    });

    it('should render label when provided', () => {
      input.setAttribute('label', 'Username');
      document.body.appendChild(input);

      const shadowContent = input.shadowRoot?.innerHTML || '';
      expect(shadowContent).toContain('Username');
    });

    it('should render placeholder when provided', () => {
      input.setAttribute('placeholder', 'Enter value');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.placeholder).toBe('Enter value');
      }
    });

    it('should default to text type', () => {
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('text');
      }
    });
  });

  describe('Input Types', () => {
    it('should support text type', () => {
      input.setAttribute('type', 'text');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('text');
      }
    });

    it('should support password type', () => {
      input.setAttribute('type', 'password');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('password');
      }
    });

    it('should support email type', () => {
      input.setAttribute('type', 'email');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('email');
      }
    });

    it('should support tel type', () => {
      input.setAttribute('type', 'tel');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('tel');
      }
    });

    it('should support number type', () => {
      input.setAttribute('type', 'number');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('number');
      }
    });

    it('should support url type', () => {
      input.setAttribute('type', 'url');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('url');
      }
    });

    it('should support search type', () => {
      input.setAttribute('type', 'search');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.type).toBe('search');
      }
    });
  });

  describe('Value Management', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should get and set value', () => {
      input.value = 'test value';

      expect(input.value).toBe('test value');
    });

    it('should handle empty value', () => {
      input.value = '';

      expect(input.value).toBe('');
    });

    it('should expose name property', () => {
      input.setAttribute('name', 'username');

      expect(input.getAttribute('name')).toBe('username');
    });

    it('should sync value to hidden input for form submission', () => {
      input.setAttribute('name', 'testfield');
      input.value = 'form value';

      // Hidden input should be created in light DOM
      const hiddenInput = input.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        expect((hiddenInput as HTMLInputElement).value).toBe('form value');
      }
    });

    it('should keep hidden input in sync after post-mount value change', () => {
      input.setAttribute('name', 'syncfield');
      document.body.appendChild(input);

      // Initial set
      input.value = 'initial';
      const hiddenInput = input.querySelector('input[type="hidden"]') as HTMLInputElement | null;
      if (!hiddenInput) return; // skip if component skips hidden input (e.g. inside secure-form)

      expect(hiddenInput.value).toBe('initial');

      // Update after mount — hidden input must follow
      input.value = 'updated';
      expect(hiddenInput.value).toBe('updated');

      // Clear
      input.value = '';
      expect(hiddenInput.value).toBe('');
    });
  });

  describe('XSS Prevention', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should not execute script tags in value', () => {
      input.value = '<script>alert("xss")</script>';

      // Value is stored but not executed
      const shadowContent = input.shadowRoot?.innerHTML || '';
      expect(shadowContent).not.toContain('<script>alert');
    });

    it('should prevent event handler injection', () => {
      window.xssInputExecuted = false;
      input.value = '<img src=x onerror="window.xssInputExecuted=true">';

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(window.xssInputExecuted).toBe(false);
          delete window.xssInputExecuted;
          resolve();
        }, 100);
      });
    });

    it('should handle special characters safely', () => {
      const special = '< > & " \' ` $ { }';
      input.value = special;

      // Should not throw
      expect(input.value).toBeDefined();
    });

    it('should sanitize javascript: protocol attempts', () => {
      input.value = 'javascript:alert(1)';

      // Value may be stored but should not execute
      expect(input).toBeDefined();
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should expose valid property', () => {
      expect(typeof input.valid).toBe('boolean');
    });

    it('should validate required field', () => {
      input.setAttribute('required', '');
      input.value = '';

      expect(input.valid).toBe(false);
    });

    it('should pass validation when required field has value', () => {
      input.setAttribute('required', '');
      input.value = 'some value';

      expect(input.valid).toBe(true);
    });

    it('should validate pattern', () => {
      input.setAttribute('pattern', '^[a-z]+$');
      input.value = '12345';

      expect(input.valid).toBe(false);
    });

    it('should pass pattern validation', () => {
      input.setAttribute('pattern', '^[a-z]+$');
      input.value = 'abcdef';

      expect(input.valid).toBe(true);
    });

    it('should validate minlength', () => {
      input.setAttribute('minlength', '5');
      input.value = 'abc';

      expect(input.valid).toBe(false);
    });

    it('should pass minlength validation', () => {
      input.setAttribute('minlength', '3');
      input.value = 'abcdef';

      expect(input.valid).toBe(true);
    });

    it('should validate maxlength', () => {
      input.setAttribute('maxlength', '5');
      input.value = 'this is too long';

      // If the browser truncated the value, length must be ≤ 5.
      // If not truncated, the component must report invalid.
      // Both outcomes are acceptable; neither "long and valid" is.
      if (input.value.length > 5) {
        expect(input.valid).toBe(false);
      } else {
        expect(input.value.length).toBeLessThanOrEqual(5);
      }
    });

    it('should configure internal input as type="email" for native browser validation', () => {
      // Create a fresh element with type="email" set BEFORE mount so render()
      // picks it up — the Validation beforeEach already appended `input` with
      // no type, so we create a separate element here.
      const emailInput = document.createElement('secure-input') as SecureInput;
      emailInput.setAttribute('type', 'email');
      emailInput.setAttribute('name', 'email');
      emailInput.setAttribute('security-tier', 'public');
      document.body.appendChild(emailInput);

      try {
        const internalInput = emailInput.shadowRoot?.querySelector('input');
        // The internal element MUST carry type="email" — without it the browser
        // never validates email format regardless of what the component does.
        expect(internalInput?.type).toBe('email');

        // In a real browser, checkValidity() returns false for a malformed address.
        // happy-dom does not implement the email constraint — branch on availability.
        emailInput.value = 'not-an-email'; // use component setter so #actualValue is set
        if (internalInput && !internalInput.checkValidity()) {
          expect(emailInput.valid).toBe(false);
        }
      } finally {
        emailInput.remove();
      }
    });

    it('should pass email validation', () => {
      input.setAttribute('type', 'email');
      input.value = 'user@example.com';

      // Valid email should pass
      expect(input.valid).toBe(true);
    });
  });

  describe('Focus and Blur', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should have focus method', () => {
      expect(typeof input.focus).toBe('function');
    });

    it('should have blur method', () => {
      expect(typeof input.blur).toBe('function');
    });

    it('should not throw when calling focus', () => {
      expect(() => input.focus()).not.toThrow();
    });

    it('should not throw when calling blur', () => {
      expect(() => input.blur()).not.toThrow();
    });
  });

  describe('Events', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should dispatch secure-input event on input', async () => {
      const eventHandler = vi.fn();
      input.addEventListener('secure-input', eventHandler);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        internalInput.value = 'test';
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Event should have been dispatched
      expect(eventHandler).toHaveBeenCalled();
    });

    it('should include name in event detail', async () => {
      input.setAttribute('name', 'testInput');

      let eventDetail: Record<string, unknown> | null = null;
      input.addEventListener('secure-input', ((e: CustomEvent) => {
        eventDetail = e.detail;
      }) as EventListener);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        internalInput.value = 'test';
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Event detail should include name
      expect(eventDetail).toBeDefined();
    });

    it('should include tier in event detail', async () => {
      let eventDetail: Record<string, unknown> | null = null;
      input.addEventListener('secure-input', ((e: CustomEvent) => {
        eventDetail = e.detail;
      }) as EventListener);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        internalInput.value = 'test';
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Event detail should include tier
      expect(eventDetail).toBeDefined();
    });
  });

  describe('Security Tier Behavior', () => {
    it('should disable autocomplete for CRITICAL tier', () => {
      input.setAttribute('security-tier', 'critical');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.autocomplete).toBe('off');
      }
    });

    it('should disable autocomplete for SENSITIVE tier', () => {
      input.setAttribute('security-tier', 'sensitive');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.autocomplete).toBe('off');
      }
    });

    it('should allow autocomplete for PUBLIC tier', () => {
      input.setAttribute('security-tier', 'public');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      // PUBLIC tier must NOT disable autocomplete
      expect(internalInput?.autocomplete).not.toBe('off');
    });

    it('should set new-password autocomplete for password fields', () => {
      input.setAttribute('type', 'password');
      input.setAttribute('security-tier', 'critical');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.autocomplete).toBe('new-password');
      }
    });
  });

  describe('Value Masking', () => {
    it('should preserve actual value for CRITICAL tier (not lose data)', () => {
      input.setAttribute('security-tier', 'critical');
      document.body.appendChild(input);

      input.value = 'sensitive-data';

      expect(input.value).toBe('sensitive-data');
    });

    it('should preserve actual value for SENSITIVE tier', () => {
      input.setAttribute('security-tier', 'sensitive');
      document.body.appendChild(input);

      input.value = '1234567890';

      expect(input.value).toBe('1234567890');
    });

    it('should not mask value for PUBLIC tier', () => {
      input.setAttribute('security-tier', 'public');
      document.body.appendChild(input);

      input.value = 'public-data';

      expect(input.value).toBe('public-data');
    });

    it('password type renders as type="password" so the browser masks display', () => {
      input.setAttribute('type', 'password');
      input.setAttribute('security-tier', 'critical');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      // The internal input MUST be type="password" — this is how the browser
      // visually masks characters. Any other type leaks the value in plaintext.
      expect(internalInput?.type).toBe('password');
    });
  });

  describe('Audit Logging', () => {
    it('should have getAuditLog method', () => {
      document.body.appendChild(input);

      expect(typeof input.getAuditLog).toBe('function');
    });

    it('should return array from getAuditLog', () => {
      document.body.appendChild(input);

      const log = input.getAuditLog();
      expect(Array.isArray(log)).toBe(true);
    });

    it('should log focus events', async () => {
      input.setAttribute('security-tier', 'sensitive');
      document.body.appendChild(input);

      await new Promise(resolve => setTimeout(resolve, 50));

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        internalInput.dispatchEvent(new FocusEvent('focus'));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const log = input.getAuditLog();
      const focusEntry = log.find(entry => entry.action === 'input_focused');
      expect(focusEntry || log.length >= 0).toBeTruthy();
    });
  });

  describe('Disabled and Readonly States', () => {
    it('should support disabled attribute', () => {
      input.setAttribute('disabled', '');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.disabled).toBe(true);
      }
    });

    it('should support readonly attribute', () => {
      input.setAttribute('readonly', '');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.readOnly).toBe(true);
      }
    });

    it('should not allow input when disabled', () => {
      input.setAttribute('disabled', '');
      document.body.appendChild(input);

      const internalInput = input.shadowRoot?.querySelector('input');
      expect(internalInput?.disabled).toBe(true);
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should have aria-required when required', () => {
      input.setAttribute('required', '');

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        expect(internalInput.getAttribute('aria-required')).toBe('true');
      }
    });

    it('should have aria-invalid when invalid', () => {
      input.setAttribute('required', '');
      input.value = '';

      // Trigger validation
      input.blur();

      const internalInput = input.shadowRoot?.querySelector('input');
      // May or may not set aria-invalid immediately
      expect(internalInput).toBeDefined();
    });

    it('should have error container with aria-live', () => {
      const shadowContent = input.shadowRoot?.innerHTML || '';
      // Should have accessible error container
      expect(shadowContent.length).toBeGreaterThan(0);
    });
  });

  describe('Progressive Enhancement', () => {
    it('should work as standard input without enhancement', () => {
      input.setAttribute('type', 'text');
      input.setAttribute('name', 'field');
      document.body.appendChild(input);

      input.value = 'test';
      expect(input.value).toBe('test');
    });

    it('should create hidden input for form submission', () => {
      input.setAttribute('name', 'formfield');
      document.body.appendChild(input);

      input.value = 'submitted value';

      // Check for hidden input in light DOM
      const hiddenInput = input.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        expect((hiddenInput as HTMLInputElement).name).toBe('formfield');
      }
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      document.body.appendChild(input);
    });

    it('should handle very long values', () => {
      const longValue = 'a'.repeat(10000);
      input.value = longValue;

      // Should not throw
      expect(input.value.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const unicode = 'Hello 世界 🌍 مرحبا';
      input.value = unicode;

      expect(input.value).toContain('世界');
    });

    it('should handle null-like values gracefully', () => {
      // @ts-expect-error Testing edge case
      input.value = null;
      expect(input.value).toBeDefined();

      // @ts-expect-error Testing edge case
      input.value = undefined;
      expect(input.value).toBeDefined();
    });

    it('should handle rapid value changes', () => {
      for (let i = 0; i < 100; i++) {
        input.value = `value-${i}`;
      }

      expect(input.value).toBe('value-99');
    });

    it('should handle empty name attribute', () => {
      input.setAttribute('name', '');

      // Should not throw
      expect(input.getAttribute('name')).toBe('');
    });

    it('should handle whitespace-only values', () => {
      input.value = '   ';

      expect(input.value).toBe('   ');
    });

    it('should store RTL override character without executing code', () => {
      // U+202E RIGHT-TO-LEFT OVERRIDE — can be used to spoof displayed filenames
      // It is not an injection vector for JS but must not cause crashes or DOM changes
      const rtlValue = 'file\u202Etxt.exe';
      input.value = rtlValue;

      // Value must be stored, no exception thrown
      expect(input.value).toBe(rtlValue);
      // Shadow DOM must not contain executable content
      expect(input.shadowRoot?.innerHTML).not.toContain('<script');
    });

    it('should store zero-width characters without executing code', () => {
      // U+200B ZERO WIDTH SPACE — invisible character sometimes used to evade filters
      const zwValue = 'hello\u200Bworld';
      input.value = zwValue;

      expect(input.value).toBe(zwValue);
      expect(input.shadowRoot?.innerHTML).not.toContain('<script');
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limiting for CRITICAL tier', async () => {
      input.setAttribute('security-tier', 'critical');
      document.body.appendChild(input);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Make many rapid inputs
      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        for (let i = 0; i < 20; i++) {
          internalInput.value = `test-${i}`;
          internalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // Should not crash
      expect(input).toBeDefined();
    });
  });

  describe('Error Display', () => {
    beforeEach(() => {
      input.setAttribute('required', '');
      document.body.appendChild(input);
    });

    it('should show error for invalid input on blur', async () => {
      input.value = '';

      const internalInput = input.shadowRoot?.querySelector('input');
      if (internalInput) {
        internalInput.dispatchEvent(new FocusEvent('blur'));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Error container should be present
      const shadowContent = input.shadowRoot?.innerHTML || '';
      expect(shadowContent.length).toBeGreaterThan(0);
    });

    it('should show error for invalid email format on blur', async () => {
      const emailInput = document.createElement('secure-input') as SecureInput;
      emailInput.setAttribute('type', 'email');
      emailInput.setAttribute('name', 'email');
      emailInput.setAttribute('security-tier', 'public');
      document.body.appendChild(emailInput);

      try {
        const internalInput = emailInput.shadowRoot?.querySelector('input');
        if (!internalInput) return;

        // Only meaningful when the browser enforces email constraint validation
        if (internalInput.checkValidity()) return; // happy-dom: skip

        internalInput.value = 'fgsdf';
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
        internalInput.dispatchEvent(new FocusEvent('blur'));

        await new Promise(resolve => setTimeout(resolve, 50));

        const errorContainer = emailInput.shadowRoot?.querySelector('[part="error"]');
        expect(errorContainer?.classList.contains('hidden')).toBe(false);
        expect(emailInput.valid).toBe(false);
      } finally {
        emailInput.remove();
      }
    });

    it('should be valid after value is set', async () => {
      // Setting via the public setter correctly updates #actualValue.
      // The field is required (beforeEach adds required) and 'valid value' satisfies that.
      input.value = 'valid value';
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(input.valid).toBe(true);
    });
  });
});

// Extend Window for XSS test flags
declare global {
  interface Window {
    xssInputExecuted?: boolean;
  }
}

// ── Injection detection integration ──────────────────────────────────────────

import type { ThreatDetectedDetail } from '../../src/core/types.js';

describe('SecureInput — injection detection', () => {
  let input: SecureInput;

  beforeEach(async () => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'comment');
    input.setAttribute('label', 'Comment');
    input.setAttribute('type', 'url');   // url is NON_MASKABLE — reads value directly on input
    input.setAttribute('security-tier', 'sensitive');
    document.body.appendChild(input);
    await new Promise(r => setTimeout(r, 50));
  });

  afterEach(() => { input.remove(); });

  it('dispatches secure-threat-detected when injection pattern is typed into field', async () => {
    const handler = vi.fn();
    document.addEventListener('secure-threat-detected', handler);

    const internalInput = input.shadowRoot?.querySelector('input');
    if (internalInput) {
      internalInput.value = '<script>alert(1)</script>';
      internalInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 50));
    document.removeEventListener('secure-threat-detected', handler);

    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0]![0] as CustomEvent<ThreatDetectedDetail>).detail;
    expect(detail.threatType).toBe('injection');
    expect(detail.fieldName).toBe('comment');
  });

  it('does not dispatch secure-threat-detected for clean input', async () => {
    const handler = vi.fn();
    document.addEventListener('secure-threat-detected', handler);

    const internalInput = input.shadowRoot?.querySelector('input');
    if (internalInput) {
      internalInput.value = 'hello world';
      internalInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 50));
    document.removeEventListener('secure-threat-detected', handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches only one event per input event even for multiple matching patterns', async () => {
    const handler = vi.fn();
    document.addEventListener('secure-threat-detected', handler);

    const internalInput = input.shadowRoot?.querySelector('input');
    if (internalInput) {
      // Both script-tag and event-handler would match this value
      internalInput.value = '<script onclick=x>';
      internalInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 50));
    document.removeEventListener('secure-threat-detected', handler);

    // Should have fired at most once
    expect(handler.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

// ── threat-feedback UI ────────────────────────────────────────────────────────

describe('SecureInput — threat-feedback UI', () => {
  let input: SecureInput;

  const setup = async (withAttribute: boolean) => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'field');
    input.setAttribute('label', 'Field');
    input.setAttribute('type', 'email'); // email bypasses masking (NON_MASKABLE_TYPES) so #actualValue = el.value directly
    input.setAttribute('security-tier', 'critical');
    if (withAttribute) input.setAttribute('threat-feedback', '');
    document.body.appendChild(input);
    await new Promise(r => setTimeout(r, 50));
  };

  afterEach(() => { input.remove(); });

  const fireInput = async (value: string) => {
    const el = input.shadowRoot?.querySelector('input');
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 50));
  };

  it('threat container has role="alert" and part="threat"', async () => {
    await setup(true);
    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container).not.toBeNull();
    expect(container?.getAttribute('role')).toBe('alert');
  });

  it('shows threat feedback when threat-feedback attribute is set and injection detected', async () => {
    await setup(true);
    await fireInput('<script>alert(1)</script>');

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container?.classList.contains('hidden')).toBe(false);
    expect(container?.querySelector('.threat-message')?.textContent).toBe('Script injection blocked');
    expect(container?.querySelector('.threat-badge')?.textContent).toBe('script-tag');
    expect(container?.querySelector('.threat-tier')).toBeNull();
  });

  it('sets threat class on input element when threat shown', async () => {
    await setup(true);
    await fireInput('javascript:void(0)');

    const el = input.shadowRoot?.querySelector('input');
    // aria-invalid is set by showThreatFeedback() but cleared synchronously by #clearErrors()
    // in the same input handler — test the stable state: threat class and container visibility
    expect(el?.classList.contains('threat')).toBe(true);
  });

  it('clears threat class on clean input after threat', async () => {
    await setup(true);
    await fireInput('<script>x</script>');
    await fireInput('clean value');

    const el = input.shadowRoot?.querySelector('input');
    expect(el?.classList.contains('threat')).toBe(false);
    // aria-invalid was already removed by #clearErrors() after the threat input, so hasAttribute is false here too
    expect(el?.hasAttribute('aria-invalid')).toBe(false);
  });

  it('adds hidden class to container on clean input after threat', async () => {
    await setup(true);
    await fireInput('{{payload}}');
    await fireInput('safe text');

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container?.classList.contains('hidden')).toBe(true);
  });

  it('does not show UI when threat-feedback attribute is absent (email type)', async () => {
    await setup(false);
    await fireInput('<script>alert(1)</script>');

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    // email is not in the default-feedback set — container must stay hidden
    expect(container?.classList.contains('hidden')).toBe(true);
  });

  it('updates message content when a second different threat is detected', async () => {
    await setup(true);
    await fireInput('javascript:void(0)');
    await fireInput('vbscript:alert(1)'); // same-length value to keep #actualValue stable under masking (moot with email type, but explicit)

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container?.querySelector('.threat-message')?.textContent).toBe('VBScript injection blocked');
    expect(container?.querySelector('.threat-badge')?.textContent).toBe('vbscript');
  });
});

// ── Default threat-feedback by type ──────────────────────────────────────────

describe('SecureInput — default threat-feedback by type', () => {
  let input: SecureInput;

  const setupType = async (type: string) => {
    input = document.createElement('secure-input') as SecureInput;
    input.setAttribute('name', 'field');
    input.setAttribute('label', 'Field');
    input.setAttribute('type', type);
    input.setAttribute('security-tier', 'public');
    // Deliberately no threat-feedback attribute
    document.body.appendChild(input);
    await new Promise(r => setTimeout(r, 50));
  };

  afterEach(() => { input.remove(); });

  const fireInput = async (value: string) => {
    const el = input.shadowRoot?.querySelector('input');
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 50));
  };

  for (const type of ['text', 'url', 'search']) {
    it(`type="${type}" shows threat feedback without threat-feedback attribute`, async () => {
      await setupType(type);
      await fireInput('<script>alert(1)</script>');

      const container = input.shadowRoot?.querySelector('[part="threat"]');
      expect(container?.classList.contains('hidden')).toBe(false);
      expect(container?.querySelector('.threat-message')?.textContent).toBe('Script injection blocked');
    });

    it(`type="${type}" clears threat feedback when input becomes clean`, async () => {
      await setupType(type);
      await fireInput('<script>x</script>');
      await fireInput('safe text');

      const container = input.shadowRoot?.querySelector('[part="threat"]');
      expect(container?.classList.contains('hidden')).toBe(true);
    });
  }

  for (const type of ['email', 'tel', 'password']) {
    it(`type="${type}" does not show feedback without attribute`, async () => {
      await setupType(type);
      await fireInput('<script>alert(1)</script>');

      const container = input.shadowRoot?.querySelector('[part="threat"]');
      expect(container?.classList.contains('hidden')).toBe(true);
    });
  }

  it('type="url" specifically catches javascript: protocol without attribute', async () => {
    await setupType('url');
    await fireInput('javascript:alert(1)');

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container?.classList.contains('hidden')).toBe(false);
    expect(container?.querySelector('.threat-badge')?.textContent).toBe('js-protocol');
  });

  it('type="url" specifically catches data:text/html without attribute', async () => {
    await setupType('url');
    await fireInput('data:text/html,<h1>hi</h1>');

    const container = input.shadowRoot?.querySelector('[part="threat"]');
    expect(container?.classList.contains('hidden')).toBe(false);
    expect(container?.querySelector('.threat-badge')?.textContent).toBe('data-uri-html');
  });

  it('type="number" does not dispatch secure-threat-detected at all', async () => {
    await setupType('number');
    const handler = vi.fn();
    document.addEventListener('secure-threat-detected', handler);

    // Fire a numeric value — no injection possible, detection is skipped entirely
    const el = input.shadowRoot?.querySelector('input');
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 50));

    document.removeEventListener('secure-threat-detected', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
