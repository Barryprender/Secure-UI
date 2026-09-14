# ADR-0005: Classify client-side rate limiting and injection detection as UX controls, not security controls

## Status
**Accepted** — 14 September 2026.
Both mechanisms are in `SecureBaseComponent`, both carry warning comments at their
definitions, and both are the features most likely to be cited by someone deciding
this library removes a server-side obligation. The comments are read by maintainers.
This record is for the people making the deployment decision, who never open the file.

## Context
`checkRateLimit()` counts attempts against a window held in a private field, and
`detectInjection()` tests a value against a list of patterns, fires
`secure-threat-detected`, and blocks form submission. Both do useful work and both are
trivially bypassed, because both run entirely in a browser the attacker controls.

The rate-limit window is a JavaScript object. It resets on reload, resets on
navigation, does not exist for a request built with `fetch` or `curl`, and is not
shared between two tabs. An attacker enumerating credentials does not click a button
five times and wait; they post to the endpoint directly and never load the component.

Injection detection is weaker still, because it is pattern matching against an
adversary who can see the patterns. `SecureBaseComponent.#INJECTION_PATTERNS` ships in
the bundle. An attacker reads the list, writes a payload that does not match it, and
in any case submits to the endpoint without the browser. Detection blocks the
submission in the DOM; it does not block the request.

The risk this record addresses is not that either mechanism is weak. It is that both
are *legible*. A rate limiter that reports "too many attempts" and a threat detector
that renders an inline warning both look, in a demonstration, exactly like controls
that work — and a library that presents them without qualification invites a team to
skip the server-side equivalent, which is the only version that stops anything. The
library would then have caused the vulnerability it appears to address.

## Decision
Both mechanisms are classified as user-experience controls and early-warning signals.
Neither is a security control, and neither is presented as one.

`checkRateLimit()` remains, because slowing an ordinary user who has mistyped a
password five times is genuinely useful and costs a legitimate user nothing.
`detectInjection()` remains, because it gives a confused user immediate feedback and
gives the server an early signal when its `secure-threat-detected` event is forwarded.

Both carry a `⚠ DEPLOYMENT REQUIREMENT` comment at the definition naming the
server-side control that must exist: per-IP or per-account rate limiting at the API
layer or WAF, and output encoding plus a strict CSP for injection. `SECURITY.md` states
the same in the consumer-facing document, and `CLAUDE.md` requires the annotation to be
preserved when either function is touched. The raw value that matched a pattern is
excluded from the threat event, per ADR-0004.

## Alternatives considered
**Remove both, since neither stops an attacker.** Tempting, and it removes the
misreading at the source. It also removes real value: the friction genuinely helps the
user who is fumbling a password, and the threat event is a useful signal when the
server records it. A control that is honest about its scope is worth more than an
absence, provided the scope is written down — which is what this record does.

**Strengthen them until they are security controls.** Not reachable from inside the
browser. Every input to both mechanisms — the clock, the counter, the pattern list, the
submitted value, whether the component runs at all — is under the attacker's control.
No amount of work in this codebase changes that, and effort spent trying produces
something that looks stronger while being exactly as bypassable.

**Fail closed: block submission entirely when the rate limit is exceeded, with no
reset.** Punishes only legitimate users, who are the only ones subject to it, and
converts a mistyped password into a support ticket. The attacker is unaffected, having
never loaded the page.

**Say nothing and let the documentation imply what it implies.** This is the status quo
that prompted the record. Silence is read as endorsement, and the team that reads it as
endorsement is the one that ships without a server-side limiter.

## Consequences

**Negative.** The library carries code that its own documentation describes as not a
security control, which reads as dead weight to a reviewer who does not read the
rationale, and invites periodic proposals to delete it. Maintenance cost is real and
permanent: the pattern list needs occasional review, the rate-limit state adds fields
to the base class, and both need test coverage for behaviour that stops nothing. The
warnings depend on being read — a consumer who takes the feature list at face value is
in the exact position this record exists to prevent, and nothing in the code stops
them. Injection detection produces false positives on legitimate input containing
angle brackets or SQL-like phrasing, which blocks a user who has done nothing wrong.

**Positive.** The security posture is stated rather than implied, so a team evaluating
the library can see what it must still build. The distinction between defence in depth
and defence is explicit, which is the distinction most often lost when a security
library is adopted. Users get immediate, local feedback for ordinary mistakes. The
threat event gives a server a signal it would not otherwise have, at no cost to the
correctness of the server's own controls.

## Follow-up
1. `SECURITY.md` should carry a deployment checklist a consumer can work through
   before going live, naming the server-side rate limiter, the CSP, and output
   encoding as required rather than recommended.
2. False-positive rates for `#INJECTION_PATTERNS` are unmeasured. Review the pattern
   list against realistic free-text input before adding to it.
3. Neither mechanism may be cited in `README.md` feature lists without the
   qualification attached in the same sentence.
