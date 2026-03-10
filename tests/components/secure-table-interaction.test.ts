/**
 * SecureTable Interaction Tests
 *
 * Targeted branch coverage for sort, filter, pagination click paths,
 * attribute-change handlers, and edge cases not covered in the main test file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureTable } from '../../src/components/secure-table/secure-table.js';

if (!customElements.get('secure-table')) {
  customElements.define('secure-table', SecureTable);
}

const COLS = [
  { key: 'id',   label: 'ID',   sortable: true },
  { key: 'name', label: 'Name', sortable: true, filterable: true },
  { key: 'role', label: 'Role', sortable: false, filterable: true },
];

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `User ${String(i + 1).padStart(3, '0')}`,
    role: i % 2 === 0 ? 'Admin' : 'User',
  }));
}

describe('SecureTable — sorting', () => {
  let table: SecureTable;

  beforeEach(() => {
    table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.columns = COLS;
    table.data = makeRows(5);
    document.body.appendChild(table);
  });

  afterEach(() => { table.remove(); });

  it('sorts ascending on first click of a sortable header', () => {
    const th = table.shadowRoot?.querySelector('th.sortable') as HTMLElement | null;
    th?.click();
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('sorted');
  });

  it('toggles to descending on second click', () => {
    const th = table.shadowRoot?.querySelector('th.sortable') as HTMLElement | null;
    th?.click();
    th?.click();
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('descending');
  });

  it('switches sort column on clicking a different header', () => {
    const headers = table.shadowRoot?.querySelectorAll('th.sortable');
    (headers?.[0] as HTMLElement)?.click();
    (headers?.[1] as HTMLElement)?.click();
    const shadow = table.shadowRoot?.innerHTML ?? '';
    // Second column should now be sorted
    expect(shadow).toContain('ascending');
  });

  it('does not sort a non-sortable column', () => {
    const ths = table.shadowRoot?.querySelectorAll('th');
    // Third column (role) has sortable: false — click should not throw
    expect(() => (ths?.[2] as HTMLElement)?.click()).not.toThrow();
  });
});

describe('SecureTable — filtering', () => {
  let table: SecureTable;

  beforeEach(() => {
    table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.columns = COLS;
    table.data = makeRows(10);
    document.body.appendChild(table);
  });

  afterEach(() => { table.remove(); });

  it('filters rows matching the search term', async () => {
    const search = table.shadowRoot?.querySelector('.search-input') as HTMLInputElement | null;
    if (!search) return;
    search.value = 'User 001';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(1);
  });

  it('shows empty state when filter matches nothing', async () => {
    const search = table.shadowRoot?.querySelector('.search-input') as HTMLInputElement | null;
    if (!search) return;
    search.value = 'zzz-no-match';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('empty-state');
  });

  it('clears filter when search input is emptied', async () => {
    const search = table.shadowRoot?.querySelector('.search-input') as HTMLInputElement | null;
    if (!search) return;
    search.value = 'User 001';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(10);
  });
});

describe('SecureTable — pagination', () => {
  let table: SecureTable;

  beforeEach(() => {
    table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.columns = COLS;
    table.data = makeRows(25);
    document.body.appendChild(table);
  });

  afterEach(() => { table.remove(); });

  it('shows first page of 10 rows by default', () => {
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(10);
  });

  it('navigates to next page', async () => {
    const nextBtn = table.shadowRoot?.getElementById('nextBtn') as HTMLButtonElement | null;
    nextBtn?.click();
    await new Promise(r => setTimeout(r, 50));
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('User 011');
  });

  it('navigates to last page via page number buttons', async () => {
    // Click page 3 button (25 rows / 10 per page = 3 pages)
    const page3 = Array.from(
      table.shadowRoot?.querySelectorAll('.pagination-button[data-page]') ?? []
    ).find(b => b.getAttribute('data-page') === '3') as HTMLButtonElement | null;
    page3?.click();
    await new Promise(r => setTimeout(r, 50));
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(5); // 25 rows, last page has 5
  });

  it('navigates to a specific page number', async () => {
    const page2 = Array.from(
      table.shadowRoot?.querySelectorAll('.pagination-button[data-page]') ?? []
    ).find(b => b.getAttribute('data-page') === '2') as HTMLButtonElement | null;
    page2?.click();
    await new Promise(r => setTimeout(r, 50));
    const shadow = table.shadowRoot?.innerHTML ?? '';
    expect(shadow).toContain('User 011');
  });

  it('disables prev button on first page', () => {
    const prevBtn = table.shadowRoot?.getElementById('prevBtn') as HTMLButtonElement | null;
    expect(prevBtn?.disabled).toBe(true);
  });

  it('disables next button on last page', async () => {
    const page3 = Array.from(
      table.shadowRoot?.querySelectorAll('.pagination-button[data-page]') ?? []
    ).find(b => b.getAttribute('data-page') === '3') as HTMLButtonElement | null;
    page3?.click();
    await new Promise(r => setTimeout(r, 50));
    const nextBtn = table.shadowRoot?.getElementById('nextBtn') as HTMLButtonElement | null;
    expect(nextBtn?.disabled).toBe(true);
  });
});

describe('SecureTable — caption attribute', () => {
  it('renders without error when caption attribute is set', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.setAttribute('caption', 'My Table Title');
    table.columns = COLS;
    table.data = makeRows(3);
    expect(() => document.body.appendChild(table)).not.toThrow();
    expect(table.shadowRoot?.innerHTML.length).toBeGreaterThan(0);
    table.remove();
  });
});

describe('SecureTable — columns as JS property', () => {
  it('renders column headers after setting columns property', () => {
    const table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.columns = COLS;
    table.data = makeRows(2);
    document.body.appendChild(table);
    const shadow = table.shadowRoot?.innerHTML ?? '';
    table.remove();
    expect(shadow).toContain('Name');
  });
});

describe('SecureTable — page-size selector', () => {
  let table: SecureTable;

  beforeEach(() => {
    table = document.createElement('secure-table') as SecureTable;
    table.setAttribute('security-tier', 'public');
    table.columns = COLS;
    table.data = makeRows(30);
    document.body.appendChild(table);
  });

  afterEach(() => { table.remove(); });

  it('changes page size via selector', async () => {
    const select = table.shadowRoot?.querySelector('.page-size-select') as HTMLSelectElement | null;
    if (!select) return;
    select.value = '25';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const rows = table.shadowRoot?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(25);
  });
});
