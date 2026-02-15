/**
 * @fileoverview Secure Textarea Component
 *
 * A security-first textarea component that implements progressive enhancement,
 * tier-based validation, character counting, and audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 textarea with attributes
 * 2. With JavaScript: Enhances with real-time validation, character limits, rate limiting
 *
 * Usage:
 * <secure-textarea
 *   security-tier="sensitive"
 *   name="bio"
 *   label="Biography"
 *   rows="5"
 *   required
 * ></secure-textarea>
 *
 * Security Features:
 * - XSS prevention via sanitization
 * - Character counting and limits based on security tier
 * - Rate limiting for sensitive/critical tiers
 * - Autocomplete control based on tier
 * - Comprehensive audit logging
 * - Visual security indicators
 *
 * @module secure-textarea
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';

/**
 * Secure Textarea Web Component
 *
 * Provides a security-hardened textarea field with progressive enhancement.
 * The component works as a standard form textarea without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * @extends SecureBaseComponent
 */
export class SecureTextarea extends SecureBaseComponent {
  /**
   * Textarea element reference
   * @private
   */
  #textareaElement: HTMLTextAreaElement | null = null;

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
   * Character count display element
   * @private
   */
  #charCountElement: HTMLSpanElement | null = null;

  /**
   * Unique ID for this textarea instance
   * @private
   */
  #instanceId: string = `secure-textarea-${Math.random().toString(36).substr(2, 9)}`;

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
      'placeholder',
      'required',
      'minlength',
      'maxlength',
      'rows',
      'cols',
      'wrap',
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
   * Render the textarea component
   *
   * Security Note: We use a native <textarea> element wrapped in our web component
   * to ensure progressive enhancement. The native textarea works without JavaScript,
   * and we enhance it with security features when JS is available.
   *
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const config = this.config;

    // Create container
    const container = document.createElement('div');
    container.className = 'textarea-container';

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

    // Create textarea wrapper for progressive enhancement
    const textareaWrapper = document.createElement('div');
    textareaWrapper.className = 'textarea-wrapper';

    // Create the actual textarea element
    this.#textareaElement = document.createElement('textarea');
    this.#textareaElement.id = this.#instanceId;
    this.#textareaElement.className = 'textarea-field';

    // Apply attributes from web component to native textarea
    this.#applyTextareaAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    textareaWrapper.appendChild(this.#textareaElement);
    container.appendChild(textareaWrapper);

    // Create character count display
    this.#charCountElement = document.createElement('span');
    this.#charCountElement.className = 'char-count';
    this.#updateCharCount();
    container.appendChild(this.#charCountElement);

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
   * Apply attributes from the web component to the native textarea
   *
   * Security Note: This is where we enforce tier-specific security controls
   * like autocomplete, caching, and validation rules.
   *
   * @private
   */
  #applyTextareaAttributes(): void {
    const config = this.config;

    // Name attribute (required for form submission)
    const name = this.getAttribute('name');
    if (name) {
      this.#textareaElement!.name = this.sanitizeValue(name);
    }

    // Placeholder
    const placeholder = this.getAttribute('placeholder');
    if (placeholder) {
      this.#textareaElement!.placeholder = this.sanitizeValue(placeholder);
    }

    // Required attribute
    if (this.hasAttribute('required') || config.validation.required) {
      this.#textareaElement!.required = true;
      this.#textareaElement!.setAttribute('aria-required', 'true');
    }

    // Length constraints
    const minLength = this.getAttribute('minlength');
    if (minLength) {
      this.#textareaElement!.minLength = parseInt(minLength, 10);
    }

    const maxLength = this.getAttribute('maxlength') || config.validation.maxLength;
    if (maxLength) {
      this.#textareaElement!.maxLength = parseInt(String(maxLength), 10);
    }

    // Rows and columns
    const rows = this.getAttribute('rows') || 3;
    this.#textareaElement!.rows = parseInt(String(rows), 10);

    const cols = this.getAttribute('cols');
    if (cols) {
      this.#textareaElement!.cols = parseInt(cols, 10);
    }

    // Wrap attribute
    const wrap = this.getAttribute('wrap') || 'soft';
    this.#textareaElement!.wrap = wrap;

    // CRITICAL SECURITY: Autocomplete control based on tier
    // For SENSITIVE and CRITICAL tiers, we disable autocomplete to prevent
    // browser storage of sensitive data
    if (config.storage.allowAutocomplete) {
      const autocomplete = this.getAttribute('autocomplete') || 'on';
      this.#textareaElement!.autocomplete = autocomplete as AutoFill;
    } else {
      this.#textareaElement!.autocomplete = 'off';
    }

    // Disabled state
    if (this.hasAttribute('disabled')) {
      this.#textareaElement!.disabled = true;
    }

    // Readonly state
    if (this.hasAttribute('readonly')) {
      this.#textareaElement!.readOnly = true;
    }

    // Initial value
    const value = this.getAttribute('value');
    if (value) {
      this.#textareaElement!.value = value;
    }
  }

  /**
   * Attach event listeners to the textarea
   *
   * @private
   */
  #attachEventListeners(): void {
    // Focus event - audit logging
    this.#textareaElement!.addEventListener('focus', () => {
      this.audit('textarea_focused', {
        name: this.#textareaElement!.name
      });
    });

    // Input event - real-time validation and character counting
    this.#textareaElement!.addEventListener('input', (e: Event) => {
      this.#handleInput(e);
    });

    // Blur event - final validation
    this.#textareaElement!.addEventListener('blur', () => {
      this.#validateAndShowErrors();
      this.audit('textarea_blurred', {
        name: this.#textareaElement!.name,
        hasValue: this.#textareaElement!.value.length > 0
      });
    });

    // Change event - audit logging
    this.#textareaElement!.addEventListener('change', () => {
      this.audit('textarea_changed', {
        name: this.#textareaElement!.name,
        valueLength: this.#textareaElement!.value.length
      });
    });
  }

  /**
   * Handle input events
   *
   * Security Note: This is where we implement real-time validation and character counting.
   *
   * @private
   */
  #handleInput(_event: Event): void {
    // Update character count
    this.#updateCharCount();

    // Clear previous errors on input (improve UX)
    this.#clearErrors();

    // Dispatch custom event for parent forms
    this.dispatchEvent(
      new CustomEvent('secure-textarea', {
        detail: {
          name: this.#textareaElement!.name,
          value: this.#textareaElement!.value,
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Update character count display
   *
   * @private
   */
  #updateCharCount(): void {
    const currentLength = this.#textareaElement!.value.length;
    const maxLength = this.#textareaElement!.maxLength;

    if (maxLength > 0) {
      this.#charCountElement!.textContent = `${currentLength} / ${maxLength}`;

      // Warn when approaching limit
      if (currentLength > maxLength * 0.9) {
        this.#charCountElement!.classList.add('warning');
      } else {
        this.#charCountElement!.classList.remove('warning');
      }
    } else {
      this.#charCountElement!.textContent = `${currentLength}`;
    }
  }

  /**
   * Validate the textarea and show error messages
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
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    const validation = this.validateInput(this.#textareaElement!.value, {
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
    this.#textareaElement!.classList.add('error');
    this.#textareaElement!.setAttribute('aria-invalid', 'true');
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
    this.#textareaElement!.classList.remove('error');
    this.#textareaElement!.removeAttribute('aria-invalid');
  }

  /**
   * Get component-specific styles
   *
   * @private
   */
  #getComponentStyles(): string {
    return `
      .textarea-container {
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

      .textarea-wrapper {
        position: relative;
      }

      .textarea-field {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #d1d5db;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        background-color: #ffffff;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        resize: vertical;
      }

      .textarea-field:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .textarea-field.error {
        border-color: #f44336;
      }

      .textarea-field:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
        opacity: 0.6;
      }

      .textarea-field:read-only {
        background-color: #fafafa;
        cursor: default;
      }

      .char-count {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #666;
        text-align: right;
      }

      .char-count.warning {
        color: #ff9800;
        font-weight: 500;
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
        .textarea-field,
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
    if (!this.#textareaElement) return;

    switch (name) {
      case 'disabled':
        this.#textareaElement.disabled = this.hasAttribute('disabled');
        break;
      case 'readonly':
        this.#textareaElement.readOnly = this.hasAttribute('readonly');
        break;
      case 'value':
        if (newValue !== this.#textareaElement.value) {
          this.#textareaElement.value = newValue || '';
          this.#updateCharCount();
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
    return this.#textareaElement ? this.#textareaElement.value : '';
  }

  /**
   * Set the value
   *
   * @public
   */
  set value(value: string) {
    if (this.#textareaElement) {
      this.#textareaElement.value = value || '';
      this.#updateCharCount();
    }
  }

  /**
   * Get the textarea name
   *
   * @public
   */
  get name(): string {
    return this.#textareaElement ? this.#textareaElement.name : '';
  }

  /**
   * Check if the textarea is valid
   *
   * @public
   */
  get valid(): boolean {
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');
    const required = this.hasAttribute('required');

    // Check required field first
    if (required || this.config.validation.required) {
      if (!this.#textareaElement!.value || this.#textareaElement!.value.trim().length === 0) {
        return false;
      }
    }

    const validation = this.validateInput(this.#textareaElement!.value, {
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    return validation.valid;
  }

  /**
   * Focus the textarea
   *
   * @public
   */
  focus(): void {
    if (this.#textareaElement) {
      this.#textareaElement.focus();
    }
  }

  /**
   * Blur the textarea
   *
   * @public
   */
  blur(): void {
    if (this.#textareaElement) {
      this.#textareaElement.blur();
    }
  }

  /**
   * Cleanup on disconnect
   */
  disconnectedCallback(): void {
    super.disconnectedCallback();

    // Clear sensitive data from memory
    if (this.#textareaElement) {
      this.#textareaElement.value = '';
    }
  }
}

// Define the custom element
customElements.define('secure-textarea', SecureTextarea);

export default SecureTextarea;
