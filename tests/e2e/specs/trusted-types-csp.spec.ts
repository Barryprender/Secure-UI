/**
 * Trusted Types CSP tests.
 *
 * native-framework serves `require-trusted-types-for 'script'; trusted-types
 * 'none'`, under which ANY assignment to an HTML sink throws — including the
 * empty string. On v0.5.1 every component rendered blank (0px) with
 * "This document requires 'TrustedHTML' assignment." in the console.
 *
 * The exact production CSP is applied to the fixture document as an HTTP header
 * (not a meta tag) via route interception — the reference server.js ships a
 * strict CSP but without the Trusted Types directives, so we override it here.
 *
 * These tests FAIL on v0.5.1 and PASS after the DOM-node rewrite.
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

// The exact CSP from the native-framework host, as one header value.
const TRUSTED_TYPES_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

const FIXTURE = '/test-fixtures/trusted-types.html';

// id → custom-element tag, for the height assertions.
const COMPONENTS: ReadonlyArray<readonly [string, string]> = [
  ['#tt-input', 'secure-input'],
  ['#tt-textarea', 'secure-textarea'],
  ['#tt-select', 'secure-select'],
  ['#tt-datetime', 'secure-datetime'],
  ['#tt-file', 'secure-file-upload'],
  ['#tt-password', 'secure-password-confirm'],
  ['#tt-card', 'secure-card'],
  ['#tt-submit', 'secure-submit-button'],
  ['#tt-table', 'secure-table'],
  ['#tt-form', 'secure-form'],
  ['#tt-telemetry', 'secure-telemetry-provider'],
];

const TAGS = [...new Set(COMPONENTS.map(([, tag]) => tag))];

/** Collect page errors and console errors; apply the strict CSP header. */
function instrument(page: import('@playwright/test').Page) {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  return { pageErrors, consoleErrors };
}

test.describe('strict Trusted Types CSP', () => {
  test.beforeEach(async ({ page }) => {
    // Override the document's CSP with the exact host policy. Only the top-level
    // document response is rewritten; sub-resources (index.js, CSS) load as usual.
    await page.route('**/trusted-types.html', async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers(), 'content-security-policy': TRUSTED_TYPES_CSP };
      await route.fulfill({ response, headers });
    });
  });

  test('every component renders (no TrustedHTML error, height > 0)', async ({ page }) => {
    const { pageErrors, consoleErrors } = instrument(page);

    await page.goto(FIXTURE);
    await page.waitForFunction(
      (tags: string[]) => tags.every((t) => customElements.get(t) !== undefined),
      TAGS,
    );
    // The table configures itself from the setup module; wait for its mount audit.
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);

    for (const [selector, tag] of COMPONENTS) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${tag} (${selector}) should have a layout box`).not.toBeNull();
      expect(box!.height, `${tag} (${selector}) should be taller than 0px`).toBeGreaterThan(0);
    }

    expect(consoleErrors.filter((t) => t.includes('TrustedHTML'))).toEqual([]);
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });

  test('table cell renders injected markup as text and creates no <img>', async ({ page }) => {
    instrument(page);
    await page.goto(FIXTURE);
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);

    // The onerror handler must never have run...
    expect(await page.evaluate(() => (window as any).__xss)).toBe(false);
    // ...and no <img> leaked anywhere reachable (the cell value is plain text).
    expect(await page.locator('img').count()).toBe(0);
  });

  test('sort and page change work under the CSP', async ({ page }) => {
    const { pageErrors, consoleErrors } = instrument(page);

    await page.goto(FIXTURE);
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);

    const table = page.locator('#tt-table');
    const box = (await table.boundingBox())!;
    expect(box).not.toBeNull();

    // The table's controls live in a CLOSED shadow root that cannot be queried
    // or targeted by selector, so we click by position within the host element.
    // locator.click auto-scrolls the element into view and clicks relative to its
    // top-left. The composed-click counter confirms each click landed on the table
    // (not off-target); the no-error assertions confirm the partial re-render path
    // (#fillTableContent, which replaced `tableContainer.innerHTML = ...`) runs
    // clean under the CSP.

    // First column header (just below the search input) → sort.
    await table.click({ position: { x: 40, y: 55 } });
    await page.waitForTimeout(50);

    // "Next" (bottom-right of the table container) → page change.
    await table.click({ position: { x: box.width - 30, y: box.height - 18 } });
    await page.waitForTimeout(50);

    expect(await page.evaluate(() => (window as any).__tableClicks)).toBeGreaterThanOrEqual(2);
    expect(consoleErrors.filter((t) => t.includes('TrustedHTML'))).toEqual([]);
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });
});
