/**
 * @fileoverview Secure Telemetry Provider
 *
 * An optional overlay component that wraps a <secure-form> and enriches
 * every submission with a signed environmental signals envelope.
 *
 * Architecture
 * ────────────
 * <secure-telemetry-provider signing-key="...">
 *   <secure-form ...>
 *     ...
 *   </secure-form>
 * </secure-telemetry-provider>
 *
 * What it does
 * ────────────
 * 1. Detects automation / headless browser characteristics at page load.
 * 2. Monitors the DOM for unexpected script injection via MutationObserver.
 * 3. Records mouse movement, keyboard activity, and pointer type.
 * 4. On `secure-form-submit`, generates a nonce-stamped envelope signed
 *    with the provided key using SubtleCrypto (HMAC-SHA-256).
 * 5. Injects the envelope as `_env` on the event's telemetry payload so the
 *    server can verify it server-side.
 *
 * Security Notes
 * ────────────
 * - The signing key set via `signing-key` attribute is a *symmetric* secret
 *   that MUST be kept server-side as well; it is used here only as a weak
 *   integrity hint to detect casual forgery, not as a cryptographic proof.
 * - For stronger guarantees, rotate the key per-session via a server nonce
 *   endpoint and inject it via script, not as a static HTML attribute.
 * - All signals are heuristic — a sufficiently motivated attacker can spoof
 *   them. The value is raising the cost of scripted attacks, not guaranteeing
 *   detection.
 *
 * @module secure-telemetry-provider
 * @license MIT
 */

import type {
  EnvironmentalSignals,
  SignedTelemetryEnvelope,
  SessionTelemetry
} from '../../core/types.js';

// ── Internal state type ───────────────────────────────────────────────────────

interface ProviderState {
  mouseMovementDetected: boolean;
  keyboardActivityDetected: boolean;
  injectedScriptCount: number;
  domMutationDetected: boolean;
  pointerType: 'mouse' | 'touch' | 'pen' | 'none';
  /** performance.now() at first keydown; -1 until a keystroke is recorded */
  firstKeystrokeAt: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export class SecureTelemetryProvider extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['signing-key'];
  }

  #state: ProviderState = {
    mouseMovementDetected: false,
    keyboardActivityDetected: false,
    injectedScriptCount: 0,
    domMutationDetected: false,
    pointerType: 'none',
    firstKeystrokeAt: -1,
  };

  /** performance.now() recorded at connectedCallback — baseline for timing signals */
  #connectedAt: number = 0;

  #mutationObserver: MutationObserver | null = null;
  #knownScripts: Set<Node> = new Set();

  // Bound listener references so we can cleanly remove them
  #onMouseMove: () => void = () => { this.#state.mouseMovementDetected = true; };
  #onKeydown: () => void = () => {
    this.#state.keyboardActivityDetected = true;
    if (this.#state.firstKeystrokeAt < 0) {
      this.#state.firstKeystrokeAt = performance.now();
    }
  };
  #onPointerDown: (e: PointerEvent) => void = (e: PointerEvent) => {
    this.#state.pointerType = e.pointerType as 'mouse' | 'touch' | 'pen';
  };
  #onFormSubmit: (e: Event) => void = (e: Event) => { void this.#handleFormSubmit(e); };

  connectedCallback(): void {
    this.#connectedAt = performance.now();

    // Snapshot existing scripts so we can detect later injections
    document.querySelectorAll('script').forEach(s => this.#knownScripts.add(s));

    this.#startMutationObserver();
    this.#attachListeners();
  }

  disconnectedCallback(): void {
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#removeListeners();
  }

  // ── Mutation observer: detect script injection ──────────────────────────────

  #startMutationObserver(): void {
    this.#mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of Array.from(mutation.addedNodes)) {
          if ((node as Element).tagName === 'SCRIPT' && !this.#knownScripts.has(node)) {
            this.#state.injectedScriptCount++;
            this.#state.domMutationDetected = true;
            this.#knownScripts.add(node);
          }
        }
      }
    });

    this.#mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── DOM event listeners ─────────────────────────────────────────────────────

  #attachListeners(): void {
    document.addEventListener('mousemove', this.#onMouseMove, { passive: true });
    document.addEventListener('keydown', this.#onKeydown, { passive: true });
    document.addEventListener('pointerdown', this.#onPointerDown as EventListener, { passive: true });
    this.addEventListener('secure-form-submit', this.#onFormSubmit);
  }

  #removeListeners(): void {
    document.removeEventListener('mousemove', this.#onMouseMove);
    document.removeEventListener('keydown', this.#onKeydown);
    document.removeEventListener('pointerdown', this.#onPointerDown as EventListener);
    this.removeEventListener('secure-form-submit', this.#onFormSubmit);
  }

  // ── Signal collection ───────────────────────────────────────────────────────

  /**
   * Collect a point-in-time snapshot of all environmental signals.
   */
  collectSignals(): EnvironmentalSignals {
    const nav = navigator as Navigator & Record<string, unknown>;

    const webdriverDetected =
      nav['webdriver'] === true ||
      Object.prototype.hasOwnProperty.call(nav, 'webdriver');

    // Headless Chrome leaves traces in userAgent and missing APIs
    const ua = navigator.userAgent;
    const headlessDetected =
      ua.includes('HeadlessChrome') ||
      ua.includes('Headless') ||
      (typeof (window as unknown as Record<string, unknown>)['chrome'] === 'undefined' &&
        ua.includes('Chrome'));

    const suspiciousScreenSize =
      screen.width === 0 ||
      screen.height === 0 ||
      (screen.width < 100 && screen.height < 100);

    const now = performance.now();
    const pageLoadToFirstKeystroke = this.#state.firstKeystrokeAt >= 0
      ? Math.round(this.#state.firstKeystrokeAt - this.#connectedAt)
      : -1;
    const loadToSubmit = Math.round(now - this.#connectedAt);

    return {
      webdriverDetected,
      headlessDetected,
      domMutationDetected: this.#state.domMutationDetected,
      injectedScriptCount: this.#state.injectedScriptCount,
      suspiciousScreenSize,
      pointerType: this.#state.pointerType,
      mouseMovementDetected: this.#state.mouseMovementDetected,
      keyboardActivityDetected: this.#state.keyboardActivityDetected,
      pageLoadToFirstKeystroke,
      loadToSubmit,
    };
  }

  // ── Signing ─────────────────────────────────────────────────────────────────

  /**
   * Generate a signed envelope using HMAC-SHA-256 via SubtleCrypto.
   * Falls back to an unsigned envelope if SubtleCrypto is unavailable
   * (e.g., non-secure context in tests) — the server should treat
   * unsigned envelopes with reduced trust.
   */
  async sign(signals: EnvironmentalSignals): Promise<SignedTelemetryEnvelope> {
    const nonce = this.#generateNonce();
    const issuedAt = new Date().toISOString();
    const signingKey = this.getAttribute('signing-key') ?? '';

    const payload = `${nonce}.${issuedAt}.${JSON.stringify(signals)}`;
    const signature = await this.#hmacSha256(signingKey, payload);

    return { nonce, issuedAt, environment: signals, signature };
  }

  #generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async #hmacSha256(key: string, data: string): Promise<string> {
    if (!crypto.subtle) {
      // Non-secure context (HTTP in dev) — return empty signature
      return '';
    }

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(data));
    return Array.from(new Uint8Array(signatureBuffer), b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Form submit interception ─────────────────────────────────────────────────

  async #handleFormSubmit(event: Event): Promise<void> {
    const detail = (event as CustomEvent).detail as {
      telemetry?: SessionTelemetry & { _env?: SignedTelemetryEnvelope };
    };

    if (!detail?.telemetry) return;

    try {
      const signals = this.collectSignals();
      const envelope = await this.sign(signals);

      // Attach the signed envelope directly onto the telemetry object.
      // Because both this handler and downstream listeners receive the same
      // detail object reference, waiting listeners that check after an async
      // tick will see the enriched value.
      detail.telemetry._env = envelope;
    } catch {
      // Signing failure (e.g. non-secure context) must not block form submission.
      // The server should treat a missing _env as an unsigned, lower-trust submission.
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Get the current environmental signals without triggering a form submit.
   * Useful for pre-flight checks or progressive disclosure flows.
   */
  getEnvironmentalSignals(): EnvironmentalSignals {
    return this.collectSignals();
  }
}

customElements.define('secure-telemetry-provider', SecureTelemetryProvider);

export default SecureTelemetryProvider;
