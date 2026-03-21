/**
 * E2E test helpers.
 *
 * Secure-UI components use CLOSED shadow roots, which cannot be pierced by
 * Playwright's JavaScript-based selector engine. All shadow-DOM interactions
 * go through the component's public JS API via page.evaluate() instead.
 */

import { Page } from '@playwright/test';

/** Wait for a custom element tag to be registered in the page. */
export async function waitForElement(page: Page, tagName: string): Promise<void> {
  await page.waitForFunction(
    (tag: string) => customElements.get(tag) !== undefined,
    tagName
  );
}

/**
 * Whether the tier's config allows autocomplete.
 * Uses el.config (protected in TS, but accessible from JS).
 */
export async function allowsAutocomplete(page: Page, hostSelector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any)?.config?.storage?.allowAutocomplete === true,
    hostSelector
  );
}

/** Resolved maxLength from the tier config. */
export async function getConfigMaxLength(page: Page, hostSelector: string): Promise<number> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any)?.config?.validation?.maxLength ?? 0,
    hostSelector
  );
}

/** Whether masking is enabled for this tier. */
export async function isMaskingEnabled(page: Page, hostSelector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any)?.config?.masking?.enabled === true,
    hostSelector
  );
}

/** Whether partial (vs full) masking is set. */
export async function isPartialMasking(page: Page, hostSelector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any)?.config?.masking?.partial === true,
    hostSelector
  );
}

/**
 * Trigger N focus→blur cycles on a component via its public focus()/blur() methods.
 * Each blur call invokes validateAndShowErrors() which increments the rate-limit counter.
 */
export async function exhaustRateLimit(
  page: Page,
  hostSelector: string,
  cycles: number
): Promise<void> {
  await page.evaluate(
    ({ sel, n }: { sel: string; n: number }) => {
      const el = document.querySelector(sel) as any;
      for (let i = 0; i < n; i++) {
        el.focus?.();
        el.blur?.();
      }
    },
    { sel: hostSelector, n: cycles }
  );
  // Allow microtasks and event dispatch to settle
  await page.waitForTimeout(100);
}

/** Returns true if the component's rate limit is currently exceeded. */
export async function isRateLimited(page: Page, hostSelector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any)?.checkRateLimit?.()?.allowed === false,
    hostSelector
  );
}

/** Set a component's value via the public setter. */
export async function setValue(page: Page, hostSelector: string, value: string): Promise<void> {
  await page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      (document.querySelector(sel) as any).value = val;
    },
    { sel: hostSelector, val: value }
  );
}

/** Trigger blur on a component via its public blur() method. */
export async function triggerBlur(page: Page, hostSelector: string): Promise<void> {
  await page.evaluate(
    (sel) => { (document.querySelector(sel) as any).blur?.(); },
    hostSelector
  );
}

/** Return the component's .valid getter value. */
export async function isValid(page: Page, hostSelector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => (document.querySelector(sel) as any).valid === true,
    hostSelector
  );
}
