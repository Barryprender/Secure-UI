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
  ThreatDetectedDetail,
  ThreatClearedDetail
} from './types.js';

/**
 * The privileged surface of a secure component.
 *
 * ⚠ SECURITY: every member here was previously declared `protected`. TypeScript
 * erases `protected` at compile time, so each one shipped as an ordinary public
 * prototype method — `el.root` handed the closed shadow root (and therefore the
 * raw value of every masked field) to any script on the page, and
 * `el.initializeSecurity()` re-read the `security-tier` attribute, allowing a
 * post-mount downgrade to `public`.
 *
 * These members are now reachable only through {@link internals}, whose lookup
 * table is module-scoped. Unlike a `Symbol` key — which
 * `Object.getOwnPropertySymbols(Object.getPrototypeOf(el))` would reveal — a
 * module-scoped WeakMap is unreachable from outside this module graph, and
 * `internals` is deliberately not re-exported from `src/index.ts`.
 */
export interface ComponentInternals {
  /** The closed shadow root. Never expose this on the prototype. */
  readonly root: ShadowRoot;
  addComponentStyles(cssInput: string): void;
  getBaseStylesheetUrl(): string;
  audit(event: string, data?: Record<string, unknown>): void;
  /** Empties the in-memory audit log. Privileged: external code must never be
   *  able to erase audit evidence. */
  clearAuditLog(): void;
  checkRateLimit(): RateLimitResult;
  detectInjection(value: string, fieldName: string, showFeedback?: boolean): void;
  rerender(): void;
  recordTelemetryFocus(): void;
  recordTelemetryInput(event: Event): void;
  recordTelemetryBlur(): void;
  setupAutofillDetection(el: HTMLInputElement | HTMLTextAreaElement): void;
}

const INTERNALS = new WeakMap<object, ComponentInternals>();

/**
 * Privileged accessor for secure components. Module-scoped by design — see
 * {@link ComponentInternals}. Importable by sibling modules inside this
 * package; unreachable from consumer code because `src/index.ts` does not
 * re-export it.
 */
export function internals(component: SecureBaseComponent): ComponentInternals {
  const found = INTERNALS.get(component);
  if (!found) {
    throw new TypeError('internals() called on a non-secure component');
  }
  return found;
}

export abstract class SecureBaseComponent extends HTMLElement {
  /** Maximum number of entries retained in the in-memory audit log */
  static readonly #MAX_AUDIT_LOG_SIZE = 1000;

  /**
   * Set to `true` by a subclass that drives its own rendering (see
   * `secure-table`). Such a component still gets full security initialisation
   * from the base `connectedCallback`; only the base render pass is skipped.
   *
   * This replaces the former pattern of calling a public `initializeSecurity()`
   * directly, which both exposed a tier-downgrade entry point and left
   * `#initialized` false forever — silently disabling the tier-immutability
   * guard and all reactive attribute handling for those components.
   */
  protected static readonly managesOwnRendering: boolean = false;

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

  /**
   * Which tier flag, if any, gates each audit event.
   *
   * `always` events are security-relevant at every tier. Anything not listed
   * falls back to #inferAuditGate, which keeps the historical substring
   * behaviour for component-specific event names.
   */
  static readonly #AUDIT_GATES: Readonly<Record<string, 'always' | 'logAccess' | 'logChanges' | 'logSubmission'>> = {
    component_initialized: 'always',
    component_disconnected: 'logAccess',
    invalid_tier: 'always',
    threat_tier_change_blocked: 'always',
    threat_detected: 'always',
    threat_cleared: 'always',
    validation_failed: 'always',
    rate_limit_exceeded: 'always',
  };

  /** Fallback for component-specific event names not in #AUDIT_GATES. */
  static #inferAuditGate(event: string): 'always' | 'logAccess' | 'logChanges' | 'logSubmission' | 'never' {
    if (event.includes('threat') || event.includes('rate_limit') ||
        event.includes('validation') || event.includes('initialized')) {
      return 'always';
    }
    if (event.includes('submit')) return 'logSubmission';
    if (event.includes('change')) return 'logChanges';
    if (event.includes('access')) return 'logAccess';
    return 'never';
  }

  /** Coarse length bucket, so an audit event cannot reveal an exact value length. */
  static #bucketLength(length: number): string {
    if (length === 0) return '0';
    if (length <= 8) return '1-8';
    if (length <= 16) return '9-16';
    if (length <= 32) return '17-32';
    if (length <= 64) return '33-64';
    return '65+';
  }

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
  // Write-once latch for the security tier. Separate from #initialized so the
  // guard engages for components that skip the base render pass.
  #tierLocked: boolean = false;
  // Re-entrancy guard for reverting a blocked security-tier attribute change.
  #revertingTier: boolean = false;
  // Field names currently matching an injection pattern. Used to emit a
  // 'secure-threat-cleared' transition event when a flagged field becomes clean.
  #activeThreatFields: Set<string> = new Set();
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

    // Register the privileged surface in the module-scoped table rather than on
    // the prototype. See ComponentInternals for why `protected` was insufficient.
    INTERNALS.set(this, {
      root: this.#shadow,
      addComponentStyles: (cssInput: string) => { this.#addComponentStyles(cssInput); },
      getBaseStylesheetUrl: () => this.#getBaseStylesheetUrl(),
      audit: (event: string, data: Record<string, unknown> = {}) => { this.#audit(event, data); },
      clearAuditLog: () => { this.#auditLog = []; },
      checkRateLimit: () => this.#checkRateLimit(),
      detectInjection: (value: string, fieldName: string, showFeedback = false) => {
        this.#detectInjection(value, fieldName, showFeedback);
      },
      rerender: () => { this.#render(); },
      recordTelemetryFocus: () => { this.#recordTelemetryFocus(); },
      recordTelemetryInput: (event: Event) => { this.#recordTelemetryInput(event); },
      recordTelemetryBlur: () => { this.#recordTelemetryBlur(); },
      setupAutofillDetection: (el: HTMLInputElement | HTMLTextAreaElement) => {
        this.#setupAutofillDetection(el);
      },
    });
  }

  static get observedAttributes(): string[] {
    return ['security-tier', 'disabled', 'readonly', 'threat-feedback'];
  }

  connectedCallback(): void {
    if (this.#initialized) {
      return;
    }
    // Order matters: the tier must be locked before anything can re-enter.
    this.#initialized = true;
    this.#lockSecurityTier();

    // A component that drives its own rendering (secure-table) still gets full
    // security initialisation above; only the base render pass is skipped.
    if (!(this.constructor as typeof SecureBaseComponent).managesOwnRendering) {
      this.#render();
    }
  }

  /**
   * Resolve the security tier once, then freeze it for the element's lifetime.
   *
   * ⚠ SECURITY: this is deliberately `#private` and runs exactly once. It was
   * previously a `protected initializeSecurity()`, which TypeScript erases —
   * shipping a public method that re-read the `security-tier` attribute. Since
   * `attributeChangedCallback` warns but leaves the poisoned attribute in the
   * DOM, any page script could call `el.initializeSecurity()` to downgrade a
   * CRITICAL field to `public`: masking off, autocomplete back on, audit
   * silenced. Re-entry is now impossible.
   */
  #lockSecurityTier(): void {
    if (this.#tierLocked) {
      return;
    }
    const tierAttr = this.getAttribute('security-tier');
    if (tierAttr && isValidTier(tierAttr)) {
      this.#securityTier = tierAttr;
    } else if (tierAttr !== null) {
      // An unrecognised tier leaves the component at the CRITICAL default.
      // Surface it, or a typo looks identical to a field that needs no tier.
      console.warn(
        `Invalid security-tier "${tierAttr}" ignored; staying at CRITICAL (fail-secure).`
      );
    }

    this.#config = getTierConfig(this.#securityTier);
    this.#tierLocked = true;

    if (tierAttr !== null && tierAttr !== this.#securityTier) {
      this.#audit('invalid_tier', { attempted: tierAttr, applied: this.#securityTier });
    }

    this.#audit('component_initialized', {
      tier: this.#securityTier,
      timestamp: new Date().toISOString()
    });
  }

  // security-tier is immutable after init to prevent privilege escalation.
  //
  // The attribute IS reverted. Leaving it poisoned was previously justified on
  // the grounds that only #securityTier drives behaviour — but every tier badge
  // and border is a `:host([security-tier="…"])` rule, so a blocked change still
  // repainted a CRITICAL field as public (or a public one as critical, which is
  // the more useful direction for a phishing overlay). The recursion that
  // justified leaving it is avoided with a re-entrancy flag.
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'security-tier' && this.#tierLocked) {
      if (this.#revertingTier) {
        return;
      }
      if (newValue !== this.#securityTier) {
        console.warn(
          `Security tier cannot be changed after initialization. ` +
          `Attempted change from "${oldValue}" to "${newValue}" blocked.`
        );
        this.#audit('threat_tier_change_blocked', {
          attempted: newValue,
          enforced: this.#securityTier
        });
        this.#revertingTier = true;
        this.setAttribute('security-tier', this.#securityTier);
        this.#revertingTier = false;
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
    this.#addComponentStyles(new URL('./base.css', import.meta.url).href);

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

    // Every field component inherits fallback neutralisation. render() has just
    // created any hidden input, so it is excluded correctly.
    this.#neutralizeFallbackInputs();
  }

  /**
   * May this component mirror its raw value into a light-DOM hidden input?
   *
   * ⚠ SECURITY: no. Not when the tier masks the value, and not for a password.
   * The hidden input is plain light DOM, so `document.querySelector('input[type=hidden]')`
   * read the cleartext value on every keystroke — defeating the closed shadow
   * root, the masking, and the deliberate omission of `value` from the change
   * event in a single call, with no need to pierce anything.
   *
   * Native form participation for those fields goes through `<secure-form>`,
   * which never writes the value to the DOM. A field that needs it outside a
   * form should use `ElementInternals.setFormValue` once the browser baseline
   * allows form-associated custom elements.
   */
  protected mayExposeValueToLightDom(isPassword: boolean): boolean {
    if (isPassword) return false;
    return !this.#config.masking.enabled;
  }

  /**
   * Neutralise the server-rendered no-JS fallback control once JS has upgraded
   * the component.
   *
   * ⚠ SECURITY: only secure-input used to do this. For secure-textarea,
   * secure-select and secure-datetime the light-DOM fallback kept its `name`,
   * and SecureForm's #collectFormData collects raw light-DOM controls AFTER the
   * secure components — under the same key. The stale fallback value therefore
   * OVERWROTE the value the user actually typed, and the server received input
   * that no validation, masking or injection check had ever seen.
   *
   * A retained `required`/`pattern` is the other half: the browser runs
   * constraint validation against the hidden control before the submit event
   * fires, so the form silently does nothing on click.
   */
  #neutralizeFallbackInputs(): void {
    const fallbacks = this.querySelectorAll('input, textarea, select');
    fallbacks.forEach((el) => {
      // Never touch a hidden input the component created for form participation.
      if (el instanceof HTMLInputElement && el.type === 'hidden') return;

      el.removeAttribute('required');
      el.removeAttribute('name');
      el.removeAttribute('minlength');
      el.removeAttribute('maxlength');
      el.removeAttribute('pattern');
      // Mark as inert so it is completely non-interactive.
      el.setAttribute('tabindex', '-1');
      el.setAttribute('aria-hidden', 'true');
    });
  }

  /**
   * Returns the base stylesheet URL or inlined CSS text (bundle mode).
   * Pass the return value directly to addComponentStyles().
   * @protected
   */
  #getBaseStylesheetUrl(): string {
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
  #addComponentStyles(cssInput: string): void {
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

  /**
   * Strip null bytes and ASCII control characters from an attribute value.
   *
   * All current call sites assign the result to a DOM property (.textContent,
   * .name, .placeholder, option.value, setAttribute) — not innerHTML. Property
   * assignment already prevents HTML injection, so HTML-entity encoding is both
   * unnecessary and harmful: returning div.innerHTML caused entities like &amp;
   * to appear literally in the rendered text (double-encoding).
   *
   * Strips U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+007F (control
   * characters that serve no display purpose and can confuse parsers).
   * Tab (U+0009), LF (U+000A), and CR (U+000D) are preserved.
   */
  protected sanitizeValue(value: string): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
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
      // strict is true only for SENSITIVE and CRITICAL — the tiers holding
      // passwords, SSNs and payment data. This event is composed and bubbling,
      // so the exact character count plus the specific failure reasons ("must
      // include a special character") reached every listener on the page,
      // narrowing the search space for the value itself. Send a count and a
      // coarse bucket; the detailed reasons are already shown to the user.
      this.#audit('validation_failed', {
        errorCount: errors.length,
        lengthBucket: SecureBaseComponent.#bucketLength(value ? value.length : 0)
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
  #checkRateLimit(): RateLimitResult {
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

    // Explicit event -> gate mapping. Substring matching let
    // 'component_disconnected' fall through every branch, so component teardown —
    // the event that would reveal a field being ripped out of the DOM mid-session
    // — was never logged at any tier, despite disconnectedCallback checking
    // config.logAccess before calling. It also meant any future event containing
    // the word "change" was silently governed by logChanges.
    const gate = SecureBaseComponent.#AUDIT_GATES[event]
      ?? SecureBaseComponent.#inferAuditGate(event);

    const shouldLog =
      gate === 'always' ||
      (gate === 'logAccess' && config.logAccess) ||
      (gate === 'logChanges' && config.logChanges) ||
      (gate === 'logSubmission' && config.logSubmission);

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
    // Freeze what we retain, and dispatch a copy. The same object used to be both
    // pushed and placed in the event detail, so a listener registered first could
    // rewrite a threat_detected record in place — and getAuditLog() copies only
    // the array, so every later read returned the attacker's version.
    const stored: AuditLogEntry = Object.freeze({
      ...logEntry,
      data: logEntry.data ? Object.freeze({ ...logEntry.data }) : undefined
    });
    this.#auditLog.push(stored);

    this.dispatchEvent(
      new CustomEvent('secure-audit', {
        detail: { ...logEntry, data: logEntry.data ? { ...logEntry.data } : undefined },
        bubbles: true,
        composed: true
      })
    );
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
  #detectInjection(value: string, fieldName: string, showFeedback = false): void {
    const feedbackEnabled = showFeedback || this.hasAttribute('threat-feedback');
    for (const { id, pattern } of SecureBaseComponent.#INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        this.#activeThreatFields.add(fieldName);
        this.#audit('threat_detected', {
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
    // No injection pattern matched the current value. If this field was flagged
    // by a previous call, emit a transition 'secure-threat-cleared' so a parent
    // <secure-form> can lift the submission block now that the content is clean.
    // Without this, a form blocked on injection stays blocked even after the user
    // removes the offending input.
    if (this.#activeThreatFields.delete(fieldName)) {
      this.#audit('threat_cleared', { fieldName });
      this.dispatchEvent(new CustomEvent<ThreatClearedDetail>('secure-threat-cleared', {
        detail: {
          fieldName,
          tier: this.securityTier,
          timestamp: Date.now(),
        },
        bubbles: true,
        composed: true,
      }));
    }
    // Clear any lingering inline feedback
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

  #recordTelemetryFocus(): void {
    const t = this.#telemetryState;
    t.focusAt = Date.now();
    t.blurAt = null;
    t.focusCount++;
    // snapshot input length at focus so we can detect blur-without-change
    const el = this.#shadow.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]), textarea, select'
    );
    t.lastInputLength = el ? el.value.length : 0;
  }

  #recordTelemetryInput(event: Event): void {
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

  #recordTelemetryBlur(): void {
    const t = this.#telemetryState;
    t.blurAt = Date.now();

    const el = this.#shadow.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
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
  #setupAutofillDetection(el: HTMLInputElement | HTMLTextAreaElement): void {
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
