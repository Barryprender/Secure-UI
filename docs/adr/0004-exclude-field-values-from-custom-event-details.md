# ADR-0004: Exclude field values from custom event details

## Status
**Accepted** — 14 September 2026.
Implemented across the component set in 0.4.0 as a set of breaking changes, each
recorded in `CHANGELOG.md` as its own line. This record gives them one rationale, so
the next person to add a component knows the rule applies to their event too, and the
next person to find `detail.value` missing knows it was removed on purpose.

## Context
Every component event is dispatched with `{ bubbles: true, composed: true }`. That
combination is required: `composed` lets the event cross the shadow boundary, and
`bubbles` lets a consumer attach one listener to a container rather than to each field.
It also means the event travels to `document`, and any listener anywhere on the page
receives it with its `detail` intact.

"Any listener anywhere on the page" includes code the application author did not write
and does not control: a tag manager, a session-replay recorder, an A/B testing
snippet, a chat widget, and an injected script. A single
`document.addEventListener('secure-input-change', e => beacon(e.detail))` collects
every keystroke of every field in the application. It needs no privileges, survives a
closed shadow root (ADR-0002), and is indistinguishable from ordinary analytics in a
code review.

The exposure is worst exactly where the library is most needed. `secure-form-submit`
carried the full `formData`; `secure-form-success` carried the raw `Response`;
`secure-card-change` carried the cardholder name; `secure-file-change` carried real
`File` objects, whose `.arrayBuffer()` and `.text()` methods hand a listener the file
contents. A CRITICAL-tier field masks its value on screen and then published that same
value to the page on every keystroke.

## Decision
Event details carry identity and metadata only. Concretely: `secure-input-change`
carries `{ name, masked, tier }`; `secure-textarea-change`, `secure-datetime-change`
and `secure-select-change` carry no `value`; `secure-file-change` carries
`ReadonlyArray<SecureFileMeta>` — `{ name, size, type }` — and no `File`;
`secure-form-submit` carries no `formData`; `secure-form-success` carries
`{ status, ok, telemetry }` and no `Response`; `secure-card-change` carries the card
type and `last4` and neither the PAN, the CVC, nor the cardholder name;
`secure-threat-detected` carries the matched pattern's identifier and not the value
that matched it.

A consumer that needs the value reads it from the element:
`(event.target as SecureInput).value`. The property is reachable only from a reference
to the component, which a listener on `document` does not have unless the page already
trusts it.

The same rule governs the audit log and the light-DOM hidden inputs. `SecureCard`
writes hidden inputs for the last four digits, the expiry and the holder, and never for
the PAN or the CVC; `getCardData()` is the single accessor for those, exists for direct
handoff to a PCI-compliant payment SDK, and its return value is used once and
discarded.

## Alternatives considered
**Drop `composed` so events stop at the shadow boundary.** This contains the leak and
breaks the API. An event that does not cross the boundary cannot be observed by the
consumer's application code at all, which is the entire purpose of dispatching it.

**Drop `bubbles` and require a listener on each component.** The event still reaches
any listener attached to that component, and any script on the page can attach one.
The blast radius shrinks from "every field" to "every field an attacker enumerates
with `querySelectorAll`", which is not a meaningful reduction.

**Mask or redact the value inside the detail.** Redaction that is good enough for a
credit-card number destroys the value's usefulness to a legitimate listener, so the
detail carries something no one can use. Redaction that preserves usefulness leaks.
There is no setting that is both.

**Gate the value on the tier — include it below SENSITIVE, omit it above.** Attractive,
and it makes the safety of a listener depend on a per-instance attribute rather than on
the event contract. A consumer writing that listener has to reason about which fields
on the page might be `public` today and `critical` after the next review. A rule that
holds only sometimes is a rule nobody can apply.

## Consequences

**Negative.** This was a breaking change for every consumer with a change listener, and
the break is quiet in the worst way: `detail.value` becomes `undefined` rather than
throwing, so a handler that logs or forwards it starts recording nothing and keeps
running. Event delegation for value handling no longer works — a listener on
`document` receives the event but must resolve `event.target` to a component reference
to read the value, which is more code than the previous one-liner. `secure-form-submit`
no longer describes the submission it announces, so a consumer wanting to inspect the
payload must walk the fields. Server-side telemetry that consumed `formData` from the
event needed rewriting. Nothing enforces the rule mechanically: a new component can
still put a value in its detail and every test will pass.

**Positive.** No page script can harvest field values by listening for library events,
which closes the gap between a masked field and an observable one and removes the most
plausible route by which this library could have become the mechanism of a breach
rather than a defence against one. The card component satisfies the PCI requirement
that the PAN and CVC never reach general application code. Event details are small,
serialisable and safe to log wholesale, which makes the audit stream genuinely usable.

## Follow-up
1. Add a test that asserts no dispatched detail object contains a key named `value`,
   `formData`, `files` holding `File` instances, or a `Response`, so the rule is
   enforced for components not yet written.
2. `docs/ARCHITECTURE.md` must state the rule beside the event table, not only the
   per-event shapes.
3. The checklist in `CLAUDE.md` for adding a component should name this record at the
   step where the event detail interface is defined.
