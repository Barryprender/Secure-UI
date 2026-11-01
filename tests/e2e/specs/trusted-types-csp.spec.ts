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
  ['#tt-html-table', 'secure-table'],
  ['#tt-slot-table', 'secure-table'],
  ['#tt-form', 'secure-form'],
  ['#tt-telemetry', 'secure-telemetry-provider'],
];

const TAGS = [...new Set(COMPONENTS.map(([, tag]) => tag))];

/**
 * Configure #tt-html-table in page context with the three HTML-cell paths:
 * a string render, a Node render (createElement), and a `_html` row value.
 * Done from the spec (not the shared setup module) because a blocked string parse
 * logs a CSP-violation console error even when caught — kept out of fixtures that
 * assert no such error. Returns once the cells have rendered.
 */
async function configureHtmlTable(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const t = document.getElementById('tt-html-table') as HTMLElement & {
      columns: unknown; data: unknown;
    };
    t.columns = [
      { key: 's', label: 'Str', render: () => '<img src=x onerror="window.__xssStr = true">' },
      { key: 'n', label: 'Node', render: () => {
        // Built with createElement, so nothing is parsed. The disallowed <img> and
        // the javascript: link are stripped by the node sanitizer, leaving the <b>.
        const frag = document.createDocumentFragment();
        const b = document.createElement('b');
        b.textContent = 'bold';
        const img = document.createElement('img');
        img.setAttribute('src', 'x');
        const a = document.createElement('a');
        a.setAttribute('href', 'javascript:void(0)');
        a.textContent = 'link';
        frag.append(b, img, a);
        return frag;
      } },
      { key: 'h', label: 'Html' },
    ];
    t.data = [
      { s: 'x', n: 'x', h: 'x', h_html: '<img src=x onerror="window.__xssHtmlVal = true">' },
    ];
  });
}

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

  test('HTML string / _html cells degrade to text with an audit event; Node and slotted cells do not parse', async ({ page }) => {
    const { pageErrors, consoleErrors } = instrument(page);

    await page.goto(FIXTURE);
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);
    await configureHtmlTable(page);

    // The string-render ('s') and `_html` ('h') columns hit DOMParser, which throws
    // under the CSP; each degrades to text and emits one audit event. The Node ('n')
    // render and the slotted table never parse, so they never appear here.
    const blocked = await page.evaluate(() => (window as any).__htmlBlocked as string[]);
    expect(blocked.sort()).toEqual(['h', 's']);

    // No injected markup ran: not the string paths (degraded to inert text), not the
    // slotted cell.
    expect(await page.evaluate(() => ({
      str: (window as any).__xssStr,
      htmlVal: (window as any).__xssHtmlVal,
      slot: (window as any).__xssSlot,
    }))).toEqual({ str: false, htmlVal: false, slot: false });

    // One cell degrading must never fail the whole table: it still has a layout box.
    expect((await page.locator('#tt-html-table').boundingBox())!.height).toBeGreaterThan(0);
    expect(await page.locator('img').count()).toBe(0);
    // Each degraded cell logs a (handled) CSP-violation console error — that is the
    // expected cost of the string fallback, and exactly two cells degraded.
    expect(consoleErrors.filter((t) => t.includes('TrustedHTML')).length).toBe(2);
    // The throws were caught, so none escaped as an uncaught page error.
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });

  test('sortable headers are keyboard operable and keep focus across the re-render', async ({ page }) => {
    const { pageErrors, consoleErrors } = instrument(page);

    await page.goto(FIXTURE);
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);

    // Focus a light-DOM anchor, then Tab into the table's closed shadow: first the
    // search input, then the first column's sort <button>. A <th> click handler
    // (the old behaviour) could not be reached this way at all.
    await page.locator('#kb-anchor').focus();
    await page.keyboard.press('Tab'); // → search input
    await page.keyboard.press('Tab'); // → first sort button

    const clicksBefore = await page.evaluate(() => (window as any).__tableClicks);

    // Enter activates the button (a native button fires click on Enter). The sort
    // re-renders the header; focus must return to the new button — observable from
    // outside a closed root as activeElement retargeting to the host, not <body>.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).__tableClicks)).toBeGreaterThan(clicksBefore);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tt-table');

    // Space toggles the same button again (fires click on key-up). Focus is kept.
    await page.keyboard.press(' ');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).__tableClicks)).toBeGreaterThan(clicksBefore + 1);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tt-table');

    expect(consoleErrors.filter((t) => t.includes('TrustedHTML'))).toEqual([]);
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });
});

test.describe('without the Trusted Types CSP (regression guard)', () => {
  // No route override here: the reference server CSP has no Trusted Types
  // directives, so DOMParser works and the string render path renders real HTML.
  test('string render path sanitizes and renders HTML, with no fallback', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(FIXTURE);
    await expect.poll(() => page.evaluate(() => (window as any).__tableReady === true)).toBe(true);
    await configureHtmlTable(page);

    // DOMParser did not throw, so nothing degraded to text: no audit events.
    expect(await page.evaluate(() => (window as any).__htmlBlocked as string[])).toEqual([]);
    // The sanitizer still strips the onerror and the disallowed <img>, so the
    // probes never fire even though the HTML was parsed and rendered.
    expect(await page.evaluate(() => ({
      str: (window as any).__xssStr,
      htmlVal: (window as any).__xssHtmlVal,
    }))).toEqual({ str: false, htmlVal: false });
    expect(await page.locator('img').count()).toBe(0);
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });
});
