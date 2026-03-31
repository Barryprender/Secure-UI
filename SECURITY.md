# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via GitHub's Security Advisory feature:
[https://github.com/Barryprender/Secure-UI/security/advisories/new](https://github.com/Barryprender/Secure-UI/security/advisories/new)

Include:
- A description of the vulnerability
- Steps to reproduce
- Affected component(s) and version(s)
- Potential impact assessment

You will receive an acknowledgement within 48 hours and a resolution timeline within 7 days.

## Security Architecture

Secure-UI is a security-first Web Component library. Key mitigations include:

- **XSS prevention** — all user-controlled values are sanitized via `textContent` assignment before any DOM insertion
- **Closed Shadow DOM** — `mode: 'closed'` prevents external JS from accessing internal component state
- **Fail-secure defaults** — components default to `security-tier="critical"` when no tier is specified
- **Rate limiting** — critical and sensitive tier components enforce per-component request rate limits
- **Audit logging** — all field interactions dispatch `secure-audit` events for external SIEM integration
- **CSRF protection** — `<secure-form>` injects a hidden CSRF token input when provided via the `csrf-token` attribute
- **CSP compliance** — styles are loaded via `<link rel="stylesheet">` (never inline `style` attributes or `adoptedStyleSheets` with inline strings)
- **Immutable security tier** — the `security-tier` attribute is locked after `connectedCallback` and cannot be downgraded
- **Behavioral telemetry** — every field silently records typing velocity, paste detection, correction patterns, dwell time, and autofill signals; `<secure-form>` aggregates these into a per-submission risk score (0–100) with named risk signals
- **Environmental signals + envelope signing** — `<secure-telemetry-provider>` detects WebDriver/headless flags, DOM script injection (via `MutationObserver`), devtools, and suspicious screen dimensions; signs the final telemetry envelope with HMAC-SHA-256 via SubtleCrypto so the server can detect replay attacks and casual forgery
- **PCI-aware card handling** — `<secure-card>` never includes the full PAN or CVC in events, audit logs, or hidden form inputs; raw card data is only accessible via `getCardData()` for direct handoff to a PCI-compliant payment SDK

## Scope

In-scope for responsible disclosure:
- XSS, CSRF, or injection vulnerabilities in any component
- Shadow DOM escape vectors
- Rate limit bypass techniques
- Audit log tampering
- Security tier downgrade attacks
- Telemetry bypass or spoofing that defeats the behavioral risk scoring
- Replay attacks against the HMAC-SHA-256 signed telemetry envelope
- Full PAN or CVC data leaking from `<secure-card>` into events, logs, or hidden inputs

Out of scope:
- Vulnerabilities requiring physical access to the host machine
- Social engineering
- Issues in `devDependencies` that do not affect the published package
- Telemetry heuristic evasion by a sophisticated attacker (signals are intentionally heuristic — see `<secure-telemetry-provider>` docs)
