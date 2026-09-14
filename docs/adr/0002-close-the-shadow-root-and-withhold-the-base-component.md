# ADR-0002: Close the shadow root and withhold SecureBaseComponent from the public API

## Status
**Accepted** — 14 September 2026.
Two decisions with one rationale, and the pair most often challenged from outside the
project. The 0.4.0 release removed the `shadowRoot` override and the
`./base-component` export was dropped from the generated `dist/package.json` in 0.4.2,
so the code now enforces what was previously only intended. This record states why,
because both changes read as gratuitous restrictions to a consumer who hits them.

## Context
`SecureBaseComponent` holds every invariant the library exists to provide: the tier is
resolved once and frozen (ADR-0001), values are sanitised before reaching the DOM, the
audit log is written on a fixed set of lifecycle events, telemetry hooks fire in a
defined order, and event details are constructed so that no raw value escapes
(ADR-0004). None of these are enforced by a type. They are enforced by the order of
statements inside methods that a subclass may override.

A subclass is therefore not a consumer of the security model — it is a participant in
it, and a careless one breaks it invisibly. A subclass that overrides `render()` and
forgets `super`, or that writes `this.root.innerHTML` because it is convenient, or
that dispatches its own change event carrying the value, produces a component that
still passes a type check, still registers, still looks correct in the browser, and
has silently lost the property the library is named for.

An open shadow root is the same problem approached from the page. `element.shadowRoot`
returning a live root gives any script on the page — a tag manager, an analytics
snippet, an injected payload — direct read access to the rendered value of a field
that the tier configuration was masking, and a way to rewrite the field's markup
without the component noticing. Masking that any script can step around is theatre.

## Decision
The shadow root is attached with `mode: 'closed'` (`src/core/base-component.ts:89`).
The root is stored in the private `#shadow` field and exposed to subclasses only
through the `protected root` accessor. `Element.shadowRoot` is not overridden, and so
returns `null` to external callers, which is the correct and expected answer for a
closed root.

`SecureBaseComponent` is not exported from `src/index.ts`, and `build/css-inliner.js`
does not emit a `./base-component` entry in the generated `dist/package.json`. The
class is reachable only by files inside this repository.

The supported extension mechanism is composition. A consumer needing bespoke behaviour
writes their own custom element and places a `<secure-input>` — or whichever component
fits — inside it, driving it through its public attributes, properties and events. The
invariants stay on the far side of a boundary the consumer cannot reach through.

## Alternatives considered
**Export the base class and document the invariants.** Documentation is the weakest
available enforcement, and this is precisely the case it handles worst: the failure is
silent, the reviewer sees a subclass that looks reasonable, and the invariant that
broke is three files away in a method the subclass never mentions. Guidance that must
be recalled at the moment of overriding a method is not a control.

**Export the base class and mark the invariant-bearing methods `final`.** TypeScript
has no `final`. The nearest approximations are lint rules and runtime checks in the
constructor, both of which the consumer's own build can drop, and neither of which
survives plain JavaScript consumption of the published package.

**Open the shadow root for testing and debugging.** The test suite has no need of it —
tests reach internals through `protected root` because they run against the source, not
the package. Opening the root for the convenience of a DevTools session hands the same
access to every third-party script the page loads, permanently, in production.

**Export the base class as `@internal` or under an `unstable_` prefix.** A naming
convention is a request. Once the class is in the exports map it is in the public API
in every sense that matters, and the first consumer who ships a subclass makes every
subsequent change to the base class a breaking change.

## Consequences

**Negative.** A consumer with a genuine need for a new field type cannot build one on
the library's foundations. They wrap a component and inherit its DOM structure and
CSS parts, or they start from `HTMLElement` and reimplement tiering, sanitisation,
audit and telemetry themselves — the second option produces exactly the weakly
protected component this decision was meant to prevent, so the constraint can push a
determined consumer toward a worse outcome than a documented base class would have.
Wrapping adds a layer of event re-dispatch and attribute forwarding that composition
does not remove. The closed root makes automated end-to-end testing harder for
consumers: Playwright cannot pierce it, so their tests must go through the public
surface. Debugging a rendering fault in a consumer's application is slower, because
DevTools shows a closed root without its contents. Any future decision to open the
root or export the base class is a one-way door — it can be granted but never
withdrawn.

**Positive.** The security invariants have exactly one implementation and one set of
call sites, all inside this repository, all covered by this repository's tests. They
can be changed, hardened and refactored without a deprecation cycle, because no
external code depends on their shape. No page script can read a masked value or
rewrite a field's internals through `shadowRoot`. The public API is small enough to
audit, which is the property a security library is actually judged on.

## Follow-up
1. `docs/customization.md` must carry a worked composition example — a wrapper element
   with attribute forwarding and event re-dispatch — so the supported path is
   demonstrated rather than merely named.
2. If a consumer's field type cannot be expressed by wrapping, that is evidence the
   component set is missing a member. Add the component here rather than reopening the
   base class.
3. `tests/build/bundle.test.ts` asserts that the generated `dist/package.json`
   carries no `./base-component` entry, that no exports entry references
   `base-component` at all, and that neither `dist/index.js` nor `dist/index.d.ts`
   names `SecureBaseComponent`. Any new build target must carry the same assertions,
   because the surrounding tests prove only which exports are present.
