/**
 * @fileoverview Custom Element Type Declarations
 *
 * Augments the global HTMLElementTagNameMap so that TypeScript knows
 * about Secure-UI custom elements when using document.querySelector()
 * and similar DOM APIs.
 *
 * @example
 * const input = document.querySelector('secure-input');
 * // TypeScript knows `input` is SecureInput | null
 *
 * @module custom-elements.d.ts
 * @license MIT
 */

import type { SecureInput } from './components/secure-input/secure-input.js';
import type { SecureTextarea } from './components/secure-textarea/secure-textarea.js';
import type { SecureSelect } from './components/secure-select/secure-select.ts';
import type { SecureForm } from './components/secure-form/secure-form.js';
import type { SecureFileUpload } from './components/secure-file-upload/secure-file-upload.js';
import type { SecureDateTime } from './components/secure-datetime/secure-datetime.js';
import type { SecureTable } from './components/secure-table/secure-table.ts';
import type { SecureSubmitButton } from './components/secure-submit-button/secure-submit-button.ts';

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
  }
}
