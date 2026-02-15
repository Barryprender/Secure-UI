/**
 * Vitest Test Setup
 *
 * This file runs before each test file to set up the testing environment.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock window.customElements if not available
if (typeof customElements === 'undefined') {
  // happy-dom provides this, but just in case
  (globalThis as any).customElements = {
    define: vi.fn(),
    get: vi.fn(),
    whenDefined: vi.fn(() => Promise.resolve())
  };
}

// Clean up after each test
afterEach(() => {
  // Remove any components added to the document
  document.body.innerHTML = '';

  // Clear all mocks
  vi.clearAllMocks();
});

// Helper to wait for custom element to be defined and connected
export async function waitForComponent(element: HTMLElement, timeout = 100): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

// Helper to create and append a component
export function createComponent<T extends HTMLElement>(
  tagName: string,
  attributes: Record<string, string> = {}
): T {
  const element = document.createElement(tagName) as T;
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  document.body.appendChild(element);
  return element;
}

// Declare globals for TypeScript
declare global {
  function waitForComponent(element: HTMLElement, timeout?: number): Promise<void>;
  function createComponent<T extends HTMLElement>(
    tagName: string,
    attributes?: Record<string, string>
  ): T;
}

// Make helpers available globally
(globalThis as any).waitForComponent = waitForComponent;
(globalThis as any).createComponent = createComponent;
