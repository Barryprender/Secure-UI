/** Shared type definitions for the Secure-UI component library. */

// ========== Security Tier Types ==========

/**
 * Security tier string literal values
 */
export type SecurityTierValue = 'public' | 'authenticated' | 'sensitive' | 'critical';

/**
 * Validation configuration for a security tier
 */
export interface ValidationConfig {
  readonly required: boolean;
  readonly strict: boolean;
  readonly maxLength: number;
  readonly pattern: RegExp | null;
  readonly sanitizeHtml: boolean;
}

/**
 * Masking configuration for a security tier
 */
export interface MaskingConfig {
  readonly enabled: boolean;
  readonly character: string;
  readonly partial: boolean;
}

/**
 * Browser storage permissions for a security tier
 */
export interface StorageConfig {
  readonly allowAutocomplete: boolean;
  readonly allowCache: boolean;
  readonly allowHistory: boolean;
}

/**
 * Audit logging configuration for a security tier
 */
export interface AuditConfig {
  readonly logAccess: boolean;
  readonly logChanges: boolean;
  readonly logSubmission: boolean;
  readonly includeMetadata: boolean;
}

/**
 * Rate limiting configuration for a security tier
 */
export interface RateLimitConfig {
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly windowMs: number;
}

/**
 * Complete tier configuration object
 */
export interface TierConfig {
  readonly name: string;
  readonly level: number;
  readonly validation: ValidationConfig;
  readonly masking: MaskingConfig;
  readonly storage: StorageConfig;
  readonly audit: AuditConfig;
  readonly rateLimit: RateLimitConfig;
}

// ========== Validation Types ==========

/**
 * Validation result returned by validateInput()
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validation options passed to validateInput()
 */
export interface ValidationOptions {
  pattern?: RegExp | null;
  minLength?: number;
  maxLength?: number;
  /** When provided, overrides the tier config's required setting */
  required?: boolean;
}

// ========== Rate Limiting Types ==========

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

/**
 * Rate limit state tracking
 */
export interface RateLimitState {
  attempts: number;
  windowStart: number;
}

// ========== Audit Types ==========

export interface AuditLogEntry {
  event: string;
  tier: SecurityTierValue;
  timestamp: string;
  userAgent?: string;
  language?: string;
  /** Additional event-specific data attached at audit time. */
  data?: Record<string, unknown>;
}

// ========== CSP & Security Headers ==========

/**
 * CSP directive mapping
 */
export type CSPDirectives = Record<string, string[]>;

/**
 * Security headers mapping
 */
export type SecurityHeaders = Record<string, string>;

// ========== Component Event Detail Types ==========

/**
 * Custom event detail for secure-input events
 */
export interface SecureInputEventDetail {
  name: string;
  value: string;
  masked: boolean;
  tier: SecurityTierValue;
}

/**
 * Custom event detail for secure-textarea events
 */
export interface SecureTextareaEventDetail {
  name: string;
  value: string;
  tier: SecurityTierValue;
}

export interface SecureSelectEventDetail {
  name: string;
  /** string for single-select; string[] for multi-select */
  value: string | string[];
  tier: SecurityTierValue;
}

/**
 * Custom event detail for secure-file-upload events
 */
export interface SecureFileUploadEventDetail {
  name: string;
  files: File[];
  tier: SecurityTierValue;
}

/**
 * Custom event detail for secure-datetime events
 */
export interface SecureDatetimeEventDetail {
  name: string;
  value: string;
  type: string;
  tier: SecurityTierValue;
}

export interface SecureFormSubmitEventDetail {
  formData: Record<string, string>;
  /**
   * Call to cancel the library's internal fetch submission.
   * Distinct from `event.preventDefault()` (which also cancels, via the
   * cancelable event flag) — this additionally re-enables the form and
   * resets submitting state so the UI recovers cleanly.
   */
  cancelSubmission: () => void;
  /** Behavioral telemetry collected from all secure fields. */
  telemetry: SessionTelemetry;
}

/**
 * Custom event detail for secure-form-success events
 */
export interface SecureFormSuccessEventDetail {
  formData: Record<string, string>;
  response: Response;
  /** Behavioral telemetry collected from all secure fields */
  telemetry: SessionTelemetry;
}

/**
 * Custom event detail for secure-audit events
 */
export type SecureAuditEventDetail = AuditLogEntry;

// ========== Table Types ==========

export interface TableColumnDefinition {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  tier?: SecurityTierValue;
  width?: string;
  /**
   * Custom cell renderer. Return value is treated as an HTML string and run
   * through the library's DOMParser-based sanitizer before insertion — event
   * handlers and disallowed tags are stripped. Safe data-* attributes and
   * common inline elements are preserved.
   */
  render?: (value: unknown, row: Record<string, unknown>, columnKey: string) => string;
}

/**
 * Table sort configuration
 */
export interface TableSortConfig {
  column: string | null;
  direction: 'asc' | 'desc';
}

/**
 * Table pagination state
 */
export interface TablePaginationState {
  currentPage: number;
  pageSize: number;
}

// ========== DateTime Types ==========

/**
 * Valid datetime input types
 */
export type DateTimeInputType = 'date' | 'time' | 'datetime-local' | 'month' | 'week';

// ========== Telemetry Types ==========

/**
 * Internal mutable state tracked per field interaction session.
 * Accumulated in SecureBaseComponent; consumed by getFieldTelemetry().
 */
export interface FieldTelemetryState {
  focusAt: number | null;
  firstKeystrokeAt: number | null;
  blurAt: number | null;
  keyCount: number;
  correctionCount: number;
  pasteDetected: boolean;
  autofillDetected: boolean;
  focusCount: number;
  blurWithoutChange: number;
  lastInputLength: number;
}

/**
 * Computed behavioral signals returned via getFieldTelemetry().
 * Safe to include in server payloads — no PII, no raw values.
 */
export interface FieldTelemetry {
  /** ms from focus to first keystroke (0 if field was pasted/autofilled without typing) */
  dwell: number;
  /** ms from first input event to blur (0 if field is still focused or never had input) */
  completionTime: number;
  /** keystrokes per second during active typing (0 if no keystrokes recorded) */
  velocity: number;
  /** number of deletion/correction input events */
  corrections: number;
  /** true if a paste event was detected */
  pasteDetected: boolean;
  /** true if browser autofill was detected */
  autofillDetected: boolean;
  /** number of times the field received focus */
  focusCount: number;
  /** number of times field was blurred without any value change */
  blurWithoutChange: number;
}

/**
 * Per-field telemetry snapshot captured at form submission.
 * Extends FieldTelemetry with identifying metadata.
 */
export interface FieldTelemetrySnapshot extends FieldTelemetry {
  /** The field's name attribute */
  fieldName: string;
  /** The element tag name (e.g. "secure-input") */
  fieldType: string;
}

/**
 * Session-level telemetry aggregated by <secure-form> at submission time.
 * Contains per-field snapshots plus computed risk signals.
 * Safe to send to the server alongside form data.
 */
export interface SessionTelemetry {
  /** ms from form connectedCallback to submission */
  sessionDuration: number;
  /** number of secure fields discovered in the form */
  fieldCount: number;
  /** per-field behavioral snapshots */
  fields: FieldTelemetrySnapshot[];
  /** composite risk score 0–100 (higher = more suspicious) */
  riskScore: number;
  /** human-readable labels for signals that contributed to the risk score */
  riskSignals: string[];
  /** ISO 8601 timestamp of submission */
  submittedAt: string;
}

/**
 * Environmental integrity signals collected by <secure-telemetry-provider>.
 * Detects automation, DOM tampering, and headless browser characteristics.
 */
export interface EnvironmentalSignals {
  /** true if WebDriver / automation flags detected on navigator */
  webdriverDetected: boolean;
  /** true if headless Chrome fingerprints detected */
  headlessDetected: boolean;
  /** true if the document was tampered with via MutationObserver during session */
  domMutationDetected: boolean;
  /** count of unexpected script elements injected after page load */
  injectedScriptCount: number;
  /** screen dimensions appear to be non-human (very small or zero) */
  suspiciousScreenSize: boolean;
  /** pointer type detected: 'mouse' | 'touch' | 'pen' | 'none' */
  pointerType: 'mouse' | 'touch' | 'pen' | 'none';
  /** true if any pointer/mouse movement was detected before submission */
  mouseMovementDetected: boolean;
  /** true if keyboard events were detected on the page outside secure fields */
  keyboardActivityDetected: boolean;
  /**
   * Milliseconds from component mount to first page-level keystroke.
   * -1 if no keystroke was detected before submission.
   * Values < 200ms are consistent with programmatic input.
   */
  pageLoadToFirstKeystroke: number;
  /**
   * Milliseconds from component mount to form submission.
   * Unusually low values (< 500ms) suggest automated submission.
   */
  loadToSubmit: number;
  /**
   * Injection or CSRF threat signals detected during this session.
   * Populated by secure-telemetry-provider when it observes secure-threat-detected events.
   */
  threatSignals?: readonly ThreatDetectedDetail[];
}

/**
 * A signed telemetry envelope produced by <secure-telemetry-provider>.
 * The nonce + timestamp allow the server to detect replay attacks.
 */
export interface SignedTelemetryEnvelope {
  /** one-time nonce (random hex, 32 chars) */
  nonce: string;
  /** ISO timestamp when the envelope was created */
  issuedAt: string;
  /** environmental signals snapshot */
  environment: EnvironmentalSignals;
  /** HMAC-like integrity hash over nonce + issuedAt + environment (SHA-256 hex) */
  signature: string;
}

/**
 * Custom event detail for secure-threat-detected events.
 * Fired by input components when an injection pattern is detected in a field value,
 * or by secure-form when a CSRF token is absent on submission.
 * The raw field value is intentionally absent.
 */
export interface ThreatDetectedDetail {
  /** The name attribute of the field that triggered detection */
  fieldName: string;
  /** Category of threat detected */
  threatType: 'injection' | 'csrf-token-absent';
  /** Identifier of the pattern that matched, e.g. 'script-tag', 'event-handler' */
  patternId: string;
  /** Security tier of the component at the time of detection */
  tier: SecurityTierValue;
  /** Unix timestamp (ms) of detection */
  timestamp: number;
  // raw field value intentionally absent
}

/**
 * Custom event detail for secure-password-confirm match/mismatch events.
 * Raw password values are intentionally absent — use element.getPasswordValue()
 * to retrieve the value only when needed for submission.
 */
export interface SecurePasswordConfirmEventDetail {
  /** The name attribute of the component */
  name: string;
  /** true on secure-password-match, false on secure-password-mismatch */
  matched: boolean;
}

// ========== Card Types ==========

/**
 * Detected card network type
 */
export type CardType =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unknown';

/**
 * Custom event detail for secure-card events.
 *
 * Security note: full PAN and CVC are intentionally absent.
 * Use element.getCardData() to obtain raw values for SDK tokenisation.
 */
export interface SecureCardEventDetail {
  name: string;
  cardType: CardType;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  valid: boolean;
  tier: SecurityTierValue;
}
