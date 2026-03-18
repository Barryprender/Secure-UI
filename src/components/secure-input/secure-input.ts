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
  #instanceId: string = `secure-input-${Math.random().toString(36).substring(2, 11)}`;

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
    // role="alert" already implies aria-live="assertive" — do not override with polite
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('part', 'error');
    this.#errorContainer.id = `${this.#instanceId}-error`;
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

    // Accessible name fallback: when no visible label is provided, use the name
    // attribute as aria-label so screen readers can identify the field
    if (!this.getAttribute('label') && name) {
      this.#inputElement!.setAttribute('aria-label', this.sanitizeValue(name));
    }

    // Link input to its error container for screen readers
    this.#inputElement!.setAttribute('aria-describedby', `${this.#instanceId}-error`);

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
    // Focus event - audit logging + telemetry
    this.#inputElement!.addEventListener('focus', () => {
      this.recordTelemetryFocus();
      this.audit('input_focused', {
        name: this.#inputElement!.name
      });
    });

    // Input event - real-time validation, change tracking + telemetry
    this.#inputElement!.addEventListener('input', (e: Event) => {
      this.recordTelemetryInput(e);
      this.#handleInput(e);
    });

    // Blur event - final validation + telemetry
    this.#inputElement!.addEventListener('blur', () => {
      this.recordTelemetryBlur();
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
   * Validate password strength based on security tier
   *
   * Tier rules:
   * - CRITICAL: uppercase + lowercase + digit + symbol, 8+ chars
   * - SENSITIVE: uppercase + lowercase + digit, 8+ chars
   * - AUTHENTICATED: 6+ chars
   * - PUBLIC: no strength requirement
   *
   * @private
   * @returns null if valid or not a password, error message string if invalid
   */
  #validatePasswordStrength(value: string): string | null {
    if (!this.#inputElement || this.#inputElement.type !== 'password') {
      return null;
    }

    // Skip strength check on empty values — required check handles that
    if (!value || value.length === 0) {
      return null;
    }

    const tier = this.securityTier;

    if (tier === 'critical') {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
      if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must include a number';
      if (!/[^a-zA-Z0-9]/.test(value)) return 'Password must include a special character';
    } else if (tier === 'sensitive') {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
      if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must include a number';
    } else if (tier === 'authenticated') {
      if (value.length < 6) return 'Password must be at least 6 characters';
    }

    return null;
  }

  /**
   * Validate number input for overflow and safe integer range
   *
   * Prevents JavaScript precision loss by checking against Number.MAX_SAFE_INTEGER.
   * Also enforces min/max attribute constraints.
   *
   * @private
   * @returns null if valid or not a number, error message string if invalid
   */
  #validateNumberOverflow(value: string): string | null {
    if (!this.#inputElement || this.#inputElement.type !== 'number') {
      return null;
    }

    // Skip on empty values — required check handles that
    if (!value || value.length === 0) {
      return null;
    }

    const num = Number(value);

    if (!Number.isFinite(num)) {
      return 'Value must be a valid number';
    }

    // Check safe integer range for integer values (no decimal point)
    if (!value.includes('.') && !Number.isSafeInteger(num)) {
      return 'Value exceeds safe integer range';
    }

    // Enforce min/max attributes
    const minAttr = this.getAttribute('min');
    const maxAttr = this.getAttribute('max');

    if (minAttr !== null) {
      const min = Number(minAttr);
      if (Number.isFinite(min) && num < min) {
        return `Value must be at least ${min}`;
      }
    }

    if (maxAttr !== null) {
      const max = Number(maxAttr);
      if (Number.isFinite(max) && num > max) {
        return `Value must be at most ${max}`;
      }
    }

    return null;
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

    // Perform base validation
    const patternAttr = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    let compiledPattern: RegExp | null = null;
    if (patternAttr) {
      try {
        // eslint-disable-next-line security/detect-non-literal-regexp
        compiledPattern = new RegExp(patternAttr);
      } catch {
        // Invalid regex from attribute — treat as no pattern
      }
    }

    const validation = this.validateInput(this.#actualValue, {
      pattern: compiledPattern,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      this.#showError(validation.errors.join(', '));
      return;
    }

    // Type-specific validation: password strength
    const passwordError = this.#validatePasswordStrength(this.#actualValue);
    if (passwordError) {
      this.#showError(passwordError);
      return;
    }

    // Type-specific validation: number overflow
    const numberError = this.#validateNumberOverflow(this.#actualValue);
    if (numberError) {
      this.#showError(numberError);
      return;
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
    return new URL('./secure-input.css', import.meta.url).href;
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
    const patternAttr = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');
    const required = this.hasAttribute('required');

    // Check required field first (combines HTML attribute and tier config)
    if (required || this.config.validation.required) {
      if (!this.#actualValue || this.#actualValue.trim().length === 0) {
        return false;
      }
    }

    let compiledPattern: RegExp | null = null;
    if (patternAttr) {
      try {
        // eslint-disable-next-line security/detect-non-literal-regexp
        compiledPattern = new RegExp(patternAttr);
      } catch {
        // Invalid regex from attribute — treat as no pattern
      }
    }

    const validation = this.validateInput(this.#actualValue, {
      pattern: compiledPattern,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      return false;
    }

    // Type-specific: password strength
    if (this.#validatePasswordStrength(this.#actualValue) !== null) {
      return false;
    }

    // Type-specific: number overflow
    if (this.#validateNumberOverflow(this.#actualValue) !== null) {
      return false;
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
