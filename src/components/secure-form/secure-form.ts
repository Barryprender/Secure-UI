/**
 * @fileoverview Secure Form Component
 *
 * A security-first form component that implements CSRF protection, automatic
 * field collection, validation, and comprehensive audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 form submission
 * 2. With JavaScript: Enhances with CSRF tokens, validation, secure submission
 *
 * Usage:
 * <secure-form
 *   security-tier="sensitive"
 *   action="/api/submit"
 *   method="POST"
 *   csrf-token="your-csrf-token"
 * >
 *   <secure-input name="email" label="Email" required></secure-input>
 *   <button type="submit">Submit</button>
 * </secure-form>
 *
 * Security Features:
 * - CSRF token injection and validation
 * - Automatic secure field collection
 * - XSS prevention via sanitization
 * - Rate limiting on submission
 * - Comprehensive audit logging
 * - Secure headers for form submission
 * - Double-submit cookie pattern support
 *
 * @module secure-form
 * @license MIT
 */

import { SecurityTier } from '../../core/security-config.js';
import type {
  SecurityTierValue,
  FieldTelemetry,
  FieldTelemetrySnapshot,
  SessionTelemetry
} from '../../core/types.js';

/**
 * Secure Form Web Component
 *
 * Provides a security-hardened form with CSRF protection and validation.
 * The component works as a standard HTML form without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * IMPORTANT: This component does NOT use Shadow DOM. It creates a native
 * <form> element in light DOM to ensure proper form submission and
 * accessibility. It extends HTMLElement directly, not SecureBaseComponent.
 *
 * @extends HTMLElement
 */
export class SecureForm extends HTMLElement {
  /** @private Whether component styles have been added to the document */
  static __stylesAdded: boolean = false;

  /**
   * Form element reference
   * @private
   */
  #formElement: HTMLFormElement | null = null;

  /**
   * CSRF token hidden input reference
   * @private
   */
  #csrfInput: HTMLInputElement | null = null;

  /**
   * Form status message element
   * @private
   */
  #statusElement: HTMLDivElement | null = null;

  /**
   * Whether form is currently submitting
   * @private
   */
  #isSubmitting: boolean = false;

  /**
   * Timestamp when the form was connected to the DOM.
   * Used to compute session duration for telemetry.
   * @private
   */
  #sessionStart: number = Date.now();

  /**
   * Unique ID for this form instance
   * @private
   */
  #instanceId: string = `secure-form-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Security tier for this form
   * @private
   */
  #securityTier: SecurityTierValue = SecurityTier.PUBLIC as SecurityTierValue;

  /**
   * Observed attributes for this component
   *
   * @static
   */
  static get observedAttributes(): string[] {
    return [
      'security-tier',
      'action',
      'method',
      'enctype',
      'csrf-token',
      'csrf-header-name',
      'csrf-field-name',
      'novalidate'
    ];
  }

  /**
   * Constructor
   */
  constructor() {
    super();
    // No Shadow DOM - we work exclusively in light DOM for form compatibility
  }

  /**
   * Called when element is connected to DOM
   *
   * Progressive Enhancement Strategy:
   * - Create a native <form> in light DOM (not Shadow DOM)
   * - Move all children into the form
   * - Add CSRF token as hidden field
   * - Attach event listeners for validation and optional enhancement
   */
  connectedCallback(): void {
    // Only initialize once
    if (this.#formElement) {
      return;
    }
    this.#sessionStart = Date.now();

    // Read security tier from attribute before anything else.
    // attributeChangedCallback fires before connectedCallback but early-returns
    // when #formElement is null, so the tier needs to be read here.
    const tierAttr = this.getAttribute('security-tier');
    if (tierAttr) {
      this.#securityTier = tierAttr as SecurityTierValue;
    }

    // Progressive enhancement: check for server-rendered <form> in light DOM
    const existingForm = this.querySelector('form');
    if (existingForm) {
      // Adopt the existing form element
      this.#formElement = existingForm;
      this.#formElement.id = this.#instanceId;
      if (!this.#formElement.classList.contains('secure-form')) {
        this.#formElement.classList.add('secure-form');
      }

      // Apply/override form attributes from the custom element
      this.#applyFormAttributes();

      // Check if CSRF field already exists in the server-rendered form
      const csrfFieldName = this.getAttribute('csrf-field-name') || 'csrf_token';
      const existingCsrf = existingForm.querySelector<HTMLInputElement>(`input[name="${csrfFieldName}"]`);
      if (existingCsrf) {
        this.#csrfInput = existingCsrf;
        // Update token value from attribute if it differs
        const csrfToken = this.getAttribute('csrf-token');
        if (csrfToken && existingCsrf.value !== csrfToken) {
          existingCsrf.value = csrfToken;
        }
      } else {
        this.#createCsrfField();
      }
    } else {
      // No server-rendered form: create one (original behavior)
      this.#formElement = document.createElement('form');
      this.#formElement.id = this.#instanceId;
      this.#formElement.className = 'secure-form';

      // Apply form attributes
      this.#applyFormAttributes();

      // Create CSRF token field
      this.#createCsrfField();

      // Move all existing children (inputs, buttons) into the form
      while (this.firstChild) {
        this.#formElement.appendChild(this.firstChild);
      }

      // Append the form to this element
      this.appendChild(this.#formElement);
    }

    // Create status message area
    this.#statusElement = document.createElement('div');
    this.#statusElement.className = 'form-status form-status-hidden';
    this.#statusElement.setAttribute('role', 'status');
    this.#statusElement.setAttribute('aria-live', 'polite');
    this.#formElement.insertBefore(this.#statusElement, this.#formElement.firstChild);

    // Add inline styles (since we're not using Shadow DOM)
    this.#addInlineStyles();

    // Set up event listeners
    this.#attachEventListeners();

    this.audit('form_initialized', {
      formId: this.#instanceId,
      action: this.#formElement.action,
      method: this.#formElement.method
    });
  }

  /**
   * Add component styles (CSP-compliant via adoptedStyleSheets on document)
   *
   * Uses constructable stylesheets instead of injecting <style> elements,
   * which would be blocked by strict Content Security Policy.
   *
   * @private
   */
  #addInlineStyles(): void {
    // Only inject once globally — <link> in document head, loads from 'self' (CSP-safe)
    if (!SecureForm.__stylesAdded) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('./secure-form.css', import.meta.url).href;
      document.head.appendChild(link);
      SecureForm.__stylesAdded = true;
    }
  }

  /**
   * Apply attributes to the form element
   *
   * @private
   */
  #applyFormAttributes(): void {
    const action = this.getAttribute('action');
    if (action) {
      this.#formElement!.action = action;
    }

    const method = this.getAttribute('method') || 'POST';
    this.#formElement!.method = method.toUpperCase();

    const enctype = this.getAttribute('enctype') || 'application/x-www-form-urlencoded';
    this.#formElement!.enctype = enctype;

    // Disable browser validation - we handle it ourselves
    const novalidate = this.hasAttribute('novalidate');
    if (novalidate) {
      this.#formElement!.noValidate = true;
    }

    // Disable autocomplete for SENSITIVE and CRITICAL tiers
    if (this.#securityTier === SecurityTier.SENSITIVE || this.#securityTier === SecurityTier.CRITICAL) {
      this.#formElement!.autocomplete = 'off';
    }
  }

  /**
   * Create CSRF token hidden field
   *
   * Security Note: CSRF tokens prevent Cross-Site Request Forgery attacks.
   * The token should be unique per session and validated server-side.
   *
   * @private
   */
  #createCsrfField(): void {
    const csrfToken = this.getAttribute('csrf-token');

    if (csrfToken) {
      this.#csrfInput = document.createElement('input');
      this.#csrfInput.type = 'hidden';
      // Use 'csrf_token' for backend compatibility (common convention)
      // Backends can configure via csrf-field-name attribute if needed
      const fieldName = this.getAttribute('csrf-field-name') || 'csrf_token';
      this.#csrfInput.name = fieldName;
      this.#csrfInput.value = csrfToken;

      this.#formElement!.appendChild(this.#csrfInput);

      this.audit('csrf_token_injected', {
        formId: this.#instanceId,
        fieldName: fieldName
      });
    } else if (this.securityTier === SecurityTier.SENSITIVE ||
               this.securityTier === SecurityTier.CRITICAL) {
      console.warn('CSRF token not provided for SENSITIVE/CRITICAL tier form');
    }
  }

  /**
   * Attach event listeners
   *
   * @private
   */
  #attachEventListeners(): void {
    // Submit event - validate and enhance submission
    this.#formElement!.addEventListener('submit', (e: Event) => {
      void this.#handleSubmit(e);
    });

    // Listen for secure field events
    this.addEventListener('secure-input', (e: Event) => {
      this.#handleFieldChange(e);
    });

    this.addEventListener('secure-textarea', (e: Event) => {
      this.#handleFieldChange(e);
    });

    this.addEventListener('secure-select', (e: Event) => {
      this.#handleFieldChange(e);
    });
  }

  /**
   * Handle field change events
   *
   * @private
   */
  #handleFieldChange(_event: Event): void {
    // Clear form-level errors when user makes changes
    this.#clearStatus();
  }

  /**
   * Handle form submission
   *
   * Progressive Enhancement Strategy:
   * - If 'enhance' attribute is NOT set: Allow native form submission (backend agnostic)
   * - If 'enhance' attribute IS set: Intercept and use Fetch API with JSON
   *
   * Security Note: This is where we perform comprehensive validation,
   * rate limiting, and secure data collection before submission.
   *
   * @private
   */
  async #handleSubmit(event: Event): Promise<void> {
    // Check if we should enhance the form submission with JavaScript
    const shouldEnhance = this.hasAttribute('enhance');

    // Prevent double submission
    if (this.#isSubmitting) {
      event.preventDefault();
      return;
    }

    // Check rate limit
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      event.preventDefault();
      this.#showStatus(
        `Too many submission attempts. Please wait ${Math.ceil(rateLimitCheck.retryAfter / 1000)} seconds.`,
        'error'
      );
      this.audit('form_rate_limited', {
        formId: this.#instanceId,
        retryAfter: rateLimitCheck.retryAfter
      });
      return;
    }

    // Discover and validate all secure fields
    const validation = this.#validateAllFields();
    if (!validation.valid) {
      event.preventDefault();
      console.log('[secure-form] Validation failed:', validation.errors);
      this.#showStatus(validation.errors.join(', '), 'error');
      this.audit('form_validation_failed', {
        formId: this.#instanceId,
        errors: validation.errors
      });
      return;
    }

    console.log('[secure-form] Validation passed, shouldEnhance:', shouldEnhance);

    // If not enhancing, allow native form submission
    if (!shouldEnhance) {
      // CRITICAL: Sync secure-input values to hidden fields for native submission
      // Secure-input components have their actual <input> in Shadow DOM,
      // so we need to create hidden inputs for native form submission
      this.#syncSecureInputsToForm();

      // Let the browser handle the submission normally
      console.log('[secure-form] Allowing native submission to:', this.#formElement!.action);
      this.audit('form_submitted_native', {
        formId: this.#instanceId,
        action: this.#formElement!.action,
        method: this.#formElement!.method
      });
      return; // Allow default behavior
    }

    // Enhanced submission with JavaScript (Fetch API)
    event.preventDefault();

    // Mark as submitting
    this.#isSubmitting = true;
    this.#showStatus('Submitting...', 'info');
    this.#disableForm();

    // Collect form data securely
    const formData = this.#collectFormData();

    // Collect behavioral telemetry from all secure fields
    const telemetry = this.#collectTelemetry();

    // Audit log submission (include risk score for server-side correlation)
    this.audit('form_submitted_enhanced', {
      formId: this.#instanceId,
      action: this.#formElement!.action,
      method: this.#formElement!.method,
      fieldCount: Object.keys(formData).length,
      riskScore: telemetry.riskScore,
      riskSignals: telemetry.riskSignals
    });

    // Dispatch pre-submit event for custom handling
    const preSubmitEvent = new CustomEvent('secure-form-submit', {
      detail: {
        formData,
        formElement: this.#formElement,
        telemetry,
        preventDefault: () => {
          this.#isSubmitting = false;
          this.#enableForm();
        }
      },
      bubbles: true,
      composed: true,
      cancelable: true
    });

    const shouldContinue = this.dispatchEvent(preSubmitEvent);

    if (!shouldContinue) {
      // Custom handler prevented default submission
      this.#isSubmitting = false;
      this.#enableForm();
      return;
    }

    // Perform secure submission via Fetch
    try {
      await this.#submitForm(formData, telemetry);
    } catch (error) {
      this.#showStatus('Submission failed. Please try again.', 'error');
      this.audit('form_submission_error', {
        formId: this.#instanceId,
        error: (error as Error).message
      });
    } finally {
      this.#isSubmitting = false;
      this.#enableForm();
    }
  }

  /**
   * Sync secure-input component values to hidden form inputs
   *
   * CRITICAL for native form submission: Secure-input components have their
   * actual <input> elements in Shadow DOM, which can't participate in native
   * form submission. We create/update hidden inputs in the form for each
   * secure-input to enable backend-agnostic form submission.
   *
   * @private
   */
  #syncSecureInputsToForm(): void {
    const secureInputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select');

    secureInputs.forEach((input) => {
      const name = input.getAttribute('name');
      if (!name) return;

      // CRITICAL: Disable the native fallback inputs inside the secure component
      // so they don't participate in native form submission (they are empty because
      // the user typed into the shadow DOM input). Without this, the server receives
      // the empty native input value first, ignoring the synced hidden input.
      const nativeFallbacks = input.querySelectorAll(`input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`);
      nativeFallbacks.forEach((fallback) => {
        (fallback as HTMLInputElement).removeAttribute('name');
      });

      // Check if hidden input already exists
      let hiddenInput = this.#formElement!.querySelector<HTMLInputElement>(`input[type="hidden"][data-secure-input="${name}"]`);

      if (!hiddenInput) {
        // Create hidden input for this secure-input
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.setAttribute('data-secure-input', name);
        hiddenInput.name = name;
        this.#formElement!.appendChild(hiddenInput);
      }

      // Sync the value
      hiddenInput.value = (input as HTMLElement & { value: string }).value || '';
    });
  }

  /**
   * Validate all secure fields in the form
   *
   * @private
   */
  #validateAllFields(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Find all secure input components within the form
    const inputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select');

    inputs.forEach((input) => {
      if (typeof (input as HTMLElement & { valid: boolean }).valid === 'boolean' && !(input as HTMLElement & { valid: boolean }).valid) {
        const label = input.getAttribute('label') || input.getAttribute('name') || 'Field';
        errors.push(`${label} is invalid`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Collect form data from secure fields
   *
   * Security Note: We collect data from secure components which have already
   * sanitized their values. We also include the CSRF token.
   *
   * @private
   */
  #collectFormData(): Record<string, string> {
    const formData: Record<string, string> = {};

    // Collect from secure components within the form
    const secureInputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select');

    secureInputs.forEach((input) => {
      const typedInput = input as HTMLElement & { name: string; value: string };
      if (typedInput.name) {
        formData[typedInput.name] = typedInput.value;
      }
    });

    // Collect from standard form inputs (for non-secure fields)
    const standardInputs = this.#formElement!.querySelectorAll('input:not([type="hidden"]), textarea:not(.textarea-field), select:not(.select-field)');

    standardInputs.forEach((input) => {
      const typedInput = input as HTMLInputElement;
      if (typedInput.name) {
        formData[typedInput.name] = this.sanitizeValue(typedInput.value);
      }
    });

    // Include CSRF token
    if (this.#csrfInput) {
      formData[this.#csrfInput.name] = this.#csrfInput.value;
    }

    return formData;
  }

  /**
   * Submit form data securely
   *
   * Security Note: We use fetch API with secure headers and proper CSRF handling.
   * In production, ensure the server validates the CSRF token.
   *
   * @private
   */
  async #submitForm(
    formData: Record<string, string>,
    telemetry: SessionTelemetry
  ): Promise<Response> {
    const action = this.#formElement!.action;
    const method = this.#formElement!.method;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add CSRF token to header if specified
    const csrfHeaderName = this.getAttribute('csrf-header-name');
    if (csrfHeaderName && this.#csrfInput) {
      headers[csrfHeaderName] = this.#csrfInput.value;
    }

    // Bundle telemetry alongside form data in a single request.
    // The server receives both the user's input and behavioral context in one
    // atomic payload, enabling server-side risk evaluation without a second round-trip.
    // Using a prefixed key (_telemetry) avoids collisions with form field names.
    const payload: Record<string, unknown> = { ...formData, _telemetry: telemetry };

    // Perform fetch
    const response = await fetch(action, {
      method: method,
      headers: headers,
      body: JSON.stringify(payload),
      credentials: 'same-origin', // Include cookies for CSRF validation
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Success
    this.#showStatus('Form submitted successfully!', 'success');

    // Dispatch success event
    this.dispatchEvent(
      new CustomEvent('secure-form-success', {
        detail: {
          formData,
          response,
          telemetry
        },
        bubbles: true,
        composed: true
      })
    );

    return response;
  }

  /**
   * Disable form during submission
   *
   * @private
   */
  #disableForm(): void {
    // Disable all form controls
    const controls = this.#formElement!.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
      (control as HTMLInputElement).disabled = true;
    });

    // Also disable secure components
    const secureFields = this.querySelectorAll('secure-input, secure-textarea, secure-select');
    secureFields.forEach((field) => {
      field.setAttribute('disabled', '');
    });
  }

  /**
   * Enable form after submission
   *
   * @private
   */
  #enableForm(): void {
    // Enable all form controls
    const controls = this.#formElement!.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
      (control as HTMLInputElement).disabled = false;
    });

    // Also enable secure components
    const secureFields = this.querySelectorAll('secure-input, secure-textarea, secure-select');
    secureFields.forEach((field) => {
      field.removeAttribute('disabled');
    });
  }

  /**
   * Show status message
   *
   * @private
   */
  #showStatus(message: string, type: string = 'info'): void {
    this.#statusElement!.textContent = message;
    this.#statusElement!.className = `form-status form-status-${type}`;
  }

  /**
   * Clear status message
   *
   * @private
   */
  #clearStatus(): void {
    this.#statusElement!.textContent = '';
    this.#statusElement!.className = 'form-status form-status-hidden';
  }

  // ── Telemetry ──────────────────────────────────────────────────────────────

  /**
   * Collect behavioral telemetry from all secure child fields and compute
   * a session-level risk score.
   *
   * @private
   */
  #collectTelemetry(): SessionTelemetry {
    const selector = 'secure-input, secure-textarea, secure-select, secure-datetime, secure-card';
    const secureFields = this.querySelectorAll(selector);

    const fields: FieldTelemetrySnapshot[] = [];

    secureFields.forEach((field) => {
      const typedField = field as HTMLElement & { getFieldTelemetry?: () => FieldTelemetry };
      if (typeof typedField.getFieldTelemetry !== 'function') return;

      const fieldName = field.getAttribute('name') ?? field.tagName.toLowerCase();
      const snapshot: FieldTelemetrySnapshot = {
        ...typedField.getFieldTelemetry(),
        fieldName,
        fieldType: field.tagName.toLowerCase(),
      };
      fields.push(snapshot);
    });

    const sessionDuration = Date.now() - this.#sessionStart;
    const { riskScore, riskSignals } = this.#computeRiskScore(fields, sessionDuration);

    return {
      sessionDuration,
      fieldCount: fields.length,
      fields,
      riskScore,
      riskSignals,
      submittedAt: new Date().toISOString(),
    };
  }

  /**
   * Compute a composite risk score 0–100 and list of contributing signals.
   *
   * Signal weights (additive, capped at 100):
   * - Session completed in under 3 s:             +30  (inhuman speed)
   * - Session completed in under 8 s:             +10  (very fast)
   * - All fields pasted (no keystrokes anywhere): +25  (credential stuffing / scripted fill)
   * - Any field has typing velocity > 15 ks/s:    +15  (bot-like keyboard simulation)
   * - Any field never focused (focusCount = 0):   +15  (field was filled without user interaction)
   * - Multiple fields probed without entry:        +10  (focusCount > 1 but blurWithoutChange > 1)
   * - High correction count on any field (> 5):   +5   (deliberate obfuscation / hesitation)
   * - Autofill on all non-empty fields:           -10  (genuine browser autofill is low-risk)
   *
   * @private
   */
  #computeRiskScore(
    fields: FieldTelemetrySnapshot[],
    sessionDuration: number
  ): { riskScore: number; riskSignals: string[] } {
    const signals: string[] = [];
    let score = 0;

    // Session speed
    if (sessionDuration < 3000) {
      score += 30;
      signals.push('session_too_fast');
    } else if (sessionDuration < 8000) {
      score += 10;
      signals.push('session_fast');
    }

    if (fields.length === 0) {
      return { riskScore: Math.min(score, 100), riskSignals: signals };
    }

    // All fields pasted with zero keystrokes — scripted fill
    const allPasted = fields.every(f => f.pasteDetected && f.velocity === 0);
    if (allPasted) {
      score += 25;
      signals.push('all_fields_pasted');
    }

    // Any field with superhuman typing speed
    const hasHighVelocity = fields.some(f => f.velocity > 15);
    if (hasHighVelocity) {
      score += 15;
      signals.push('high_velocity_typing');
    }

    // Any field never touched (focusCount === 0) — programmatic fill
    const hasUnfocusedField = fields.some(f => f.focusCount === 0);
    if (hasUnfocusedField) {
      score += 15;
      signals.push('field_filled_without_focus');
    }

    // Form probing: multiple focus/blur cycles with no value entry
    const hasProbing = fields.some(f => f.focusCount > 1 && f.blurWithoutChange > 1);
    if (hasProbing) {
      score += 10;
      signals.push('form_probing');
    }

    // Excessive corrections on any field
    const hasHighCorrections = fields.some(f => f.corrections > 5);
    if (hasHighCorrections) {
      score += 5;
      signals.push('high_correction_count');
    }

    // Genuine autofill on all non-empty fields is a trust signal — reduce score
    const autofillFields = fields.filter(f => f.autofillDetected);
    if (autofillFields.length > 0 && autofillFields.length === fields.length) {
      score -= 10;
      signals.push('autofill_detected');
    }

    return { riskScore: Math.max(0, Math.min(score, 100)), riskSignals: signals };
  }

  /**
   * Get form data
   *
   * @public
   */
  getData(): Record<string, string> {
    return this.#collectFormData();
  }

  /**
   * Reset the form
   *
   * @public
   */
  reset(): void {
    if (this.#formElement) {
      this.#formElement.reset();
      this.#clearStatus();

      this.audit('form_reset', {
        formId: this.#instanceId
      });
    }
  }

  /**
   * Programmatically submit the form
   *
   * @public
   */
  submit(): void {
    if (this.#formElement) {
      // Trigger submit event which will run our validation
      this.#formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  /**
   * Check if form is valid
   *
   * @public
   */
  get valid(): boolean {
    const validation = this.#validateAllFields();
    return validation.valid;
  }

  /**
   * Cleanup on disconnect
   */
  disconnectedCallback(): void {
    // Clear any sensitive form data
    if (this.#formElement) {
      this.#formElement.reset();
    }
  }

  /**
   * Handle attribute changes
   */
  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#formElement) return;

    switch (name) {
      case 'security-tier':
        this.#securityTier = (newValue || SecurityTier.PUBLIC) as SecurityTierValue;
        break;
      case 'action':
        this.#formElement.action = newValue!;
        break;
      case 'method':
        this.#formElement.method = newValue!;
        break;
      case 'csrf-token':
        if (this.#csrfInput) {
          this.#csrfInput.value = newValue!;
        }
        break;
    }
  }

  /**
   * Get security tier
   */
  get securityTier(): SecurityTierValue {
    return this.#securityTier;
  }

  /**
   * Sanitize a value to prevent XSS
   *
   * Uses the same div.textContent round-trip as SecureBaseComponent to correctly
   * handle all injection vectors (attribute injection, entity encoding, etc).
   */
  sanitizeValue(value: string): string {
    if (typeof value !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /**
   * Audit log helper
   */
  audit(action: string, data: Record<string, unknown>): void {
    if (console.debug) {
      console.debug(`[secure-form] ${action}`, data);
    }
  }

  /**
   * Check rate limit (stub - implement proper rate limiting in production)
   */
  checkRateLimit(): { allowed: boolean; retryAfter: number } {
    return { allowed: true, retryAfter: 0 };
  }
}

// Define the custom element
customElements.define('secure-form', SecureForm);

export default SecureForm;
