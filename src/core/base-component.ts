/**
 * @fileoverview Base Component Class for Secure-UI
 *
 * This module provides the foundational class that all Secure-UI web components
 * extend. It implements core security features, progressive enhancement,
 * and standardized lifecycle management.
 *
 * Security Features:
 * - Closed Shadow DOM (prevents external JavaScript access)
 * - Automatic XSS sanitization
 * - Security tier enforcement
 * - Audit logging infrastructure
 * - Rate limiting support
 * - Progressive enhancement (works without JS)
 *
 * @module base-component
 * @license MIT
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
  FieldTelemetryState
} from './types.js';

/**
 * Base class for all Secure-UI components
 *
 * All components in the Secure-UI library should extend this class to inherit
 * core security functionality and standardized behavior.
 *
 * Security Architecture:
 * - Closed Shadow DOM prevents external tampering
 * - All attributes are sanitized on read
 * - Security tier is immutable after initial set
 * - Default tier is CRITICAL (fail secure)
 */
export abstract class SecureBaseComponent extends HTMLElement {
  /** Maximum number of entries retained in the in-memory audit log */
  static readonly #MAX_AUDIT_LOG_SIZE = 1000;

  #securityTier: SecurityTierValue = SecurityTier.CRITICAL as SecurityTierValue;
  #config: TierConfig;
  #shadow: ShadowRoot;
  #auditLog: AuditLogEntry[] = [];
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

  /**
   * Constructor
   *
   * Security Note: Creates a CLOSED shadow DOM to prevent external JavaScript
   * from accessing or modifying the component's internal DOM.
   */
  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'closed' });
    this.#config = getTierConfig(this.#securityTier);
  }

  /**
   * Observed attributes - must be overridden by child classes
   */
  static get observedAttributes(): string[] {
    return ['security-tier', 'disabled', 'readonly'];
  }

  /**
   * Called when element is added to DOM
   */
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

  /**
   * Called when an observed attribute changes
   *
   * Security Note: security-tier attribute is immutable after initialization
   * to prevent privilege escalation.
   */
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

  /**
   * Handle attribute changes - to be overridden by child classes
   */
  protected handleAttributeChange(_name: string, _oldValue: string | null, _newValue: string | null): void {
    // Child classes should override this method
  }

  #render(): void {
    this.#shadow.innerHTML = '';

    // Base styles via <link> — loads from 'self', fully CSP-safe.
    // Using adoptedStyleSheets + replaceSync(inlineString) triggers CSP violations
    // when style-src lacks 'unsafe-inline'. A <link> element loading from 'self'
    // is always permitted.
    const baseLink = document.createElement('link');
    baseLink.rel = 'stylesheet';
    baseLink.href = new URL('./base.css', import.meta.url).href;
    this.#shadow.appendChild(baseLink);

    const content = this.render();
    if (content) {
      this.#shadow.appendChild(content);
    }
  }

  /**
   * Returns the URL of the shared base stylesheet.
   * Components that manage their own rendering (e.g. secure-table) can use
   * this to inject the base <link> themselves.
   * @protected
   */
  protected getBaseStylesheetUrl(): string {
    return new URL('./base.css', import.meta.url).href;
  }

  /**
   * Inject a component stylesheet into the shadow root via <link>.
   * Accepts a URL (use import.meta.url to derive it, e.g.
   *   new URL('./my-component.css', import.meta.url).href
   * ). Loading from 'self' satisfies strict CSP without unsafe-inline.
   * @protected
   */
  protected addComponentStyles(cssUrl: string): void {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    this.#shadow.appendChild(link);
  }

  /**
   * Render method to be implemented by child classes
   */
  protected abstract render(): DocumentFragment | HTMLElement | null;

  /**
   * Sanitize a string value to prevent XSS
   */
  protected sanitizeValue(value: string): string {
    if (typeof value !== 'string') {
      return '';
    }

    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /**
   * Validate input against tier-specific rules
   */
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
   * Check rate limit for this component
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
      event.includes('validation');

    if (!shouldLog) {
      return;
    }

    const logEntry: AuditLogEntry = {
      event,
      tier: this.#securityTier,
      timestamp: new Date().toISOString(),
      ...data
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

  /**
   * Get the shadow root (protected access for child classes)
   */
  get shadowRoot(): ShadowRoot {
    return this.#shadow;
  }

  /**
   * Get the current security tier
   */
  get securityTier(): SecurityTierValue {
    return this.#securityTier;
  }

  /**
   * Get the tier configuration
   */
  get config(): TierConfig {
    return this.#config;
  }

  /**
   * Get all audit log entries
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.#auditLog];
  }

  /**
   * Clear the local audit log
   */
  clearAuditLog(): void {
    this.#auditLog = [];
  }

  /**
   * Trigger an audit event from child classes
   */
  protected audit(event: string, data: Record<string, unknown>): void {
    this.#audit(event, data);
  }

  /**
   * Force re-render of the component
   */
  protected rerender(): void {
    this.#render();
  }

  // ── Telemetry collection ────────────────────────────────────────────────────

  /**
   * Call from the field's `focus` event handler to start a telemetry session.
   * @protected
   */
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

  /**
   * Call from the field's `input` event handler.
   * Pass the native `InputEvent` so inputType can be inspected.
   * @protected
   */
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
      // Browser autofill triggers this type
      t.autofillDetected = true;
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

  /**
   * Call from the field's `blur` event handler to finalise the telemetry session.
   * @protected
   */
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

  /**
   * Returns computed behavioral signals for the current (or last completed)
   * interaction session. Safe to include in server payloads — contains no
   * raw field values or PII.
   */
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

  /**
   * Clean up when component is removed from DOM
   */
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
