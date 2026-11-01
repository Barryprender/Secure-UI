// Configures the table under a strict Trusted Types CSP. Plain ES module served
// same-origin, so it runs under `script-src 'self'`. No inline script anywhere.
//
// Sentinels the spec reads back:
//  __tableReady  : true once columns + data are set and the table has rendered.
//  __xss         : set true only if an injected onerror handler ever executes.
//  __tableClicks : count of clicks whose composed path reached the table host.
//                  The table's controls live in a CLOSED shadow root that page
//                  script cannot query; this confirms a coordinate click landed
//                  on the table (not off-target) without piercing the root.
window.__tableReady = false;
window.__xss = false;
window.__tableClicks = 0;

// HTML-cell path probes. Each stays false unless injected markup executes.
window.__xssStr = false;
window.__xssHtmlVal = false;
window.__xssSlot = false;
// Column keys for which a cell degraded a blocked HTML string to text. Under the
// strict CSP this fills with the string-render and `_html` columns; the Node and
// slotted paths never parse, so they never appear here.
window.__htmlBlocked = [];

document.addEventListener('click', (e) => {
  if (e.composedPath().some((n) => n instanceof Element && n.id === 'tt-table')) {
    window.__tableClicks++;
  }
});

// secure-audit bubbles + composes out of the closed root; count the fallbacks.
document.addEventListener('secure-audit', (e) => {
  const d = e.detail;
  if (d && d.event === 'html_blocked_by_trusted_types') {
    window.__htmlBlocked.push(d.data ? d.data.columnKey : null);
  }
});

// A connected element upgrades synchronously inside customElements.define(), so
// registration must happen after the sentinels above are in place. A static
// `import` runs before any module body; a dynamic import does not.
await import('/latest/index.js');

const table = document.getElementById('tt-table');

table.columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'note', label: 'Note' },
];

// 12 rows → two pages at the default pageSize of 10, so pagination renders.
// Row 1's `note` is a plain string value (no `_html` key, no render function),
// so the cell builder sets it via textContent. An XSS probe lands here: if the
// markup were ever inserted as HTML the onerror would fire and set window.__xss.
const rows = [
  { id: 1, name: 'Ada', note: '<img src=x onerror="window.__xss = true">' },
];
for (let i = 2; i <= 12; i++) {
  rows.push({ id: i, name: 'User ' + i, note: 'row ' + i });
}
table.data = rows;

// The tt-html-table (string / Node / _html cell paths) is configured by the spec
// itself, not here: a blocked string parse logs a CSP-violation console error even
// when caught, and that would pollute the shared "no TrustedHTML error" fixture.
// Keeping it out of the default setup leaves this fixture sink-clean for the other
// tests; only the HTML-cell tests opt in.

window.__tableReady = true;
