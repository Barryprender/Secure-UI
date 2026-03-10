/**
 * SecureFileUpload Branch Coverage Tests
 *
 * Targets the uncovered branches in secure-file-upload.ts:
 * - Drag events (dragover / dragleave / drop class management)
 * - Rate limit exceeded
 * - Multiple file display
 * - Magic number content validation (critical tier)
 * - Remove file button
 * - setScanHook / hasScanHook / scanning getters
 * - clear() with actual files selected
 * - handleAttributeChange
 * - File type rejection
 * - Dangerous file name rejection
 *
 * Note: happy-dom 20.x DragEvent.dataTransfer is undefined even when passed in
 * the constructor init dict.  File selection tests therefore use the change-event
 * path (fileInput.files assignment + Event('change')), which is fully supported.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureFileUpload, type ScanHookFn } from '../../src/components/secure-file-upload/secure-file-upload.js';

if (!customElements.get('secure-file-upload')) {
  customElements.define('secure-file-upload', SecureFileUpload);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDropZone(upload: SecureFileUpload): HTMLElement {
  return upload.shadowRoot!.querySelector('.drop-zone') as HTMLElement;
}

function getFileInput(upload: SecureFileUpload): HTMLInputElement {
  return upload.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
}

function getErrorContainer(upload: SecureFileUpload): HTMLElement {
  return upload.shadowRoot!.querySelector('.error-container') as HTMLElement;
}

function getFileNameDisplay(upload: SecureFileUpload): HTMLElement {
  return upload.shadowRoot!.querySelector('.file-name-display') as HTMLElement;
}

/**
 * Simulate file selection via the change event.
 *
 * happy-dom allows direct assignment to HTMLInputElement.files, so we set
 * the files via DataTransfer and fire the change event.  This exercises the
 * same #handleFileSelect() code path as a real browser file picker or drop.
 */
async function selectFiles(upload: SecureFileUpload, files: File[]): Promise<void> {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  const fileInput = getFileInput(upload);
  // happy-dom allows direct assignment here (unlike real browsers)
  (fileInput as HTMLInputElement & { files: FileList }).files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  // Wait for the async #handleFileSelect promise to settle
  await new Promise(resolve => setTimeout(resolve, 30));
}

function makeTxtFile(name = 'test.txt', sizeBytes = 10): File {
  return new File(['a'.repeat(sizeBytes)], name, { type: 'text/plain' });
}

function makePdfFile(valid = true): File {
  // Valid PDF magic bytes: %PDF = [0x25, 0x50, 0x44, 0x46]
  const bytes = valid
    ? new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a])
    : new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x0a]);
  return new File([bytes], 'test.pdf', { type: 'application/pdf' });
}

function makeJpegFile(valid = true): File {
  // Valid JPEG magic bytes: [0xFF, 0xD8, 0xFF]
  const bytes = valid
    ? new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    : new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  return new File([bytes], 'test.jpg', { type: 'image/jpeg' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecureFileUpload — branch coverage', () => {
  let upload: SecureFileUpload;

  beforeEach(() => {
    upload = document.createElement('secure-file-upload') as SecureFileUpload;
  });

  afterEach(() => {
    upload.remove();
    vi.restoreAllMocks();
  });

  // ── Drag events ────────────────────────────────────────────────────────────
  // Note: DragEvent.dataTransfer is undefined in happy-dom, so we only test
  // the CSS class management branches here.

  describe('Drag events', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);
    });

    it('dragover adds drag-over class to drop zone', () => {
      const dropZone = getDropZone(upload);
      dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      expect(dropZone.classList.contains('drag-over')).toBe(true);
    });

    it('dragleave removes drag-over class from drop zone', () => {
      const dropZone = getDropZone(upload);
      dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      dropZone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
      expect(dropZone.classList.contains('drag-over')).toBe(false);
    });

    it('drop always removes drag-over class (no dataTransfer in happy-dom)', () => {
      const dropZone = getDropZone(upload);
      // Add the class first
      dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      expect(dropZone.classList.contains('drag-over')).toBe(true);
      // Drop removes it
      dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      expect(dropZone.classList.contains('drag-over')).toBe(false);
    });

    it('drop with empty dataTransfer does not process files', async () => {
      const dt = new DataTransfer(); // no files
      const dropEvent = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      getDropZone(upload).dispatchEvent(dropEvent);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(upload.files).toBeNull();
    });
  });

  // ── File selection via change event ────────────────────────────────────────

  describe('File selection (change event)', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);
    });

    it('selecting a valid file dispatches secure-file-upload event', async () => {
      const handler = vi.fn();
      upload.addEventListener('secure-file-upload', handler);

      await selectFiles(upload, [makeTxtFile()]);

      expect(handler).toHaveBeenCalledOnce();
      const detail = handler.mock.calls[0][0].detail;
      expect(detail.files).toHaveLength(1);
    });

    it('selecting a valid file stores it in the files getter', async () => {
      await selectFiles(upload, [makeTxtFile()]);
      expect(upload.files).not.toBeNull();
      expect(upload.files!.length).toBe(1);
    });

    it('empty file list (change event with no files) returns early', async () => {
      const fileInput = getFileInput(upload);
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(upload.files).toBeNull();
    });
  });

  // ── Rate limit exceeded ────────────────────────────────────────────────────

  describe('Rate limit exceeded', () => {
    it('shows rate limit error after maxAttempts exceeded (critical tier = 5)', async () => {
      // critical tier: rateLimit.enabled=true, maxAttempts=5
      upload.setAttribute('security-tier', 'critical');
      document.body.appendChild(upload);

      const txtFile = makeTxtFile();

      // 5 successful uploads consume all rate limit tokens
      for (let i = 0; i < 5; i++) {
        await selectFiles(upload, [txtFile]);
      }

      // 6th upload → rate limit exceeded
      await selectFiles(upload, [txtFile]);

      const errorContainer = getErrorContainer(upload);
      expect(errorContainer.classList.contains('hidden')).toBe(false);
      expect(errorContainer.textContent).toMatch(/Too many upload attempts/i);

      // File input value should be cleared
      expect(getFileInput(upload).value).toBe('');
    });
  });

  // ── Multiple files display ─────────────────────────────────────────────────

  describe('Multiple file display', () => {
    it('shows "N files selected" when multiple files are selected', async () => {
      upload.setAttribute('security-tier', 'public');
      upload.setAttribute('multiple', '');
      document.body.appendChild(upload);

      await selectFiles(upload, [
        makeTxtFile('a.txt'),
        makeTxtFile('b.txt'),
        makeTxtFile('c.txt')
      ]);

      expect(getFileNameDisplay(upload).textContent).toBe('3 files selected');
    });

    it('shows single filename when one file is selected', async () => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);

      await selectFiles(upload, [makeTxtFile('single.txt')]);

      expect(getFileNameDisplay(upload).textContent).toBe('single.txt');
    });
  });

  // ── File content validation (critical tier magic numbers) ──────────────────

  describe('File content validation — JPEG magic numbers (critical tier)', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'critical');
      upload.setAttribute('accept', '.jpg');
      document.body.appendChild(upload);
    });

    it('rejects JPEG file whose bytes do not match JPEG magic numbers', async () => {
      await selectFiles(upload, [makeJpegFile(false)]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/does not match declared type/i);
    });

    it('accepts JPEG file with correct magic bytes [0xFF, 0xD8, 0xFF]', async () => {
      const handler = vi.fn();
      upload.addEventListener('secure-file-upload', handler);

      await selectFiles(upload, [makeJpegFile(true)]);

      expect(handler).toHaveBeenCalled();
      expect(getErrorContainer(upload).classList.contains('hidden')).toBe(true);
    });
  });

  describe('File content validation — PDF magic numbers (critical tier)', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'critical');
      upload.setAttribute('accept', '.pdf');
      document.body.appendChild(upload);
    });

    it('rejects PDF with wrong magic bytes', async () => {
      await selectFiles(upload, [makePdfFile(false)]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/does not match declared type/i);
    });

    it('accepts PDF with correct %PDF magic bytes', async () => {
      const handler = vi.fn();
      upload.addEventListener('secure-file-upload', handler);

      await selectFiles(upload, [makePdfFile(true)]);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('File content validation — no magic numbers for text/plain (critical tier)', () => {
    it('accepts text/plain file (no magic numbers defined for that MIME type)', async () => {
      upload.setAttribute('security-tier', 'critical');
      document.body.appendChild(upload);

      const handler = vi.fn();
      upload.addEventListener('secure-file-upload', handler);

      // txt is in critical default accept (.pdf,.txt); text/plain has no magic numbers
      await selectFiles(upload, [makeTxtFile()]);

      expect(handler).toHaveBeenCalled();
    });
  });

  // ── Remove file button ─────────────────────────────────────────────────────

  describe('Remove file button', () => {
    it('clicking remove button clears files and resets filename display', async () => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);

      await selectFiles(upload, [makeTxtFile('document.txt')]);
      expect(upload.files).not.toBeNull();
      expect(getFileNameDisplay(upload).textContent).toBe('document.txt');

      const removeBtn = upload.shadowRoot!.querySelector('.remove-file') as HTMLButtonElement;
      expect(removeBtn).not.toBeNull();
      removeBtn.click();

      expect(upload.files).toBeNull();
      expect(getFileNameDisplay(upload).textContent).toBe('No file selected');
    });

    it('clicking remove button empties the preview container', async () => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);

      await selectFiles(upload, [makeTxtFile()]);

      const preview = upload.shadowRoot!.querySelector('.preview-container') as HTMLElement;
      expect(preview.innerHTML).not.toBe('');

      const removeBtn = upload.shadowRoot!.querySelector('.remove-file') as HTMLButtonElement;
      removeBtn.click();

      expect(preview.innerHTML).toBe('');
    });

    it('clicking remove button clears error state on drop zone', async () => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);

      await selectFiles(upload, [makeTxtFile()]);
      const removeBtn = upload.shadowRoot!.querySelector('.remove-file') as HTMLButtonElement;
      removeBtn.click();

      expect(getDropZone(upload).classList.contains('error')).toBe(false);
    });
  });

  // ── setScanHook / hasScanHook / scanning ───────────────────────────────────

  describe('setScanHook / hasScanHook / scanning', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);
    });

    it('hasScanHook is false before any hook is registered', () => {
      expect(upload.hasScanHook).toBe(false);
    });

    it('hasScanHook is true after setScanHook is called', () => {
      upload.setScanHook(async () => ({ valid: true }));
      expect(upload.hasScanHook).toBe(true);
    });

    it('setScanHook throws TypeError when given a non-function', () => {
      expect(() => upload.setScanHook('not-a-function' as unknown as ScanHookFn)).toThrow(TypeError);
    });

    it('scanning is false initially', () => {
      expect(upload.scanning).toBe(false);
    });

    it('scan hook that rejects a file shows the rejection reason in error container', async () => {
      upload.setScanHook(async () => ({ valid: false, reason: 'malware detected' }));

      await selectFiles(upload, [makeTxtFile()]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/malware detected/i);
    });

    it('scan hook returning valid:true allows the file through', async () => {
      upload.setScanHook(async () => ({ valid: true }));

      const handler = vi.fn();
      upload.addEventListener('secure-file-upload', handler);

      await selectFiles(upload, [makeTxtFile()]);

      expect(handler).toHaveBeenCalled();
      expect(getErrorContainer(upload).classList.contains('hidden')).toBe(true);
    });

    it('scan hook that throws is handled gracefully with "Scan error:" message', async () => {
      upload.setScanHook(async () => {
        throw new Error('network timeout');
      });

      await selectFiles(upload, [makeTxtFile()]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/Scan error: network timeout/i);
    });

    it('scanning is false after hook completes', async () => {
      upload.setScanHook(async () => ({ valid: true }));
      await selectFiles(upload, [makeTxtFile()]);
      expect(upload.scanning).toBe(false);
    });
  });

  // ── clear() with files selected ────────────────────────────────────────────

  describe('clear() after files are selected', () => {
    it('clear() resets files, preview, and filename display', async () => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);

      await selectFiles(upload, [makeTxtFile('report.txt')]);
      expect(upload.files).not.toBeNull();

      upload.clear();

      expect(upload.files).toBeNull();
      expect(getFileNameDisplay(upload).textContent).toBe('No file selected');
      const preview = upload.shadowRoot!.querySelector('.preview-container') as HTMLElement;
      expect(preview.innerHTML).toBe('');
    });
  });

  // ── handleAttributeChange ──────────────────────────────────────────────────

  describe('handleAttributeChange', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);
    });

    it('setting disabled attribute disables the internal file input', () => {
      const fileInput = getFileInput(upload);
      expect(fileInput.disabled).toBe(false);

      upload.setAttribute('disabled', '');
      expect(fileInput.disabled).toBe(true);
    });

    it('removing disabled attribute re-enables the internal file input', () => {
      upload.setAttribute('disabled', '');
      const fileInput = getFileInput(upload);
      expect(fileInput.disabled).toBe(true);

      upload.removeAttribute('disabled');
      expect(fileInput.disabled).toBe(false);
    });

    it('changing accept attribute updates the internal file input', () => {
      upload.setAttribute('accept', '.pdf');
      expect(getFileInput(upload).accept).toBe('.pdf');
    });
  });

  // ── Dangerous file names ───────────────────────────────────────────────────

  describe('Dangerous file names (#isFileNameDangerous)', () => {
    beforeEach(() => {
      upload.setAttribute('security-tier', 'public');
      document.body.appendChild(upload);
    });

    it('rejects .htaccess filename', async () => {
      const file = new File(['content'], '.htaccess', { type: 'text/plain' });
      await selectFiles(upload, [file]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/Invalid file name/i);
    });

    it('rejects .env filename', async () => {
      const file = new File(['content'], '.env', { type: 'text/plain' });
      await selectFiles(upload, [file]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/Invalid file name/i);
    });

    it('rejects web.config filename', async () => {
      const file = new File(['content'], 'web.config', { type: 'text/plain' });
      await selectFiles(upload, [file]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/Invalid file name/i);
    });
  });

  // ── File type not in allow list ────────────────────────────────────────────

  describe('File type rejection (#isFileTypeAllowed)', () => {
    it('rejects file whose MIME type is not in the allowed list', async () => {
      upload.setAttribute('security-tier', 'public');
      upload.setAttribute('accept', '.pdf');
      document.body.appendChild(upload);

      const wrongTypeFile = new File(['content'], 'script.exe', { type: 'application/x-msdownload' });
      await selectFiles(upload, [wrongTypeFile]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/File type not allowed/i);
    });

    it('rejects file exceeding max size', async () => {
      upload.setAttribute('security-tier', 'critical');
      // critical max: 2MB
      upload.setAttribute('max-size', '100'); // 100 bytes max
      document.body.appendChild(upload);

      const bigFile = makeTxtFile('big.txt', 200);
      await selectFiles(upload, [bigFile]);

      const err = getErrorContainer(upload);
      expect(err.classList.contains('hidden')).toBe(false);
      expect(err.textContent).toMatch(/File size exceeds/i);
    });
  });
});
