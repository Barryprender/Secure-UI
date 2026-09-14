/**
 * Test access to the privileged surface of a secure component.
 *
 * Tests previously reached the closed shadow root via `(el as any).root`. That
 * worked because `protected` is erased at compile time — the same erasure that
 * handed the root, and therefore every masked value, to any script on the page.
 * The accessor is gone from the prototype; `internals()` is the module-scoped
 * replacement, importable here because the suite runs against `src/`.
 *
 * If a test can only reach something through this helper, consumer code cannot
 * reach it at all. That is the point.
 */
import { internals } from '../../src/core/base-component.js';
import type { SecureBaseComponent } from '../../src/core/base-component.js';

/** The closed shadow root of a secure component. */
export function shadowOf(component: unknown): ShadowRoot {
  return internals(component as SecureBaseComponent).root;
}

export { internals };
