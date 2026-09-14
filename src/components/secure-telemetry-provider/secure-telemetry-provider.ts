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
  SessionTelemetry,
  ThreatDetectedDetail
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
  /** Threat signals detected by child components during this session */
  threatSignals: ThreatDetectedDetail[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export class SecureTelemetryProvider extends HTMLElement {
  /** No observed attributes — signing-key is intentionally not a DOM attribute.
   *  Use setSigningKey() to supply the key programmatically so it is never
   *  readable via getAttribute(), devtools, or XSS. */
  static get observedAttributes(): string[] {
    return [];
  }

  /** Symmetric HMAC key stored in JS-private field only — never in the DOM. */
  #signingKey: string = '';

  #state: ProviderState = {
    mouseMovementDetected: false,
    keyboardActivityDetected: false,
    injectedScriptCount: 0,
    domMutationDetected: false,
    pointerType: 'none',
    firstKeystrokeAt: -1,
    threatSignals: [],
  };

  /** performance.now() recorded at connectedCallback — baseline for timing signals */
  #connectedAt: number = 0;

  #mutationObserver: MutationObserver | null = null;
  #knownScripts: Set<Node> = new Set();

  /**
   * Cached CryptoKey derived from the signing-key attribute.
   * Imported once on first use; invalidated when the attribute changes.
   * Avoids re-importing the key on every form submission.
   */
  #cryptoKey: CryptoKey | null = null;
  /** The raw key string that #cryptoKey was derived from. Used to detect stale cache. */
  #cryptoKeySource: string = '';

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
  // Synchronous by design — see #handleFormSubmit.
  #onFormSubmit: (e: Event) => void = (e: Event) => { this.#handleFormSubmit(e); };
  #onThreatDetected: (e: Event) => void = (e: Event) => {
    this.#state.threatSignals.push((e as CustomEvent<ThreatDetectedDetail>).detail);
  };

  connectedCallback(): void {
    this.#connectedAt = performance.now();

    // If a signing-key attribute was set in HTML, migrate it to the private
    // field immediately and remove it from the DOM so it is not readable by JS.
    const attrKey = this.getAttribute('signing-key');
    if (attrKey) {
      this.#signingKey = attrKey;
      this.removeAttribute('signing-key');
    }

    // Snapshot existing scripts so we can detect later injections
    document.querySelectorAll('script').forEach(s => this.#knownScripts.add(s));

    this.#startMutationObserver();
    this.#attachListeners();
  }

  disconnectedCallback(): void {
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#removeListeners();
    this.#cryptoKey = null;
    this.#cryptoKeySource = '';
    this.#signingKey = '';
    // Clear the script snapshot so reconnection gets a fresh baseline.
    // Without this, scripts injected between disconnect and reconnect would
    // be treated as pre-existing and go undetected.
    this.#knownScripts.clear();
  }

  /**
   * Supply the HMAC signing key programmatically.
   *
   * Prefer this over the `signing-key` HTML attribute — the attribute is
   * automatically migrated and removed in connectedCallback, but setting it
   * via JS means it never appears in the DOM at all.
   *
   * For maximum security, inject the key via a server nonce endpoint rather
   * than embedding it in static HTML or JS bundles.
   */
  setSigningKey(key: string): void {
    if (key !== this.#signingKey) {
      this.#signingKey = key;
      // Invalidate the cached CryptoKey so it is re-imported on next sign() call.
      this.#cryptoKey = null;
      this.#cryptoKeySource = '';
    }
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
    this.addEventListener('secure-threat-detected', this.#onThreatDetected);
  }

  #removeListeners(): void {
    document.removeEventListener('mousemove', this.#onMouseMove);
    document.removeEventListener('keydown', this.#onKeydown);
    document.removeEventListener('pointerdown', this.#onPointerDown as EventListener);
    this.removeEventListener('secure-form-submit', this.#onFormSubmit);
    this.removeEventListener('secure-threat-detected', this.#onThreatDetected);
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
      threatSignals: this.#state.threatSignals.length > 0
        ? [...this.#state.threatSignals]
        : undefined,
    };
  }

  // ── Signing ─────────────────────────────────────────────────────────────────

  /**
   * Produces a nonce-stamped envelope signed with HMAC-SHA-256.
   *
   * ⚠ TAMPER-EVIDENCE, NOT CRYPTOGRAPHIC PROOF.
   * The signing key lives in client-side JavaScript memory. Any same-page XSS,
   * compromised browser extension, or privileged script can read the key via
   * the JS heap and forge arbitrary envelopes. The signature raises the cost
   * of casual spoofing — it does not guarantee the signals are genuine.
   *
   * Use the signature to detect low-effort forgery attempts; treat the signals
   * themselves as heuristic inputs to a server-side risk model, not as ground
   * truth. For stronger guarantees, rotate the key per-session via a server
   * nonce endpoint rather than embedding a static secret.
   *
   * Falls back to an unsigned envelope (empty signature) when SubtleCrypto is
   * unavailable (non-secure HTTP context). Treat unsigned envelopes as
   * lowest-trust submissions.
   */
  async sign(
    signals: EnvironmentalSignals,
    telemetry?: unknown,
    boundTo?: string | null
  ): Promise<SignedTelemetryEnvelope> {
    const nonce = this.#generateNonce();
    const issuedAt = new Date().toISOString();
    const signingKey = this.#signingKey;

    // Digest the telemetry so the envelope cannot be lifted onto a different
    // submission. Canonical serialization (recursively sorted keys) so a server
    // that parses and re-serializes the JSON reproduces the same bytes —
    // `JSON.stringify` alone depends on insertion order and on which optional
    // fields happen to be present.
    const telemetryDigest = telemetry === undefined
      ? ''
      : await this.#sha256(SecureTelemetryProvider.#canonicalJson(telemetry));
    const bound = boundTo ?? null;

    const claims = {
      v: 1 as const,
      nonce,
      issuedAt,
      environment: signals,
      telemetryDigest,
      boundTo: bound,
    };
    const signature = await this.#hmacSha256(
      signingKey,
      SecureTelemetryProvider.#canonicalJson(claims)
    );

    return { ...claims, signature };
  }

  /**
   * Deterministic JSON: object keys sorted recursively, `undefined` dropped.
   * Both sides must produce identical bytes or verification fails for honest
   * traffic, which pushes integrators toward verifying loosely or not at all.
   */
  static #canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
      return `[${value.map(v => SecureTelemetryProvider.#canonicalJson(v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${SecureTelemetryProvider.#canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }

  async #sha256(data: string): Promise<string> {
    if (!crypto.subtle) return '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
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

    // Import and cache the CryptoKey. Re-import only when the key string changes.
    if (this.#cryptoKey === null || this.#cryptoKeySource !== key) {
      this.#cryptoKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      this.#cryptoKeySource = key;
    }

    const signatureBuffer = await crypto.subtle.sign('HMAC', this.#cryptoKey, enc.encode(data));
    return Array.from(new Uint8Array(signatureBuffer), b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Form submit interception ─────────────────────────────────────────────────

  /**
   * Attach a signing promise to the outgoing telemetry — synchronously.
   *
   * ⚠ SECURITY: this handler used to `await this.sign(...)` and then assign
   * `detail.telemetry._env`. `dispatchEvent` is synchronous, so it returned at
   * that first `await`; SecureForm then ran on to `JSON.stringify(payload)`
   * inside the same task. A SubtleCrypto promise cannot settle before the task
   * ends, so `_env` was always attached AFTER the body had been serialized and
   * the signature never reached the server. Every submission was silently
   * unsigned while appearing to be signed.
   *
   * Handing over a promise instead keeps this synchronous, and SecureForm awaits
   * it immediately before building the request body.
   */
  #handleFormSubmit(event: Event): void {
    const detail = (event as CustomEvent).detail as {
      telemetry?: SessionTelemetry & {
        _env?: SignedTelemetryEnvelope;
        _envPromise?: Promise<SignedTelemetryEnvelope>;
      };
    } | null;

    const telemetry = detail?.telemetry;
    if (!telemetry) return;

    // The digest must cover the telemetry as it will be sent, so exclude the
    // envelope fields themselves.
    const signable: Record<string, unknown> = { ...telemetry };
    delete signable['_env'];
    delete signable['_envPromise'];
    const action = this.querySelector('secure-form')?.getAttribute('action') ?? null;

    telemetry._envPromise = this.sign(this.collectSignals(), signable, action);
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
