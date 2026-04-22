
import { SecurityTier, TIER_CONFIG, isValidTier } from '../../core/security-config.js';
import type {
  SecurityTierValue,
  AuditLogEntry,
  FieldTelemetry,
  FieldTelemetrySnapshot,
  SessionTelemetry,
  ThreatDetectedDetail
} from '../../core/types.js';

// Light-DOM form component — extends HTMLElement directly (no Shadow DOM) so that
// native form submission, label association, and browser validation work correctly.
export class SecureForm extends HTMLElement {
  static #stylesAdded: boolean = false;
  static readonly #MAX_AUDIT_LOG_SIZE = 1000;

  #formElement: HTMLFormElement | null = null;
  #auditLog: AuditLogEntry[] = [];
  #csrfInput: HTMLInputElement | null = null;
  #statusElement: HTMLDivElement | null = null;
  #isSubmitting: boolean = false;
  #sessionStart: number = Date.now();

  #rateLimitState: { attempts: number; windowStart: number } = {
    attempts: 0,
    windowStart: Date.now()
  };

  #instanceId: string = `secure-form-${Math.random().toString(36).substring(2, 11)}`;
  #securityTier: SecurityTierValue = SecurityTier.CRITICAL as SecurityTierValue;

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

  constructor() {
    super(); // No Shadow DOM — light DOM required for native form participation.
  }

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
    if (tierAttr && isValidTier(tierAttr)) {
      this.#securityTier = tierAttr;
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
      const existingCsrf = existingForm.querySelector<HTMLInputElement>(`input[name="${CSS.escape(csrfFieldName)}"]`);
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
    if (!SecureForm.#stylesAdded) {
      const cssInput = new URL('./secure-form.css', import.meta.url).href;
      if (cssInput.includes('{')) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssInput);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssInput;
        document.head.appendChild(link);
      }
      SecureForm.#stylesAdded = true;
    }
  }

  /** Returns true for relative URLs and absolute URLs on the same origin.
   *  Rejects cross-origin URLs and non-http(s) schemes (javascript:, data:, etc.). */
  #isSameOriginOrRelative(url: string): boolean {
    if (!url) return true;
    try {
      const parsed = new URL(url, window.location.href);
      return (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.origin === window.location.origin
      );
    } catch {
      return false;
    }
  }

  #applyFormAttributes(): void {
    const action = this.getAttribute('action');
    if (action) {
      if (this.#isSameOriginOrRelative(action)) {
        this.#formElement!.action = action;
      } else {
        console.warn(
          `SecureForm: cross-origin or non-http action "${action}" rejected. ` +
          `Forms must submit to the same origin to prevent credential exfiltration.`
        );
        this.audit('form_action_rejected', { action });
      }
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

  #attachEventListeners(): void {
    this.#formElement!.addEventListener('submit', (e: Event) => {
      void this.#handleSubmit(e);
    });

    // Listen for secure field events
    this.addEventListener('secure-input-change', (e: Event) => {
      this.#handleFieldChange(e);
    });

    this.addEventListener('secure-textarea-change', (e: Event) => {
      this.#handleFieldChange(e);
    });

    this.addEventListener('secure-select-change', (e: Event) => {
      this.#handleFieldChange(e);
    });

    this.addEventListener('secure-threat-detected', (e: Event) => {
      const detail = (e as CustomEvent<ThreatDetectedDetail>).detail;
      if (!detail) return;
      this.#detectedThreats.push(detail);
      if (detail.threatType === 'injection') {
        this.#setFormState('blocked');
        this.#reportFieldError(
          detail.fieldName,
          'Injection attempt blocked — clear this field to submit',
          'error'
        );
      }
    });
  }

  #handleFieldChange(_event: Event): void {
    this.#clearStatus();
  }

  async #handleSubmit(event: Event): Promise<void> {
    const shouldEnhance = this.hasAttribute('use-fetch');

    if (this.#isSubmitting) {
      event.preventDefault();
      return;
    }

    // Detect absent CSRF token on sensitive/critical tiers at submission time
    if (
      (this.#securityTier === SecurityTier.SENSITIVE || this.#securityTier === SecurityTier.CRITICAL) &&
      !this.#csrfInput?.value
    ) {
      this.dispatchEvent(new CustomEvent<ThreatDetectedDetail>('secure-threat-detected', {
        detail: {
          fieldName: this.#instanceId,
          threatType: 'csrf-token-absent',
          patternId: 'csrf-token-absent',
          tier: this.#securityTier,
          timestamp: Date.now(),
        },
        bubbles: true,
        composed: true,
      }));
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
      this.#showStatus(validation.errors.join(', '), 'error');
      this.audit('form_validation_failed', {
        formId: this.#instanceId,
        errors: validation.errors
      });
      return;
    }

    // Block if any injection threat was detected during this session
    const hasInjection = this.#detectedThreats.some(t => t.threatType === 'injection');
    if (hasInjection) {
      event.preventDefault();
      this.#setFormState('blocked');
      this.#showStatus(
        'Submission blocked: injection attempt detected. Clear the highlighted field(s) and try again.',
        'error'
      );
      this.audit('form_blocked_injection', {
        formId: this.#instanceId,
        count: this.#detectedThreats.filter(t => t.threatType === 'injection').length
      });
      return;
    }

    if (!shouldEnhance) {
      this.#syncSecureInputsToForm();

      this.audit('form_submitted_native', {
        formId: this.#instanceId,
        action: this.#formElement!.action,
        method: this.#formElement!.method
      });
      return;
    }

    event.preventDefault();

    this.#isSubmitting = true;
    this.#showStatus('Submitting...', 'info');
    this.#disableForm();

    const formData = this.#collectFormData();
    const telemetry = this.#collectTelemetry();

    // Non-blocking risk warnings — annotate fields, do not prevent submission
    this.#applyRiskWarnings(telemetry.fields);

    // Audit log submission (include risk score for server-side correlation)
    this.audit('form_submitted_enhanced', {
      formId: this.#instanceId,
      action: this.#formElement!.action,
      method: this.#formElement!.method,
      fieldCount: Object.keys(formData).length,
      riskScore: telemetry.riskScore,
      riskSignals: telemetry.riskSignals
    });

    const preSubmitEvent = new CustomEvent('secure-form-submit', {
      detail: {
        formData,
        telemetry,
        cancelSubmission: () => {
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
      this.#setFormState('success');
      if (this.#formStateTimeout !== null) clearTimeout(this.#formStateTimeout);
      this.#formStateTimeout = setTimeout(() => {
        this.#setFormState(null);
        this.#formStateTimeout = null;
      }, 3000);
      this.#clearAllExternalErrors();
    } catch (error) {
      this.#setFormState('error');
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

  // Shadow DOM inputs can't participate in native form submission — create/update
  // light-DOM hidden inputs so the browser includes their values on submit.
  #syncSecureInputsToForm(): void {
    const secureInputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload');

    secureInputs.forEach((input) => {
      const name = input.getAttribute('name');
      if (!name) return;

      // Strip name from server-rendered fallback inputs so the browser doesn't
      // submit their (empty) values alongside the synced hidden input.
      const escapedName = CSS.escape(name);
      const nativeFallbacks = input.querySelectorAll(`input[name="${escapedName}"], textarea[name="${escapedName}"], select[name="${escapedName}"]`);
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

  #validateAllFields(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Find all secure input components within the form
    const inputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload');

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

  #collectFormData(): Record<string, string> {
    const formData = Object.create(null) as Record<string, string>;

    // Collect from secure components within the form
    const secureInputs = this.#formElement!.querySelectorAll('secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload');

    secureInputs.forEach((input) => {
      const typedInput = input as HTMLElement & { name: string; value: string };
      if (typedInput.name) {
        formData[typedInput.name] = typedInput.value;
      }
    });

    // Shadow DOM inputs are not reachable here; only actual light-DOM inputs are collected.
    const standardInputs = this.#formElement!.querySelectorAll('input:not([type="hidden"]), textarea, select');

    standardInputs.forEach((input) => {
      const typedInput = input as HTMLInputElement;
      if (typedInput.name) {
        formData[typedInput.name] = this.sanitizeValue(typedInput.value);
      }
    });

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
  #detectedThreats: ThreatDetectedDetail[] = [];
  #formStateTimeout: ReturnType<typeof setTimeout> | null = null;

  #submitAbortController: AbortController | null = null;

  async #submitForm(
    formData: Record<string, string>,
    telemetry: SessionTelemetry
  ): Promise<Response> {
    // Abort any in-flight request before starting a new one
    this.#submitAbortController?.abort();
    this.#submitAbortController = new AbortController();

    const action = this.#formElement!.action;
    const method = this.#formElement!.method;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const csrfHeaderName = this.getAttribute('csrf-header-name');
    if (csrfHeaderName && this.#csrfInput) {
      headers[csrfHeaderName] = this.#csrfInput.value;
    }

    const payload: Record<string, unknown> = { ...formData, _telemetry: telemetry };

    const response = await fetch(action, {
      method: method,
      headers: headers,
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow',
      signal: this.#submitAbortController.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    this.#showStatus('Form submitted successfully!', 'success');

    // formData and the raw Response object are intentionally excluded.
    // formData contains sensitive field values that must not broadcast globally
    // via a bubbling composed event. The Response object exposes server headers
    // including Set-Cookie. Consumers that need field values should read them
    // from the elements directly; those that need response details should use
    // their own fetch logic via the secure-form-submit cancelSubmission() API.
    this.dispatchEvent(
      new CustomEvent('secure-form-success', {
        detail: { status: response.status, ok: response.ok, telemetry },
        bubbles: true,
        composed: true
      })
    );

    return response;
  }

  #disableForm(): void {
    const controls = this.#formElement!.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
      (control as HTMLInputElement).disabled = true;
    });

    const secureFields = this.querySelectorAll('secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload');
    secureFields.forEach((field) => {
      field.setAttribute('disabled', '');
    });
  }

  #enableForm(): void {
    const controls = this.#formElement!.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
      (control as HTMLInputElement).disabled = false;
    });

    const secureFields = this.querySelectorAll('secure-input, secure-textarea, secure-select, secure-datetime, secure-file-upload');
    secureFields.forEach((field) => {
      field.removeAttribute('disabled');
    });
  }

  #showStatus(message: string, type: string = 'info'): void {
    this.#statusElement!.textContent = message;
    this.#statusElement!.className = `form-status form-status-${type}`;
  }

  #clearStatus(): void {
    this.#statusElement!.textContent = '';
    this.#statusElement!.className = 'form-status form-status-hidden';
  }

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
    const { riskScore, riskSignals } = this.#computeRiskScore(fields, sessionDuration, this.#detectedThreats);

    return {
      sessionDuration,
      fieldCount: fields.length,
      fields,
      riskScore,
      riskSignals,
      submittedAt: new Date().toISOString(),
      detectedThreats: this.#detectedThreats.length > 0 ? [...this.#detectedThreats] : undefined,
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
    sessionDuration: number,
    threats: ThreatDetectedDetail[] = []
  ): { riskScore: number; riskSignals: string[] } {
    const signals: string[] = [];
    let score = 0;

    // Threat events are the strongest signal — weight them first
    const injections = threats.filter(t => t.threatType === 'injection');
    const csrfAbsent = threats.some(t => t.threatType === 'csrf-token-absent');
    if (injections.length > 0) {
      score += 40;
      signals.push('injection_detected');
    }
    if (csrfAbsent) {
      score += 20;
      signals.push('csrf_token_absent');
    }

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

  #setFormState(state: 'success' | 'blocked' | 'error' | null): void {
    if (state === null) {
      delete this.dataset['state'];
    } else {
      this.dataset['state'] = state;
    }
  }

  #clearAllExternalErrors(): void {
    const fields = this.querySelectorAll<HTMLElement>(
      'secure-input, secure-textarea, secure-select, secure-datetime, secure-card, secure-file-upload'
    );
    fields.forEach(field => {
      (field as HTMLElement & { clearExternalError?: () => void }).clearExternalError?.();
    });
  }

  #reportFieldError(
    fieldName: string,
    message: string,
    variant: 'error' | 'warning' = 'error'
  ): void {
    if (!fieldName) return;
    const field = this.querySelector<HTMLElement>(
      `[name="${CSS.escape(fieldName)}"]`
    ) as (HTMLElement & { reportError?: (msg: string, variant?: string) => void }) | null;
    field?.reportError?.(message, variant);
  }

  #applyRiskWarnings(fields: FieldTelemetrySnapshot[]): void {
    for (const snapshot of fields) {
      let warning: string | null = null;
      if (snapshot.focusCount === 0) {
        warning = 'Field was filled without interaction';
      } else if (snapshot.velocity > 15) {
        warning = 'Unusually fast input detected';
      } else if (snapshot.pasteDetected && snapshot.velocity === 0) {
        warning = 'Paste-only entry detected';
      } else if (snapshot.focusCount > 1 && snapshot.blurWithoutChange > 1) {
        warning = 'Repeated focus without entry';
      } else if (snapshot.corrections > 5) {
        warning = 'Excessive corrections detected';
      }
      if (warning !== null) {
        this.#reportFieldError(snapshot.fieldName, warning, 'warning');
      }
    }
  }

  getData(): Record<string, string> {
    return this.#collectFormData();
  }

  reset(): void {
    if (this.#formElement) {
      this.#formElement.reset();
      this.#clearStatus();
      this.#detectedThreats = [];
      if (this.#formStateTimeout !== null) {
        clearTimeout(this.#formStateTimeout);
        this.#formStateTimeout = null;
      }
      this.#setFormState(null);
      this.#clearAllExternalErrors();

      this.audit('form_reset', {
        formId: this.#instanceId
      });
    }
  }

  submit(): void {
    if (this.#formElement) {
      this.#formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  get valid(): boolean {
    const validation = this.#validateAllFields();
    return validation.valid;
  }

  disconnectedCallback(): void {
    this.#submitAbortController?.abort();
    if (this.#formStateTimeout !== null) {
      clearTimeout(this.#formStateTimeout);
      this.#formStateTimeout = null;
    }
    if (this.#formElement) {
      this.#formElement.reset();
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.#formElement) return;

    switch (name) {
      case 'security-tier':
        // Tier is immutable after connectedCallback to prevent privilege escalation.
        // We intentionally do NOT revert the DOM attribute — doing so would trigger
        // attributeChangedCallback again and cause infinite recursion. The internal
        // #securityTier field is never updated here, so component behaviour stays correct
        // regardless of what the DOM attribute shows.
        console.warn(
          `SecureForm: security-tier cannot be changed after initialization. ` +
          `Attempted change from "${oldValue}" to "${newValue}" blocked.`
        );
        return;
      case 'action':
        if (newValue && this.#isSameOriginOrRelative(newValue)) {
          this.#formElement.action = newValue;
        } else if (newValue) {
          console.warn(
            `SecureForm: cross-origin or non-http action "${newValue}" rejected.`
          );
          this.audit('form_action_rejected', { action: newValue });
        }
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

  get securityTier(): SecurityTierValue {
    return this.#securityTier;
  }

  sanitizeValue(value: string): string {
    if (typeof value !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  audit(action: string, data: Record<string, unknown>): void {
    const tierConfig = TIER_CONFIG[this.#securityTier];

    const entry: AuditLogEntry = {
      event: action,
      tier: this.#securityTier,
      timestamp: new Date().toISOString(),
      ...(Object.keys(data).length > 0 ? { data } : {}),
      ...(tierConfig.audit.includeMetadata ? {
        userAgent: navigator.userAgent,
        language: navigator.language,
      } : {}),
    };

    if (this.#auditLog.length >= SecureForm.#MAX_AUDIT_LOG_SIZE) {
      this.#auditLog.shift();
    }
    this.#auditLog.push(entry);

    this.dispatchEvent(new CustomEvent<AuditLogEntry>('secure-audit', {
      detail: entry,
      bubbles: true,
      composed: true,
    }));
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.#auditLog];
  }

  /**
   * Client-side rate limiting — resets on page reload, new tab, and incognito.
   *
   * ⚠ DEPLOYMENT REQUIREMENT: This is a UX safeguard only. It provides zero
   * protection against an attacker who reloads the page or opens a second tab.
   * You MUST enforce rate limits server-side (e.g. per-IP, per-account, via a
   * WAF rule, or with a token-bucket at the API layer). Do not treat this as a
   * security control in isolation.
   */
  checkRateLimit(): { allowed: boolean; retryAfter: number } {
    const tierConfig = TIER_CONFIG[this.#securityTier];
    if (!tierConfig.rateLimit.enabled) {
      return { allowed: true, retryAfter: 0 };
    }

    const { maxAttempts, windowMs } = tierConfig.rateLimit;
    const now = Date.now();

    if (now - this.#rateLimitState.windowStart > windowMs) {
      this.#rateLimitState.attempts = 0;
      this.#rateLimitState.windowStart = now;
    }

    if (this.#rateLimitState.attempts >= maxAttempts) {
      const retryAfter = windowMs - (now - this.#rateLimitState.windowStart);
      return { allowed: false, retryAfter };
    }

    this.#rateLimitState.attempts++;
    return { allowed: true, retryAfter: 0 };
  }
}

customElements.define('secure-form', SecureForm);
