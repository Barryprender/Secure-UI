/**
 * Base component class for Secure-UI. All field components extend this.
 *
 * Provides: closed Shadow DOM, security tier enforcement (fail-secure default
 * CRITICAL, immutable after init), XSS sanitization, rate limiting, audit
 * logging, injection detection, and field-level behavioural telemetry.
 */

import {
  SecurityTier,
  getTierConfig,
  isValidTier,
} from './security-config.js';

import type {
  SecurityTierValue,
  TierConfig,
  ValidationResult,
  ValidationOptions,
  RateLimitResult,
  RateLimitState,
  AuditLogEntry,
  FieldTelemetry,
  FieldTelemetryState,
  ThreatDetectedDetail
} from './types.js';

export abstract class SecureBaseComponent extends HTMLElement {
  /** Maximum number of entries retained in the in-memory audit log */
  static readonly #MAX_AUDIT_LOG_SIZE = 1000;

  // Human-readable labels for each injection pattern ID.
  // Used by components that opt into inline threat feedback UI.
  static readonly #THREAT_LABELS: Readonly<Record<string, string>> = {
    'script-tag':      'Script injection blocked',
    'js-protocol':     'JavaScript protocol blocked',
    'event-handler':   'Event handler injection blocked',
    'html-injection':  'HTML element injection blocked',
    'css-expression':  'CSS expression injection blocked',
    'vbscript':        'VBScript injection blocked',
    'data-uri-html':   'Data URI injection blocked',
    'template-syntax': 'Template injection blocked',
  };

  static readonly #INJECTION_PATTERNS: ReadonlyArray<{
    readonly id: string;
    readonly pattern: RegExp;
  }> = [
    { id: 'script-tag',      pattern: /<script[\s>/]/i },
    { id: 'js-protocol',     pattern: /javascript\s*:/i },
    { id: 'event-handler',   pattern: /\bon\w+\s*=/i },
    { id: 'html-injection',  pattern: /<\s*(img|svg|iframe|object|embed|link|meta|base)[^>]*/i },
    { id: 'css-expression',  pattern: /expression\s*\(/i },
    { id: 'vbscript',        pattern: /vbscript\s*:/i },
    { id: 'data-uri-html',   pattern: /data:\s*text\/html/i },
    { id: 'template-syntax', pattern: /\{\{[\s\S]*?\}\}/ },
  ];

  #securityTier: SecurityTierValue = SecurityTier.CRITICAL as SecurityTierValue;
  #config: TierConfig;
  #shadow: ShadowRoot;
  #auditLog: AuditLogEntry[] = [];
  #externalErrorEl: HTMLDivElement | null = null;
  #rateLimitState: RateLimitState = {
    attempts: 0,
    windowStart: Date.now()
  };
  #initialized: boolean = false;
  #telemetryState: FieldTelemetryState = {
    focusAt: null,
    firstKeystrokeAt: null,
    blurAt: null,
    keyCount: 0,
    correctionCount: 0,
    pasteDetected: false,
    autofillDetected: false,
    focusCount: 0,
    blurWithoutChange: 0,
    lastInputLength: 0,
  };

  // Closed shadow DOM prevents external JS from accessing internal DOM.
  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'closed' });
    this.#config = getTierConfig(this.#securityTier);
  }

  static get observedAttributes(): string[] {
    return ['security-tier', 'disabled', 'readonly', 'threat-feedback'];
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialize();
      this.#initialized = true;
    }
  }

  #initialize(): void {
    this.initializeSecurity();
    this.#render();
  }

  /**
   * Initialize security tier, config, and audit logging without triggering render.
   *
   * Components that manage their own rendering (e.g. secure-table) can call this
   * from their connectedCallback instead of super.connectedCallback() to get
   * security initialization without the base render lifecycle.
   * @protected
   */
  protected initializeSecurity(): void {
    const tierAttr = this.getAttribute('security-tier');
    if (tierAttr && isValidTier(tierAttr)) {
      this.#securityTier = tierAttr;
    }

    this.#config = getTierConfig(this.#securityTier);

    this.#audit('component_initialized', {
      tier: this.#securityTier,
      timestamp: new Date().toISOString()
    });
  }

  // security-tier is immutable after init to prevent privilege escalation.
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'security-tier' && this.#initialized) {
      console.warn(
        `Security tier cannot be changed after initialization. ` +
        `Attempted change from "${oldValue}" to "${newValue}" blocked.`
      );
      if (oldValue !== null) {
        this.setAttribute('security-tier', oldValue);
      }
      return;
    }

    if (this.#initialized) {
      this.handleAttributeChange(name, oldValue, newValue);
    }
  }

  protected handleAttributeChange(_name: string, _oldValue: string | null, _newValue: string | null): void {
    // Override in child classes to react to attribute changes.
  }

  #render(): void {
    this.#shadow.innerHTML = '';
    this.addComponentStyles(new URL('./base.css', import.meta.url).href);

    const content = this.render();
    if (content) {
      this.#shadow.appendChild(content);
    }

    // External error slot — written by secure-form to surface form-level errors
    // and telemetry warnings on individual fields without touching their internal
    // validation state.
    this.#externalErrorEl = document.createElement('div');
    this.#externalErrorEl.className = 'external-error hidden';
    this.#externalErrorEl.setAttribute('aria-live', 'polite');
    this.#shadow.appendChild(this.#externalErrorEl);
  }

  /**
   * Returns the base stylesheet URL or inlined CSS text (bundle mode).
   * Pass the return value directly to addComponentStyles().
   * @protected
   */
  protected getBaseStylesheetUrl(): string {
    return new URL('./base.css', import.meta.url).href;
  }

  /**
   * Inject a component stylesheet into the shadow root.
   *
   * Accepts either:
   * - A URL string (from import.meta.url) → injected as <link rel="stylesheet">
   *   which satisfies strict CSP style-src 'self' without unsafe-inline.
   * - Inlined CSS text (bundle mode) → applied via CSSStyleSheet.replaceSync() /
   *   adoptedStyleSheets. Constructable stylesheets are explicitly exempt from the
   *   style-src 'unsafe-inline' restriction (that restriction applies only to
   *   <style> elements and inline style="" attributes).
   *
   * Detection: CSS text always contains `{`; resolved URLs never do.
   * @protected
   */
  protected addComponentStyles(cssInput: string): void {
    if (cssInput.includes('{')) {
      // CSS text — bundle mode.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssInput);
      this.#shadow.adoptedStyleSheets = [...this.#shadow.adoptedStyleSheets, sheet];
    } else {
      // URL — link-based injection (dev / ESM mode).
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssInput;
      this.#shadow.appendChild(link);
    }
  }

  protected abstract render(): DocumentFragment | HTMLElement | null;

  /** div.textContent round-trip — safe HTML-entity encoding, no innerHTML needed. */
  protected sanitizeValue(value: string): string {
    if (typeof value !== 'string') {
      return '';
    }

    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  protected validateInput(value: string, options: ValidationOptions = {}): ValidationResult {
    const errors: string[] = [];
    const config = this.#config;

    const isRequired = options.required !== undefined ? options.required : config.validation.required;
    if (isRequired && (!value || value.trim().length === 0)) {
      errors.push('This field is required');
    }

    const maxLength = options.maxLength || config.validation.maxLength;
    if (value && value.length > maxLength) {
      errors.push(`Value exceeds maximum length of ${maxLength}`);
    }

    const minLength = options.minLength || 0;
    if (value && value.length < minLength) {
      errors.push(`Value must be at least ${minLength} characters`);
    }

    const pattern = options.pattern || config.validation.pattern;
    if (pattern && value && !pattern.test(value)) {
      errors.push('Value does not match required format');
    }

    if (config.validation.strict && errors.length > 0) {
      this.#audit('validation_failed', {
        errors,
        valueLength: value ? value.length : 0
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
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
  protected checkRateLimit(): RateLimitResult {
    if (!this.#config.rateLimit.enabled) {
      return { allowed: true, retryAfter: 0 };
    }

    const now = Date.now();
    const windowMs = this.#config.rateLimit.windowMs;

    if (now - this.#rateLimitState.windowStart > windowMs) {
      this.#rateLimitState.attempts = 0;
      this.#rateLimitState.windowStart = now;
    }

    if (this.#rateLimitState.attempts >= this.#config.rateLimit.maxAttempts) {
      const retryAfter = windowMs - (now - this.#rateLimitState.windowStart);
      this.#audit('rate_limit_exceeded', {
        attempts: this.#rateLimitState.attempts,
        retryAfter
      });
      return { allowed: false, retryAfter };
    }

    this.#rateLimitState.attempts++;

    return { allowed: true, retryAfter: 0 };
  }

  #audit(event: string, data: Record<string, unknown> = {}): void {
    const config = this.#config.audit;

    const shouldLog =
      (event.includes('access') && config.logAccess) ||
      (event.includes('change') && config.logChanges) ||
      (event.includes('submit') && config.logSubmission) ||
      event.includes('initialized') ||
      event.includes('rate_limit') ||
      event.includes('validation') ||
      event.includes('threat');

    if (!shouldLog) {
      return;
    }

    const logEntry: AuditLogEntry = {
      event,
      tier: this.#securityTier,
      timestamp: new Date().toISOString(),
      data: Object.keys(data).length > 0 ? data : undefined,
    };

    if (config.includeMetadata) {
      logEntry.userAgent = navigator.userAgent;
      logEntry.language = navigator.language;
    }

    // Cap log size to prevent unbounded memory growth (DoS mitigation)
    if (this.#auditLog.length >= SecureBaseComponent.#MAX_AUDIT_LOG_SIZE) {
      this.#auditLog.shift();
    }
    this.#auditLog.push(logEntry);

    this.dispatchEvent(
      new CustomEvent('secure-audit', {
        detail: logEntry,
        bubbles: true,
        composed: true
      })
    );
  }

  get shadowRoot(): ShadowRoot {
    return this.#shadow;
  }

  get securityTier(): SecurityTierValue {
    return this.#securityTier;
  }

  get config(): TierConfig {
    return this.#config;
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.#auditLog];
  }

  /**
   * Display a form-level message on this field.
   * Called by secure-form to surface injection errors ('error') or
   * behavioural risk warnings ('warning') without disturbing the field's
   * own validation state.
   */
  reportError(message: string, variant: 'error' | 'warning' = 'error'): void {
    if (!this.#externalErrorEl) return;
    this.#externalErrorEl.textContent = message;
    this.#externalErrorEl.dataset['variant'] = variant;
    // role="alert" triggers assertive announcement for errors; polite aria-live
    // handles warnings — only promote to alert when showing an error message.
    if (variant === 'error') {
      this.#externalErrorEl.setAttribute('role', 'alert');
    } else {
      this.#externalErrorEl.removeAttribute('role');
    }
    this.#externalErrorEl.classList.remove('hidden');
  }

  /** Clear any message previously set by reportError(). */
  clearExternalError(): void {
    if (!this.#externalErrorEl) return;
    this.#externalErrorEl.removeAttribute('role');
    this.#externalErrorEl.classList.add('hidden');
    this.#externalErrorEl.textContent = '';
    delete this.#externalErrorEl.dataset['variant'];
  }

  protected clearAuditLog(): void {
    this.#auditLog = [];
  }

  protected audit(event: string, data: Record<string, unknown>): void {
    this.#audit(event, data);
  }

  /**
   * Scans value against known client-side injection patterns and fires a
   * `secure-threat-detected` event on the first match.
   *
   * ⚠ THIS IS A UX CONTROL, NOT AN XSS PREVENTION MECHANISM.
   * It gives users early feedback that their input looks malicious and gives
   * your server logs an early signal. It does NOT prevent XSS — a determined
   * attacker can bypass client-side checks trivially. Real XSS prevention
   * happens server-side through output encoding, a strict CSP, and input
   * sanitization at the persistence layer. Never rely on this alone.
   *
   * First match wins; the raw value is intentionally absent from the event.
   * showFeedback activates the inline threat UI on the field.
   */
  protected detectInjection(value: string, fieldName: string, showFeedback = false): void {
    const feedbackEnabled = showFeedback || this.hasAttribute('threat-feedback');
    for (const { id, pattern } of SecureBaseComponent.#INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        this.audit('threat_detected', {
          fieldName,
          patternId: id,
          threatType: 'injection',
        });
        this.dispatchEvent(new CustomEvent<ThreatDetectedDetail>('secure-threat-detected', {
          detail: {
            fieldName,
            threatType: 'injection',
            patternId: id,
            tier: this.securityTier,
            timestamp: Date.now(),
          },
          bubbles: true,
          composed: true,
        }));
        if (feedbackEnabled) {
          this.showThreatFeedback(id);
        }
        return; // first match only
      }
    }
    // No threat found — clear any lingering feedback
    if (feedbackEnabled) {
      this.clearThreatFeedback();
    }
  }

  // Override in child classes that render inline threat UI.
  protected showThreatFeedback(_patternId: string): void {}
  protected clearThreatFeedback(): void {}

  protected getThreatLabel(patternId: string): string {
    return SecureBaseComponent.#THREAT_LABELS[patternId] ?? `Injection blocked: ${patternId}`;
  }

  protected rerender(): void {
    this.#render();
  }

  protected recordTelemetryFocus(): void {
    const t = this.#telemetryState;
    t.focusAt = Date.now();
    t.blurAt = null;
    t.focusCount++;
    // snapshot input length at focus so we can detect blur-without-change
    const el = this.shadowRoot.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]), textarea, select'
    );
    t.lastInputLength = el ? el.value.length : 0;
  }

  protected recordTelemetryInput(event: Event): void {
    const t = this.#telemetryState;
    const now = Date.now();

    if (t.firstKeystrokeAt === null) {
      t.firstKeystrokeAt = now;
    }

    const inputEvent = event as InputEvent;
    const inputType = inputEvent.inputType ?? '';

    if (inputType === 'insertFromPaste' || inputType === 'insertFromPasteAsQuotation') {
      t.pasteDetected = true;
    } else if (inputType === 'insertReplacementText') {
      t.autofillDetected = true;
    } else if (inputType === '') {
      // Firefox fires input events with empty inputType for autocomplete selections.
      // Programmatic .value assignments do not fire input events, so an empty inputType
      // on an actual input event reliably indicates browser fill on input/textarea.
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        t.autofillDetected = true;
      }
    } else if (
      inputType.startsWith('delete') ||
      inputType === 'historyUndo' ||
      inputType === 'historyRedo'
    ) {
      t.correctionCount++;
    } else {
      t.keyCount++;
    }

    const el = event.target as HTMLInputElement | null;
    if (el) t.lastInputLength = el.value.length;
  }

  protected recordTelemetryBlur(): void {
    const t = this.#telemetryState;
    t.blurAt = Date.now();

    const el = this.shadowRoot.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]), textarea, select'
    );
    const currentLength = el ? el.value.length : 0;
    if (currentLength === t.lastInputLength && t.keyCount === 0 && !t.pasteDetected) {
      t.blurWithoutChange++;
    }
  }

  /** Wire up CSS-animation-based autofill detection for an input or textarea element.
   * Call once per element during event listener setup. Works alongside the
   * `insertReplacementText` (Chrome) and empty-inputType (Firefox) paths in
   * recordTelemetryInput to give full cross-browser coverage. */
  protected setupAutofillDetection(el: HTMLInputElement | HTMLTextAreaElement): void {
    el.addEventListener('animationstart', (e: Event) => {
      if ((e as AnimationEvent).animationName === 'secure-autofill-detect') {
        this.#telemetryState.autofillDetected = true;
      }
    });
  }

  /** Computed behavioural signals for this field. No raw values or PII. */
  getFieldTelemetry(): FieldTelemetry {
    const t = this.#telemetryState;
    const focusAt = t.focusAt ?? Date.now();
    const firstKeystrokeAt = t.firstKeystrokeAt;
    const blurAt = t.blurAt ?? Date.now();

    const dwell = firstKeystrokeAt !== null ? firstKeystrokeAt - focusAt : 0;
    const completionTime = firstKeystrokeAt !== null ? blurAt - firstKeystrokeAt : 0;
    const durationSec = completionTime / 1000;
    const velocity = durationSec > 0 ? t.keyCount / durationSec : 0;

    return {
      dwell,
      completionTime,
      velocity: Math.round(velocity * 100) / 100,
      corrections: t.correctionCount,
      pasteDetected: t.pasteDetected,
      autofillDetected: t.autofillDetected,
      focusCount: t.focusCount,
      blurWithoutChange: t.blurWithoutChange,
    };
  }

  #resetTelemetryState(): void {
    this.#telemetryState = {
      focusAt: null,
      firstKeystrokeAt: null,
      blurAt: null,
      keyCount: 0,
      correctionCount: 0,
      pasteDetected: false,
      autofillDetected: false,
      focusCount: 0,
      blurWithoutChange: 0,
      lastInputLength: 0,
    };
  }

  disconnectedCallback(): void {
    this.#rateLimitState = { attempts: 0, windowStart: Date.now() };
    this.#resetTelemetryState();

    if (this.#config.audit.logAccess) {
      this.#audit('component_disconnected', {
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default SecureBaseComponent;
