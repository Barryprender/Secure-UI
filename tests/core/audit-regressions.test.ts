/**
 * Security audit regressions — findings outside the encapsulation set.
 *
 * Each test reproduces the exact attack from the audit. A failure here means a
 * fixed vulnerability has come back.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/components/secure-table/secure-table.js';
import '../../src/components/secure-file-upload/secure-file-upload.js';
import '../../src/components/secure-form/secure-form.js';
import '../../src/components/secure-input/secure-input.js';
import { getTierConfig, TIER_CONFIG, SecurityTier } from '../../src/core/security-config.js';
import { shadowOf } from '../helpers/internals.js';

const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

async function mountTable(inner: string): Promise<HTMLElement> {
  const el = document.createElement('secure-table');
  el.innerHTML = inner;
  document.body.appendChild(el);
  await tick();
  await tick();
  return el;
}

describe('audit regressions', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  describe('SecureTable URL sanitisation', () => {
    // Was: /^\s*(javascript|data)\s*:/i required a contiguous scheme. Browsers
    // strip TAB/LF/CR from inside a scheme before parsing, so java<TAB>script:
    // slipped through and was re-serialized with the TAB intact.
    const payloads: [string, string][] = [
      ['tab', 'java&#9;script:alert(1)'],
      ['newline', 'java&#10;script:alert(1)'],
      ['carriage return', 'java&#13;script:alert(1)'],
      ['leading control', '&#1;javascript:alert(1)'],
      ['mixed case', 'JaVaScRiPt:alert(1)'],
      ['plain', 'javascript:alert(1)'],
      ['data html', 'data:text/html,<script>alert(1)</script>'],
      ['vbscript', 'vbscript:msgbox(1)'],
      ['blob', 'blob:https://evil.example/x'],
    ];

    it.each(payloads)('strips a %s obfuscated scheme', async (_label, payload) => {
      const el = await mountTable(`
        <table slot="table">
          <thead><tr><th data-key="site">Site</th></tr></thead>
          <tbody><tr><td data-key="site"><a href="${payload}">x</a></td></tr></tbody>
        </table>`);
      const html = shadowOf(el).innerHTML;
      expect(html).not.toMatch(/href="[^"]*script/i);
      expect(html).not.toMatch(/href="[^"]*data:/i);
      expect(html).not.toMatch(/href="[^"]*blob:/i);
    });

    it('keeps a safe relative link', async () => {
      const el = await mountTable(`
        <table slot="table">
          <thead><tr><th data-key="site">Site</th></tr></thead>
          <tbody><tr><td data-key="site"><a href="/profile/42">x</a></td></tr></tbody>
        </table>`);
      expect(shadowOf(el).innerHTML).toContain('href="/profile/42"');
    });

    it('keeps http, https and mailto links', async () => {
      const el = await mountTable(`
        <table slot="table">
          <thead><tr><th data-key="site">Site</th></tr></thead>
          <tbody><tr><td data-key="site"><a href="https://example.com/x">x</a></td></tr></tbody>
        </table>`);
      expect(shadowOf(el).innerHTML).toContain('https://example.com/x');
    });
  });

  describe('SecureTable tier masking', () => {
    // Was: #renderCell checked `${key}_html` before masking, and
    // #parseSlottedTable creates that key for ANY cell containing a '<'. So a
    // CRITICAL column rendered in full whenever the server wrapped it in markup.
    it.each(['critical', 'sensitive'])('masks a %s column even when the cell contains markup', async (tier) => {
      const el = await mountTable(`
        <table slot="table">
          <thead><tr><th data-key="ssn" data-tier="${tier}">SSN</th></tr></thead>
          <tbody><tr><td data-key="ssn"><span>123-45-6789</span></td></tr></tbody>
        </table>`);
      expect(shadowOf(el).innerHTML).not.toContain('123-45-6789');
    });

    it('escapes the visible tail of a sensitive value', async () => {
      const el = await mountTable(`
        <table slot="table">
          <thead><tr><th data-key="v" data-tier="sensitive">V</th></tr></thead>
          <tbody><tr><td data-key="v">abcdef&lt;a h</td></tr></tbody>
        </table>`);
      // The 4-character tail must not reach the innerHTML sink as raw markup.
      expect(shadowOf(el).innerHTML).not.toMatch(/<a h/);
    });
  });

  describe('SecureFileUpload type gating', () => {
    const mountUpload = async (accept?: string): Promise<HTMLElement> => {
      const el = document.createElement('secure-file-upload');
      el.setAttribute('name', 'f');
      if (accept !== undefined) el.setAttribute('accept', accept);
      document.body.appendChild(el);
      await tick();
      return el;
    };

    const selectFile = async (el: HTMLElement, file: File): Promise<void> => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = shadowOf(el).querySelector('input[type="file"]') as HTMLInputElement;
      (input as HTMLInputElement & { files: FileList }).files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => { setTimeout(r, 30); });
    };

    const accepted = (el: HTMLElement): boolean =>
      ((el as unknown as { files: unknown[] }).files ?? []).length > 0;

    // Was: unrecognised extensions were dropped, leaving an empty allowlist, and
    // the check gated on `#allowedTypes.size > 0` — so it was skipped entirely
    // and accept=".webp" accepted .html, .svg, .exe, anything.
    it('rejects an HTML file when accept lists only unmapped extensions', async () => {
      const el = await mountUpload('.webp,.avif');
      await selectFile(el, new File(['<script>alert(1)</script>'], 'payload.html', { type: 'text/html' }));
      expect(accepted(el)).toBe(false);
    });

    it('accepts a file whose extension is in an unmapped accept list', async () => {
      const el = await mountUpload('.webp,.avif');
      await selectFile(el, new File(['x'], 'photo.webp', { type: 'image/webp' }));
      expect(accepted(el)).toBe(true);
    });

    // Was: 'image/svg+xml'.startsWith('image') matched the wildcard, re-admitting
    // the one type deliberately removed from the extension map.
    it.each([
      ['image/*', 'logo.svg', 'image/svg+xml'],
      ['image/*', 'page.html', 'text/html'],
      ['image/*', 'doc.xml', 'text/xml'],
    ])('accept="%s" still denies %s', async (accept, name, type) => {
      const el = await mountUpload(accept);
      await selectFile(el, new File(['<svg onload="alert(1)"/>'], name, { type }));
      expect(accepted(el)).toBe(false);
    });

    it('accept="image/*" still allows a real PNG', async () => {
      const el = await mountUpload('image/*');
      const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        'logo.png', { type: 'image/png' });
      await selectFile(el, png);
      expect(accepted(el)).toBe(true);
    });

    // Was: bidi overrides passed the name check, so `invoice<RLO>fdp.exe`
    // displayed as `invoiceexe.pdf`.
    it('rejects a filename containing a bidirectional override', async () => {
      const el = await mountUpload('.txt');
      await selectFile(el, new File(['x'], 'invoice‮fdp.exe', { type: 'text/plain' }));
      expect(accepted(el)).toBe(false);
    });
  });

  describe('getTierConfig fail-secure', () => {
    // Was: a truthiness check on an inherited-property lookup, so
    // getTierConfig('constructor') returned the Object constructor.
    it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
      'falls back to CRITICAL for the prototype key %s',
      (key) => {
        expect(getTierConfig(key as never)).toBe(TIER_CONFIG[SecurityTier.CRITICAL]);
      }
    );

    it.each(['public', 'authenticated', 'sensitive', 'critical'])(
      'still resolves the real tier %s',
      (tier) => {
        expect(getTierConfig(tier as never)).toBe(
          TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
        );
      }
    );
  });

  describe('SecureForm action validation', () => {
    const mountForm = async (inner: string, attrs: Record<string, string>): Promise<HTMLElement> => {
      const el = document.createElement('secure-form');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.innerHTML = inner;
      document.body.appendChild(el);
      await tick();
      return el;
    };

    // Was: only an `action` on the custom element was validated. The adopted
    // form's own action was never read — and then received the CSRF token.
    it.each([
      'https://evil.example/collect',
      '//evil.example/collect',
      'javascript:alert(1)',
      'https://self@evil.example/x',
    ])('removes the unsafe adopted action %s', async (action) => {
      const el = await mountForm(
        `<form action="${action}" method="post"></form>`,
        { 'csrf-token': 'SECRET', 'security-tier': 'sensitive' }
      );
      const inner = el.querySelector('form')!;
      expect(inner.getAttribute('action')).not.toBe(action);
    });

    it('keeps a same-origin adopted action', async () => {
      const el = await mountForm(
        `<form action="/api/profile" method="post"></form>`,
        { 'csrf-token': 'SECRET', 'security-tier': 'sensitive' }
      );
      expect(el.querySelector('form')!.getAttribute('action')).toBe('/api/profile');
    });

    // Was: `!" "` is false, so a whitespace-only token satisfied the gate.
    it('treats a whitespace-only CSRF token as absent', async () => {
      const el = await mountForm('', { 'csrf-token': ' ', 'security-tier': 'critical' });
      const csrf = el.querySelector<HTMLInputElement>('input[name="csrf_token"]');
      expect(csrf).toBeNull();
    });

    it('still accepts a real CSRF token', async () => {
      const el = await mountForm('', { 'csrf-token': 'real-token', 'security-tier': 'critical' });
      const csrf = el.querySelector<HTMLInputElement>('input[name="csrf_token"]');
      expect(csrf?.value).toBe('real-token');
    });
  });
});
