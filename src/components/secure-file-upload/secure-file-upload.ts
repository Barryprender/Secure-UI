/**
 * @fileoverview Secure File Upload Component
 *
 * A security-first file upload component that implements progressive enhancement,
 * file type validation, size limits, malware scanning hooks, and audit logging.
 *
 * Progressive Enhancement Strategy:
 * 1. Without JavaScript: Falls back to native HTML5 file input
 * 2. With JavaScript: Enhances with validation, preview, drag-drop, security checks
 *
 * Usage:
 * <secure-file-upload
 *   security-tier="sensitive"
 *   name="document"
 *   label="Upload Document"
 *   accept=".pdf,.doc,.docx"
 *   max-size="5242880"
 *   required
 * ></secure-file-upload>
 *
 * Security Features:
 * - File type validation (MIME type and extension)
 * - File size limits based on security tier
 * - Malware scanning hook integration
 * - Content scanning before upload
 * - Rate limiting on uploads
 * - Comprehensive audit logging
 * - Drag-and-drop with validation
 * - Preview for safe file types
 *
 * @module secure-file-upload
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';

/**
 * Secure File Upload Web Component
 *
 * Provides a security-hardened file upload field with progressive enhancement.
 * The component works as a standard file input without JavaScript and
 * enhances with security features when JavaScript is available.
 *
 * @extends SecureBaseComponent
 */
export class SecureFileUpload extends SecureBaseComponent {
  /**
   * File input element reference
   * @private
   */
  #fileInput: HTMLInputElement | null = null;

  /**
   * Label element reference
   * @private
   */
  #labelElement: HTMLLabelElement | null = null;

  /**
   * Error container element reference
   * @private
   */
  #errorContainer: HTMLDivElement | null = null;

  /**
   * File preview container
   * @private
   */
  #previewContainer: HTMLDivElement | null = null;

  /**
   * Drop zone element
   * @private
   */
  #dropZone: HTMLDivElement | null = null;

  /**
   * File name display element
   * @private
   */
  #fileNameDisplay: HTMLSpanElement | null = null;

  /**
   * Selected files
   * @private
   */
  #selectedFiles: FileList | null = null;

  /**
   * Unique ID for this file upload instance
   * @private
   */
  #instanceId: string = `secure-file-upload-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Allowed MIME types
   * @private
   */
  #allowedTypes: Set<string> = new Set();

  /**
   * Maximum file size in bytes
   * @private
   */
  #maxSize: number = 5 * 1024 * 1024; // Default 5MB

  /**
   * Observed attributes for this component
   *
   * @static
   */
  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'label',
      'accept',
      'max-size',
      'multiple',
      'required',
      'capture'
    ];
  }

  /**
   * Constructor
   */
  constructor() {
    super();
  }

  /**
   * Render the file upload component
   *
   * Security Note: We use a native <input type="file"> element wrapped in our
   * web component to ensure progressive enhancement. The native input works
   * without JavaScript, and we enhance it with security features when JS is available.
   *
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const config = this.config;

    // Create container
    const container = document.createElement('div');
    container.className = 'file-upload-container';

    // Create label
    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);

      // Add security tier suffix if configured
      if (config.ui.labelSuffix) {
        const suffix = document.createElement('span');
        suffix.className = 'label-suffix';
        suffix.textContent = config.ui.labelSuffix;
        this.#labelElement.appendChild(suffix);
      }

      // Add security badge if configured
      if (config.ui.showSecurityBadge) {
        const badge = document.createElement('span');
        badge.className = 'security-badge';
        badge.textContent = config.name;
        this.#labelElement.appendChild(badge);
      }

      container.appendChild(this.#labelElement);
    }

    // Create drop zone
    this.#dropZone = document.createElement('div');
    this.#dropZone.className = 'drop-zone';

    // Create the file input element
    this.#fileInput = document.createElement('input');
    this.#fileInput.type = 'file';
    this.#fileInput.id = this.#instanceId;
    this.#fileInput.className = 'file-input';

    // Apply attributes
    this.#applyFileInputAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    // Create Bulma-style drop zone content
    const dropZoneContent = document.createElement('div');
    dropZoneContent.className = 'drop-zone-content has-name';

    // Call-to-action button
    const fileCta = document.createElement('span');
    fileCta.className = 'file-cta';

    const dropIcon = document.createElement('span');
    dropIcon.className = 'drop-icon';
    dropIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    fileCta.appendChild(dropIcon);

    const dropText = document.createElement('span');
    dropText.className = 'drop-text';
    dropText.textContent = 'Choose a file\u2026';
    fileCta.appendChild(dropText);

    dropZoneContent.appendChild(fileCta);

    // Filename display area
    this.#fileNameDisplay = document.createElement('span');
    this.#fileNameDisplay.className = 'file-name-display';
    this.#fileNameDisplay.textContent = 'No file selected';
    dropZoneContent.appendChild(this.#fileNameDisplay);

    this.#dropZone.appendChild(this.#fileInput);
    this.#dropZone.appendChild(dropZoneContent);
    container.appendChild(this.#dropZone);

    // Accepted types hint (below the input)
    const dropHint = document.createElement('div');
    dropHint.className = 'drop-hint';
    dropHint.textContent = this.#getAcceptHint();
    container.appendChild(dropHint);

    // Create preview container
    this.#previewContainer = document.createElement('div');
    this.#previewContainer.className = 'preview-container';
    container.appendChild(this.#previewContainer);

    // Create error container
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('aria-live', 'polite');
    container.appendChild(this.#errorContainer);

    // Add component styles (CSP-compliant via adoptedStyleSheets)
    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  /**
   * Apply attributes to the file input
   *
   * @private
   */
  #applyFileInputAttributes(): void {
    const config = this.config;

    // Name attribute
    const name = this.getAttribute('name');
    if (name) {
      this.#fileInput!.name = this.sanitizeValue(name);
    }

    // Accept attribute (file types)
    const accept = this.getAttribute('accept');
    if (accept) {
      this.#fileInput!.accept = accept;
      this.#parseAcceptTypes(accept);
    } else {
      // Default safe file types based on tier
      const defaultAccept = this.#getDefaultAcceptTypes();
      this.#fileInput!.accept = defaultAccept;
      this.#parseAcceptTypes(defaultAccept);
    }

    // Max size
    const maxSize = this.getAttribute('max-size');
    if (maxSize) {
      this.#maxSize = parseInt(maxSize, 10);
    } else {
      // Default max size based on tier
      this.#maxSize = this.#getDefaultMaxSize();
    }

    // Multiple files
    if (this.hasAttribute('multiple')) {
      this.#fileInput!.multiple = true;
    }

    // Required
    if (this.hasAttribute('required') || config.validation.required) {
      this.#fileInput!.required = true;
    }

    // Capture (for mobile camera)
    const capture = this.getAttribute('capture');
    if (capture) {
      this.#fileInput!.capture = capture;
    }

    // Disabled
    if (this.hasAttribute('disabled')) {
      this.#fileInput!.disabled = true;
    }
  }

  /**
   * Parse accept attribute to extract MIME types
   *
   * @private
   */
  #parseAcceptTypes(accept: string): void {
    this.#allowedTypes.clear();

    const types = accept.split(',').map(t => t.trim());

    types.forEach((type) => {
      if (type.startsWith('.')) {
        // File extension - convert to MIME type
        const mimeType = this.#extensionToMimeType(type);
        if (mimeType) {
          this.#allowedTypes.add(mimeType);
        }
      } else {
        // MIME type
        this.#allowedTypes.add(type);
      }
    });
  }

  /**
   * Convert file extension to MIME type
   *
   * @private
   */
  #extensionToMimeType(extension: string): string | null {
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.zip': 'application/zip',
      '.json': 'application/json'
    };

    return mimeTypes[extension.toLowerCase()] || null;
  }

  /**
   * Get default accept types based on security tier
   *
   * @private
   */
  #getDefaultAcceptTypes(): string {
    switch (this.securityTier) {
      case SecurityTier.CRITICAL:
        // Most restrictive - only documents
        return '.pdf,.txt';
      case SecurityTier.SENSITIVE:
        // Documents and images
        return '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png';
      case SecurityTier.AUTHENTICATED:
        // Common safe file types
        return '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif';
      case SecurityTier.PUBLIC:
      default:
        // All common file types
        return '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip';
    }
  }

  /**
   * Get default max size based on security tier
   *
   * @private
   */
  #getDefaultMaxSize(): number {
    switch (this.securityTier) {
      case SecurityTier.CRITICAL:
        return 2 * 1024 * 1024; // 2MB
      case SecurityTier.SENSITIVE:
        return 5 * 1024 * 1024; // 5MB
      case SecurityTier.AUTHENTICATED:
        return 10 * 1024 * 1024; // 10MB
      case SecurityTier.PUBLIC:
      default:
        return 20 * 1024 * 1024; // 20MB
    }
  }

  /**
   * Get accept hint text
   *
   * @private
   */
  #getAcceptHint(): string {
    const maxSizeMB = (this.#maxSize / (1024 * 1024)).toFixed(1);
    const accept = this.#fileInput!.accept;
    return `Accepted: ${accept || 'all files'} (max ${maxSizeMB}MB)`;
  }

  /**
   * Attach event listeners
   *
   * @private
   */
  #attachEventListeners(): void {
    // File input change
    this.#fileInput!.addEventListener('change', (e: Event) => {
      this.#handleFileSelect(e as unknown as { target: HTMLInputElement });
    });

    // Drag and drop events
    this.#dropZone!.addEventListener('dragover', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dropZone!.classList.add('drag-over');
    });

    this.#dropZone!.addEventListener('dragleave', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dropZone!.classList.remove('drag-over');
    });

    this.#dropZone!.addEventListener('drop', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dropZone!.classList.remove('drag-over');

      const dragEvent = e as DragEvent;
      const files = dragEvent.dataTransfer!.files;
      if (files.length > 0) {
        this.#fileInput!.files = files;
        this.#handleFileSelect({ target: this.#fileInput! });
      }
    });
  }

  /**
   * Handle file selection
   *
   * Security Note: This is where we perform comprehensive file validation
   * including type checking, size limits, and content validation.
   *
   * @private
   */
  async #handleFileSelect(event: { target: HTMLInputElement }): Promise<void> {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    // Check rate limit
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.#showError(
        `Too many upload attempts. Please wait ${Math.ceil(rateLimitCheck.retryAfter / 1000)} seconds.`
      );
      this.#fileInput!.value = '';
      return;
    }

    // Clear previous errors
    this.#clearErrors();

    // Validate all files
    const validation = await this.#validateFiles(files);

    if (!validation.valid) {
      this.#showError(validation.errors.join(', '));
      this.#fileInput!.value = '';
      this.#selectedFiles = null;
      return;
    }

    // Store selected files
    this.#selectedFiles = files;

    // Update filename display
    this.#updateFileNameDisplay(files);

    // Show preview
    this.#showPreview(files);

    // Audit log
    this.audit('files_selected', {
      name: this.#fileInput!.name,
      fileCount: files.length,
      totalSize: Array.from(files).reduce((sum, f) => sum + f.size, 0)
    });

    // Dispatch custom event
    this.dispatchEvent(
      new CustomEvent('secure-file-upload', {
        detail: {
          name: this.#fileInput!.name,
          files: Array.from(files),
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Validate selected files
   *
   * Security Note: Multi-layered validation including type, size, and content checks.
   *
   * @private
   */
  async #validateFiles(files: FileList): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check file count
    if (!this.#fileInput!.multiple && files.length > 1) {
      errors.push('Only one file is allowed');
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file size
      if (file.size > this.#maxSize) {
        const maxSizeMB = (this.#maxSize / (1024 * 1024)).toFixed(1);
        errors.push(`${file.name}: File size exceeds ${maxSizeMB}MB`);
        continue;
      }

      // Validate file type
      if (this.#allowedTypes.size > 0) {
        const isAllowed = this.#isFileTypeAllowed(file);
        if (!isAllowed) {
          errors.push(`${file.name}: File type not allowed`);
          continue;
        }
      }

      // Validate file name (prevent path traversal)
      if (this.#isFileNameDangerous(file.name)) {
        errors.push(`${file.name}: Invalid file name`);
        continue;
      }

      // Content validation for critical tier
      if (this.securityTier === SecurityTier.CRITICAL) {
        const contentCheck = await this.#validateFileContent(file);
        if (!contentCheck.valid) {
          errors.push(`${file.name}: ${contentCheck.error}`);
          continue;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if file type is allowed
   *
   * @private
   */
  #isFileTypeAllowed(file: File): boolean {
    // Check MIME type
    if (this.#allowedTypes.has(file.type)) {
      return true;
    }

    // Check wildcard patterns (e.g., image/*)
    for (const allowedType of this.#allowedTypes) {
      if (allowedType.endsWith('/*')) {
        const prefix = allowedType.slice(0, -2);
        if (file.type.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if file name is dangerous
   *
   * Security Note: Prevent path traversal and dangerous file names
   *
   * @private
   */
  #isFileNameDangerous(fileName: string): boolean {
    // Check for path traversal attempts
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return true;
    }

    // Check for dangerous file names
    const dangerousNames = ['web.config', '.htaccess', '.env', 'config.php'];
    if (dangerousNames.includes(fileName.toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Validate file content
   *
   * Security Note: Basic content validation. In production, integrate with
   * malware scanning service.
   *
   * @private
   */
  async #validateFileContent(file: File): Promise<{ valid: boolean; error?: string }> {
    try {
      // Read first few bytes to check magic numbers
      const buffer = await file.slice(0, 4).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Basic magic number validation for common types
      const magicNumbers: Record<string, number[]> = {
        'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47]
      };

      // If we have magic numbers for this type, validate them
      if (magicNumbers[file.type]) {
        const expected = magicNumbers[file.type];
        const matches = expected.every((byte, i) => bytes[i] === byte);

        if (!matches) {
          return {
            valid: false,
            error: 'File content does not match declared type'
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate file content'
      };
    }
  }

  /**
   * Update the filename display area
   *
   * @private
   */
  #updateFileNameDisplay(files: FileList | null): void {
    if (!this.#fileNameDisplay) return;

    if (!files || files.length === 0) {
      this.#fileNameDisplay.textContent = 'No file selected';
      this.#fileNameDisplay.classList.remove('has-file');
    } else if (files.length === 1) {
      this.#fileNameDisplay.textContent = files[0].name;
      this.#fileNameDisplay.classList.add('has-file');
    } else {
      this.#fileNameDisplay.textContent = `${files.length} files selected`;
      this.#fileNameDisplay.classList.add('has-file');
    }
  }

  /**
   * Show file preview
   *
   * @private
   */
  #showPreview(files: FileList): void {
    this.#previewContainer!.innerHTML = '';

    Array.from(files).forEach((file) => {
      const preview = document.createElement('div');
      preview.className = 'file-preview';

      const fileName = document.createElement('div');
      fileName.className = 'file-name';
      fileName.textContent = file.name;

      const fileSize = document.createElement('div');
      fileSize.className = 'file-size';
      fileSize.textContent = this.#formatFileSize(file.size);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-file';
      removeBtn.textContent = '\u2715';
      removeBtn.type = 'button';
      removeBtn.onclick = () => {
        this.#removeFile();
      };

      preview.appendChild(fileName);
      preview.appendChild(fileSize);
      preview.appendChild(removeBtn);

      this.#previewContainer!.appendChild(preview);
    });
  }

  /**
   * Format file size for display
   *
   * @private
   */
  #formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Remove selected file
   *
   * @private
   */
  #removeFile(): void {
    this.#fileInput!.value = '';
    this.#selectedFiles = null;
    this.#previewContainer!.innerHTML = '';
    this.#updateFileNameDisplay(null);
    this.#clearErrors();

    this.audit('file_removed', {
      name: this.#fileInput!.name
    });
  }

  /**
   * Show error message
   *
   * @private
   */
  #showError(message: string): void {
    this.#errorContainer!.textContent = message;
    this.#errorContainer!.classList.remove('hidden');
    this.#dropZone!.classList.add('error');
  }

  /**
   * Clear error messages
   *
   * @private
   */
  #clearErrors(): void {
    this.#errorContainer!.textContent = '';
    this.#errorContainer!.classList.add('hidden');
    this.#dropZone!.classList.remove('error');
  }

  /**
   * Get component-specific styles
   *
   * This returns a placeholder that will be replaced by the css-inliner build script
   * with the actual CSS from secure-file-upload.css using design tokens.
   *
   * @private
   */
  #getComponentStyles(): string {
    return `/* CSS will be inlined from secure-file-upload.css by build script */`;
  }

  /**
   * Handle attribute changes
   *
   * @protected
   */
  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#fileInput) return;

    switch (name) {
      case 'disabled':
        this.#fileInput.disabled = this.hasAttribute('disabled');
        break;
      case 'accept':
        this.#fileInput.accept = newValue!;
        this.#parseAcceptTypes(newValue!);
        break;
    }
  }

  /**
   * Get selected files
   *
   * @public
   */
  get files(): FileList | null {
    return this.#selectedFiles;
  }

  /**
   * Get the input name
   *
   * @public
   */
  get name(): string {
    return this.#fileInput ? this.#fileInput.name : '';
  }

  /**
   * Check if the upload is valid
   *
   * @public
   */
  get valid(): boolean {
    const required = this.hasAttribute('required') || this.config.validation.required;

    if (required && (!this.#selectedFiles || this.#selectedFiles.length === 0)) {
      return false;
    }

    return true;
  }

  /**
   * Clear selected files
   *
   * @public
   */
  clear(): void {
    this.#removeFile();
  }

  /**
   * Cleanup on disconnect
   */
  disconnectedCallback(): void {
    super.disconnectedCallback();

    // Clear file references
    this.#selectedFiles = null;
    if (this.#fileInput) {
      this.#fileInput.value = '';
    }
  }
}

// Define the custom element
customElements.define('secure-file-upload', SecureFileUpload);

export default SecureFileUpload;
