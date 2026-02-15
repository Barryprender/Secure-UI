/**
 * @fileoverview Secure Select Component
 *
 * A security-first select dropdown component that implements progressive enhancement,
 * tier-based validation, and audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 select with options
 * 2. With JavaScript: Enhances with validation, audit logging, rate limiting
 *
 * Usage:
 * <secure-select
 *   security-tier="authenticated"
 *   name="country"
 *   label="Country"
 *   required
 * >
 *   <option value="">Select a country</option>
 *   <option value="us">United States</option>
 *   <option value="uk">United Kingdom</option>
 * </secure-select>
 *
 * Multiple selection:
 * <secure-select label="Languages" name="langs" multiple size="4">
 *   <option value="en">English</option>
 *   <option value="es">Spanish</option>
 * </secure-select>
 *
 * Security Features:
 * - XSS prevention via sanitization
 * - Option value validation
 * - Rate limiting for sensitive/critical tiers
 * - Comprehensive audit logging
 * - Visual security indicators
 *
 * @module secure-select
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';

/**
 * Secure Select Web Component
 *
 * Provides a security-hardened select dropdown with progressive enhancement.
 * The component works as a standard form select without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * @extends SecureBaseComponent
 */
export class SecureSelect extends SecureBaseComponent {
  /**
   * Select element reference
   * @private
   */
  #selectElement: HTMLSelectElement | null = null;

  /**
   * Label element reference
   * @private
   */
  #labelElement: HTMLLabelElement | null = null;

  /**
   * Error container element reference
   * @private
   */
  #errorContainer: HTMLDivElement | null = null;

  /**
   * Unique ID for this select instance
   * @private
   */
  #instanceId: string = `secure-select-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Valid option values
   * @private
   */
  #validOptions: Set<string> = new Set();

  /**
   * Flag to track if options have been transferred from light DOM
   * @private
   */
  #optionsTransferred: boolean = false;

  /**
   * Whether this is a multi-select instance
   * @private
   */
  #isMultiple: boolean = false;

  /**
   * Observed attributes for this component
   *
   * @static
   */
  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'label',
      'required',
      'multiple',
      'size',
      'value'
    ];
  }

  /**
   * Constructor
   */
  constructor() {
    super();
  }

  /**
   * Render the select component
   *
   * Security Note: We use a native <select> element wrapped in our web component
   * to ensure progressive enhancement. The native select works without JavaScript,
   * and we enhance it with security features when JS is available.
   *
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const config = this.config;

    // Create container
    const container = document.createElement('div');
    container.className = 'select-container';

    // Check if this is a multi-select
    this.#isMultiple = this.hasAttribute('multiple');

    // Create label
    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);

      // Add security tier suffix if configured
      if (config.ui.labelSuffix) {
        const suffix = document.createElement('span');
        suffix.className = 'label-suffix';
        suffix.textContent = config.ui.labelSuffix;
        this.#labelElement.appendChild(suffix);
      }

      // Add security badge if configured
      if (config.ui.showSecurityBadge) {
        const badge = document.createElement('span');
        badge.className = 'security-badge';
        badge.textContent = config.name;
        this.#labelElement.appendChild(badge);
      }

      container.appendChild(this.#labelElement);
    }

    // Create select wrapper for progressive enhancement
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'select-wrapper';

    // Create the actual select element
    this.#selectElement = document.createElement('select');
    this.#selectElement.id = this.#instanceId;
    this.#selectElement.className = 'select-field';

    // Apply attributes from web component to native select
    this.#applySelectAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    // Defer transferring options to allow light DOM to be fully parsed
    // This handles the case where the component is created before its children
    queueMicrotask(() => {
      this.#transferOptions();
    });

    selectWrapper.appendChild(this.#selectElement);
    container.appendChild(selectWrapper);

    // Create error container
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('aria-live', 'polite');
    container.appendChild(this.#errorContainer);

    // Add component styles (CSP-compliant via adoptedStyleSheets)
    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  /**
   * Apply attributes from the web component to the native select
   *
   * Security Note: This is where we enforce tier-specific security controls
   * like validation rules.
   *
   * @private
   */
  #applySelectAttributes(): void {
    const config = this.config;

    // Name attribute (required for form submission)
    const name = this.getAttribute('name');
    if (name) {
      this.#selectElement!.name = this.sanitizeValue(name);
    }

    // Required attribute
    if (this.hasAttribute('required') || config.validation.required) {
      this.#selectElement!.required = true;
      this.#selectElement!.setAttribute('aria-required', 'true');
    }

    // Multiple selection
    if (this.hasAttribute('multiple')) {
      this.#selectElement!.multiple = true;
    }

    // Size attribute
    const size = this.getAttribute('size');
    if (size) {
      this.#selectElement!.size = parseInt(size, 10);
    }

    // Disabled state
    if (this.hasAttribute('disabled')) {
      this.#selectElement!.disabled = true;
    }

    // Autocomplete control
    if (!config.storage.allowAutocomplete) {
      this.#selectElement!.autocomplete = 'off';
    }
  }

  /**
   * Transfer option elements from light DOM to select element
   *
   * Security Note: We sanitize all option values and text to prevent XSS
   *
   * @private
   */
  #transferOptions(): void {
    // Only transfer once to avoid clearing programmatically-added options
    if (this.#optionsTransferred) return;
    this.#optionsTransferred = true;

    // Get option elements from light DOM (original content)
    const options = Array.from(this.querySelectorAll('option'));

    // If no light DOM options, nothing to transfer
    if (options.length === 0) return;

    // Track selected values (supports multiple selected attributes)
    const selectedValues: string[] = [];

    // Transfer each option to the select element
    options.forEach((option) => {
      const newOption = document.createElement('option');

      // Sanitize value
      const value = option.getAttribute('value') || '';
      newOption.value = this.sanitizeValue(value);
      this.#validOptions.add(newOption.value);

      // Sanitize text content
      newOption.textContent = this.sanitizeValue(option.textContent || '');

      // Copy other attributes
      if (option.hasAttribute('selected')) {
        newOption.selected = true;
        selectedValues.push(newOption.value);
      }
      if (option.hasAttribute('disabled')) {
        newOption.disabled = true;
      }

      this.#selectElement!.appendChild(newOption);
    });

    // Set initial value - attribute takes precedence over selected option
    if (!this.#isMultiple) {
      const initialValue = this.getAttribute('value');
      if (initialValue) {
        this.#selectElement!.value = initialValue;
      } else if (selectedValues.length > 0) {
        this.#selectElement!.value = selectedValues[0];
      }
    }
    // For multiple, the selected attributes on individual options already applied
  }

  /**
   * Attach event listeners to the select
   *
   * @private
   */
  #attachEventListeners(): void {
    // Focus event - audit logging
    this.#selectElement!.addEventListener('focus', () => {
      this.audit('select_focused', {
        name: this.#selectElement!.name
      });
    });

    // Change event - validation and audit logging
    this.#selectElement!.addEventListener('change', (e: Event) => {
      this.#handleChange(e);
    });

    // Blur event - final validation
    this.#selectElement!.addEventListener('blur', () => {
      this.#validateAndShowErrors();
      this.audit('select_blurred', {
        name: this.#selectElement!.name,
        hasValue: this.#isMultiple
          ? this.#selectElement!.selectedOptions.length > 0
          : this.#selectElement!.value.length > 0
      });
    });
  }

  /**
   * Handle change events
   *
   * Security Note: We validate that the selected value is in the list of valid options
   * to prevent value injection attacks.
   *
   * @private
   */
  #handleChange(_event: Event): void {
    if (this.#isMultiple) {
      // Multi-select: validate all selected values
      const selectedValues = Array.from(this.#selectElement!.selectedOptions).map(opt => opt.value);
      const invalidValues = selectedValues.filter(v => v && !this.#validOptions.has(v));

      if (invalidValues.length > 0) {
        this.#showError('Invalid option selected');
        this.audit('invalid_option_detected', {
          name: this.#selectElement!.name,
          attemptedValues: invalidValues
        });
        return;
      }

      // Clear previous errors
      this.#clearErrors();

      // Log the change
      this.audit('select_changed', {
        name: this.#selectElement!.name,
        values: selectedValues
      });

      // Dispatch custom event for parent forms
      this.dispatchEvent(
        new CustomEvent('secure-select', {
          detail: {
            name: this.#selectElement!.name,
            value: selectedValues,
            tier: this.securityTier
          },
          bubbles: true,
          composed: true
        })
      );
    } else {
      // Single select: validate the selected value
      const selectedValue = this.#selectElement!.value;

      if (selectedValue && !this.#validOptions.has(selectedValue)) {
        this.#showError('Invalid option selected');
        this.audit('invalid_option_detected', {
          name: this.#selectElement!.name,
          attemptedValue: selectedValue
        });
        // Reset to empty value
        this.#selectElement!.value = '';
        return;
      }

      // Clear previous errors
      this.#clearErrors();

      // Log the change
      this.audit('select_changed', {
        name: this.#selectElement!.name,
        value: selectedValue
      });

      // Dispatch custom event for parent forms
      this.dispatchEvent(
        new CustomEvent('secure-select', {
          detail: {
            name: this.#selectElement!.name,
            value: selectedValue,
            tier: this.securityTier
          },
          bubbles: true,
          composed: true
        })
      );
    }
  }

  /**
   * Validate the select and show error messages
   *
   * @private
   */
  #validateAndShowErrors(): void {
    // Check rate limit first
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.#showError(
        `Too many attempts. Please wait ${Math.ceil(rateLimitCheck.retryAfter / 1000)} seconds.`
      );
      return;
    }

    const required = this.hasAttribute('required') || this.config.validation.required;

    if (this.#isMultiple) {
      // Multi-select: check if at least one option is selected
      const selectedValues = Array.from(this.#selectElement!.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');

      if (required && selectedValues.length === 0) {
        this.#showError('Please select at least one option');
        return;
      }

      // Validate all selected values are in valid options
      const invalidValues = selectedValues.filter(v => !this.#validOptions.has(v));
      if (invalidValues.length > 0) {
        this.#showError('Invalid option selected');
        return;
      }
    } else {
      // Single select: check required and valid option
      if (required && !this.#selectElement!.value) {
        this.#showError('Please select an option');
        return;
      }

      const selectedValue = this.#selectElement!.value;
      if (selectedValue && !this.#validOptions.has(selectedValue)) {
        this.#showError('Invalid option selected');
        return;
      }
    }
  }

  /**
   * Show error message
   *
   * @private
   */
  #showError(message: string): void {
    this.#errorContainer!.textContent = message;
    // Force reflow so browser registers the hidden state with content,
    // then remove hidden to trigger the CSS transition
    void this.#errorContainer!.offsetHeight;
    this.#errorContainer!.classList.remove('hidden');
    this.#selectElement!.classList.add('error');
    this.#selectElement!.setAttribute('aria-invalid', 'true');
  }

  /**
   * Clear error messages
   *
   * @private
   */
  #clearErrors(): void {
    // Start the hide animation first, clear text only after transition ends
    this.#errorContainer!.classList.add('hidden');
    this.#errorContainer!.addEventListener('transitionend', () => {
      if (this.#errorContainer!.classList.contains('hidden')) {
        this.#errorContainer!.textContent = '';
      }
    }, { once: true });
    this.#selectElement!.classList.remove('error');
    this.#selectElement!.removeAttribute('aria-invalid');
  }

  /**
   * Get component-specific styles
   *
   * @private
   */
  #getComponentStyles(): string {
    return `
      .select-container {
        margin-bottom: 16px;
      }

      label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: #333;
      }

      .label-suffix {
        font-weight: normal;
        color: #666;
        font-size: 12px;
      }

      .select-wrapper {
        position: relative;
      }

      .select-field {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #d1d5db;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        background-color: #ffffff;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        cursor: pointer;
      }

      .select-field:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .select-field.error {
        border-color: #f44336;
      }

      .select-field:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
        opacity: 0.6;
      }

      .select-field[multiple] {
        height: auto;
        min-height: 80px;
      }

      /* Native multi-select option styling (where supported) */
      .select-field[multiple] option {
        padding: 6px 8px;
      }

      .select-field[multiple] option:checked {
        background-color: #3b82f6;
        color: #ffffff;
      }

      .error-container {
        margin-top: 4px;
        color: #f44336;
        font-size: 12px;
        overflow: hidden;
        max-height: 40px;
        opacity: 1;
        transform: translateY(0);
        transition: opacity 0.2s ease-out, transform 0.2s ease-out, max-height 0.2s ease-out;
      }

      .error-container.hidden {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        margin-top: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .select-field,
        .error-container {
          transition: none !important;
        }
      }
    `;
  }

  /**
   * Handle attribute changes
   *
   * @protected
   */
  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#selectElement) return;

    switch (name) {
      case 'disabled':
        this.#selectElement.disabled = this.hasAttribute('disabled');
        break;
      case 'value':
        if (newValue !== this.#selectElement.value) {
          this.#selectElement.value = newValue || '';
        }
        break;
    }
  }

  /**
   * Get the current value
   *
   * @public
   */
  get value(): string {
    if (!this.#selectElement) return '';

    // Multi-select: return comma-separated selected values
    if (this.#isMultiple) {
      return Array.from(this.#selectElement.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '')
        .join(', ');
    }

    return this.#selectElement.value;
  }

  /**
   * Set the value
   *
   * @public
   */
  set value(value: string) {
    if (!this.#selectElement) return;

    if (this.#isMultiple) {
      // Multi-select: accept comma-separated values
      const values = value.split(',').map(v => v.trim()).filter(v => v !== '');
      // Deselect all first
      Array.from(this.#selectElement.options).forEach(opt => { opt.selected = false; });
      // Select matching valid options
      values.forEach(v => {
        if (this.#validOptions.has(v)) {
          const opt = Array.from(this.#selectElement!.options).find(o => o.value === v);
          if (opt) opt.selected = true;
        }
      });
    } else {
      if (this.#validOptions.has(value)) {
        this.#selectElement.value = value;
      }
    }
  }

  /**
   * Get the select name
   *
   * @public
   */
  get name(): string {
    return this.#selectElement ? this.#selectElement.name : '';
  }

  /**
   * Get selected options (for multiple select)
   *
   * @public
   */
  get selectedOptions(): string[] {
    if (!this.#selectElement) return [];
    return Array.from(this.#selectElement.selectedOptions).map(opt => opt.value);
  }

  /**
   * Check if the select is valid
   *
   * @public
   */
  get valid(): boolean {
    const required = this.hasAttribute('required') || this.config.validation.required;

    if (this.#isMultiple) {
      const selectedValues = Array.from(this.#selectElement!.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');

      if (required && selectedValues.length === 0) {
        return false;
      }

      // All selected values must be valid
      return selectedValues.every(v => this.#validOptions.has(v));
    }

    // Single select
    if (required && !this.#selectElement!.value) {
      return false;
    }

    const selectedValue = this.#selectElement!.value;
    if (selectedValue && !this.#validOptions.has(selectedValue)) {
      return false;
    }

    return true;
  }

  /**
   * Focus the select
   *
   * @public
   */
  focus(): void {
    if (this.#selectElement) {
      this.#selectElement.focus();
    }
  }

  /**
   * Blur the select
   *
   * @public
   */
  blur(): void {
    if (this.#selectElement) {
      this.#selectElement.blur();
    }
  }

  /**
   * Add an option programmatically
   *
   * @public
   */
  addOption(value: string, text: string, selected: boolean = false): void {
    if (!this.#selectElement) return;

    const option = document.createElement('option');
    option.value = this.sanitizeValue(value);
    option.textContent = this.sanitizeValue(text);
    option.selected = selected;

    this.#validOptions.add(option.value);
    this.#selectElement.appendChild(option);
  }

  /**
   * Remove an option by value
   *
   * @public
   */
  removeOption(value: string): void {
    if (!this.#selectElement) return;

    const options = Array.from(this.#selectElement.options);
    const option = options.find(opt => opt.value === value);

    if (option) {
      this.#selectElement.removeChild(option);
      this.#validOptions.delete(value);
    }
  }

  /**
   * Clear all options
   *
   * @public
   */
  clearOptions(): void {
    if (!this.#selectElement) return;

    this.#selectElement.innerHTML = '';
    this.#validOptions.clear();
  }

  /**
   * Cleanup on disconnect
   *
   * Note: We intentionally do NOT clear #validOptions here.
   * When <secure-select> is inside a <secure-form>, the form moves its children
   * into a <form> element, which triggers disconnect/reconnect. Clearing
   * #validOptions on disconnect would leave the set empty after reconnect,
   * causing all subsequent selections to be rejected as "invalid option".
   */
  disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

// Define the custom element
customElements.define('secure-select', SecureSelect);

export default SecureSelect;
