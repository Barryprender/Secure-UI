
import {
  SecurityTier,
  TIER_CONFIG,
  isValidTier,
  SECURE_FIELD_SELECTOR
} from '../../core/security-config.js';
import type {
  SecurityTierValue,
  AuditLogEntry,
  FieldTelemetry,
  FieldTelemetrySnapshot,
  SessionTelemetry,
  ThreatDetectedDetail,
  ThreatClearedDetail
} from '../../core/types.js';

// Light-DOM form component — extends HTMLElement directly (no Shadow DOM) so that
// native form submission, label association, and browser validation work correctly.
export class SecureForm extends HTMLElement {
  static #stylesAdded: boolean = false;
  static readonly #MAX_AUDIT_LOG_SIZE = 1000;

  /**
   * Every secure field tag. Used for validation, telemetry aggregation and for
   * deciding whether a threat event came from a field this form owns.
   *
   * Sourced from the shared registry in security-config, never re-typed here:
   * a local copy is what let this list and <secure-submit-button>'s diverge.
   */
  static readonly #SECURE_FIELD_SELECTOR = SECURE_FIELD_SELECTOR;

  /**
   * Fields whose value may be mirrored into a light-DOM hidden input for native
   * submission. secure-card is deliberately excluded: PCI forbids the PAN or CVC
   * reaching the light DOM. It contributes only its own last4/expiry/holder
   * hidden inputs, collected separately in #collectFormData.
   */
  static readonly #SYNCABLE_FIELD_SELECTOR =
    'secure-input, secure-textarea, secure-select, secure-datetime, ' +
    'secure-file-upload, secure-password-confirm';

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
        // Update token value from attribute if it differs. Trimmed for the same
        // reason as #createCsrfField: a whitespace-only token is truthy and would
        // otherwise satisfy the fail-closed gate in #handleSubmit.
        const csrfToken = (this.getAttribute('csrf-token') ?? '').trim();
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

  /**
   * Reject a cross-origin action already present on the form element.
   *
   * ⚠ SECURITY: on the progressive-enhancement path SecureForm adopts a
   * server-rendered `<form>` wholesale. Its own `action` attribute was never
   * read, never validated and never overwritten — only an `action` on the
   * custom element went through #isSameOriginOrRelative. `method` was
   * unconditionally reassigned one line below, which is what made the omission
   * an oversight rather than a decision.
   *
   * The consequence was full credential exfiltration: the native submit path
   * returns without preventDefault(), so the browser POSTed every field to the
   * attacker's origin — and #createCsrfField() had already injected the CSRF
   * token into that same form.
   *
   * Removing the attribute makes the form submit to the current document URL,
   * which is the correct fail-safe.
   */
  #rejectUnsafeFormAction(): void {
    const inherited = this.#formElement?.getAttribute('action');
    if (inherited && !this.#isSameOriginOrRelative(inherited)) {
      this.#formElement!.removeAttribute('action');
      console.warn(
        `SecureForm: cross-origin or non-http action "${inherited}" on the ` +
        `server-rendered form was removed. Forms must submit to the same origin ` +
        `to prevent credential exfiltration.`
      );
      this.audit('form_action_rejected', { action: inherited, source: 'adopted-form' });
    }
  }

  #applyFormAttributes(): void {
    // Validate what the adopted form already carries before considering the
    // custom element's own action.
    this.#rejectUnsafeFormAction();

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

    const rawMethod = (this.getAttribute('method') || 'POST').toUpperCase();
    // Only allow methods that send a request body. GET would append form data
    // to the URL, leaking credentials into server logs and browser history.
    const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const method = (ALLOWED_METHODS as readonly string[]).includes(rawMethod) ? rawMethod : 'POST';
    if (rawMethod !== method) {
      console.warn(`SecureForm: method "${rawMethod}" is not allowed; defaulting to POST.`);
      this.audit('form_method_rejected', { attempted: rawMethod });
    }
    this.#formElement!.method = method;

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
    // Trim: a template rendering `csrf-token="{{ .Token }}"` with an empty token
    // yields `" "`, which is truthy. The gate in #handleSubmit then passed a
    // blank token straight through, turning a fail-closed tier into fail-open.
    const csrfToken = (this.getAttribute('csrf-token') ?? '').trim();

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
      // Only a secure field belonging to this form may write threat state.
      const source = this.#emittingSecureField(e);
      if (!source) return;
      this.#threatRecords.push({ detail, source });
      if (detail.threatType === 'injection') {
        this.#setFormState('blocked');
        this.#reportFieldError(
          detail.fieldName,
          'Injection attempt blocked — clear this field to submit',
          'error'
        );
      }
    });

    // A field that was previously flagged is now clean — drop its recorded
    // threats and lift the block if no injection threats remain. Without this
    // the form stays permanently blocked after a single flagged keystroke, even
    // once the user corrects the field (false positives included).
    //
    // ⚠ SECURITY: the clearing element is resolved from the event path and the
    // record is matched by element identity, never by detail.fieldName. These
    // events are {bubbles:true, composed:true}, so previously ANY descendant —
    // a third-party widget, an injected <div> — could dispatch a forged
    // secure-threat-cleared naming a genuinely flagged field and lift the block
    // with the payload still in place.
    this.addEventListener('secure-threat-cleared', (e: Event) => {
      const detail = (e as CustomEvent<ThreatClearedDetail>).detail;
      if (!detail) return;
      const source = this.#emittingSecureField(e);
      if (!source) return;
      this.#threatRecords = this.#threatRecords.filter(r => r.source !== source);
      const field = source as HTMLElement & { clearExternalError?: () => void };
      field.clearExternalError?.();
      if (!this.#threatRecords.some(r => r.detail.threatType === 'injection')) {
        this.#setFormState(null);
        this.#clearStatus();
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

    // Block submission when CSRF token is absent on SENSITIVE/CRITICAL tiers.
    // A warning-only check is insufficient — an attacker can simply not trigger
    // the threat event. We must prevent the native submit and any fetch path.
    if (
      (this.#securityTier === SecurityTier.SENSITIVE || this.#securityTier === SecurityTier.CRITICAL) &&
      !this.#csrfInput?.value.trim()
    ) {
      event.preventDefault();
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
      this.audit('form_csrf_blocked', { tier: this.#securityTier });
      this.#showStatus('Submission blocked: CSRF token missing.', 'error');
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
      this.#showStatus(validation.errors.join(', '), 'error');
      this.audit('form_validation_failed', {
        formId: this.#instanceId,
        errors: validation.errors
      });
      return;
    }

    // Block if any injection threat was detected during this session
    const hasInjection = this.#threatRecords.some(r => r.detail.threatType === 'injection');
    if (hasInjection) {
      event.preventDefault();
      this.#setFormState('blocked');
      this.#showStatus(
        'Submission blocked: injection attempt detected. Clear the highlighted field(s) and try again.',
        'error'
      );
      this.audit('form_blocked_injection', {
        formId: this.#instanceId,
        count: this.#threatRecords.filter(r => r.detail.threatType === 'injection').length
      });
      return;
    }

    if (!shouldEnhance) {
      // Re-validate immediately before handing control to the browser. Mount-time
      // validation alone leaves a window in which any script can rewrite
      // form.action and have the native submit carry every field — plus the CSRF
      // token — to another origin. This is the last point at which we can stop it.
      const outgoing = this.#formElement!.getAttribute('action');
      if (outgoing && !this.#isSameOriginOrRelative(outgoing)) {
        event.preventDefault();
        this.#formElement!.removeAttribute('action');
        this.#setFormState('blocked');
        this.#showStatus('Submission blocked: the form target is not on this origin.', 'error');
        this.audit('form_action_rejected', { action: outgoing, source: 'submit-time' });
        return;
      }

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

    // cancelSubmission sets this flag synchronously before dispatchEvent returns,
    // so we can check it immediately after without any async gap.
    let submissionCancelled = false;

    // formData is intentionally absent from the event detail — a bubbling composed
    // event carrying credential-class values can be intercepted by any page script.
    // Listeners that need field values should read from the element directly.
    const preSubmitEvent = new CustomEvent('secure-form-submit', {
      detail: {
        telemetry,
        cancelSubmission: () => {
          submissionCancelled = true;
          this.#isSubmitting = false;
          this.#enableForm();
        }
      },
      bubbles: true,
      composed: true,
      cancelable: true
    });

    const shouldContinue = this.dispatchEvent(preSubmitEvent);

    if (!shouldContinue || submissionCancelled) {
      // preventDefault() or cancelSubmission() called — abort fetch
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
    const secureInputs = this.#formElement!.querySelectorAll(SecureForm.#SYNCABLE_FIELD_SELECTOR);

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
      // CSS.escape is mandatory here: a crafted `name` such as
      // `a"], input[type="hidden"][data-secure-input="victim` otherwise selects
      // another field's hidden input and the sync below overwrites its value.
      // An unbalanced quote throws instead, aborting the loop mid-way — and the
      // native path does not preventDefault(), so a partly-synced form submits.
      let hiddenInput = this.#formElement!.querySelector<HTMLInputElement>(
        `input[type="hidden"][data-secure-input="${escapedName}"]`
      );

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
    const inputs = this.#formElement!.querySelectorAll(SecureForm.#SECURE_FIELD_SELECTOR);

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
    const secureInputs = this.#formElement!.querySelectorAll(SecureForm.#SYNCABLE_FIELD_SELECTOR);

    secureInputs.forEach((input) => {
      const typedInput = input as HTMLElement & { name: string; value: string };
      if (!typedInput.name) return;

      // secure-password-confirm has no `value` property and, by design, writes
      // no hidden input — the password must not reach the light DOM. It was
      // therefore collected as `undefined`: inside a <secure-form> the password
      // was silently never submitted, while the form reported success.
      if (input.tagName === 'SECURE-PASSWORD-CONFIRM') {
        const password = (input as HTMLElement & {
          getPasswordValue?: () => string | null;
        }).getPasswordValue?.();
        if (password !== null && password !== undefined) {
          formData[typedInput.name] = password;
        }
        return;
      }

      formData[typedInput.name] = typedInput.value;
    });

    // Shadow DOM inputs are not reachable here; only actual light-DOM inputs are collected.
    // Values are included as-is — sanitizeValue() returns HTML-entity-encoded strings
    // which would corrupt data when JSON-serialised to the server. Output encoding
    // is a server-side responsibility applied at the persistence / rendering layer.
    const standardInputs = this.#formElement!.querySelectorAll('input:not([type="hidden"]), textarea, select');

    standardInputs.forEach((input) => {
      const typedInput = input as HTMLInputElement;
      if (typedInput.name) {
        formData[typedInput.name] = typedInput.value;
      }
    });

    // secure-card exposes its submittable data only through light-DOM hidden
    // inputs ({name}=last4, {name}-expiry, {name}-holder). They are type=hidden,
    // so the standardInputs query above skips them — collect them explicitly.
    // The full PAN and CVC are never in a hidden input by design (PCI DSS), so
    // nothing sensitive is captured here.
    const cardHiddenInputs = this.#formElement!.querySelectorAll<HTMLInputElement>(
      'secure-card input[type="hidden"]'
    );
    cardHiddenInputs.forEach((input) => {
      if (input.name) {
        formData[input.name] = input.value;
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
  // Threats are keyed by the element that raised them, not by a caller-supplied
  // name. The detail still travels to the server; the element never does.
  #threatRecords: { detail: ThreatDetectedDetail; source: Element }[] = [];

  /**
   * Resolve the secure field that actually dispatched a threat event, or null.
   *
   * composedPath()[0] is the true origin even across a shadow boundary, where
   * event.target is retargeted to the host. Returns null for anything that is
   * not a secure field inside this form.
   */
  #emittingSecureField(e: Event): Element | null {
    const origin = (e.composedPath()[0] ?? e.target) as Node | null;
    const el = origin instanceof Element ? origin : null;
    if (!el) return null;
    // The form raises its own threats (e.g. csrf-token-absent) against itself.
    if (el === this) return this;
    const field = el.closest?.(SecureForm.#SECURE_FIELD_SELECTOR) ?? null;
    return field && this.contains(field) ? field : null;
  }
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

    // Resolve the signing promise handed over by secure-telemetry-provider during
    // the synchronous secure-form-submit dispatch. Without this await the
    // envelope was attached after JSON.stringify had already run, so the
    // signature never left the browser and every submission arrived unsigned.
    const signable = telemetry as SessionTelemetry & {
      _env?: unknown;
      _envPromise?: Promise<unknown>;
    };
    if (signable._envPromise) {
      try {
        signable._env = await signable._envPromise;
      } catch {
        // Signing failure must not block submission. The server treats a missing
        // _env as an unsigned, lowest-trust submission.
      }
      delete signable._envPromise;
    }

    const payload: Record<string, unknown> = { ...formData, _telemetry: telemetry };

    const response = await fetch(action, {
      method: method,
      headers: headers,
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      // Action URLs are validated to same-origin only; same-origin mode
      // makes that constraint explicit and prevents accidental cross-origin requests.
      mode: 'same-origin',
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

    const secureFields = this.querySelectorAll(SecureForm.#SECURE_FIELD_SELECTOR);
    secureFields.forEach((field) => {
      field.setAttribute('disabled', '');
    });
  }

  #enableForm(): void {
    const controls = this.#formElement!.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
      (control as HTMLInputElement).disabled = false;
    });

    const secureFields = this.querySelectorAll(SecureForm.#SECURE_FIELD_SELECTOR);
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
    const selector = SecureForm.#SECURE_FIELD_SELECTOR;
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
    const detectedThreats = this.#threatRecords.map(r => r.detail);
    const { riskScore, riskSignals } = this.#computeRiskScore(fields, sessionDuration, detectedThreats);

    return {
      sessionDuration,
      fieldCount: fields.length,
      fields,
      riskScore,
      riskSignals,
      submittedAt: new Date().toISOString(),
      detectedThreats: detectedThreats.length > 0 ? detectedThreats : undefined,
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
      SecureForm.#SECURE_FIELD_SELECTOR
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
      this.#threatRecords = [];
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
      case 'method': {
        const ALLOWED = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
        const candidate = (newValue ?? 'POST').toUpperCase();
        const safe = (ALLOWED as readonly string[]).includes(candidate) ? candidate : 'POST';
        if (candidate !== safe) {
          console.warn(`SecureForm: method "${candidate}" is not allowed; defaulting to POST.`);
          this.audit('form_method_rejected', { attempted: candidate });
        }
        this.#formElement.method = safe;
        break;
      }
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

  // Mirrors SecureBaseComponent.sanitizeValue: strips null bytes and ASCII
  // control characters and returns PLAIN text. It deliberately does NOT
  // HTML-entity-encode — every call site assigns the result to a DOM property
  // (.textContent / .value), where property assignment already prevents HTML
  // injection; entity-encoding there would double-encode (& → &amp;). HTML
  // output encoding is a server-side responsibility at the render layer.
  sanitizeValue(value: string): string {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
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
