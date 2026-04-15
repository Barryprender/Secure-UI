/**
 * Form Interaction Tests
 *
 * Real-browser tests for form filling, blur validation, CSRF injection,
 * and secure-form-submit event payload. All shadow-DOM interactions use
 * page.evaluate() via the component's public JS API.
 */

import { test, expect } from '@playwright/test';
import { waitForElement, setValue, isValid, triggerBlur } from '../helpers.js';

test.describe('Form Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/test-submit', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
    await page.goto('/test-fixtures/secure-form.html');
    await waitForElement(page, 'secure-form');
    await waitForElement(page, 'secure-input');
    await waitForElement(page, 'secure-submit-button');
  });

  // ── Field filling ────────────────────────────────────────────────────────────

  test('fills username field — .value returns the set value', async ({ page }) => {
    await setValue(page, 'secure-input[name="username"]', 'alice');
    const value = await page.evaluate(
      () => (document.querySelector('secure-input[name="username"]') as any).value
    );
    expect(value).toBe('alice');
  });

  test('fills email field — .value returns the set value', async ({ page }) => {
    await setValue(page, 'secure-input[name="email"]', 'alice@example.com');
    const value = await page.evaluate(
      () => (document.querySelector('secure-input[name="email"]') as any).value
    );
    expect(value).toBe('alice@example.com');
  });

  test('password field: .value returns unmasked value even though display is masked', async ({ page }) => {
    await setValue(page, 'secure-input[name="password"]', 'S3cur3P@ss!');
    const value = await page.evaluate(
      () => (document.querySelector('secure-input[name="password"]') as any).value
    );
    expect(value).toBe('S3cur3P@ss!');
  });

  // ── Blur validation ───────────────────────────────────────────────────────────

  test('required field: .valid returns false when empty after blur', async ({ page }) => {
    await triggerBlur(page, 'secure-input[name="username"]');
    await page.waitForTimeout(50);
    expect(await isValid(page, 'secure-input[name="username"]')).toBe(false);
  });

  test('email field: .valid returns false for invalid format', async ({ page }) => {
    await setValue(page, 'secure-input[name="email"]', 'notanemail');
    expect(await isValid(page, 'secure-input[name="email"]')).toBe(false);
  });

  test('email field: .valid returns true for correctly formed address', async ({ page }) => {
    await setValue(page, 'secure-input[name="email"]', 'alice@example.com');
    expect(await isValid(page, 'secure-input[name="email"]')).toBe(true);
  });

  test('valid email then changed to invalid: .valid updates correctly', async ({ page }) => {
    await setValue(page, 'secure-input[name="email"]', 'alice@example.com');
    expect(await isValid(page, 'secure-input[name="email"]')).toBe(true);

    await setValue(page, 'secure-input[name="email"]', 'bad-email');
    expect(await isValid(page, 'secure-input[name="email"]')).toBe(false);
  });

  // ── CSRF ──────────────────────────────────────────────────────────────────────

  test('CSRF hidden input injected into form DOM', async ({ page }) => {
    const csrf = page.locator('#test-form input[name="_csrf"]');
    await expect(csrf).toHaveCount(1);
    await expect(csrf).toHaveValue('test-csrf-token-abc123');
  });

  test('CSRF hidden input is type="hidden"', async ({ page }) => {
    const type = await page.locator('#test-form input[name="_csrf"]').getAttribute('type');
    expect(type).toBe('hidden');
  });

  test('form without csrf-token attribute creates no _csrf input', async ({ page }) => {
    expect(await page.locator('#form-no-csrf input[name="_csrf"]').count()).toBe(0);
  });

  // ── Submission event ──────────────────────────────────────────────────────────

  test('secure-form-submit fires with correct formData on valid submission', async ({ page }) => {
    // Set up event capture before filling fields
    await page.evaluate(() => {
      (window as any).__submitted = false;
      (window as any).__formData = null;
      document.getElementById('test-form')!.addEventListener('secure-form-submit', (e: any) => {
        (window as any).__submitted = true;
        (window as any).__formData = e.detail.formData;
        e.detail.cancelSubmission();
      }, { once: true });
    });

    // Fill all required fields via public API
    await setValue(page, 'secure-input[name="username"]', 'alice');
    await setValue(page, 'secure-input[name="email"]', 'alice@example.com');
    await setValue(page, 'secure-input[name="password"]', 'S3cur3P@ss!');

    // Submit via the internal <form> element (secure-form renders to light DOM, no shadow)
    await page.evaluate(() => {
      (document.querySelector('#test-form form') as HTMLFormElement)?.requestSubmit();
    });
    await page.waitForFunction(() => (window as any).__submitted === true, { timeout: 5000 });

    const formData = await page.evaluate(
      () => (window as any).__formData as Record<string, string>
    );
    expect(formData['username']).toBe('alice');
    expect(formData['email']).toBe('alice@example.com');
    expect(formData).toHaveProperty('password');
  });

  test('secure-form-submit event detail includes telemetry with riskScore', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__telemetry = null;
      document.getElementById('test-form')!.addEventListener('secure-form-submit', (e: any) => {
        (window as any).__telemetry = e.detail.telemetry;
        e.detail.cancelSubmission();
      }, { once: true });
    });

    await setValue(page, 'secure-input[name="username"]', 'alice');
    await setValue(page, 'secure-input[name="email"]', 'alice@example.com');
    await setValue(page, 'secure-input[name="password"]', 'S3cur3P@ss!');

    await page.evaluate(() => {
      (document.querySelector('#test-form form') as HTMLFormElement)?.requestSubmit();
    });
    await page.waitForFunction(() => (window as any).__telemetry !== null, { timeout: 5000 });

    const telemetry = await page.evaluate(
      () => (window as any).__telemetry as Record<string, unknown>
    );
    expect(typeof telemetry['riskScore']).toBe('number');
    expect(typeof telemetry['fieldCount']).toBe('number');
    expect(Array.isArray(telemetry['fields'])).toBe(true);
  });

  test('form submission blocked when required fields are empty', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__submitted = false;
      document.getElementById('test-form')!.addEventListener('secure-form-submit', (e: any) => {
        (window as any).__submitted = true;
        e.detail.cancelSubmission();
      }, { once: true });
    });

    await page.locator('#submit-btn').click();
    await page.waitForTimeout(300);

    const submitted = await page.evaluate(() => (window as any).__submitted);
    expect(submitted).toBeFalsy();
  });

  // ── Component .valid API ──────────────────────────────────────────────────────

  test('.valid returns false for empty required input', async ({ page }) => {
    expect(await isValid(page, 'secure-input[name="username"]')).toBe(false);
  });

  test('.valid returns true after a non-empty value is set', async ({ page }) => {
    await setValue(page, 'secure-input[name="username"]', 'alice');
    expect(await isValid(page, 'secure-input[name="username"]')).toBe(true);
  });

  test('.valid returns false for malformed email', async ({ page }) => {
    await setValue(page, 'secure-input[name="email"]', 'notvalid');
    expect(await isValid(page, 'secure-input[name="email"]')).toBe(false);
  });
});
