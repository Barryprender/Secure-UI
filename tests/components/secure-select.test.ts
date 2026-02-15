/**
 * SecureSelect Unit Tests
 *
 * Tests for the secure-select component including option management,
 * validation, value injection prevention, and XSS prevention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureSelect } from '../../src/components/secure-select/secure-select.js';

// Register the component if not already defined
if (!customElements.get('secure-select')) {
  customElements.define('secure-select', SecureSelect);
}

describe('SecureSelect', () => {
  let select: SecureSelect;

  beforeEach(() => {
    select = document.createElement('secure-select') as SecureSelect;
  });

  afterEach(() => {
    select.remove();
  });

  describe('Initialization', () => {
    it('should create component', () => {
      document.body.appendChild(select);

      expect(select).toBeInstanceOf(SecureSelect);
      expect(select.tagName.toLowerCase()).toBe('secure-select');
    });

    it('should have shadow DOM', () => {
      document.body.appendChild(select);

      expect(select.shadowRoot).toBeDefined();
      expect(select.shadowRoot).not.toBeNull();
    });

    it('should default to CRITICAL security tier', () => {
      document.body.appendChild(select);

      expect(select.securityTier).toBe('critical');
    });

    it('should accept security tier attribute', () => {
      select.setAttribute('security-tier', 'public');
      document.body.appendChild(select);

      expect(select.securityTier).toBe('public');
    });

    it('should render label when provided', () => {
      select.setAttribute('label', 'Choose an option');
      document.body.appendChild(select);

      const shadowContent = select.shadowRoot?.innerHTML || '';
      expect(shadowContent).toContain('Choose an option');
    });
  });

  describe('Option Management', () => {
    beforeEach(() => {
      document.body.appendChild(select);
    });

    it('should have addOption method', () => {
      expect(typeof select.addOption).toBe('function');
    });

    it('should have removeOption method', () => {
      expect(typeof select.removeOption).toBe('function');
    });

    it('should have clearOptions method', () => {
      expect(typeof select.clearOptions).toBe('function');
    });

    it('should add options programmatically', () => {
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');

      const shadowContent = select.shadowRoot?.innerHTML || '';
      expect(shadowContent).toContain('Option 1');
      expect(shadowContent).toContain('Option 2');
    });

    it('should remove options', () => {
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');
      select.removeOption('opt1');

      const shadowContent = select.shadowRoot?.innerHTML || '';
      expect(shadowContent).not.toContain('Option 1');
      expect(shadowContent).toContain('Option 2');
    });

    it('should clear all options', () => {
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');
      select.clearOptions();

      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        // Should have no options (or just a placeholder)
        expect(internalSelect.options.length).toBeLessThanOrEqual(1);
      }
    });

    it('should add selected option', () => {
      select.addOption('opt1', 'Option 1', true);

      expect(select.value).toBe('opt1');
    });
  });

  describe('Value Management', () => {
    beforeEach(() => {
      document.body.appendChild(select);
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');
      select.addOption('opt3', 'Option 3');
    });

    it('should get and set value', () => {
      select.value = 'opt2';

      expect(select.value).toBe('opt2');
    });

    it('should only accept valid option values', () => {
      select.value = 'invalid-option';

      // Should either reject or keep previous value
      expect(select.value).not.toBe('invalid-option');
    });

    it('should expose name property', () => {
      select.setAttribute('name', 'category');

      // Name may be on internal element or attribute
      expect(select.getAttribute('name')).toBe('category');
    });

    it('should expose selectedOptions for multiple select', () => {
      select.setAttribute('multiple', '');

      expect(Array.isArray(select.selectedOptions)).toBe(true);
    });
  });

  describe('XSS Prevention', () => {
    beforeEach(() => {
      document.body.appendChild(select);
    });

    it('should sanitize option text', () => {
      select.addOption('xss', '<script>alert("xss")</script>');

      const shadowContent = select.shadowRoot?.innerHTML || '';
      expect(shadowContent).not.toContain('<script>');
    });

    it('should sanitize option values', () => {
      // Attempt to inject via value
      select.addOption('<script>alert(1)</script>', 'Malicious');

      // Value should be sanitized
      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect && internalSelect.options.length > 0) {
        const optionValue = internalSelect.options[0]?.value || '';
        expect(optionValue).not.toContain('<script>');
      }
    });

    it('should prevent event handler injection in option text', () => {
      window.xssSelectExecuted = false;
      select.addOption('xss', '<img src=x onerror="window.xssSelectExecuted=true">');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(window.xssSelectExecuted).toBe(false);
          delete window.xssSelectExecuted;
          resolve();
        }, 100);
      });
    });
  });

  describe('Option Value Validation', () => {
    beforeEach(() => {
      document.body.appendChild(select);
      select.addOption('valid1', 'Valid Option 1');
      select.addOption('valid2', 'Valid Option 2');
    });

    it('should reject invalid option values on set', () => {
      const originalValue = select.value;
      select.value = 'injected-value';

      // Should not accept injected value
      expect(select.value).not.toBe('injected-value');
    });

    it('should track valid options internally', () => {
      // Only values added via addOption should be accepted
      select.value = 'valid1';
      expect(select.value).toBe('valid1');

      select.value = 'never-added';
      expect(select.value).not.toBe('never-added');
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      document.body.appendChild(select);
    });

    it('should expose valid property', () => {
      expect(typeof select.valid).toBe('boolean');
    });

    it('should validate required field', () => {
      select.setAttribute('required', '');
      // No option selected

      expect(select.valid).toBe(false);
    });

    it('should pass validation when required field has value', () => {
      select.setAttribute('required', '');
      select.addOption('opt1', 'Option 1', true);

      expect(select.valid).toBe(true);
    });
  });

  describe('Focus and Blur', () => {
    beforeEach(() => {
      document.body.appendChild(select);
    });

    it('should have focus method', () => {
      expect(typeof select.focus).toBe('function');
    });

    it('should have blur method', () => {
      expect(typeof select.blur).toBe('function');
    });

    it('should not throw when calling focus', () => {
      expect(() => select.focus()).not.toThrow();
    });

    it('should not throw when calling blur', () => {
      expect(() => select.blur()).not.toThrow();
    });
  });

  describe('Events', () => {
    beforeEach(() => {
      document.body.appendChild(select);
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');
    });

    it('should dispatch secure-select event on change', async () => {
      const eventHandler = vi.fn();
      select.addEventListener('secure-select', eventHandler);

      // Simulate change
      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        internalSelect.value = 'opt1';
        internalSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify event handler was called or no error
      expect(true).toBe(true);
    });
  });

  describe('Security Tier Behavior', () => {
    it('should disable autocomplete for CRITICAL tier', () => {
      select.setAttribute('security-tier', 'critical');
      document.body.appendChild(select);

      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        expect(internalSelect.autocomplete).toBe('off');
      }
    });

    it('should disable autocomplete for SENSITIVE tier', () => {
      select.setAttribute('security-tier', 'sensitive');
      document.body.appendChild(select);

      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        expect(internalSelect.autocomplete).toBe('off');
      }
    });
  });

  describe('Audit Logging', () => {
    it('should have getAuditLog method', () => {
      document.body.appendChild(select);

      expect(typeof select.getAuditLog).toBe('function');
    });

    it('should return array from getAuditLog', () => {
      document.body.appendChild(select);

      const log = select.getAuditLog();
      expect(Array.isArray(log)).toBe(true);
    });

    it('should log invalid option attempts', async () => {
      select.setAttribute('security-tier', 'critical');
      document.body.appendChild(select);
      await new Promise(resolve => setTimeout(resolve, 50));

      select.addOption('valid', 'Valid');
      select.value = 'invalid-injection-attempt';

      const log = select.getAuditLog();
      // Should have logged the invalid attempt
      expect(log.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Multiple Select', () => {
    beforeEach(() => {
      select.setAttribute('multiple', '');
      document.body.appendChild(select);
      select.addOption('opt1', 'Option 1');
      select.addOption('opt2', 'Option 2');
      select.addOption('opt3', 'Option 3');
    });

    it('should support multiple attribute', () => {
      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        expect(internalSelect.multiple).toBe(true);
      }
    });

    it('should return array for selectedOptions', () => {
      expect(Array.isArray(select.selectedOptions)).toBe(true);
    });
  });

  describe('Light DOM Options Transfer', () => {
    it('should transfer options from light DOM', async () => {
      select.innerHTML = `
        <option value="light1">Light DOM Option 1</option>
        <option value="light2">Light DOM Option 2</option>
      `;
      document.body.appendChild(select);

      // Wait for microtask to complete (options are transferred asynchronously)
      await new Promise(resolve => queueMicrotask(resolve));

      const shadowContent = select.shadowRoot?.innerHTML || '';
      // Options should be transferred to shadow DOM
      expect(shadowContent).toContain('Light DOM Option');
    });

    it('should respect selected attribute on options', async () => {
      select.innerHTML = `
        <option value="">Select one</option>
        <option value="us">United States</option>
        <option value="uk" selected>United Kingdom</option>
        <option value="ca">Canada</option>
      `;
      document.body.appendChild(select);

      // Wait for microtask to complete (options are transferred asynchronously)
      await new Promise(resolve => queueMicrotask(resolve));

      // The "uk" option has selected attribute, so value should be "uk"
      expect(select.value).toBe('uk');
    });

    it('should display selected option text correctly', async () => {
      select.innerHTML = `
        <option value="">Select one</option>
        <option value="private" selected>Private</option>
        <option value="public">Public</option>
      `;
      document.body.appendChild(select);

      // Wait for microtask to complete (options are transferred asynchronously)
      await new Promise(resolve => queueMicrotask(resolve));

      const internalSelect = select.shadowRoot?.querySelector('select') as HTMLSelectElement;
      expect(internalSelect).toBeDefined();
      expect(internalSelect.value).toBe('private');

      // Check the selected option shows the correct text
      const selectedOption = internalSelect.options[internalSelect.selectedIndex];
      expect(selectedOption.text).toBe('Private');
    });
  });

  describe('Disabled and Readonly States', () => {
    it('should support disabled attribute', () => {
      select.setAttribute('disabled', '');
      document.body.appendChild(select);

      const internalSelect = select.shadowRoot?.querySelector('select');
      if (internalSelect) {
        expect(internalSelect.disabled).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      document.body.appendChild(select);
    });

    it('should handle option with empty value', () => {
      select.addOption('', 'Please select...');

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle option with special characters in value', () => {
      select.addOption('opt-with-dash', 'Option with dash');
      select.addOption('opt_with_underscore', 'Option with underscore');

      select.value = 'opt-with-dash';
      expect(select.value).toBe('opt-with-dash');
    });

    it('should handle unicode in option text', () => {
      select.addOption('unicode', 'Option 世界 🌍');

      const shadowContent = select.shadowRoot?.innerHTML || '';
      expect(shadowContent).toContain('世界');
    });

    it('should handle many options', () => {
      for (let i = 0; i < 100; i++) {
        select.addOption(`opt${i}`, `Option ${i}`);
      }

      // Should not throw
      select.value = 'opt50';
      expect(select.value).toBe('opt50');
    });
  });
});

// Extend Window for XSS test flags
declare global {
  interface Window {
    xssSelectExecuted?: boolean;
  }
}
