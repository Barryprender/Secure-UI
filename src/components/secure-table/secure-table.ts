/**
 * Secure Table Component
 *
 * A security-aware data table component with filtering, sorting, and pagination.
 *
 * Features:
 * - Real-time filtering/search across all columns
 * - Column sorting (ascending/descending)
 * - Pagination
 * - Security tier-based column masking
 * - XSS prevention via sanitization
 * - Audit logging for data access
 *
 * @example
 * <secure-table
 *   id="userTable"
 *   security-tier="sensitive"
 * ></secure-table>
 *
 * // Set data programmatically
 * const table = document.getElementById('userTable');
 * table.data = [
 *   { id: 1, name: 'John', email: 'john@example.com' },
 *   { id: 2, name: 'Jane', email: 'jane@example.com' }
 * ];
 * table.columns = [
 *   { key: 'id', label: 'ID', sortable: true },
 *   { key: 'name', label: 'Name', sortable: true, filterable: true },
 *   { key: 'email', label: 'Email', sortable: true, filterable: true, tier: 'sensitive' }
 * ];
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';
import type { TableColumnDefinition, TableSortConfig, TablePaginationState } from '../../core/types.js';

export class SecureTable extends SecureBaseComponent {
  /**
   * Data array for the table
   * @private
   */
  #data: Record<string, unknown>[] = [];

  /**
   * Column configuration
   * @private
   */
  #columns: TableColumnDefinition[] = [];

  /**
   * Filtered data after applying search
   * @private
   */
  #filteredData: Record<string, unknown>[] = [];

  /**
   * Current filter/search term
   * @private
   */
  #filterTerm: string = '';

  /**
   * Current sort configuration
   * @private
   */
  #sortConfig: TableSortConfig = { column: null, direction: 'asc' };

  /**
   * Pagination state
   * @private
   */
  #pagination: TablePaginationState = { currentPage: 1, pageSize: 10 };

  /**
   * Shadow DOM root
   * @private
   */
  #shadow: ShadowRoot;

  /**
   * Whether the component is using slotted server-rendered content
   * @private
   */
  #usingSlottedContent: boolean = false;

  constructor() {
    super();
    this.#shadow = this.shadowRoot;
  }

  /**
   * Required by abstract base class, but this component manages its own rendering
   * via the private #render() method.
   * @protected
   */
  protected render(): DocumentFragment | HTMLElement | null {
    return null;
  }

  /**
   * Component lifecycle - called when added to DOM
   */
  connectedCallback(): void {
    // Initialize security tier, config, and audit - but skip the base render
    // lifecycle since the table manages its own innerHTML-based rendering for
    // dynamic sort/filter/pagination updates.
    this.initializeSecurity();

    // Try to parse server-rendered content first (progressive enhancement)
    const slottedTable = this.querySelector('table[slot="table"]');
    const parsed = this.#parseSlottedTable();
    if (parsed) {
      console.log('SecureTable: Using server-rendered content', {
        columns: parsed.columns.length,
        rows: parsed.data.length
      });
      this.#usingSlottedContent = true;
      this.#columns = parsed.columns;
      this.#data = parsed.data;
      this.#filteredData = [...parsed.data];

      // Remove the server-rendered table from light DOM now that data is extracted
      if (slottedTable) {
        slottedTable.remove();
      }
    }

    this.#render();

    this.audit('table_mounted', {
      rowCount: this.#data.length,
      columnCount: this.#columns.length,
      usingSlottedContent: this.#usingSlottedContent
    });
  }

  /**
   * Parse server-rendered table from light DOM slot
   * @private
   */
  #parseSlottedTable(): { columns: TableColumnDefinition[]; data: Record<string, unknown>[] } | null {
    const slottedTable = this.querySelector('table[slot="table"]');
    if (!slottedTable) return null;

    try {
      // Extract columns from <thead>
      const headers = slottedTable.querySelectorAll('thead th');
      if (headers.length === 0) return null;

      const columns: TableColumnDefinition[] = Array.from(headers).map(th => {
        const key = th.getAttribute('data-key') || th.textContent!.trim().toLowerCase().replace(/\s+/g, '_');
        return {
          key: key,
          label: th.textContent!.trim().replace(/\s+$/, ''), // Remove trailing spaces/badges
          sortable: th.hasAttribute('data-sortable') ? th.getAttribute('data-sortable') !== 'false' : true,
          filterable: th.hasAttribute('data-filterable') ? th.getAttribute('data-filterable') !== 'false' : undefined,
          tier: (th.getAttribute('data-tier') || undefined) as TableColumnDefinition['tier'],
          width: th.getAttribute('data-width') || undefined,
          render: th.hasAttribute('data-render-html') ? this.#createRenderFunction(th as HTMLElement) : undefined
        };
      });

      // Extract data from <tbody>
      const rows = slottedTable.querySelectorAll('tbody tr');
      const data: Record<string, unknown>[] = Array.from(rows).map((tr, _rowIndex) => {
        const cells = tr.querySelectorAll('td');
        const row: Record<string, unknown> = {};

        cells.forEach((td, index) => {
          if (index < columns.length) {
            const column = columns[index];
            const dataKey = td.getAttribute('data-key') || column.key;

            // Store both text content and HTML if needed
            if (td.innerHTML.trim().includes('<')) {
              // Cell contains HTML (like forms, badges, etc.)
              row[dataKey] = td.textContent!.trim();
              row[`${dataKey}_html`] = td.innerHTML.trim();
            } else {
              row[dataKey] = td.textContent!.trim();
            }
          }
        });

        return row;
      });

      return { columns, data };
    } catch (error) {
      console.error('SecureTable: Error parsing slotted table', error);
      return null;
    }
  }

  /**
   * Create a render function for HTML content
   * @private
   */
  #createRenderFunction(_th: HTMLElement): (value: unknown, row: Record<string, unknown>, columnKey: string) => string {
    return (value: unknown, row: Record<string, unknown>, columnKey: string): string => {
      const htmlKey = `${columnKey}_html`;
      return (row[htmlKey] as string) || this.#sanitize(value);
    };
  }

  /**
   * Set table data
   */
  set data(data: Record<string, unknown>[]) {
    if (!Array.isArray(data)) {
      console.error('SecureTable: data must be an array');
      return;
    }
    console.log('SecureTable: Setting data, count:', data.length);
    this.#data = data;
    this.#filteredData = [...data];
    this.#render();
  }

  /**
   * Get table data
   */
  get data(): Record<string, unknown>[] {
    return this.#data;
  }

  /**
   * Set column configuration
   */
  set columns(columns: TableColumnDefinition[]) {
    if (!Array.isArray(columns)) {
      console.error('SecureTable: columns must be an array');
      return;
    }
    console.log('SecureTable: Setting columns, count:', columns.length);
    this.#columns = columns;
    this.#render();
  }

  /**
   * Get column configuration
   */
  get columns(): TableColumnDefinition[] {
    return this.#columns;
  }

  /**
   * Apply filter to data
   * @private
   */
  #applyFilter(term: string): void {
    this.#filterTerm = term.toLowerCase();

    if (!this.#filterTerm) {
      this.#filteredData = [...this.#data];
    } else {
      this.#filteredData = this.#data.filter(row => {
        return this.#columns.some(col => {
          if (col.filterable === false) return false;
          const value = String(row[col.key] || '').toLowerCase();
          return value.includes(this.#filterTerm);
        });
      });
    }

    this.#pagination.currentPage = 1; // Reset to first page
    this.#updateTableContent();

    this.audit('table_filtered', {
      filterTerm: term,
      resultCount: this.#filteredData.length
    });
  }

  /**
   * Apply sorting to data
   * @private
   */
  #applySort(columnKey: string): void {
    if (this.#sortConfig.column === columnKey) {
      // Toggle direction
      this.#sortConfig.direction = this.#sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.#sortConfig.column = columnKey;
      this.#sortConfig.direction = 'asc';
    }

    this.#filteredData.sort((a, b) => {
      const aVal = a[columnKey];
      const bVal = b[columnKey];

      let comparison = 0;
      if (aVal! > bVal!) comparison = 1;
      if (aVal! < bVal!) comparison = -1;

      return this.#sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    this.#updateTableContent();

    this.audit('table_sorted', {
      column: columnKey,
      direction: this.#sortConfig.direction
    });
  }

  /**
   * Change page
   * @private
   */
  #goToPage(pageNumber: number): void {
    const totalPages = Math.ceil(this.#filteredData.length / this.#pagination.pageSize);
    if (pageNumber < 1 || pageNumber > totalPages) return;

    this.#pagination.currentPage = pageNumber;
    this.#updateTableContent();
  }

  /**
   * Simple HTML sanitization to prevent XSS
   * @private
   */
  #sanitize(str: unknown): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * Mask sensitive column values based on tier
   * @private
   */
  #maskValue(value: unknown, tier: string | undefined): string {
    if (!value) return '-';

    const strValue = String(value);

    if (tier === SecurityTier.SENSITIVE && strValue.length > 4) {
      return '\u2022'.repeat(strValue.length - 4) + strValue.slice(-4);
    }

    if (tier === SecurityTier.CRITICAL) {
      return '\u2022'.repeat(strValue.length);
    }

    return this.#sanitize(strValue);
  }

  /**
   * Render cell content with custom render function if available
   * @private
   */
  #renderCell(value: unknown, row: Record<string, unknown>, column: TableColumnDefinition): string {
    // If column has custom render function, use it
    if (typeof column.render === 'function') {
      return column.render(value, row, column.key);
    }

    // Check if we have stored HTML content from server-rendered table
    const htmlKey = `${column.key}_html`;
    if (row[htmlKey]) {
      // Don't mask HTML content, it's already rendered
      return row[htmlKey] as string;
    }

    // Otherwise, mask value based on security tier
    return this.#maskValue(value, column.tier);
  }

  /**
   * Get component styles - placeholder for development.
   * The build process (css-inliner.js) replaces this with minified CSS from secure-table.css.
   * @private
   */
  #getComponentStyles(): string {
    return ``;
  }

  /**
   * Generate the table body, thead, and pagination HTML
   * @private
   */
  #renderTableContent(): { tableHtml: string; paginationHtml: string } {
    const totalPages = Math.ceil(this.#filteredData.length / this.#pagination.pageSize);
    const startIndex = (this.#pagination.currentPage - 1) * this.#pagination.pageSize;
    const endIndex = startIndex + this.#pagination.pageSize;
    const pageData = this.#filteredData.slice(startIndex, endIndex);

    let tableHtml: string;
    let paginationHtml: string;

    if (pageData.length === 0 || this.#columns.length === 0) {
      tableHtml = `
        <div class="empty-state">
          <div class="empty-state-icon">\uD83D\uDD0D</div>
          <h3>${this.#columns.length === 0 ? 'No columns configured' : 'No results found'}</h3>
          <p>${this.#columns.length === 0 ? 'Set the columns property to configure the table' : 'Try adjusting your search term'}</p>
        </div>`;
      paginationHtml = '';
    } else {
      tableHtml = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                ${this.#columns.map(col => `
                  <th
                    class="${col.sortable !== false ? 'sortable' : ''} ${this.#sortConfig.column === col.key ? 'sorted' : ''}"
                    data-column="${col.key}"
                  >
                    ${this.#sanitize(col.label)}
                    ${col.sortable !== false ? `<span class="sort-indicator">${this.#sortConfig.column === col.key ? (this.#sortConfig.direction === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}</span>` : ''}
                    ${col.tier ? `<span class="security-badge">${col.tier}</span>` : ''}
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${pageData.map(row => `
                <tr>
                  ${this.#columns.map(col => `
                    <td>${this.#renderCell(row[col.key], row, col)}</td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;

      paginationHtml = totalPages > 1 ? `
        <div class="pagination">
          <div class="pagination-info">
            Showing ${startIndex + 1}-${Math.min(endIndex, this.#filteredData.length)} of ${this.#filteredData.length} results
          </div>
          <div class="pagination-controls">
            <button class="pagination-button" id="prevBtn" ${this.#pagination.currentPage === 1 ? 'disabled' : ''}>
              \u2190 Previous
            </button>
            ${this.#renderPageNumbers(totalPages)}
            <button class="pagination-button" id="nextBtn" ${this.#pagination.currentPage === totalPages ? 'disabled' : ''}>
              Next \u2192
            </button>
          </div>
        </div>` : '';
    }

    return { tableHtml, paginationHtml };
  }

  /**
   * Full initial render of the table
   * @private
   */
  #render(): void {
    if (!this.#shadow) return;

    // Apply styles via adoptedStyleSheets (CSP-compliant, no nonce required)
    const baseSheet = new CSSStyleSheet();
    baseSheet.replaceSync(this.getBaseStyles());
    const componentSheet = new CSSStyleSheet();
    componentSheet.replaceSync(this.#getComponentStyles());
    this.#shadow.adoptedStyleSheets = [baseSheet, componentSheet];

    const { tableHtml, paginationHtml } = this.#renderTableContent();

    this.#shadow.innerHTML = `
      <!-- Slot for server-rendered table (fallback when JS fails to load) -->
      <slot name="table"></slot>

      <div class="table-container">
        <div class="table-header">
          <input
            type="search"
            class="search-input"
            placeholder="Search across all columns..."
            value="${this.#filterTerm}"
            id="searchInput"
          />
        </div>
        <div id="tableContent">${tableHtml}</div>
        <div id="paginationContent">${paginationHtml}</div>
      </div>
    `;

    // Attach event listeners
    this.#attachEventListeners();
  }

  /**
   * Partial update — only replaces table body and pagination, preserving search input focus.
   * @private
   */
  #updateTableContent(): void {
    if (!this.#shadow) return;

    const tableContainer = this.#shadow.getElementById('tableContent');
    const paginationContainer = this.#shadow.getElementById('paginationContent');
    if (!tableContainer) {
      // Fallback to full render if containers don't exist yet
      this.#render();
      return;
    }

    const { tableHtml, paginationHtml } = this.#renderTableContent();

    tableContainer.innerHTML = tableHtml;
    if (paginationContainer) {
      paginationContainer.innerHTML = paginationHtml;
    }

    // Re-attach listeners for table and pagination (search input listener is preserved)
    this.#attachTableEventListeners();
  }

  /**
   * Render page number buttons
   * @private
   */
  #renderPageNumbers(totalPages: number): string {
    const maxButtons = 5;
    let startPage = Math.max(1, this.#pagination.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    let buttons = '';
    for (let i = startPage; i <= endPage; i++) {
      buttons += `
        <button
          class="pagination-button ${i === this.#pagination.currentPage ? 'active' : ''}"
          data-page="${i}"
        >
          ${i}
        </button>
      `;
    }
    return buttons;
  }

  /**
   * Attach all event listeners (called on full render only)
   * @private
   */
  #attachEventListeners(): void {
    // Search input — only attached once on full render, preserved across partial updates
    const searchInput = this.#shadow.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e: Event) => {
        this.#applyFilter((e.target as HTMLInputElement).value);
      });
    }

    // Table and pagination listeners
    this.#attachTableEventListeners();
  }

  /**
   * Attach event listeners for table headers and pagination (called on every update)
   * @private
   */
  #attachTableEventListeners(): void {
    // Column sorting
    const headers = this.#shadow.querySelectorAll('th.sortable');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const column = th.getAttribute('data-column');
        this.#applySort(column!);
      });
    });

    // Pagination
    const prevBtn = this.#shadow.getElementById('prevBtn');
    const nextBtn = this.#shadow.getElementById('nextBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.#goToPage(this.#pagination.currentPage - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.#goToPage(this.#pagination.currentPage + 1);
      });
    }

    // Page number buttons
    const pageButtons = this.#shadow.querySelectorAll('.pagination-button[data-page]');
    pageButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.getAttribute('data-page')!, 10);
        this.#goToPage(page);
      });
    });

    // Action button delegation — dispatches 'table-action' CustomEvent on the host
    // element when any [data-action] element inside the table is clicked.
    // This allows page-level scripts to handle action buttons without needing
    // access to the closed shadow DOM.
    const tableContent = this.#shadow.getElementById('tableContent');
    if (tableContent) {
      tableContent.addEventListener('click', (e: Event) => {
        const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
        if (!target) return;

        const action = target.getAttribute('data-action');
        // Collect all data-* attributes from the action element
        const detail: Record<string, string> = { action: action! };
        for (const attr of Array.from(target.attributes)) {
          if (attr.name.startsWith('data-') && attr.name !== 'data-action') {
            // Convert data-user-id to userId style key
            const key = attr.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            detail[key] = attr.value;
          }
        }

        this.dispatchEvent(new CustomEvent('table-action', {
          bubbles: true,
          composed: true,
          detail
        }));

        this.audit('table_action', detail);
      });
    }
  }
}

// Register the custom element
customElements.define('secure-table', SecureTable);
