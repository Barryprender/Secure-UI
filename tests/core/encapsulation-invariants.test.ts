/**
 * Encapsulation invariants — the security audit regression suite.
 *
 * Each test here corresponds to a finding where the library's stated guarantee
 * was not enforced at runtime. They exist because every one of these holes was
 * invisible to the type checker: TypeScript's `protected` is erased at compile
 * time, so a `protected` member ships as an ordinary public prototype method.
 *
 * If one of these starts failing, a security invariant has regressed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../../src/components/secure-input/secure-input.js';
import '../../src/components/secure-card/secure-card.js';
import '../../src/components/secure-table/secure-table.js';
import '../../src/components/secure-password-confirm/secure-password-confirm.js';
import { internals } from '../helpers/internals.js';

const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

async function mount<T extends HTMLElement>(
  tag: string,
  attrs: Record<string, string> = {}
): Promise<T> {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await tick();
  return el as T;
}

describe('encapsulation invariants', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  describe('the closed shadow root is unreachable from page script', () => {
    // Was: `protected get root()` compiled to a public getter, so
    // `el.root.querySelector('input').value` returned the real password of a
    // masked CRITICAL field, and the raw PAN and CVC of a secure-card.
    const tags = ['secure-input', 'secure-card', 'secure-table', 'secure-password-confirm'];

    it.each(tags)('%s exposes no `root` accessor', async (tag) => {
      const el = await mount(tag, { name: 'x' });
      expect((el as unknown as Record<string, unknown>)['root']).toBeUndefined();
      expect(el.shadowRoot).toBeNull();
    });

    it('no prototype in the chain defines a `root` accessor', async () => {
      const el = await mount('secure-input', { name: 'x' });
      for (let p: object | null = Object.getPrototypeOf(el) as object | null;
           p && p !== Object.prototype;
           p = Object.getPrototypeOf(p) as object | null) {
        expect(Object.getOwnPropertyDescriptor(p, 'root')).toBeUndefined();
      }
    });

    it('no symbol on the library prototypes leaks the shadow root', async () => {
      // A Symbol key is discoverable via getOwnPropertySymbols, which is why the
      // privileged surface lives in a module-scoped WeakMap instead.
      //
      // Scope: the component's own prototype chain. The happy-dom instance
      // additionally carries Symbol(shadowRoot) as its internal storage for a
      // closed root — that is the DOM implementation, not this library. A real
      // browser keeps it in an internal slot with no property key at all, so
      // asserting over instance symbols would test happy-dom, not us.
      const el = await mount('secure-input', { name: 'x' });
      const seen: unknown[] = [];
      for (let p: object | null = Object.getPrototypeOf(el) as object | null;
           p && p !== Object.prototype;
           p = Object.getPrototypeOf(p) as object | null) {
        for (const sym of Object.getOwnPropertySymbols(p)) {
          seen.push((el as unknown as Record<symbol, unknown>)[sym]);
        }
      }
      expect(seen.some((v) => v instanceof ShadowRoot)).toBe(false);
    });

    it('internals() still reaches it from inside the package', async () => {
      const el = await mount('secure-input', { name: 'x' });
      expect(internals(el as never).root).toBeInstanceOf(ShadowRoot);
    });
  });

  describe('privileged members are absent from the public surface', () => {
    // Was: every one of these shipped as a public prototype method.
    // addComponentStyles() injected CSS into the closed shadow root (which a
    // strict CSP does not block, because adoptedStyleSheets are exempt from
    // style-src 'unsafe-inline'), enabling attribute-selector exfiltration.
    // clearAuditLog() erased evidence; audit() forged it; the telemetry
    // recorders faked human behaviour to defeat the risk score.
    const forbidden = [
      'root', 'initializeSecurity', 'addComponentStyles', 'getBaseStylesheetUrl',
      'audit', 'clearAuditLog', 'checkRateLimit', 'detectInjection', 'rerender',
      'recordTelemetryFocus', 'recordTelemetryInput', 'recordTelemetryBlur',
      'setupAutofillDetection',
    ];

    it.each(forbidden)('secure-input does not expose %s', async (member) => {
      const el = await mount('secure-input', { name: 'x' });
      expect((el as unknown as Record<string, unknown>)[member]).toBeUndefined();
    });

    it('the intended public API is still present', async () => {
      const el = await mount('secure-input', { name: 'x' });
      for (const member of ['value', 'valid', 'securityTier', 'config',
                            'getAuditLog', 'reportError', 'clearExternalError',
                            'getFieldTelemetry']) {
        expect((el as unknown as Record<string, unknown>)[member]).toBeDefined();
      }
    });
  });

  describe('the security tier is write-once', () => {
    it('cannot be downgraded after mount', async () => {
      const el = await mount('secure-input', { name: 'pw', type: 'password', 'security-tier': 'critical' });
      const typed = el as unknown as { securityTier: string; config: { masking: { enabled: boolean } } };
      expect(typed.securityTier).toBe('critical');

      el.setAttribute('security-tier', 'public');

      expect(typed.securityTier).toBe('critical');
      expect(typed.config.masking.enabled).toBe(true);
      // The attribute is reverted too — tier badges and borders are driven by
      // :host([security-tier="…"]), so a poisoned attribute repainted the field.
      expect(el.getAttribute('security-tier')).toBe('critical');
    });

    it('survives detach and re-attach with a poisoned attribute', async () => {
      const el = await mount('secure-input', { name: 'pw', 'security-tier': 'critical' });
      el.remove();
      el.setAttribute('security-tier', 'public');
      document.body.appendChild(el);
      await tick();
      expect((el as unknown as { securityTier: string }).securityTier).toBe('critical');
    });

    it('holds for a component that manages its own rendering', async () => {
      // secure-table skips the base render pass. It previously called a public
      // initializeSecurity() instead of super.connectedCallback(), which left
      // #initialized false forever — disabling this guard entirely.
      const el = await mount('secure-table', { 'security-tier': 'critical' });
      el.remove();
      el.setAttribute('security-tier', 'public');
      document.body.appendChild(el);
      await tick();
      expect((el as unknown as { securityTier: string }).securityTier).toBe('critical');
    });

    it('an invalid tier falls back to CRITICAL rather than the requested value', async () => {
      const el = await mount('secure-input', { name: 'x', 'security-tier': 'sensative' });
      expect((el as unknown as { securityTier: string }).securityTier).toBe('critical');
    });
  });

  describe('components locked to CRITICAL', () => {
    it.each(['secure-card', 'secure-password-confirm'])(
      '%s ignores a security-tier attribute in markup',
      async (tag) => {
        const el = await mount(tag, { name: 'x', 'security-tier': 'public' });
        expect((el as unknown as { securityTier: string }).securityTier).toBe('critical');
      }
    );
  });
});
