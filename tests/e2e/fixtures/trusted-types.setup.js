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

document.addEventListener('click', (e) => {
  if (e.composedPath().some((n) => n instanceof Element && n.id === 'tt-table')) {
    window.__tableClicks++;
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

window.__tableReady = true;
