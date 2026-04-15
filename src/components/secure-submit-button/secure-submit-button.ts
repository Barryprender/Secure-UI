/**
 * @fileoverview Secure Submit Button Component
 *
 * A security-aware form submit button that integrates with <secure-form>.
 * The button's enabled/disabled state is driven by the parent form's security
 * tier and field validation state.
 *
 * Tier behaviour:
 * - public:        Button enabled by default (validation.required = false)
 * - authenticated: Button disabled until all required fields are valid
 * - sensitive:     Button disabled until all required fields are valid
 * - critical:      Button disabled until all required fields are valid
 *
 * Usage:
 * <secure-form action="/api/data" method="POST" security-tier="sensitive">
 *   <secure-input label="Name" name="name" required></secure-input>
 *   <secure-submit-button label="Submit"></secure-submit-button>
 * </secure-form>
 *
 * @module secure-submit-button
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import { getTierConfig } from '../../core/security-config.js';
import type { SecurityTierValue, TierConfig } from '../../core/types.js';

// Structural interface for the parent <secure-form> element.
// Avoids a circular import while still providing type safety and a runtime guard.
interface SecureFormLike extends Element {
  readonly securityTier: SecurityTierValue;
  readonly valid: boolean;
  submit(): void;
}

function isSecureFormLike(el: Element | null): el is SecureFormLike {
  if (el === null) return false;
  const obj = el as unknown as Record<string, unknown>;
  return typeof obj['securityTier'] === 'string' &&
    typeof obj['valid'] === 'boolean' &&
    typeof obj['submit'] === 'function';
}

/**
 * Secure Submit Button Web Component
 *
 * Provides a security-aware submit button that monitors parent form validity
 * and enables/disables based on the form's security tier requirements.
 *
 * @extends SecureBaseComponent
 */
export class SecureSubmitButton extends SecureBaseComponent {
  /**
   * Button element reference inside shadow DOM
   * @private
   */
  #buttonElement: HTMLButtonElement | null = null;

  /**
   * Label span element
   * @private
   */
  #labelElement: HTMLSpanElement | null = null;

  /**
   * Loading indicator element
   * @private
   */
  #loadingElement: HTMLSpanElement | null = null;

  /**
   * Reference to the parent <secure-form> element
   * @private
   */
  #parentForm: HTMLElement | null = null;

  /**
   * Whether the parent form is currently valid
   * @private
   */
  #isFormValid: boolean = false;

  /**
   * Whether a submission is in progress
   * @private
   */
  #isSubmitting: boolean = false;

  /**
   * Effective security tier (inherited from form or explicit)
   * @private
   */
  #effectiveTier: SecurityTierValue = 'critical';

  /**
   * Effective tier config
   * @private
   */
  #effectiveConfig: TierConfig;

  /**
   * Unique instance ID for aria attribute association
   * @private
   */
  #instanceId: string = `secure-submit-button-${Math.random().toString(36).substring(2, 11)}`;

  #boundHandleFieldChange: (e: Event) => void;
  #boundHandleClick: () => void;
  #boundHandleFormSuccess: () => void;

  /**
   * Observed attributes
   */
  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'label',
      'loading-label',
      'disabled'
    ];
  }

  constructor() {
    super();
    this.#effectiveConfig = getTierConfig(this.#effectiveTier);
    this.#boundHandleFieldChange = this.#handleFieldChange.bind(this);
    this.#boundHandleClick = this.#handleClick.bind(this);
    this.#boundHandleFormSuccess = () => { this.#setLoading(false); };
  }

  /**
   * Connected to DOM — discover form, attach listeners, evaluate state
   */
  connectedCallback(): void {
    super.connectedCallback();

    // Defer form discovery to ensure parent secure-form has initialized
    // (secure-form creates its <form> element in its own connectedCallback)
    queueMicrotask(() => {
      this.#discoverParentForm();
      this.#resolveEffectiveTier();
      this.#attachFormListeners();
      this.#evaluateValidity();
      this.audit('submit_button_initialized', {
        tier: this.#effectiveTier,
        hasParentForm: !!this.#parentForm
      });
    });
  }

  /**
   * Render the button inside shadow DOM
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'submit-container';

    // Visually hidden hint explains why the button may be disabled (WCAG 1.3.5, 4.1.2)
    const hintId = `${this.#instanceId}-hint`;
    const hint = document.createElement('p');
    hint.id = hintId;
    hint.className = 'sr-only';
    hint.textContent = 'Complete all required fields to enable this button';
    container.appendChild(hint);

    // Create button (type="button" — cannot use type="submit" in shadow DOM)
    this.#buttonElement = document.createElement('button');
    this.#buttonElement.type = 'button';
    this.#buttonElement.className = 'submit-btn';
    this.#buttonElement.disabled = true; // Disabled by default until validity is evaluated
    this.#buttonElement.setAttribute('aria-disabled', 'true');
    this.#buttonElement.setAttribute('aria-describedby', hintId);

    // Label span
    this.#labelElement = document.createElement('span');
    this.#labelElement.className = 'btn-label';
    this.#labelElement.textContent = this.sanitizeValue(
      this.getAttribute('label') || 'Submit'
    );

    // Loading indicator span (hidden by default)
    this.#loadingElement = document.createElement('span');
    this.#loadingElement.className = 'btn-loading hidden';
    this.#loadingElement.setAttribute('aria-hidden', 'true');

    const spinner = document.createElement('span');
    spinner.className = 'spinner';

    const loadingText = document.createElement('span');
    loadingText.textContent = this.sanitizeValue(
      this.getAttribute('loading-label') || 'Submitting...'
    );

    this.#loadingElement.appendChild(spinner);
    this.#loadingElement.appendChild(loadingText);

    this.#buttonElement.appendChild(this.#labelElement);
    this.#buttonElement.appendChild(this.#loadingElement);

    // Click handler
    this.#buttonElement.addEventListener('click', this.#boundHandleClick);

    container.appendChild(this.#buttonElement);
    fragment.appendChild(container);

    this.addComponentStyles(this.#getComponentStyles());

    return fragment;
  }

  // ---------------------------------------------------------------------------
  // Form discovery & tier resolution
  // ---------------------------------------------------------------------------

  /**
   * Find the parent <secure-form> element
   * @private
   */
  #discoverParentForm(): void {
    this.#parentForm = this.closest('secure-form');
  }

  /**
   * Determine the effective security tier.
   * If the button has an explicit security-tier attribute, use it.
   * Otherwise, inherit from the parent form.
   * @private
   */
  #resolveEffectiveTier(): void {
    const ownTier = this.getAttribute('security-tier');

    if (!ownTier && isSecureFormLike(this.#parentForm)) {
      this.#effectiveTier = this.#parentForm.securityTier;
    } else {
      this.#effectiveTier = this.securityTier;
    }

    this.#effectiveConfig = getTierConfig(this.#effectiveTier);
  }

  // ---------------------------------------------------------------------------
  // Validation monitoring
  // ---------------------------------------------------------------------------

  /**
   * Attach event listeners on the parent form to monitor field changes
   * @private
   */
  #attachFormListeners(): void {
    const target = this.#parentForm || this.parentElement;
    if (!target) return;

    target.addEventListener('secure-input', this.#boundHandleFieldChange);
    target.addEventListener('secure-textarea', this.#boundHandleFieldChange);
    target.addEventListener('secure-select', this.#boundHandleFieldChange);
    target.addEventListener('secure-datetime', this.#boundHandleFieldChange);
    // Reset loading state when the form reports successful submission.
    target.addEventListener('secure-form-success', this.#boundHandleFormSuccess);
  }

  /**
   * Handle a field change event — re-evaluate form validity
   * @private
   */
  #handleFieldChange(_event: Event): void {
    this.#evaluateValidity();
  }

  /**
   * Evaluate form validity and enable/disable the button accordingly
   * @private
   */
  #evaluateValidity(): void {
    // If manually disabled via attribute, stay disabled
    if (this.hasAttribute('disabled')) {
      this.#setButtonDisabled(true);
      return;
    }

    // If currently submitting, stay disabled
    if (this.#isSubmitting) {
      return;
    }

    // Public tier: validation not required, button always enabled
    if (!this.#effectiveConfig.validation.required) {
      this.#isFormValid = true;
      this.#setButtonDisabled(false);
      return;
    }

    // Authenticated / Sensitive / Critical: check form validity
    if (isSecureFormLike(this.#parentForm)) {
      this.#isFormValid = this.#parentForm.valid;
    } else {
      // Fallback: manually query fields
      this.#isFormValid = this.#checkFieldsValid();
    }

    this.#setButtonDisabled(!this.#isFormValid);
  }

  /**
   * Fallback field validation when no parent form is found
   * @private
   */
  #checkFieldsValid(): boolean {
    const container = this.#parentForm || this.parentElement;
    if (!container) return false;

    const fields = container.querySelectorAll(
      'secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload'
    );

    for (const field of fields) {
      const typedField = field as unknown as { valid: boolean };
      if (typeof typedField.valid === 'boolean' && !typedField.valid) {
        return false;
      }
    }

    // If there are no fields and validation is required, stay disabled
    return fields.length > 0;
  }

  /**
   * Update the button's disabled state
   * @private
   */
  #setButtonDisabled(disabled: boolean): void {
    if (!this.#buttonElement) return;

    this.#buttonElement.disabled = disabled;
    this.#buttonElement.setAttribute('aria-disabled', String(disabled));
  }

  // ---------------------------------------------------------------------------
  // Click & submission
  // ---------------------------------------------------------------------------

  /**
   * Handle button click — rate limit, audit, trigger form submission
   * @private
   */
  #handleClick(): void {
    if (this.#isSubmitting || this.#buttonElement?.disabled) return;

    // Rate limit check
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.audit('submit_button_rate_limited', {
        retryAfter: rateLimitCheck.retryAfter
      });
      return;
    }

    this.audit('submit_button_clicked', {
      tier: this.#effectiveTier,
      formValid: this.#isFormValid
    });

    this.#setLoading(true);

    // Trigger form submission. #handleSubmit is async — loading state is cleared
    // by the secure-form-success listener or on disconnect, not here.
    if (isSecureFormLike(this.#parentForm)) {
      this.#parentForm.submit();
    } else {
      // No parent form — nothing to submit, reset immediately.
      this.#setLoading(false);
    }
  }

  /**
   * Toggle loading/submitting state
   * @private
   */
  #setLoading(loading: boolean): void {
    this.#isSubmitting = loading;

    if (this.#buttonElement) {
      this.#buttonElement.disabled = loading;
      this.#buttonElement.setAttribute('aria-disabled', String(loading));
    }
    if (this.#labelElement) {
      this.#labelElement.classList.toggle('hidden', loading);
    }
    if (this.#loadingElement) {
      this.#loadingElement.classList.toggle('hidden', !loading);
      this.#loadingElement.setAttribute('aria-hidden', String(!loading));
    }
  }

  // ---------------------------------------------------------------------------
  // Attribute changes
  // ---------------------------------------------------------------------------

  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    switch (name) {
      case 'label':
        if (this.#labelElement) {
          this.#labelElement.textContent = this.sanitizeValue(newValue || 'Submit');
        }
        break;
      case 'loading-label':
        if (this.#loadingElement) {
          const textSpan = this.#loadingElement.querySelector('span:last-child');
          if (textSpan) {
            textSpan.textContent = this.sanitizeValue(newValue || 'Submitting...');
          }
        }
        break;
      case 'disabled':
        this.#evaluateValidity();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Whether the button is disabled
   */
  get disabled(): boolean {
    return this.#buttonElement ? this.#buttonElement.disabled : true;
  }

  set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
    this.#evaluateValidity();
  }

  /**
   * The button label text
   */
  get label(): string {
    return this.getAttribute('label') || 'Submit';
  }

  set label(value: string) {
    this.setAttribute('label', value);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  #getComponentStyles(): string {
    return new URL('./secure-submit-button.css', import.meta.url).href;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  disconnectedCallback(): void {
    super.disconnectedCallback();

    this.#setLoading(false);
    const target = this.#parentForm || this.parentElement;
    if (target) {
      target.removeEventListener('secure-input', this.#boundHandleFieldChange);
      target.removeEventListener('secure-textarea', this.#boundHandleFieldChange);
      target.removeEventListener('secure-select', this.#boundHandleFieldChange);
      target.removeEventListener('secure-datetime', this.#boundHandleFieldChange);
      target.removeEventListener('secure-form-success', this.#boundHandleFormSuccess);
    }
  }
}

// Register the custom element
customElements.define('secure-submit-button', SecureSubmitButton);

export default SecureSubmitButton;
