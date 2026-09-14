# Architecture decision records

Records of decisions that were contested, that closed off an alternative, or that a
new engineer would otherwise have to reconstruct from scattered source comments.

Most reasoning does not belong here. Component structure, naming and the day-to-day
rules of the codebase live in `CLAUDE.md`; the public API and event contracts live in
`docs/ARCHITECTURE.md` and `README.md`; the consumer-facing security posture lives in
`SECURITY.md`. A record earns its place when the decision needs a status and a date
attached, because it can be reversed, superseded, or signed off.

## Conventions

Numbers are assigned in order and never reused. A record is never deleted and never
rewritten after acceptance — a decision that no longer holds is superseded by a new
record, and the old one has its status changed to `Superseded by ADR-NNNN` with the
date and nothing else altered. The wrong turns are half the value.

Titles state the decision in the imperative, not the question it answered.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-default-to-the-critical-tier-and-freeze-it-after-mount.md) | Default every component to the CRITICAL tier and freeze the tier after mount | Accepted |
| [0002](0002-close-the-shadow-root-and-withhold-the-base-component.md) | Close the shadow root and withhold SecureBaseComponent from the public API | Accepted |
| [0003](0003-carry-component-css-as-a-link-in-source-and-a-constructable-sheet-in-the-bundle.md) | Carry component CSS as a linked stylesheet in source and a constructable sheet in the bundle | Accepted |
| [0004](0004-exclude-field-values-from-custom-event-details.md) | Exclude field values from custom event details | Accepted |
| [0005](0005-classify-client-side-rate-limiting-and-injection-detection-as-ux-controls.md) | Classify client-side rate limiting and injection detection as UX controls, not security controls | Accepted |
