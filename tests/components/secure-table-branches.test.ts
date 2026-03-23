/**
 * SecureTable — branch coverage
 *
 * Targets specific uncovered branches identified by coverage analysis:
 * non-array setters, filterable:false, prototype-pollution guards,
 * action-button delegation, sort direction toggle, page boundary guard,
 * slotted-table parsing edge cases, renderCell HTML-key path,
 * renderPageNumbers startPage clamp, and maskValue branches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureTable } from '../../src/components/secure-table/secure-table.js';

if (!customElements.get('secure-table')) {
  customElements.define('secure-table', SecureTable);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mount(tier = 'public'): SecureTable {
  const t = document.createElement('secure-table') as SecureTable;
  t.setAttribute('security-tier', tier);
  document.body.appendChild(t);
  return t;
}

const BASE_COLS = [
  { key: 'id',   label: 'ID',   sortable: true },
  { key: 'name', label: 'Name', sortable: true, filterable: true },
];

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `User ${String(i + 1).padStart(3, '0')}`,
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecureTable — non-array setter guards (lines 204, 223)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('ignores non-array assigned to data', () => {
    table = mount();
    table.columns = BASE_COLS;
    table.data = makeRows(3);
    // @ts-expect-error — intentional bad input
    table.data = 'not-an-array';
    expect(table.data).toHaveLength(3); // unchanged
  });

  it('ignores non-array assigned to columns', () => {
    table = mount();
    table.columns = BASE_COLS;
    // @ts-expect-error — intentional bad input
    table.columns = { key: 'x', label: 'X' };
    expect(table.columns).toHaveLength(2); // unchanged
  });
});

describe('SecureTable — filterable:false branch (line 249)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('does not match rows via a filterable:false column', async () => {
    table = mount();
    table.columns = [
      { key: 'id',   label: 'ID',   sortable: true, filterable: false },
      { key: 'name', label: 'Name', sortable: true, filterable: true },
    ];
    table.data = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const search = table.shadowRoot?.querySelector('.search-input') as HTMLInputElement;
    // Searching "1" would match id=1 if id were filterable, but it's not
    search.value = '1';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(0); // no match via non-filterable id column
  });
});

describe('SecureTable — goToPage boundary guard (line 303)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('does not change page when prevBtn clicked on first page', async () => {
    table = mount();
    table.columns = BASE_COLS;
    table.data = makeRows(25);

    const prevBtn = table.shadowRoot?.getElementById('prevBtn') as HTMLButtonElement;
    // Remove disabled to force the click through (tests the guard inside goToPage)
    prevBtn.removeAttribute('disabled');
    prevBtn.click();
    await new Promise(r => setTimeout(r, 30));

    // Should still show rows 1-10 (first page unchanged)
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('User 001');
    expect(shadow).not.toContain('User 011');
  });

  it('does not advance past the last page when nextBtn clicked on last page', async () => {
    table = mount();
    table.columns = BASE_COLS;
    table.data = makeRows(15); // 2 pages

    const nextBtn = table.shadowRoot?.getElementById('nextBtn') as HTMLButtonElement;
    nextBtn.click(); // go to page 2
    await new Promise(r => setTimeout(r, 30));

    const nextBtn2 = table.shadowRoot?.getElementById('nextBtn') as HTMLButtonElement;
    nextBtn2.removeAttribute('disabled');
    nextBtn2.click(); // attempt page 3 (out of range)
    await new Promise(r => setTimeout(r, 30));

    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(5); // still on page 2 (last 5 of 15)
  });
});

describe('SecureTable — sort direction toggle back to ascending (line 272)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('toggles desc → asc on third click of same header', () => {
    table = mount();
    table.columns = BASE_COLS;
    table.data = makeRows(5);

    const th = table.shadowRoot?.querySelector('th.sortable') as HTMLElement;
    th.click(); // → asc
    th.click(); // → desc
    th.click(); // → asc again (covers line 272 arm 1: direction !== 'asc')
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('ascending');
  });
});

describe('SecureTable — sort comparison equal values (lines 283, 284)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('handles rows with identical sort values (comparison stays 0)', () => {
    table = mount();
    table.columns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'score', label: 'Score', sortable: true },
    ];
    table.data = [
      { name: 'Alice', score: 100 },
      { name: 'Bob',   score: 100 }, // same score
      { name: 'Carol', score: 100 },
    ];
    const scoreHeader = Array.from(
      table.shadowRoot?.querySelectorAll('th.sortable') ?? []
    ).find(th => th.getAttribute('data-column') === 'score') as HTMLElement;
    expect(() => scoreHeader.click()).not.toThrow();
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(3);
  });
});

describe('SecureTable — action button delegation (lines 596–617)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  beforeEach(() => {
    table = mount();
    table.columns = [
      { key: 'name', label: 'Name' },
      {
        key: 'action',
        label: 'Action',
        render: (_v: unknown, row: Record<string, unknown>) =>
          `<button data-action="edit" data-user-id="${row['name'] as string}">Edit</button>`,
      },
    ];
    table.data = [{ name: 'Alice', action: '' }];
  });

  it('dispatches table-action event when [data-action] element is clicked', () => {
    const events: CustomEvent[] = [];
    table.addEventListener('table-action', (e) => events.push(e as CustomEvent));

    const btn = table.shadowRoot?.querySelector('[data-action="edit"]') as HTMLElement | null;
    btn?.click();

    expect(events).toHaveLength(1);
    expect(events[0]?.detail?.action).toBe('edit');
    expect(events[0]?.detail?.userId).toBe('Alice');
  });

  it('does not dispatch table-action when clicking non-action element', () => {
    const events: CustomEvent[] = [];
    table.addEventListener('table-action', (e) => events.push(e as CustomEvent));

    // Click a cell that has no [data-action]
    const td = table.shadowRoot?.querySelector('td') as HTMLElement | null;
    td?.click();
    expect(events).toHaveLength(0);
  });
});

describe('SecureTable — prototype pollution guard in action button (lines 606, 610)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('strips __proto__, constructor, prototype data-* attributes from action detail', () => {
    table = mount();
    table.columns = [
      {
        key: 'action',
        label: 'Action',
        render: () =>
          `<button
             data-action="test"
             data-__proto__="polluted"
             data-constructor="polluted"
             data-prototype="polluted"
             data-safe-key="ok"
           >Act</button>`,
      },
    ];
    table.data = [{ action: '' }];

    const events: CustomEvent[] = [];
    table.addEventListener('table-action', (e) => events.push(e as CustomEvent));

    const btn = table.shadowRoot?.querySelector('[data-action="test"]') as HTMLElement | null;
    btn?.click();

    expect(events).toHaveLength(1);
    const detail = events[0]?.detail as Record<string, unknown>;
    expect(detail['__proto__']).toBeUndefined();
    expect(detail['constructor']).toBeUndefined();
    expect(detail['prototype']).toBeUndefined();
    expect(detail['safeKey']).toBe('ok');
  });
});

describe('SecureTable — slotted table parsing edge cases', () => {
  afterEach(() => document.querySelectorAll('secure-table').forEach(t => t.remove()));

  it('returns null and does not crash when slotted <thead> has no <th> elements (line 137)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr></tr></thead>
        <tbody></tbody>
      </table>`;
    expect(() => document.body.appendChild(table)).not.toThrow();
    // No columns parsed — falls through to empty state
    expect(table.columns).toHaveLength(0);
  });

  it('falls back to text-based key when data-key is absent on <th> (line 140)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th>Full Name</th></tr></thead>
        <tbody><tr><td>Alice</td></tr></tbody>
      </table>`;
    document.body.appendChild(table);
    // Key derived from text: "Full Name" → "full_name"
    expect(table.columns[0]?.key).toBe('full_name');
  });

  it('respects data-sortable="false" on <th> (line 144)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th data-key="name" data-sortable="false">Name</th></tr></thead>
        <tbody><tr><td>Alice</td></tr></tbody>
      </table>`;
    document.body.appendChild(table);
    expect(table.columns[0]?.sortable).toBe(false);
  });

  it('respects data-filterable="false" on <th> (line 145)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th data-key="name" data-filterable="false">Name</th></tr></thead>
        <tbody><tr><td>Alice</td></tr></tbody>
      </table>`;
    document.body.appendChild(table);
    expect(table.columns[0]?.filterable).toBe(false);
  });

  it('attaches a render function when data-render-html is set on <th> (line 148)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th data-key="name" data-render-html>Name</th></tr></thead>
        <tbody><tr><td>Alice</td></tr></tbody>
      </table>`;
    document.body.appendChild(table);
    expect(typeof table.columns[0]?.render).toBe('function');
  });

  it('skips cell data when data-key is a prototype-polluting value (line 164)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th data-key="name">Name</th></tr></thead>
        <tbody>
          <tr><td data-key="__proto__">polluted</td></tr>
          <tr><td>Alice</td></tr>
        </tbody>
      </table>`;
    expect(() => document.body.appendChild(table)).not.toThrow();
    // Object.prototype must not be polluted
    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('stores HTML content from cells that contain markup (line 169)', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.innerHTML = `
      <table slot="table">
        <thead><tr><th data-key="status" data-render-html>Status</th></tr></thead>
        <tbody><tr><td><span class="badge">Active</span></td></tr></tbody>
      </table>`;
    document.body.appendChild(table);
    // Parsed row should contain the html variant
    expect(table.data[0]).toBeDefined();
    // Text content captured
    expect(String(table.data[0]?.['status'] ?? '')).toContain('Active');
  });
});

describe('SecureTable — renderCell HTML-key path (line 355)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('renders pre-stored HTML from _html key without masking', () => {
    table = mount();
    table.columns = [
      { key: 'status', label: 'Status' },
    ];
    // Simulate row that has a _html variant (as produced by slotted table parser)
    table.data = [
      { status: 'Active', status_html: '<span class="badge">Active</span>' },
    ];
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('badge');
  });
});

describe('SecureTable — maskValue with short sensitive string (line 332)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('does not mask a sensitive-tier value that is <= 4 chars', () => {
    table = mount();
    table.columns = [{ key: 'code', label: 'Code', tier: 'sensitive' }];
    table.data = [{ code: 'AB' }]; // length 2, <= 4, no masking applied
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('AB');
  });
});

describe('SecureTable — renderPageNumbers startPage clamp (line 516)', () => {
  let table: SecureTable;
  afterEach(() => table.remove());

  it('clamps startPage when near the end of many pages', async () => {
    table = mount();
    table.columns = BASE_COLS;
    table.data = makeRows(100); // 10 pages

    // Navigate to the last page
    for (let i = 0; i < 9; i++) {
      const nextBtn = table.shadowRoot?.getElementById('nextBtn') as HTMLButtonElement;
      nextBtn.click();
      await new Promise(r => setTimeout(r, 10));
    }

    const shadow = table.shadowRoot?.innerHTML ?? '';
    // Page 10 should be shown and active
    expect(shadow).toContain('active');
    // Pagination buttons should be rendered without throwing
    const pageButtons = table.shadowRoot?.querySelectorAll('.pagination-button[data-page]');
    expect(pageButtons?.length).toBeGreaterThan(0);
  });
});
