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
      expect(typeof envelope.issuedAt).toBe('string');
      expect(() => new Date(envelope.issuedAt)).not.toThrow();
      expect(envelope.environment).toEqual(signals);
      expect(typeof envelope.signature).toBe('string');
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

      // Signatures should differ (different keys)
      // In non-secure contexts SubtleCrypto may not be available, both return ''
      if (envA.signature && envB.signature) {
        expect(envA.signature).not.toBe(envB.signature);
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
