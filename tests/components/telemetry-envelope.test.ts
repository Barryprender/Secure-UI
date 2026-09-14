import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../src/components/secure-form/secure-form.js';
import '../../src/components/secure-telemetry-provider/secure-telemetry-provider.js';
import '../../src/components/secure-input/secure-input.js';
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * The signed telemetry envelope must reach the server.
 *
 * Was: the provider awaited SubtleCrypto inside a synchronous dispatch, so it
 * returned at the first await while SecureForm ran on to JSON.stringify in the
 * same task. `_env` was attached after the body had been serialized — every
 * submission was silently unsigned while appearing to be signed.
 */
describe('telemetry envelope reaches the server', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('_env is present in the serialized body', async () => {
    let sentBody: string | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sentBody = String(init.body);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const provider = document.createElement('secure-telemetry-provider');
    provider.setAttribute('signing-key', 'k'.repeat(32));
    const form = document.createElement('secure-form');
    form.setAttribute('action', '/api/x');
    form.setAttribute('csrf-token', 'tok');
    form.setAttribute('use-fetch', '');
    form.setAttribute('security-tier', 'authenticated');
    provider.appendChild(form);
    document.body.appendChild(provider);
    await tick(); await tick();
    const inner = form.querySelector('form') as HTMLFormElement;
    inner.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 15; i++) await tick();
    expect(sentBody).not.toBeNull();
    const p = JSON.parse(sentBody!) as {
      _telemetry: { _env?: Record<string, unknown>; _envPromise?: unknown };
    };
    expect(p._telemetry._env).toBeDefined();
    expect(p._telemetry._env.v).toBe(1);
    expect(p._telemetry._envPromise).toBeUndefined();
    expect(typeof p._telemetry._env.telemetryDigest).toBe('string');
    expect(p._telemetry._env.boundTo).toBe('/api/x');
  });
});
