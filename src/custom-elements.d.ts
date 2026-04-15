/**
 * Augments HTMLElementTagNameMap so TypeScript resolves the correct type
 * when using document.querySelector('secure-input') and similar DOM APIs.
 *
 * @example
 * const input = document.querySelector('secure-input');
 * // TypeScript knows `input` is SecureInput | null
 */

import type { SecureInput } from './components/secure-input/secure-input.js';
import type { SecureTextarea } from './components/secure-textarea/secure-textarea.js';
import type { SecureSelect } from './components/secure-select/secure-select.js';
import type { SecureForm } from './components/secure-form/secure-form.js';
import type { SecureFileUpload } from './components/secure-file-upload/secure-file-upload.js';
import type { SecureDateTime } from './components/secure-datetime/secure-datetime.js';
import type { SecureTable } from './components/secure-table/secure-table.js';
import type { SecureSubmitButton } from './components/secure-submit-button/secure-submit-button.js';
import type { SecureCard } from './components/secure-card/secure-card.js';
import type { SecureTelemetryProvider } from './components/secure-telemetry-provider/secure-telemetry-provider.js';
import type { SecurePasswordConfirm } from './components/secure-password-confirm/secure-password-confirm.js';

declare global {
  interface HTMLElementTagNameMap {
    'secure-input': SecureInput;
    'secure-textarea': SecureTextarea;
    'secure-select': SecureSelect;
    'secure-form': SecureForm;
    'secure-file-upload': SecureFileUpload;
    'secure-datetime': SecureDateTime;
    'secure-table': SecureTable;
    'secure-submit-button': SecureSubmitButton;
    'secure-card': SecureCard;
    'secure-telemetry-provider': SecureTelemetryProvider;
    'secure-password-confirm': SecurePasswordConfirm;
  }
}
