export {
  SecurityTier,
  TIER_CONFIG,
  getTierConfig,
  isValidTier,
  compareTiers,
  getMoreSecureTier,
} from './core/security-config.js';

// Components
export { SecureInput } from './components/secure-input/secure-input.js';
export { SecureTextarea } from './components/secure-textarea/secure-textarea.js';
export { SecureSelect } from './components/secure-select/secure-select.js';
export { SecureForm } from './components/secure-form/secure-form.js';
export { SecureFileUpload } from './components/secure-file-upload/secure-file-upload.js';
export { SecureDateTime } from './components/secure-datetime/secure-datetime.js';
export { SecureTable } from './components/secure-table/secure-table.js';
export { SecureSubmitButton } from './components/secure-submit-button/secure-submit-button.js';
export { SecureCard } from './components/secure-card/secure-card.js';
export { SecureTelemetryProvider } from './components/secure-telemetry-provider/secure-telemetry-provider.js';
export { SecurePasswordConfirm } from './components/secure-password-confirm/secure-password-confirm.js';

// Types
export type {
  SecurityTierValue,
  TierConfig,
  ValidationConfig,
  MaskingConfig,
  StorageConfig,
  AuditConfig,
  RateLimitConfig,
  ValidationResult,
  ValidationOptions,
  RateLimitResult,
  AuditLogEntry,
  SecureInputChangeDetail,
  SecureTextareaChangeDetail,
  SecureSelectChangeDetail,
  SecureFileChangeDetail,
  SecureDatetimeChangeDetail,
  SecureFormSubmitEventDetail,
  SecureFormSuccessEventDetail,
  SecureAuditEventDetail,
  ThreatDetectedDetail,
  TableColumnDefinition,
  TableSortConfig,
  TablePaginationState,
  DateTimeInputType,
  CardType,
  SecureCardChangeDetail,
  FieldTelemetry,
  FieldTelemetrySnapshot,
  SessionTelemetry,
  EnvironmentalSignals,
  SignedTelemetryEnvelope,
  SecurePasswordConfirmEventDetail,
} from './core/types.js';
