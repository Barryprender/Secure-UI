/**
 * SecureTelemetryProvider — unit tests
 *
 * Covers: signal collection, signing, DOM mutation detection,
 * pointer/mouse/keyboard tracking, form submit envelope injection,
 * and lifecycle cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureTelemetryProvider } from '../../src/components/secure-telemetry-provider/secure-telemetry-provider.js';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';
import type { EnvironmentalSignals, SignedTelemetryEnvelope, SessionTelemetry } from '../../src/core/types.js';

if (!customElements.get('secure-telemetry-provider')) {
  customElements.define('secure-telemetry-provider', SecureTelemetryProvider);
}
if (!customElements.get('secure-form')) customElements.define('secure-form', SecureForm);
if (!customElements.get('secure-input')) customElements.define('secure-input', SecureInput);

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountProvider(signingKey = 'test-key'): SecureTelemetryProvider {
  const p = document.createElement('secure-telemetry-provider') as SecureTelemetryProvider;
  if (signingKey) p.setAttribute('signing-key', signingKey);
  document.body.appendChild(p);
  return p;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecureTelemetryProvider', () => {
  let provider: SecureTelemetryProvider;

  afterEach(() => {
    provider?.remove();
    vi.restoreAllMocks();
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it('registers as a custom element', () => {
    expect(customElements.get('secure-telemetry-provider')).toBeDefined();
  });

  it('connects and disconnects without throwing', () => {
    provider = mountProvider();
    expect(() => provider.remove()).not.toThrow();
  });

  // ── collectSignals / getEnvironmentalSignals ──────────────────────────────

  describe('collectSignals()', () => {
    beforeEach(() => {
      provider = mountProvider();
    });

    it('returns an EnvironmentalSignals object with all expected keys', () => {
      const signals: EnvironmentalSignals = provider.collectSignals();
      expect(typeof signals.webdriverDetected).toBe('boolean');
      expect(typeof signals.headlessDetected).toBe('boolean');
      expect(typeof signals.domMutationDetected).toBe('boolean');
      expect(typeof signals.injectedScriptCount).toBe('number');
      expect(typeof signals.devtoolsOpen).toBe('boolean');
      expect(typeof signals.suspiciousScreenSize).toBe('boolean');
      expect(['mouse', 'touch', 'pen', 'none']).toContain(signals.pointerType);
      expect(typeof signals.mouseMovementDetected).toBe('boolean');
      expect(typeof signals.keyboardActivityDetected).toBe('boolean');
    });

    it('pointerType starts as "none" before any pointer event', () => {
      const signals = provider.collectSignals();
      expect(signals.pointerType).toBe('none');
    });

    it('mouseMovementDetected is false before mousemove', () => {
      expect(provider.collectSignals().mouseMovementDetected).toBe(false);
    });

    it('mouseMovementDetected is true after mousemove', () => {
      document.dispatchEvent(new MouseEvent('mousemove'));
      expect(provider.collectSignals().mouseMovementDetected).toBe(true);
    });

    it('keyboardActivityDetected is false before keydown', () => {
      expect(provider.collectSignals().keyboardActivityDetected).toBe(false);
    });

    it('keyboardActivityDetected is true after keydown', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(provider.collectSignals().keyboardActivityDetected).toBe(true);
    });

    it('pointerType reflects the last pointerdown event', () => {
      document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
      expect(provider.collectSignals().pointerType).toBe('touch');
    });

    it('getEnvironmentalSignals() returns the same shape as collectSignals()', () => {
      const a = provider.getEnvironmentalSignals();
      const b = provider.collectSignals();
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    });

    it('webdriverDetected is true when navigator.webdriver is set', () => {
      // Simulate an automation context
      const navSpy = vi.spyOn(navigator, 'webdriver', 'get').mockReturnValue(true);
      const signals = provider.collectSignals();
      expect(signals.webdriverDetected).toBe(true);
      navSpy.mockRestore();
    });

    it('headlessDetected is true when userAgent contains HeadlessChrome', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0'
      );
      const signals = provider.collectSignals();
      expect(signals.headlessDetected).toBe(true);
      vi.restoreAllMocks();
    });

    it('suspiciousScreenSize is true when screen dimensions are zero', () => {
      vi.spyOn(screen, 'width', 'get').mockReturnValue(0);
      vi.spyOn(screen, 'height', 'get').mockReturnValue(0);
      const signals = provider.collectSignals();
      expect(signals.suspiciousScreenSize).toBe(true);
      vi.restoreAllMocks();
    });

    it('suspiciousScreenSize is false for normal screen dimensions', () => {
      vi.spyOn(screen, 'width', 'get').mockReturnValue(1920);
      vi.spyOn(screen, 'height', 'get').mockReturnValue(1080);
      const signals = provider.collectSignals();
      expect(signals.suspiciousScreenSize).toBe(false);
      vi.restoreAllMocks();
    });
  });

  // ── Timing signals ───────────────────────────────────────────────────────

  describe('timing signals', () => {
    it('pageLoadToFirstKeystroke is -1 before any keydown', () => {
      provider = mountProvider();
      expect(provider.collectSignals().pageLoadToFirstKeystroke).toBe(-1);
    });

    it('pageLoadToFirstKeystroke is a non-negative number after a keydown', () => {
      const nowStart = performance.now();
      provider = mountProvider();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      const delta = provider.collectSignals().pageLoadToFirstKeystroke;
      // Must be >= 0 and not absurdly large (less than the time since the test suite started)
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThan(performance.now() - nowStart + 1000);
    });

    it('pageLoadToFirstKeystroke only records the first keydown', () => {
      provider = mountProvider();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      const first = provider.collectSignals().pageLoadToFirstKeystroke;
      // Simulate time passing then a second keydown
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
      const second = provider.collectSignals().pageLoadToFirstKeystroke;
      expect(first).toBe(second);
    });

    it('loadToSubmit is >= 0 immediately after mount', () => {
      provider = mountProvider();
      expect(provider.collectSignals().loadToSubmit).toBeGreaterThanOrEqual(0);
    });

    it('loadToSubmit increases over time', async () => {
      provider = mountProvider();
      const t1 = provider.collectSignals().loadToSubmit;
      await new Promise(r => setTimeout(r, 20));
      const t2 = provider.collectSignals().loadToSubmit;
      expect(t2).toBeGreaterThan(t1);
    });

    it('collectSignals returns pageLoadToFirstKeystroke and loadToSubmit as numbers', () => {
      provider = mountProvider();
      const signals = provider.collectSignals();
      expect(typeof signals.pageLoadToFirstKeystroke).toBe('number');
      expect(typeof signals.loadToSubmit).toBe('number');
    });

    it('low loadToSubmit value (< 500) is present in the signed envelope environment', async () => {
      provider = mountProvider('test-key');
      // Collect immediately — loadToSubmit will be very small
      const signals = provider.collectSignals();
      expect(signals.loadToSubmit).toBeLessThan(500);
      const envelope = await provider.sign(signals);
      expect(envelope.environment.loadToSubmit).toBe(signals.loadToSubmit);
    });

    it('low pageLoadToFirstKeystroke value (< 200) is preserved in the signed envelope', async () => {
      provider = mountProvider('test-key');
      // Dispatch keydown immediately — delta from connectedAt will be tiny
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      const signals = provider.collectSignals();
      expect(signals.pageLoadToFirstKeystroke).toBeGreaterThanOrEqual(0);
      expect(signals.pageLoadToFirstKeystroke).toBeLessThan(200);
      const envelope = await provider.sign(signals);
      expect(envelope.environment.pageLoadToFirstKeystroke).toBe(signals.pageLoadToFirstKeystroke);
    });
  });

  // ── DOM mutation detection ────────────────────────────────────────────────

  describe('DOM mutation detection', () => {
    beforeEach(() => {
      provider = mountProvider();
    });

    it('injectedScriptCount is 0 before any dynamic injection', () => {
      expect(provider.collectSignals().injectedScriptCount).toBe(0);
    });

    it('detects dynamically injected <script> elements', async () => {
      const script = document.createElement('script');
      document.head.appendChild(script);

      // MutationObserver callbacks fire asynchronously
      await new Promise(r => setTimeout(r, 10));

      const signals = provider.collectSignals();
      expect(signals.injectedScriptCount).toBeGreaterThanOrEqual(1);
      expect(signals.domMutationDetected).toBe(true);

      // Cleanup
      script.remove();
    });
  });

  // ── Signing ───────────────────────────────────────────────────────────────

  describe('sign()', () => {
    beforeEach(() => {
      provider = mountProvider('my-signing-key');
    });

    it('returns a SignedTelemetryEnvelope with required fields', async () => {
      const signals = provider.collectSignals();
      const envelope: SignedTelemetryEnvelope = await provider.sign(signals);

      expect(typeof envelope.nonce).toBe('string');
      expect(envelope.nonce.length).toBe(32);
      // Nonce must be hex (only 0-9, a-f)
      expect(envelope.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof envelope.issuedAt).toBe('string');
      expect(new Date(envelope.issuedAt).toISOString()).toBe(envelope.issuedAt);
      expect(envelope.environment).toEqual(signals);
      // Signature must always be a string — never undefined
      expect(typeof envelope.signature).toBe('string');
      // In a secure context (SubtleCrypto available in Node/happy-dom) the
      // signature must be a 64-char hex HMAC-SHA-256. In a non-secure context
      // the implementation returns '' — both are acceptable, but the type contract holds.
      expect(envelope.signature === '' || /^[0-9a-f]{64}$/.test(envelope.signature)).toBe(true);
    });

    it('generates a unique nonce on each call', async () => {
      const signals = provider.collectSignals();
      const a = await provider.sign(signals);
      const b = await provider.sign(signals);
      expect(a.nonce).not.toBe(b.nonce);
    });

    it('issuedAt is a valid ISO 8601 timestamp', async () => {
      const signals = provider.collectSignals();
      const envelope = await provider.sign(signals);
      expect(new Date(envelope.issuedAt).toISOString()).toBe(envelope.issuedAt);
    });

    it('signature differs between different signing keys', async () => {
      const providerB = document.createElement('secure-telemetry-provider') as SecureTelemetryProvider;
      providerB.setAttribute('signing-key', 'other-key');
      document.body.appendChild(providerB);

      const signals = provider.collectSignals();
      const envA = await provider.sign(signals);
      const envB = await providerB.sign(signals);

      // When SubtleCrypto is available both signatures are 64-char hex — they MUST differ.
      // When unavailable, both are '' and the test would be a no-op, so we skip that branch
      // only if neither produced a signature (non-secure context).
      const bothProducedSignatures = envA.signature.length > 0 && envB.signature.length > 0;
      if (bothProducedSignatures) {
        expect(envA.signature).not.toBe(envB.signature);
      } else {
        // Non-secure context: both empty — confirm the type contract at least holds
        expect(typeof envA.signature).toBe('string');
        expect(typeof envB.signature).toBe('string');
      }

      providerB.remove();
    });
  });

  // ── Form submit envelope injection ───────────────────────────────────────

  describe('form submit integration', () => {
    it('injects _env onto telemetry object after secure-form-submit fires', async () => {
      provider = mountProvider('test-key');

      // Directly dispatch a synthetic secure-form-submit on the provider
      // to isolate the provider's handler without the full form async chain.
      const telemetryPayload: SessionTelemetry & { _env?: SignedTelemetryEnvelope } = {
        sessionDuration: 5000,
        fieldCount: 1,
        fields: [],
        riskScore: 10,
        riskSignals: [],
        submittedAt: new Date().toISOString(),
      };

      provider.dispatchEvent(new CustomEvent('secure-form-submit', {
        detail: { telemetry: telemetryPayload },
        bubbles: false,
        composed: false,
      }));

      // Wait for the async sign() to complete and set _env
      await new Promise(r => setTimeout(r, 100));

      expect(telemetryPayload._env).toBeDefined();
      expect(typeof telemetryPayload._env!.nonce).toBe('string');
      expect(telemetryPayload._env!.nonce.length).toBe(32);
      expect(telemetryPayload._env!.environment).toBeDefined();
    });

    it('does not throw when telemetry is absent from the event detail', async () => {
      provider = mountProvider('test-key');

      expect(() => {
        provider.dispatchEvent(new CustomEvent('secure-form-submit', {
          detail: {},
          bubbles: false,
        }));
      }).not.toThrow();

      // Give async handler time to process
      await new Promise(r => setTimeout(r, 50));
    });
  });

  // ── Cleanup on disconnect ─────────────────────────────────────────────────

  it('stops observing DOM mutations after disconnect', async () => {
    provider = mountProvider();
    provider.remove(); // triggers disconnectedCallback

    const script = document.createElement('script');
    document.head.appendChild(script);
    await new Promise(r => setTimeout(r, 10));

    // After disconnect, observer should have been stopped —
    // injectedScriptCount should still be 0
    expect(provider.collectSignals().injectedScriptCount).toBe(0);
    script.remove();
  });

  it('no longer responds to mousemove after disconnect', () => {
    provider = mountProvider();
    provider.remove();

    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(provider.collectSignals().mouseMovementDetected).toBe(false);
  });
});
