# ADR-0003: Carry component CSS as a linked stylesheet in source and a constructable sheet in the bundle

## Status
**Accepted** — 14 September 2026.
`addComponentStyles()` branches on whether its argument contains a `{`, which is the
kind of detail that gets "cleaned up" by someone who does not know what the two
branches are for. The constraint driving the design is a Content-Security-Policy rule
that lives in `server.js`, in a different language, in a different part of the tree.

## Context
The library targets deployments running a strict CSP: `style-src 'self'`, with no
`unsafe-inline`. That directive is not decoration — it is the second half of the XSS
defence, the half that stops an injected payload from styling a fake login prompt over
the real form, and the project's own guidance says injection detection in the browser
is not a substitute for it (ADR-0005).

`style-src 'unsafe-inline'` governs `<style>` elements and `style=""` attributes. It
does not govern constructable stylesheets: a `CSSStyleSheet` built in script and
assigned to `adoptedStyleSheets` carries no inline-style origin and is unaffected by
the directive. It also does not govern a `<link rel="stylesheet">` whose href is
same-origin, which `'self'` permits outright.

So the obvious implementation — build a `<style>` element and append it to the shadow
root — is the one option a strict CSP refuses, and it fails in a way that is easy to
miss during development. Unstyled shadow content still renders. The component works.
The only evidence is a console violation on a page nobody was watching.

The two build modes have genuinely different needs. In source and dev mode the CSS
lives in a real `.css` file next to its component, which is what makes it editable,
diffable and reloadable. In `dist/secure-ui.bundle.js` there is no separate file to
fetch: the bundle is one self-contained artefact, and a `<link>` in it would point at a
path the consumer never deployed.

## Decision
`addComponentStyles(cssInput: string)` accepts either a resolved URL or CSS text and
distinguishes them by testing for `{`. CSS text always contains a brace; a resolved URL
never does.

Given a URL, it appends a `<link rel="stylesheet">` to the shadow root. Components pass
`new URL('./secure-foo.css', import.meta.url).href`, which resolves against the
module's own location and is therefore same-origin and allowed by `style-src 'self'`.

Given CSS text, it constructs a `CSSStyleSheet`, calls `replaceSync()` and appends it
to `adoptedStyleSheets`. `build/css-inliner.js` rewrites the URL argument into
minified CSS text at build time, so the same source line produces a link in dev and an
adopted sheet in the bundle with no conditional in the component.

No component builds a `<style>` element. No component uses a `style=""` attribute
except for a genuinely dynamic value with no custom-property equivalent. No shadow
stylesheet uses `@import`, which would issue a second fetch outside the module graph
that the build cannot see or inline.

## Alternatives considered
**A `<style>` element with the CSS inlined.** The shortest implementation and the one
every tutorial shows. It requires `style-src 'unsafe-inline'`, which weakens the CSP
for the entire page — not just for this library — to save a build step. Trading a
page-wide security header for component convenience is the wrong direction.

**`adoptedStyleSheets` everywhere, including source mode.** Removes the branch, at the
cost of moving every component's CSS into a template literal inside its TypeScript
file. Stylesheets stop being stylesheets: no editor CSS support, no independent
caching, no reload without a rebuild, and diffs that mix style and behaviour changes in
one file. The branch is cheaper than that.

**`<link>` everywhere, including the bundle.** Keeps one code path, and breaks the
bundle's central promise. `dist/secure-ui.bundle.js` exists so a consumer can add one
script tag; a bundle that then fetches fifteen CSS files from paths relative to itself
is not self-contained, and fails outright when the consumer serves the bundle from a
CDN and nothing else.

**A hash- or nonce-based CSP allowing specific inline styles.** Technically sound and
operationally hostile: every style change alters a hash, the consumer must regenerate
their CSP header on each library upgrade, and a nonce requires server-side generation
per response. The library would be imposing deployment work to avoid a build step it
already has.

## Consequences

**Negative.** Style delivery differs between development and production, so a CSP
fault can be present in one mode and absent in the other; the build-artefact suite is
what catches this, not day-to-day development. The `{` test is a heuristic, not a
parse — a URL containing a literal brace would be misread as CSS, which is
theoretically reachable through an oddly encoded path. Every new component must be
added to the `COMPONENTS` array in `build/css-inliner.js` or its `<link>` survives into
the bundle and 404s at the consumer's origin, a failure that appears as unstyled
components rather than as a build error. Dev mode issues one stylesheet request per
component instance type. `adoptedStyleSheets` and constructable stylesheets exclude
browsers without them, which is a deliberate narrowing of support.

**Positive.** The library runs under `style-src 'self'` with no exceptions asked of
the consumer, so adopting it does not require weakening a page's CSP. Component CSS
stays in `.css` files where it can be read, linted and reviewed as CSS. The bundle is
genuinely one file. The switch between the two mechanisms is one function, so a future
third mode is one more branch in one place.

## Follow-up
1. `build/css-inliner.js` should fail the build when a component directory contains a
   `.css` file that is not listed in `COMPONENTS`, rather than silently leaving the
   `<link>` in place.
2. Add a build-artefact assertion that `dist/secure-ui.bundle.js` contains no
   `rel="stylesheet"` and no `<style` string.
3. The end-to-end suite should load the gallery under the production CSP and fail on a
   `securitypolicyviolation` event, so the dev/production divergence is caught by CI
   rather than by a consumer.
