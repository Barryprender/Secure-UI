# ADR-0001: Default every component to the CRITICAL tier and freeze the tier after mount

## Status
**Accepted** — 14 September 2026.
The behaviour has been in `SecureBaseComponent` since the first release, but it lives
only in a field initialiser and a comment inside `attributeChangedCallback`. Both read
as defensive coding rather than as a decision, and both are the sort of thing a
maintainer removes while making the component "more flexible".

## Context
A security tier drives masking, autocomplete, rate limiting and audit verbosity
(`TIER_CONFIG` in `src/core/security-config.ts`). The tier is selected by a
`security-tier` attribute written in the consumer's markup — which means it is
selected by whoever writes the page, and can be absent, misspelled, or supplied by a
template that renders an empty string.

Two failure modes follow. First, a typo (`security-tier="sensative"`) silently
produces a component with weaker protection than the author asked for. If the
fallback were `public`, a credit-card field would render unmasked, autocompleted and
unaudited because of one transposed letter. Second, if the attribute stayed live
after mount, any script on the page — including an injected one — could downgrade a
field mid-session with a single `setAttribute` call and read the value in clear. That
is privilege escalation with no exploit required.

Both failures are silent. Nothing throws, nothing logs, and the component keeps
working. The only visible symptom is protection that quietly is not there.

## Decision
`#securityTier` is initialised to `SecurityTier.CRITICAL` at field declaration
(`src/core/base-component.ts:60`). `initializeSecurity()` overwrites it only when
`isValidTier()` accepts the supplied attribute. An absent, empty or invalid attribute
therefore leaves the component at CRITICAL. Configuration failure costs usability,
never confidentiality.

After `connectedCallback` has run once, `attributeChangedCallback` rejects any change
to `security-tier` with a console warning and returns without acting. The DOM
attribute is deliberately **not** reverted: calling `setAttribute()` from inside
`attributeChangedCallback` re-enters the callback with `oldValue` and `newValue`
swapped and recurses without bound. The internal field is already immutable, so
component behaviour is correct regardless of what the attribute in the DOM reads. The
attribute and the behaviour can disagree; the behaviour is authoritative.

`SecureCard` and `SecurePasswordConfirm` go further and are pinned to CRITICAL
unconditionally. Neither has a legitimate lower-tier use.

## Alternatives considered
**Default to `public` and require an explicit opt-in to protection.** This matches
the ergonomics of most component libraries and produces the smaller diff for a
consumer adding a name field. It also means every field is unprotected until someone
remembers, and the failure is invisible in review — a missing attribute looks
identical to a field that does not need one. A default that fails open is not a
default, it is a trap.

**Throw on an invalid tier instead of falling back.** This surfaces the typo
immediately, which is the correct behaviour for a build tool. A custom element cannot
use it: an exception thrown inside `connectedCallback` is swallowed by the browser's
upgrade machinery, leaving the element half-constructed and unrendered. A page that
loses its payment form in production is worse than a page whose payment form is
over-protected.

**Allow tier changes while auditing them.** An audit trail records the downgrade but
does not stop it, and the attacker who can call `setAttribute` can also stop the
component from dispatching the audit event. A control that reports its own bypass is
not a control.

**Revert the DOM attribute to keep it truthful.** Only reachable through a re-entry
guard flag, which is state added purely to preserve a display detail nothing reads.
The attribute is decoration after mount; `getSecurityTier()` is the accessor.

## Consequences

**Negative.** A consumer who omits `security-tier` on a search box gets masking off
but autocomplete disabled and full audit logging — heavier than the field needs, and
the reason is not obvious from the markup. Typos are not reported at all; the
component looks configured and behaves as though it is not. A page's DOM can show
`security-tier="public"` on a component that is enforcing CRITICAL, which will mislead
anyone debugging from DevTools until they read this record. Server-rendered markup
cannot re-tier a component after hydration, so the tier must be correct in the initial
HTML.

**Positive.** No configuration mistake can produce a component weaker than CRITICAL.
Tier is fixed for the lifetime of the element, so an audit entry written at mount
describes the policy in force at every later moment — the log cannot be
retrospectively falsified by a downgrade. The escalation path through `setAttribute`
is closed without a re-entry guard, and the recursion bug that guard would have
introduced does not exist.

## Follow-up
1. `isValidTier()` rejection is silent beyond the fallback. Emit an `invalid_tier`
   audit event so a misspelling is visible in the audit stream rather than only in the
   absence of expected behaviour.
2. The DOM attribute and the enforced tier may disagree. Document this in
   `docs/ARCHITECTURE.md` beside the tier table, not only here.
