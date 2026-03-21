/**
 * Penetration Tests
 *
 * XSS prevention, injection handling, rate-limit bypass attempts,
 * large payload protection, tier immutability, and server security headers.
 *
 * Tests marked [FINDING] document known security gaps. They intentionally
 * FAIL until the gap is addressed, acting as security ratchets.
 */

import { test, expect } from '@playwright/test';
import { waitForElement, setValue, exhaustRateLimit, isRateLimited, isValid } from '../helpers.js';

// ── XSS Prevention ────────────────────────────────────────────────────────────

test.describe('XSS Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-input.html');
    await waitForElement(page, 'secure-input');
    await page.evaluate(() => { (window as any).__xss = false; });
  });

  const xssPayloads: [string, string][] = [
    ['script tag',        '<script>window.__xss=true</script>'],
    ['img onerror',       '<img src=x onerror="window.__xss=true">'],
    ['attribute escape',  '"><script>window.__xss=true</script>'],
    ['SVG onload',        '<svg onload="window.__xss=true">'],
    ['javascript: URI',   'javascript:window.__xss=true'],
    ['template literal',  '${window.__xss=true}'],
    ['data: URI script',  'data:text/html,<script>window.__xss=true</script>'],
  ];

  for (const [label, payload] of xssPayloads) {
    test(`[${label}] payload does not execute`, async ({ page }) => {
      await setValue(page, '#input-public', payload);
      await page.evaluate(() => { (document.querySelector('#input-public') as any).blur?.(); });
      await page.waitForTimeout(100);

      expect(await page.evaluate(() => (window as any).__xss)).toBe(false);
    });
  }

  test('XSS payload stored as plain text — not interpreted as HTML', async ({ page }) => {
    const payload = '<script>window.__xss=true</script>';
    await setValue(page, '#input-public', payload);
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(stored).toBe(payload);
  });

  test('XSS via label attribute: renders as text (not executed)', async ({ page }) => {
    const executed = await page.evaluate((): Promise<boolean> => {
      (window as any).__xss = false;
      const el = document.createElement('secure-input') as HTMLElement;
      el.setAttribute('security-tier', 'public');
      el.setAttribute('label', '<img src=x onerror="window.__xss=true">');
      el.setAttribute('name', 'xss-label-test');
      document.body.appendChild(el);
      return new Promise(resolve => setTimeout(() => resolve((window as any).__xss), 200));
    });
    expect(executed).toBe(false);
  });

  test('XSS via placeholder attribute: renders as text (not executed)', async ({ page }) => {
    const executed = await page.evaluate((): Promise<boolean> => {
      (window as any).__xss = false;
      const el = document.createElement('secure-input') as HTMLElement;
      el.setAttribute('security-tier', 'public');
      el.setAttribute('placeholder', '<script>window.__xss=true</script>');
      el.setAttribute('name', 'xss-placeholder-test');
      document.body.appendChild(el);
      return new Promise(resolve => setTimeout(() => resolve((window as any).__xss), 200));
    });
    expect(executed).toBe(false);
  });

  test('XSS via value attribute on dynamically created element: not executed', async ({ page }) => {
    const executed = await page.evaluate((): Promise<boolean> => {
      (window as any).__xss = false;
      const el = document.createElement('secure-input') as HTMLElement;
      el.setAttribute('security-tier', 'public');
      el.setAttribute('value', '<script>window.__xss=true</script>');
      el.setAttribute('name', 'xss-value-test');
      document.body.appendChild(el);
      return new Promise(resolve => setTimeout(() => resolve((window as any).__xss), 200));
    });
    expect(executed).toBe(false);
  });
});

// ── Injection Handling ────────────────────────────────────────────────────────

test.describe('Injection Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-input.html');
    await waitForElement(page, 'secure-input');
  });

  test('SQL injection string stored safely as literal text', async ({ page }) => {
    const payload = "'; DROP TABLE users; --";
    await setValue(page, '#input-public', payload);
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(stored).toBe(payload);
  });

  test('path traversal string stored safely', async ({ page }) => {
    const payload = '../../../etc/passwd';
    await setValue(page, '#input-public', payload);
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(stored).toBe(payload);
  });

  test('HTML entities stored as literal characters', async ({ page }) => {
    const payload = '&lt;script&gt;alert(1)&lt;/script&gt;';
    await setValue(page, '#input-public', payload);
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(stored).toBe(payload);
  });

  test('Unicode RTL override character stored without crash', async ({ page }) => {
    // U+202E can spoof displayed filenames
    const payload = 'file\u202Etxt.exe';
    await setValue(page, '#input-public', payload);
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(typeof stored).toBe('string');
  });

  test('zero-width space stored without crash', async ({ page }) => {
    await setValue(page, '#input-public', 'hello\u200Bworld');
    const stored = await page.evaluate(
      () => (document.querySelector('#input-public') as any).value
    );
    expect(typeof stored).toBe('string');
  });
});

// ── Security Tier Immutability ────────────────────────────────────────────────

test.describe('Security Tier Immutability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-input.html');
    await waitForElement(page, 'secure-input');
  });

  test('CRITICAL cannot be downgraded to PUBLIC: config stays CRITICAL', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('#input-critical')?.setAttribute('security-tier', 'public');
    });
    const ac = await page.evaluate(
      () => (document.querySelector('#input-critical') as any)?.config?.storage?.allowAutocomplete
    );
    expect(ac).toBe(false); // CRITICAL: autocomplete off
  });

  test('SENSITIVE cannot be downgraded to PUBLIC: config stays SENSITIVE', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('#input-sensitive')?.setAttribute('security-tier', 'public');
    });
    const ac = await page.evaluate(
      () => (document.querySelector('#input-sensitive') as any)?.config?.storage?.allowAutocomplete
    );
    expect(ac).toBe(false); // SENSITIVE: autocomplete off
  });

  test('PUBLIC cannot be upgraded to CRITICAL: config stays PUBLIC', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('#input-public')?.setAttribute('security-tier', 'critical');
    });
    const ac = await page.evaluate(
      () => (document.querySelector('#input-public') as any)?.config?.storage?.allowAutocomplete
    );
    expect(ac).toBe(true); // PUBLIC: autocomplete on
  });

  test('invalid tier string rejected — component keeps original tier', async ({ page }) => {
    const tierBefore = await page.evaluate(
      () => (document.querySelector('#input-public') as any)?.securityTier
    );
    await page.evaluate(() => {
      document.querySelector('#input-public')?.setAttribute('security-tier', 'hacked-tier');
    });
    const tierAfter = await page.evaluate(
      () => (document.querySelector('#input-public') as any)?.securityTier
    );
    expect(tierAfter).toBe(tierBefore);
  });
});

// ── Rate Limit Bypass Attempts ────────────────────────────────────────────────

test.describe('Rate Limit Bypass', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-input.html');
    await waitForElement(page, 'secure-input');
  });

  test('rapid programmatic blur() calls enforce CRITICAL rate limit', async ({ page }) => {
    await exhaustRateLimit(page, '#input-critical', 10);
    expect(await isRateLimited(page, '#input-critical')).toBe(true);
  });

  test('rate limit counters are per-instance — exhausting one does not affect another', async ({ page }) => {
    await exhaustRateLimit(page, '#input-critical', 10);
    expect(await isRateLimited(page, '#input-critical')).toBe(true);
    // The PUBLIC instance should still be unrestricted
    expect(await isRateLimited(page, '#input-public')).toBe(false);
  });
});

// ── Large Payload Protection ──────────────────────────────────────────────────
// Note: the public .value setter stores values directly in #actualValue without
// native truncation (browser maxlength only limits keyboard input). Enforcement
// happens at validation time: validateInput() rejects values that exceed the
// tier's maxLength config, making .valid return false.

test.describe('Large Payload Protection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-input.html');
    await waitForElement(page, 'secure-input');
  });

  test('CRITICAL: .valid returns false when value exceeds tier maxLength (256 chars)', async ({ page }) => {
    await setValue(page, '#input-critical', 'A'.repeat(500));
    expect(await isValid(page, '#input-critical')).toBe(false);
  });

  test('PUBLIC: .valid returns false when value exceeds tier maxLength (5000 chars)', async ({ page }) => {
    await setValue(page, '#input-public', 'B'.repeat(6000));
    expect(await isValid(page, '#input-public')).toBe(false);
  });
});

// ── CSRF Protection ────────────────────────────────────────────────────────────

test.describe('CSRF Protection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixtures/secure-form.html');
    await waitForElement(page, 'secure-form');
  });

  test('CSRF token injected as type="hidden" input with correct value', async ({ page }) => {
    const csrf = page.locator('#test-form input[name="_csrf"]');
    await expect(csrf).toHaveCount(1);
    await expect(csrf).toHaveAttribute('type', 'hidden');
    await expect(csrf).toHaveValue('test-csrf-token-abc123');
  });

  test('form without csrf-token attribute creates no _csrf hidden input', async ({ page }) => {
    expect(await page.locator('#form-no-csrf input[name="_csrf"]').count()).toBe(0);
  });
});

// ── Server Security Headers ───────────────────────────────────────────────────

test.describe('Server Security Headers', () => {
  test('component JS served with Content-Type: application/javascript', async ({ page }) => {
    const res = await page.request.get('/latest/components/secure-input/secure-input.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/javascript/);
  });

  test('CSS served with Content-Type: text/css', async ({ page }) => {
    const res = await page.request.get('/latest/styles/tokens.css');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/css/);
  });

  test('CORS header present on component resources', async ({ page }) => {
    const res = await page.request.get('/latest/components/secure-input/secure-input.js');
    expect(res.headers()['access-control-allow-origin']).toBe('*');
  });

  test('404 responses do not contain Node.js stack traces', async ({ page }) => {
    const res = await page.request.get('/nonexistent-endpoint-xyzabc123');
    expect(res.status()).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/at Object\.|\.js:\d+:\d+|node_modules/);
  });

  test('health endpoint returns status and version', async ({ page }) => {
    const res = await page.request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('version');
  });

  // ── [FINDING] Security hardening gaps — will FAIL until addressed ─────────────

  test('[FINDING] X-Content-Type-Options: nosniff must be set', async ({ page }) => {
    // Prevents MIME-type sniffing attacks (OWASP: Security Misconfiguration)
    const res = await page.request.get('/');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('[FINDING] X-Frame-Options: DENY must be set', async ({ page }) => {
    // Prevents clickjacking (OWASP: Security Misconfiguration)
    const res = await page.request.get('/');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  test('[FINDING] Referrer-Policy header must be set', async ({ page }) => {
    // Prevents sensitive URL leakage in Referer header
    const res = await page.request.get('/');
    expect(res.headers()['referrer-policy']).toBeTruthy();
  });

  test('[FINDING] health endpoint must not expose internal filesystem paths', async ({ page }) => {
    // distDir field leaks absolute server path — information disclosure
    const res = await page.request.get('/health');
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('distDir');
  });
});
