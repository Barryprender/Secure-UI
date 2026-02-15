/**
 * @fileoverview Secure Date/Time Picker Component
 *
 * A security-first date/time picker component that implements progressive enhancement,
 * validation, and audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 date/time inputs
 * 2. With JavaScript: Enhances with validation, range limits, audit logging
 *
 * Usage:
 * <secure-datetime
 *   security-tier="authenticated"
 *   name="appointment"
 *   label="Appointment Date"
 *   type="datetime-local"
 *   min="2024-01-01T00:00"
 *   max="2024-12-31T23:59"
 *   required
 * ></secure-datetime>
 *
 * Security Features:
 * - Input sanitization and validation
 * - Date range enforcement
 * - Rate limiting for sensitive/critical tiers
 * - Comprehensive audit logging
 * - Timezone awareness
 * - Format validation
 *
 * @module secure-datetime
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';

/**
 * Secure DateTime Web Component
 *
 * Provides a security-hardened date/time picker with progressive enhancement.
 * The component works as a standard HTML5 date/time input without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * @extends SecureBaseComponent
 */
export class SecureDateTime extends SecureBaseComponent {
  /**
   * Input element reference
   * @private
   */
  #inputElement: HTMLInputElement | null = null;

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
   * Timezone display element
   * @private
   */
  #timezoneElement: HTMLSpanElement | null = null;

  /**
   * Unique ID for this datetime instance
   * @private
   */
  #instanceId: string = `secure-datetime-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Observed attributes for this component
   *
   * @static
   */
  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'type',
      'label',
      'required',
      'min',
      'max',
      'step',
      'value',
      'show-timezone'
    ];
  }

  /**
   * Constructor
   */
  constructor() {
    super();
  }

  /**
   * Render the datetime component
   *
   * Security Note: We use native HTML5 date/time inputs wrapped in our web component
   * to ensure progressive enhancement and browser-native date validation.
   *
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const config = this.config;

    // Create container
    const container = document.createElement('div');
    container.className = 'datetime-container';

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

    // Create input wrapper
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';

    // Create the datetime input element
    this.#inputElement = document.createElement('input');
    this.#inputElement.id = this.#instanceId;
    this.#inputElement.className = 'datetime-field';

    // Apply attributes
    this.#applyDateTimeAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    inputWrapper.appendChild(this.#inputElement);

    // Add timezone display if requested
    if (this.hasAttribute('show-timezone')) {
      this.#timezoneElement = document.createElement('span');
      this.#timezoneElement.className = 'timezone-display';
      this.#timezoneElement.textContent = this.#getTimezoneString();
      inputWrapper.appendChild(this.#timezoneElement);
    }

    container.appendChild(inputWrapper);

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
   * Apply attributes to the datetime input
   *
   * @private
   */
  #applyDateTimeAttributes(): void {
    const config = this.config;

    // Name attribute
    const name = this.getAttribute('name');
    if (name) {
      this.#inputElement!.name = this.sanitizeValue(name);
    }

    // Type attribute (date, time, datetime-local, month, week)
    const type = this.getAttribute('type') || 'date';
    const validTypes = ['date', 'time', 'datetime-local', 'month', 'week'];

    if (validTypes.includes(type)) {
      this.#inputElement!.type = type;
    } else {
      console.warn(`Invalid datetime type "${type}", defaulting to "date"`);
      this.#inputElement!.type = 'date';
    }

    // Required attribute
    if (this.hasAttribute('required') || config.validation.required) {
      this.#inputElement!.required = true;
      this.#inputElement!.setAttribute('aria-required', 'true');
    }

    // Min/max constraints
    const min = this.getAttribute('min');
    if (min) {
      this.#inputElement!.min = this.#validateDateTimeValue(min);
    }

    const max = this.getAttribute('max');
    if (max) {
      this.#inputElement!.max = this.#validateDateTimeValue(max);
    }

    // Step attribute
    const step = this.getAttribute('step');
    if (step) {
      this.#inputElement!.step = step;
    }

    // Disabled state
    if (this.hasAttribute('disabled')) {
      this.#inputElement!.disabled = true;
    }

    // Readonly state
    if (this.hasAttribute('readonly')) {
      this.#inputElement!.readOnly = true;
    }

    // Autocomplete control
    if (!config.storage.allowAutocomplete) {
      this.#inputElement!.autocomplete = 'off';
    }

    // Initial value
    const value = this.getAttribute('value');
    if (value) {
      this.#inputElement!.value = this.#validateDateTimeValue(value);
    }
  }

  /**
   * Validate and sanitize datetime value
   *
   * Security Note: Prevent injection of invalid date formats
   *
   * @private
   */
  #validateDateTimeValue(value: string): string {
    if (!value) return '';

    // Basic format validation based on input type
    const type = this.#inputElement?.type || this.getAttribute('type') || 'date';

    const patterns: Record<string, RegExp> = {
      'date': /^\d{4}-\d{2}-\d{2}$/,
      'time': /^\d{2}:\d{2}(:\d{2})?$/,
      'datetime-local': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
      'month': /^\d{4}-\d{2}$/,
      'week': /^\d{4}-W\d{2}$/
    };

    const pattern = patterns[type];

    if (pattern && !pattern.test(value)) {
      console.warn(`Invalid ${type} format: ${value}`);
      return '';
    }

    return value;
  }

  /**
   * Get timezone string for display
   *
   * @private
   */
  #getTimezoneString(): string {
    const offset = new Date().getTimezoneOffset();
    const hours = Math.abs(Math.floor(offset / 60));
    const minutes = Math.abs(offset % 60);
    const sign = offset <= 0 ? '+' : '-';

    return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Attach event listeners
   *
   * @private
   */
  #attachEventListeners(): void {
    // Focus event - audit logging
    this.#inputElement!.addEventListener('focus', () => {
      this.audit('datetime_focused', {
        name: this.#inputElement!.name,
        type: this.#inputElement!.type
      });
    });

    // Input event - real-time validation
    this.#inputElement!.addEventListener('input', (e: Event) => {
      this.#handleInput(e);
    });

    // Change event - validation and audit
    this.#inputElement!.addEventListener('change', (e: Event) => {
      this.#handleChange(e);
    });

    // Blur event - final validation
    this.#inputElement!.addEventListener('blur', () => {
      this.#validateAndShowErrors();
      this.audit('datetime_blurred', {
        name: this.#inputElement!.name,
        hasValue: this.#inputElement!.value.length > 0
      });
    });
  }

  /**
   * Handle input events
   *
   * @private
   */
  #handleInput(_event: Event): void {
    // Clear previous errors on input
    this.#clearErrors();

    // Dispatch custom event for parent forms
    this.dispatchEvent(
      new CustomEvent('secure-datetime', {
        detail: {
          name: this.#inputElement!.name,
          value: this.#inputElement!.value,
          type: this.#inputElement!.type,
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Handle change events
   *
   * @private
   */
  #handleChange(_event: Event): void {
    const value = this.#inputElement!.value;

    // Validate the value
    const isValid = this.#validateDateTimeValue(value);
    if (!isValid && value) {
      this.#showError('Invalid date/time format');
      return;
    }

    // Clear errors
    this.#clearErrors();

    // Audit log
    this.audit('datetime_changed', {
      name: this.#inputElement!.name,
      type: this.#inputElement!.type,
      value: value
    });
  }

  /**
   * Validate the datetime and show error messages
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

    const value = this.#inputElement!.value;

    // Check required
    if (this.#inputElement!.required && !value) {
      this.#showError('This field is required');
      return;
    }

    // Check min/max constraints
    if (value) {
      if (this.#inputElement!.min && value < this.#inputElement!.min) {
        this.#showError(`Value must be after ${this.#formatDateForDisplay(this.#inputElement!.min)}`);
        return;
      }

      if (this.#inputElement!.max && value > this.#inputElement!.max) {
        this.#showError(`Value must be before ${this.#formatDateForDisplay(this.#inputElement!.max)}`);
        return;
      }
    }

    // Additional validation for CRITICAL tier
    if (this.securityTier === SecurityTier.CRITICAL && value) {
      const date = new Date(value);

      // Ensure date is valid
      if (isNaN(date.getTime())) {
        this.#showError('Invalid date/time');
        return;
      }

      // Prevent dates too far in the past or future (potential attack)
      const year = date.getFullYear();
      if (year < 1900 || year > 2100) {
        this.#showError('Date must be between 1900 and 2100');
        return;
      }
    }
  }

  /**
   * Format date for display in error messages
   *
   * @private
   */
  #formatDateForDisplay(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString;
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
    this.#inputElement!.classList.add('error');
    this.#inputElement!.setAttribute('aria-invalid', 'true');
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
    this.#inputElement!.classList.remove('error');
    this.#inputElement!.removeAttribute('aria-invalid');
  }

  /**
   * Get component-specific styles
   *
   * @private
   */
  #getComponentStyles(): string {
    return `
      :host {
        /* CSS Custom Properties for theming */
        --label-color: var(--secure-ui-label-color, #333);
        --label-font-weight: var(--secure-ui-label-font-weight, 500);
        --label-suffix-color: var(--secure-ui-label-suffix-color, #666);

        --input-background: var(--secure-ui-input-background, #ffffff);
        --input-color: var(--secure-ui-input-color, #1a1a1a);
        --input-border-color: var(--secure-ui-input-border-color, #d1d5db);
        --input-border-radius: var(--secure-ui-input-border-radius, 6px);
        --input-border-width: var(--secure-ui-input-border-width, 1px);
        --input-padding: var(--secure-ui-input-padding, 10px 14px);
        --input-font-size: var(--secure-ui-input-font-size, 14px);

        --input-focus-border-color: var(--secure-ui-input-focus-border-color, #0066cc);
        --input-focus-background: var(--secure-ui-input-focus-background, #ffffff);
        --input-focus-shadow: var(--secure-ui-input-focus-shadow, 0 0 0 3px rgba(0, 102, 204, 0.1));

        --input-hover-border-color: var(--secure-ui-input-hover-border-color, #666);

        --input-error-border-color: var(--secure-ui-input-error-border-color, #dc2626);
        --input-error-background: var(--secure-ui-input-error-background, #ffffff);

        --input-disabled-background: var(--secure-ui-input-disabled-background, #f5f5f5);
        --input-disabled-color: var(--secure-ui-input-disabled-color, #999);
        --input-disabled-border-color: var(--secure-ui-input-disabled-border-color, #ddd);

        --input-readonly-background: var(--secure-ui-input-readonly-background, #fafafa);
        --input-readonly-color: var(--secure-ui-input-readonly-color, #666);
        --input-readonly-border-color: var(--secure-ui-input-readonly-border-color, #e0e0e0);

        --timezone-color: var(--secure-ui-timezone-color, #666);
        --timezone-font-size: var(--secure-ui-timezone-font-size, 12px);

        --error-color: var(--secure-ui-error-color, #dc2626);
        --error-font-size: var(--secure-ui-error-font-size, 12px);

        --security-badge-background: var(--secure-ui-security-badge-background, #f0f0f0);
        --security-badge-color: var(--secure-ui-security-badge-color, #666);

        display: block;
      }

      .datetime-container {
        margin-bottom: 16px;
        width: 100%;
      }

      label {
        display: block;
        margin-bottom: 6px;
        font-weight: var(--label-font-weight);
        color: var(--label-color);
        font-size: 14px;
        line-height: 1.5;
      }

      .label-suffix {
        font-weight: normal;
        color: var(--label-suffix-color);
        font-size: 12px;
        margin-left: 6px;
      }

      .security-badge {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        background-color: var(--security-badge-background);
        color: var(--security-badge-color);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        border-radius: 3px;
        letter-spacing: 0.5px;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: visible;
      }

      .datetime-field {
        flex: 1;
        width: 100%;
        padding: var(--input-padding);
        border: var(--input-border-width) solid var(--input-border-color);
        border-radius: var(--input-border-radius);
        font-size: var(--input-font-size);
        font-family: inherit;
        line-height: 1.5;
        color: var(--input-color);
        background-color: var(--input-background);
        transition: all 0.2s ease;
        box-sizing: border-box;
      }

      .datetime-field:hover:not(:disabled):not(:read-only) {
        border-color: var(--input-hover-border-color);
      }

      .datetime-field:focus {
        outline: none;
        border-color: var(--input-focus-border-color);
        background-color: var(--input-focus-background);
        box-shadow: var(--input-focus-shadow);
      }

      .datetime-field.error {
        border-color: var(--input-error-border-color);
        background-color: var(--input-error-background);
      }

      .datetime-field:disabled {
        background-color: var(--input-disabled-background);
        color: var(--input-disabled-color);
        border-color: var(--input-disabled-border-color);
        cursor: not-allowed;
        opacity: 0.7;
      }

      .datetime-field:read-only:not(:disabled) {
        background-color: var(--input-readonly-background);
        color: var(--input-readonly-color);
        border-color: var(--input-readonly-border-color);
        cursor: default;
      }

      .datetime-field::placeholder {
        color: var(--input-placeholder-color, #999);
        opacity: 1;
      }

      /* WebKit datetime pseudo-elements - conservative styling with fallbacks */

      /* Main datetime editor container */
      .datetime-field::-webkit-datetime-edit {
        padding: 0;
        color: var(--input-color);
      }

      /* Wrapper around all fields */
      .datetime-field::-webkit-datetime-edit-fields-wrapper {
        padding: 0;
      }

      /* Separator text (slashes, colons) */
      .datetime-field::-webkit-datetime-edit-text {
        color: var(--input-color);
        padding: 0 2px;
      }

      /* Individual date/time fields */
      .datetime-field::-webkit-datetime-edit-year-field,
      .datetime-field::-webkit-datetime-edit-month-field,
      .datetime-field::-webkit-datetime-edit-day-field,
      .datetime-field::-webkit-datetime-edit-hour-field,
      .datetime-field::-webkit-datetime-edit-minute-field,
      .datetime-field::-webkit-datetime-edit-second-field,
      .datetime-field::-webkit-datetime-edit-millisecond-field,
      .datetime-field::-webkit-datetime-edit-ampm-field {
        color: var(--input-color);
        padding: 2px;
      }

      /* Focus state for fields */
      .datetime-field:focus::-webkit-datetime-edit-year-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-month-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-day-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-hour-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-minute-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-second-field:focus,
      .datetime-field:focus::-webkit-datetime-edit-ampm-field:focus {
        background-color: var(--input-focus-border-color);
        color: white;
        outline: none;
      }

      /* Spin buttons (for number inputs) */
      .datetime-field::-webkit-inner-spin-button {
        height: auto;
        opacity: 0.6;
        cursor: pointer;
      }

      .datetime-field:hover::-webkit-inner-spin-button {
        opacity: 1;
      }

      /* Calendar picker indicator (icon) */
      .datetime-field::-webkit-calendar-picker-indicator {
        display: inline-block;
        cursor: pointer;
        opacity: 1;
        padding: 4px;
        margin-left: 4px;
      }

      .datetime-field:disabled::-webkit-calendar-picker-indicator {
        cursor: not-allowed;
        opacity: 0.3;
      }

      /* Clear button */
      .datetime-field::-webkit-clear-button {
        cursor: pointer;
        opacity: 0.6;
      }

      .datetime-field:hover::-webkit-clear-button {
        opacity: 1;
      }

      .timezone-display {
        font-size: var(--timezone-font-size);
        color: var(--timezone-color);
        white-space: nowrap;
        font-weight: 500;
        padding: 4px 8px;
        background-color: var(--input-disabled-background);
        border-radius: 4px;
      }

      .error-container {
        margin-top: 6px;
        color: var(--error-color);
        font-size: var(--error-font-size);
        line-height: 1.4;
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

      .error-container:before {
        content: "\u26A0 ";
        font-weight: bold;
      }

      @media (prefers-reduced-motion: reduce) {
        .datetime-field,
        .error-container {
          transition: none !important;
        }
      }

      /* Responsive adjustments */
      @media (max-width: 640px) {
        .datetime-field {
          font-size: 16px; /* Prevent zoom on iOS */
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
    if (!this.#inputElement) return;

    switch (name) {
      case 'disabled':
        this.#inputElement.disabled = this.hasAttribute('disabled');
        break;
      case 'readonly':
        this.#inputElement.readOnly = this.hasAttribute('readonly');
        break;
      case 'value':
        if (newValue !== this.#inputElement.value) {
          this.#inputElement.value = this.#validateDateTimeValue(newValue || '');
        }
        break;
      case 'min':
        this.#inputElement.min = this.#validateDateTimeValue(newValue || '');
        break;
      case 'max':
        this.#inputElement.max = this.#validateDateTimeValue(newValue || '');
        break;
    }
  }

  /**
   * Get the current value
   *
   * @public
   */
  get value(): string {
    return this.#inputElement ? this.#inputElement.value : '';
  }

  /**
   * Set the value
   *
   * @public
   */
  set value(value: string) {
    if (this.#inputElement) {
      this.#inputElement.value = this.#validateDateTimeValue(value || '');
    }
  }

  /**
   * Get the input name
   *
   * @public
   */
  get name(): string {
    return this.#inputElement ? this.#inputElement.name : '';
  }

  /**
   * Get value as Date object
   *
   * @public
   */
  getValueAsDate(): Date | null {
    if (!this.#inputElement || !this.#inputElement.value) {
      return null;
    }

    try {
      const date = new Date(this.#inputElement.value);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }

  /**
   * Set value from Date object
   *
   * @public
   */
  setValueFromDate(date: Date): void {
    if (!this.#inputElement || !(date instanceof Date)) {
      return;
    }

    const type = this.#inputElement.type;

    let value = '';

    switch (type) {
      case 'date':
        value = date.toISOString().split('T')[0];
        break;
      case 'time':
        value = date.toTimeString().slice(0, 5);
        break;
      case 'datetime-local':
        value = date.toISOString().slice(0, 16);
        break;
      case 'month':
        value = date.toISOString().slice(0, 7);
        break;
      case 'week':
        // ISO week calculation
        const weekDate = new Date(date);
        weekDate.setHours(0, 0, 0, 0);
        weekDate.setDate(weekDate.getDate() + 4 - (weekDate.getDay() || 7));
        const yearStart = new Date(weekDate.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((weekDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        value = `${weekDate.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
        break;
    }

    this.#inputElement.value = value;
  }

  /**
   * Check if the datetime is valid
   *
   * @public
   */
  get valid(): boolean {
    const required = this.hasAttribute('required') || this.config.validation.required;
    const value = this.#inputElement ? this.#inputElement.value : '';

    // Check required
    if (required && !value) {
      return false;
    }

    // Check format
    if (value && !this.#validateDateTimeValue(value)) {
      return false;
    }

    // Check min/max
    if (this.#inputElement) {
      if (this.#inputElement.min && value < this.#inputElement.min) {
        return false;
      }

      if (this.#inputElement.max && value > this.#inputElement.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Focus the input
   *
   * @public
   */
  focus(): void {
    if (this.#inputElement) {
      this.#inputElement.focus();
    }
  }

  /**
   * Blur the input
   *
   * @public
   */
  blur(): void {
    if (this.#inputElement) {
      this.#inputElement.blur();
    }
  }

  /**
   * Cleanup on disconnect
   */
  disconnectedCallback(): void {
    super.disconnectedCallback();

    // Clear value
    if (this.#inputElement) {
      this.#inputElement.value = '';
    }
  }
}

// Define the custom element
customElements.define('secure-datetime', SecureDateTime);

export default SecureDateTime;
