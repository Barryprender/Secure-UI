/**
 * @fileoverview Secure Input Component
 *
 * A security-first input field component that implements progressive enhancement,
 * tier-based validation, masking, and audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 input with attributes
 * 2. With JavaScript: Enhances with masking, real-time validation, rate limiting
 *
 * Usage:
 * <secure-input
 *   security-tier="critical"
 *   name="password"
 *   label="Password"
 *   type="password"
 *   required
 * ></secure-input>
 *
 * Security Features:
 * - XSS prevention via sanitization
 * - Configurable masking based on security tier
 * - Rate limiting for sensitive/critical tiers
 * - Autocomplete control based on tier
 * - Comprehensive audit logging
 * - Visual security indicators
 *
 * @module secure-input
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';

/**
 * Secure Input Web Component
 *
 * Provides a security-hardened input field with progressive enhancement.
 * The component works as a standard form input without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * @extends SecureBaseComponent
 */
export class SecureInput extends SecureBaseComponent {
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
   * The actual unmasked value
   * @private
   */
  #actualValue: string = '';

  /**
   * Whether the input is currently masked
   * @private
   */
  #isMasked: boolean = false;

  /**
   * Hidden input element in light DOM for form submission
   * @private
   */
  #hiddenInput: HTMLInputElement | null = null;

  /**
   * Unique ID for this input instance
   * @private
   */
  #instanceId: string = `secure-input-${Math.random().toString(36).substr(2, 9)}`;

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
      'placeholder',
      'required',
      'pattern',
      'minlength',
      'maxlength',
      'autocomplete',
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
   * Render the input component
   *
   * Security Note: We use a native <input> element wrapped in our web component
   * to ensure progressive enhancement. The native input works without JavaScript,
   * and we enhance it with security features when JS is available.
   *
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const config = this.config;

    // Create container
    const container = document.createElement('div');
    container.className = 'input-container';
    container.setAttribute('part', 'container');

    // Create label
    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);
      this.#labelElement.setAttribute('part', 'label');

      // Add security tier suffix if configured
      if (config.ui.labelSuffix) {
        const suffix = document.createElement('span');
        suffix.className = 'label-suffix';
        suffix.setAttribute('part', 'label-suffix');
        suffix.textContent = config.ui.labelSuffix;
        this.#labelElement.appendChild(suffix);
      }

      // Add security badge if configured
      if (config.ui.showSecurityBadge) {
        const badge = document.createElement('span');
        badge.className = 'security-badge';
        badge.setAttribute('part', 'security-badge');
        badge.textContent = config.name;
        this.#labelElement.appendChild(badge);
      }

      container.appendChild(this.#labelElement);
    }

    // Create input wrapper for progressive enhancement
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';
    inputWrapper.setAttribute('part', 'wrapper');

    // Create the actual input element
    this.#inputElement = document.createElement('input');
    this.#inputElement.id = this.#instanceId;
    this.#inputElement.className = 'input-field';
    this.#inputElement.setAttribute('part', 'input');

    // Apply attributes from web component to native input
    this.#applyInputAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    inputWrapper.appendChild(this.#inputElement);
    container.appendChild(inputWrapper);

    // Create error container
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('aria-live', 'polite');
    this.#errorContainer.setAttribute('part', 'error');
    container.appendChild(this.#errorContainer);

    // CRITICAL: Create hidden input in light DOM for native form submission
    // The actual input is in Shadow DOM and can't participate in form submission
    this.#createHiddenInputForForm();

    // CRITICAL: Neutralize native fallback inputs in light DOM.
    // The server renders native <input> elements inside <secure-input> for no-JS
    // progressive enhancement. Now that JS has loaded and the shadow DOM input is
    // active, these native fallbacks must be neutralized:
    // 1. They are hidden by shadow DOM so users can't interact with them
    // 2. They still have 'required' attributes that trigger HTML5 constraint
    //    validation, silently blocking form submission (browser can't show the
    //    validation popup for a hidden element, so "nothing happens" on click)
    // 3. They still have 'name' attributes causing duplicate empty form fields
    this.#neutralizeFallbackInputs();

    // Add component styles (CSP-compliant via adoptedStyleSheets)
    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  /**
   * Create hidden input in light DOM for native form submission
   *
   * CRITICAL: The actual input is in Shadow DOM and can't participate in
   * native form submission. We create a hidden input in light DOM that syncs
   * with the Shadow DOM input value.
   *
   * IMPORTANT: Only create hidden input if NOT inside a <secure-form> component.
   * The secure-form component handles its own hidden input creation.
   *
   * @private
   */
  #createHiddenInputForForm(): void {
    const name = this.getAttribute('name');
    if (!name) return;

    // Check if this input is inside a <secure-form> component
    // If yes, the secure-form will handle hidden input creation
    const isInsideSecureForm = this.closest('secure-form');
    if (isInsideSecureForm) {
      // Don't create hidden input - secure-form will handle it
      return;
    }

    // Create hidden input in light DOM
    this.#hiddenInput = document.createElement('input');
    this.#hiddenInput.type = 'hidden';
    this.#hiddenInput.name = name;
    this.#hiddenInput.value = this.#actualValue || '';

    // Append to light DOM (this element, not shadow root)
    this.appendChild(this.#hiddenInput);
  }

  /**
   * Sync hidden input value with the actual input value
   *
   * @private
   */
  #syncHiddenInput(): void {
    if (this.#hiddenInput) {
      this.#hiddenInput.value = this.#actualValue || '';
    }
  }

  /**
   * Neutralize native fallback inputs in light DOM
   *
   * When the component initializes with JavaScript, the shadow DOM input takes
   * over. The server-rendered native fallback inputs (for no-JS progressive
   * enhancement) must be neutralized to prevent:
   * - HTML5 constraint validation blocking form submission silently
   * - Duplicate form field values on native form submission
   *
   * @private
   */
  #neutralizeFallbackInputs(): void {
    const fallbacks = this.querySelectorAll('input, textarea, select');
    fallbacks.forEach((el) => {
      // Skip the hidden input we created for form submission
      if (el === this.#hiddenInput) return;

      const input = el as HTMLInputElement;
      // Remove attributes that interfere with form submission
      input.removeAttribute('required');
      input.removeAttribute('name');
      input.removeAttribute('minlength');
      input.removeAttribute('maxlength');
      input.removeAttribute('pattern');
      // Mark as inert so it's completely non-interactive
      input.setAttribute('tabindex', '-1');
      input.setAttribute('aria-hidden', 'true');
    });
  }

  /**
   * Apply attributes from the web component to the native input
   *
   * Security Note: This is where we enforce tier-specific security controls
   * like autocomplete, caching, and validation rules.
   *
   * @private
   */
  #applyInputAttributes(): void {
    const config = this.config;

    // Name attribute (required for form submission)
    const name = this.getAttribute('name');
    if (name) {
      this.#inputElement!.name = this.sanitizeValue(name);
    }

    // Type attribute
    const type = this.getAttribute('type') || 'text';
    this.#inputElement!.type = type;

    // Placeholder
    const placeholder = this.getAttribute('placeholder');
    if (placeholder) {
      this.#inputElement!.placeholder = this.sanitizeValue(placeholder);
    }

    // Required attribute
    if (this.hasAttribute('required') || config.validation.required) {
      this.#inputElement!.required = true;
      this.#inputElement!.setAttribute('aria-required', 'true');
    }

    // Pattern validation
    const pattern = this.getAttribute('pattern');
    if (pattern) {
      this.#inputElement!.pattern = pattern;
    }

    // Length constraints
    const minLength = this.getAttribute('minlength');
    if (minLength) {
      this.#inputElement!.minLength = parseInt(minLength, 10);
    }

    const maxLength = this.getAttribute('maxlength') || config.validation.maxLength;
    if (maxLength) {
      this.#inputElement!.maxLength = parseInt(String(maxLength), 10);
    }

    // CRITICAL SECURITY: Autocomplete control based on tier
    // For SENSITIVE and CRITICAL tiers, we disable autocomplete to prevent
    // browser storage of sensitive data
    if (config.storage.allowAutocomplete) {
      const autocomplete = this.getAttribute('autocomplete') || 'on';
      this.#inputElement!.autocomplete = autocomplete as AutoFill;
    } else {
      // Explicitly disable autocomplete for sensitive data
      this.#inputElement!.autocomplete = 'off';
      // Also set autocomplete="new-password" for password fields to prevent
      // password managers from auto-filling
      if (this.#inputElement!.type === 'password') {
        this.#inputElement!.autocomplete = 'new-password';
      }
    }

    // Disabled state
    if (this.hasAttribute('disabled')) {
      this.#inputElement!.disabled = true;
    }

    // Readonly state
    if (this.hasAttribute('readonly')) {
      this.#inputElement!.readOnly = true;
    }

    // Initial value
    const value = this.getAttribute('value');
    if (value) {
      this.#setValue(value);
    }

    // Apply masking if configured for this tier
    if (config.masking.enabled && this.#inputElement!.type !== 'password') {
      this.#isMasked = true;
    }
  }

  /**
   * Attach event listeners to the input
   *
   * @private
   */
  #attachEventListeners(): void {
    // Focus event - audit logging
    this.#inputElement!.addEventListener('focus', () => {
      this.audit('input_focused', {
        name: this.#inputElement!.name
      });
    });

    // Input event - real-time validation and change tracking
    this.#inputElement!.addEventListener('input', (e: Event) => {
      this.#handleInput(e);
    });

    // Blur event - final validation
    this.#inputElement!.addEventListener('blur', () => {
      this.#validateAndShowErrors();
      this.audit('input_blurred', {
        name: this.#inputElement!.name,
        hasValue: this.#actualValue.length > 0
      });
    });

    // Change event - audit logging
    this.#inputElement!.addEventListener('change', () => {
      this.audit('input_changed', {
        name: this.#inputElement!.name,
        valueLength: this.#actualValue.length
      });
    });
  }

  /**
   * Handle input events
   *
   * Security Note: This is where we implement real-time masking and validation.
   * We never expose the actual value in the DOM for CRITICAL tier fields.
   *
   * @private
   */
  #handleInput(event: Event): void {

    // For masked inputs (except password which browser handles), we need to track
    // the actual unmasked value separately because the input element shows masked chars
    if (this.#isMasked && this.#inputElement!.type !== 'password') {
      const inputEvent = event as InputEvent;
      const inputType = inputEvent.inputType;
      const data = inputEvent.data || '';

      // Get current state before we modify
      const currentDisplayValue = this.#inputElement!.value;
      const cursorPos = this.#inputElement!.selectionStart || 0;

      // Handle different input types by reconstructing the actual value
      if (inputType === 'deleteContentBackward') {
        // Backspace: remove character before cursor
        if (cursorPos < this.#actualValue.length) {
          this.#actualValue = this.#actualValue.substring(0, cursorPos) +
                             this.#actualValue.substring(cursorPos + 1);
        }
      } else if (inputType === 'deleteContentForward') {
        // Delete key: character at cursor already removed, cursor position is correct
        this.#actualValue = this.#actualValue.substring(0, cursorPos) +
                           this.#actualValue.substring(cursorPos + 1);
      } else if (inputType === 'insertText') {
        // User typed a character - insert at cursor position
        this.#actualValue = this.#actualValue.substring(0, cursorPos - data.length) +
                           data +
                           this.#actualValue.substring(cursorPos - data.length);
      } else if (inputType === 'insertFromPaste') {
        // User pasted - the data might be the full pasted content
        if (data) {
          this.#actualValue = this.#actualValue.substring(0, cursorPos - data.length) +
                             data +
                             this.#actualValue.substring(cursorPos - data.length);
        }
      } else {
        // For any other input type, use a simpler approach:
        // The display shows masked chars, but we can infer changes by comparing lengths
        const oldLength = this.#actualValue.length;
        const newLength = currentDisplayValue.length;

        if (newLength > oldLength) {
          // Something was added
          const diff = newLength - oldLength;
          const insertPos = cursorPos - diff;
          this.#actualValue = this.#actualValue.substring(0, insertPos) +
                             currentDisplayValue.substring(insertPos, cursorPos) +
                             this.#actualValue.substring(insertPos);
        } else if (newLength < oldLength) {
          // Something was removed (fallback)
          this.#actualValue = this.#actualValue.substring(0, cursorPos) +
                             this.#actualValue.substring(cursorPos + (oldLength - newLength));
        }
      }

      // Now apply masking to the display
      const maskedValue = this.#maskValue(this.#actualValue);
      this.#inputElement!.value = maskedValue;

      // Restore cursor position
      this.#inputElement!.setSelectionRange(cursorPos, cursorPos);
    } else {
      // For non-masked inputs, just read the value normally
      this.#actualValue = this.#inputElement!.value;
    }

    // Clear previous errors on input (improve UX)
    this.#clearErrors();

    // Sync hidden input for form submission
    this.#syncHiddenInput();

    // Dispatch custom event for parent forms
    this.dispatchEvent(
      new CustomEvent('secure-input', {
        detail: {
          name: this.#inputElement!.name,
          value: this.#actualValue, // Parent can access actual value
          masked: this.#isMasked,
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Mask a value based on tier configuration
   *
   * Security Note: For CRITICAL tier, we mask everything. For SENSITIVE tier,
   * we can optionally reveal last few characters (e.g., last 4 digits of phone).
   *
   * @private
   */
  #maskValue(value: string): string {
    const config = this.config;
    const maskChar = config.masking.character;

    if (!config.masking.partial || this.securityTier === SecurityTier.CRITICAL) {
      // Mask everything
      return maskChar.repeat(value.length);
    }

    // Partial masking: show last 4 characters
    if (value.length <= 4) {
      return maskChar.repeat(value.length);
    }

    const maskedPart = maskChar.repeat(value.length - 4);
    const visiblePart = value.slice(-4);
    return maskedPart + visiblePart;
  }

  /**
   * Validate the input and show error messages
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

    // Perform validation
    const pattern = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    const validation = this.validateInput(this.#actualValue, {
      pattern: pattern ? new RegExp(pattern) : null,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      this.#showError(validation.errors.join(', '));
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
   * Set the input value
   *
   * @private
   */
  #setValue(value: string): void {
    this.#actualValue = value;

    if (this.#isMasked && this.#inputElement!.type !== 'password') {
      this.#inputElement!.value = this.#maskValue(value);
    } else {
      this.#inputElement!.value = value;
    }

    // Sync hidden input for form submission
    this.#syncHiddenInput();
  }

  /**
   * Get component-specific styles
   *
   * @private
   */
  #getComponentStyles(): string {
    const config = this.config;

    return `
      /* CSS Custom Properties for full adaptbility */
      :host {
        /* Container spacing */
        --input-container-margin-bottom: 16px;

        /* Label styles */
        --label-display: block;
        --label-margin-bottom: 4px;
        --label-font-weight: 500;
        --label-font-size: 14px;
        --label-color: #333;
        --label-line-height: 1.5;

        /* Label suffix (e.g., tier indicators) */
        --label-suffix-font-weight: normal;
        --label-suffix-color: #666;
        --label-suffix-font-size: 12px;
        --label-suffix-margin-left: 8px;

        /* Security badge */
        --security-badge-display: inline-block;
        --security-badge-margin-left: 8px;
        --security-badge-padding: 2px 8px;
        --security-badge-font-size: 10px;
        --security-badge-font-weight: 600;
        --security-badge-border-radius: 4px;
        --security-badge-background: #6b7280;
        --security-badge-color: white;
        --security-badge-text-transform: uppercase;
        --security-badge-letter-spacing: 0.5px;

        /* Input field - size and spacing */
        --input-width: 100%;
        --input-padding: 8px 12px;
        --input-padding-top: 8px;
        --input-padding-right: 12px;
        --input-padding-bottom: 8px;
        --input-padding-left: 12px;

        /* Input field - border */
        --input-border-width: 2px;
        --input-border-style: solid;
        --input-border-color: #d1d5db;
        --input-border-radius: 4px;
        --input-border: var(--input-border-width) var(--input-border-style) var(--input-border-color);

        /* Input field - typography */
        --input-font-size: 14px;
        --input-font-family: inherit;
        --input-font-weight: normal;
        --input-line-height: 1.5;
        --input-color: #333;
        --input-letter-spacing: normal;

        /* Input field - background */
        --input-background: #ffffff;

        /* Input field - transitions */
        --input-transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;

        /* Input field - focus state */
        --input-focus-border-color: #3b82f6;
        --input-focus-outline: none;
        --input-focus-box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        --input-focus-background: #ffffff;

        /* Input field - hover state */
        --input-hover-border-color: #9ca3af;

        /* Input field - error state */
        --input-error-border-color: #f44336;
        --input-error-border-width: 2px;
        --input-error-background: #fff;
        --input-error-color: #333;

        /* Input field - disabled state */
        --input-disabled-background: #f5f5f5;
        --input-disabled-color: #999;
        --input-disabled-cursor: not-allowed;
        --input-disabled-opacity: 0.6;
        --input-disabled-border-color: #ddd;

        /* Input field - readonly state */
        --input-readonly-background: #fafafa;
        --input-readonly-color: #666;
        --input-readonly-border-color: #e0e0e0;

        /* Input field - placeholder */
        --input-placeholder-color: #999;
        --input-placeholder-opacity: 1;
        --input-placeholder-font-style: normal;

        /* Error container */
        --error-display: block;
        --error-margin-top: 4px;
        --error-color: #f44336;
        --error-font-size: 12px;
        --error-font-weight: normal;
        --error-line-height: 1.4;

        /* Input wrapper */
        --input-wrapper-position: relative;
        --input-wrapper-display: block;

        /* Box shadow presets */
        --input-box-shadow: none;
        --input-focus-glow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .input-container {
        margin-bottom: var(--input-container-margin-bottom);
      }

      label {
        display: var(--label-display);
        margin-bottom: var(--label-margin-bottom);
        font-weight: var(--label-font-weight);
        font-size: var(--label-font-size);
        color: var(--label-color);
        line-height: var(--label-line-height);
      }

      .label-suffix {
        font-weight: var(--label-suffix-font-weight);
        color: var(--label-suffix-color);
        font-size: var(--label-suffix-font-size);
        margin-left: var(--label-suffix-margin-left);
      }

      .security-badge {
        display: var(--security-badge-display);
        margin-left: var(--security-badge-margin-left);
        padding: var(--security-badge-padding);
        font-size: var(--security-badge-font-size);
        font-weight: var(--security-badge-font-weight);
        border-radius: var(--security-badge-border-radius);
        background-color: var(--security-badge-background);
        color: var(--security-badge-color);
        text-transform: var(--security-badge-text-transform);
        letter-spacing: var(--security-badge-letter-spacing);
      }

      .input-wrapper {
        position: var(--input-wrapper-position);
        display: var(--input-wrapper-display);
      }

      .input-field {
        width: var(--input-width);
        padding: var(--input-padding);
        border: var(--input-border);
        border-radius: var(--input-border-radius);
        font-size: var(--input-font-size);
        font-family: var(--input-font-family);
        font-weight: var(--input-font-weight);
        line-height: var(--input-line-height);
        color: var(--input-color);
        letter-spacing: var(--input-letter-spacing);
        background-color: var(--input-background);
        box-shadow: var(--input-box-shadow);
        transition: var(--input-transition);
        box-sizing: border-box;
      }

      .input-field:hover:not(:disabled):not(:read-only) {
        border-color: var(--input-hover-border-color);
      }

      .input-field:focus {
        outline: var(--input-focus-outline);
        border-color: var(--input-focus-border-color);
        box-shadow: var(--input-focus-box-shadow);
        background-color: var(--input-focus-background);
      }

      .input-field.error {
        border-color: var(--input-error-border-color);
        border-width: var(--input-error-border-width);
        background-color: var(--input-error-background);
        color: var(--input-error-color);
      }

      .input-field:disabled {
        background-color: var(--input-disabled-background);
        color: var(--input-disabled-color);
        cursor: var(--input-disabled-cursor);
        opacity: var(--input-disabled-opacity);
        border-color: var(--input-disabled-border-color);
      }

      .input-field:read-only {
        background-color: var(--input-readonly-background);
        color: var(--input-readonly-color);
        border-color: var(--input-readonly-border-color);
        cursor: default;
      }

      .input-field::placeholder {
        color: var(--input-placeholder-color);
        opacity: var(--input-placeholder-opacity);
        font-style: var(--input-placeholder-font-style);
      }

      .error-container {
        margin-top: var(--error-margin-top);
        color: var(--error-color);
        font-size: var(--error-font-size);
        font-weight: var(--error-font-weight);
        line-height: var(--error-line-height);
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
        .input-field,
        .error-container {
          transition: none !important;
        }
      }

      /* Prevent autofill styling for sensitive fields */
      .input-field:-webkit-autofill {
        ${!config.storage.allowAutocomplete ? '-webkit-text-fill-color: transparent;' : ''}
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
        if (newValue !== this.#actualValue) {
          this.#setValue(newValue || '');
        }
        break;
    }
  }

  /**
   * Get the current value (unmasked)
   *
   * Security Note: This exposes the actual value. Only call this when
   * submitting the form or when you have proper authorization.
   *
   * @public
   */
  get value(): string {
    return this.#actualValue;
  }

  /**
   * Set the value
   *
   * @public
   */
  set value(value: string) {
    this.#setValue(value || '');
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
   * Check if the input is valid
   *
   * @public
   */
  get valid(): boolean {
    const pattern = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');
    const required = this.hasAttribute('required');

    // Check required field first (combines HTML attribute and tier config)
    if (required || this.config.validation.required) {
      if (!this.#actualValue || this.#actualValue.trim().length === 0) {
        return false;
      }
    }

    const validation = this.validateInput(this.#actualValue, {
      pattern: pattern ? new RegExp(pattern) : null,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    return validation.valid;
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

    // Clear sensitive data from memory
    this.#actualValue = '';
    if (this.#inputElement) {
      this.#inputElement.value = '';
    }
  }
}

// Define the custom element
customElements.define('secure-input', SecureInput);

export default SecureInput;
