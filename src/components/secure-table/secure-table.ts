
import { SecureBaseComponent, internals } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';
import type { TableColumnDefinition, TableSortConfig, TablePaginationState } from '../../core/types.js';

export class SecureTable extends SecureBaseComponent {
  #data: Record<string, unknown>[] = [];
  #columns: TableColumnDefinition[] = [];
  #filteredData: Record<string, unknown>[] = [];
  #filterTerm: string = '';
  #sortConfig: TableSortConfig = { column: null, direction: 'asc' };
  #pagination: TablePaginationState = { currentPage: 1, pageSize: 10 };
  #usingSlottedContent: boolean = false;
  // True once the delegated action listener is bound to the current #tableContent.
  // Reset in #render(), which recreates that container.
  #actionListenerAttached: boolean = false;

  constructor() {
    super();
  }

  // render() required by base class; this component manages its own DOM via #render().
  protected render(): DocumentFragment | HTMLElement | null {
    return null;
  }

  // The table drives its own DOM-node rendering for dynamic
  // sort/filter/pagination updates, so the base render pass is skipped. Security
  // initialisation still runs in the base connectedCallback — previously this
  // component called a public initializeSecurity() instead, which left
  // #initialized false forever and silently disabled the tier-immutability guard.
  protected static override readonly managesOwnRendering = true;

  override connectedCallback(): void {
    super.connectedCallback();

    // Try to parse server-rendered content first (progressive enhancement)
    const slottedTable = this.querySelector('table[slot="table"]');
    const parsed = this.#parseSlottedTable();
    if (parsed) {
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

    internals(this).audit('table_mounted', {
      rowCount: this.#data.length,
      columnCount: this.#columns.length,
      usingSlottedContent: this.#usingSlottedContent
    });
  }

  #parseSlottedTable(): { columns: TableColumnDefinition[]; data: Record<string, unknown>[] } | null {
    const slottedTable = this.querySelector('table[slot="table"]');
    if (!slottedTable) return null;

    try {
      // Extract columns from <thead>
      const headers = slottedTable.querySelectorAll('thead th');
      if (headers.length === 0) return null;

      const columns: TableColumnDefinition[] = Array.from(headers).map(th => {
        const key = th.getAttribute('data-key') || th.textContent.trim().toLowerCase().replace(/\s+/g, '_');
        return {
          key: key,
          label: th.textContent.trim().replace(/\s+$/, ''), // Remove trailing spaces/badges
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
        const row = Object.create(null) as Record<string, unknown>;

        cells.forEach((td, index) => {
          if (index < columns.length) {
            const column = columns[index];
            const dataKey = td.getAttribute('data-key') || column.key;

            // Guard against prototype pollution via attacker-controlled data-key attributes
            if (dataKey === '__proto__' || dataKey === 'constructor' || dataKey === 'prototype') {
              return;
            }

            // Store the plain text, and — when the cell has element markup — a
            // CLONE of its child nodes for the `_html` pass-through convention.
            // `.children.length` detects markup without reading innerHTML. We clone
            // the live nodes rather than read innerHTML because the string form
            // would then have to be re-parsed with DOMParser, a Trusted Types sink
            // that throws under a strict CSP. Cloning skips parsing entirely.
            row[dataKey] = td.textContent?.trim() ?? '';
            if (td.children.length > 0) {
              const frag = document.createDocumentFragment();
              for (const node of Array.from(td.childNodes)) frag.appendChild(node.cloneNode(true));
              row[`${dataKey}_html`] = frag;
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

  #createRenderFunction(_th: HTMLElement): (value: unknown, row: Record<string, unknown>, columnKey: string) => string | Node {
    return (value: unknown, row: Record<string, unknown>, columnKey: string): string | Node => {
      const htmlKey = `${columnKey}_html`;
      // A slotted cell with markup stored a cloned DocumentFragment (a Node) under
      // the `_html` key. Return it as-is: the cell builder sanitizes nodes directly,
      // with no string parsing, so slotted HTML survives a strict Trusted Types CSP.
      // Cells without markup fall back to the escaped text so a stray `<` stays text.
      const raw = Object.hasOwn(row, htmlKey) ? (row[htmlKey] as Node) : null;
      return raw ?? this.#sanitize(value);
    };
  }

  set data(data: Record<string, unknown>[]) {
    if (!Array.isArray(data)) {
      return;
    }
    this.#data = data;
    this.#filteredData = [...data];
    this.#render();
  }

  get data(): Record<string, unknown>[] {
    return this.#data;
  }

  set columns(columns: TableColumnDefinition[]) {
    if (!Array.isArray(columns)) {
      return;
    }
    this.#columns = columns;
    this.#render();
  }

  get columns(): TableColumnDefinition[] {
    return this.#columns;
  }

  #applyFilter(term: string): void {
    this.#filterTerm = term.toLowerCase();

    if (!this.#filterTerm) {
      this.#filteredData = [...this.#data];
    } else {
      this.#filteredData = this.#data.filter(row => {
        return this.#columns.some(col => {
          if (col.filterable === false) return false;
          const value = String(row[col.key] ?? '').toLowerCase();
          return value.includes(this.#filterTerm);
        });
      });
    }

    this.#pagination.currentPage = 1; // Reset to first page
    this.#updateTableContent();

    internals(this).audit('table_filtered', {
      filterTerm: term,
      resultCount: this.#filteredData.length
    });
  }

  #applySort(columnKey: string): void {
    if (this.#sortConfig.column === columnKey) {
      // Toggle direction
      this.#sortConfig.direction = this.#sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.#sortConfig.column = columnKey;
      this.#sortConfig.direction = 'asc';
    }

    this.#filteredData.sort((a, b) => {
      const aVal = Object.hasOwn(a, columnKey) ? a[columnKey] : undefined;
      const bVal = Object.hasOwn(b, columnKey) ? b[columnKey] : undefined;

      const aNull = aVal === undefined || aVal === null;
      const bNull = bVal === undefined || bVal === null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      // Coerce to a comparable primitive: numbers sort numerically, everything else lexically.
      const aPrim = typeof aVal === 'number' ? aVal : String(aVal);
      const bPrim = typeof bVal === 'number' ? bVal : String(bVal);
      let comparison = 0;
      if (aPrim > bPrim) comparison = 1;
      else if (aPrim < bPrim) comparison = -1;

      return this.#sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    this.#updateTableContent();

    // Re-render replaces the header, so the focused sort button is gone. Return
    // focus to the new button for the same column — a keyboard user keeps their
    // place and can toggle direction with another Enter/Space.
    const root = internals(this).root;
    const button = root?.querySelector(`[data-sort-button="${CSS.escape(columnKey)}"]`);
    if (button instanceof HTMLElement) button.focus();

    internals(this).audit('table_sorted', {
      column: columnKey,
      direction: this.#sortConfig.direction
    });
  }

  #goToPage(pageNumber: number): void {
    const totalPages = Math.ceil(this.#filteredData.length / this.#pagination.pageSize);
    if (pageNumber < 1 || pageNumber > totalPages) return;

    this.#pagination.currentPage = pageNumber;
    this.#updateTableContent();
  }

  /**
   * Escape a plain-text string for safe insertion into HTML.
   * Never use this for HTML pass-through — use #sanitizeHtml() for that.
   * @private
   */
  #sanitize(str: unknown): string {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // Tags allowed inside table cells when HTML pass-through is used.
  static readonly #ALLOWED_CELL_TAGS: ReadonlySet<string> = new Set([
    'a', 'abbr', 'b', 'br', 'button', 'code', 'em', 'i',
    's', 'small', 'span', 'strong', 'time', 'u'
  ]);

  // Attributes allowed on the above tags.
  static readonly #ALLOWED_CELL_ATTRS: ReadonlySet<string> = new Set([
    'class', 'href', 'title', 'aria-label', 'aria-hidden', 'type', 'datetime'
  ]);

  // Attributes whose value the browser resolves as a URL.
  static readonly #URL_ATTRS: ReadonlySet<string> = new Set(['href', 'src', 'action']);

  // The only schemes a table cell may navigate to. Everything else — including
  // javascript:, data:, blob: and vbscript: — is rejected.
  static readonly #SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
    'http', 'https', 'mailto', 'tel'
  ]);

  /**
   * Decide whether a URL attribute value is safe to keep.
   *
   * ⚠ SECURITY: this replaces a denylist regex that required the scheme to
   * appear as one contiguous string. Browsers strip TAB, LF and CR from *inside*
   * a URL scheme, and strip leading C0 controls, before parsing it — and the
   * regex `\s` class does not cover the C0 range. So `java&#9;script:alert(1)`
   * failed the test, survived sanitization, and was re-serialized with the raw
   * TAB intact (the HTML attribute serializer escapes only `&`, `"` and NBSP),
   * after which the browser resolved it straight back to `javascript:`.
   *
   * Normalising first and then matching an allowlist removes the whole class:
   * an unrecognised scheme is rejected whether or not we anticipated it.
   */
  static #isSafeUrl(value: string): boolean {
    const normalized = value
      .replace(/[\t\n\r]/g, '')
      .replace(/^[\u0000-\u0020]+/, '')
      .toLowerCase();
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];
    // No scheme at all means a relative URL, a fragment, or a
    // protocol-relative path - none of which can execute script.
    return scheme === undefined || SecureTable.#SAFE_URL_SCHEMES.has(scheme);
  }


  /**
   * Turn a cell render result into a sanitized DocumentFragment.
   *
   * A `Node` (the recommended `render` return, and how slotted markup is captured)
   * is sanitized directly — no string parsing, so it is always Trusted-Types-safe.
   * A `string` is parsed with DOMParser, which IS a Trusted Types sink; see
   * #sanitizeHtmlStringToFragment for the strict-CSP fallback.
   * @private
   */
  #toSanitizedFragment(result: string | Node, columnKey: string): DocumentFragment {
    return result instanceof Node
      ? this.#sanitizeNodeToFragment(result)
      : this.#sanitizeHtmlStringToFragment(result, columnKey);
  }

  /**
   * Sanitize a Node tree with the strict tag/attribute allowlist and return its
   * surviving nodes in a fragment. Works on a CLONE so a node the caller still
   * holds is never mutated. No DOMParser, no HTML sink — safe under Trusted Types.
   * @private
   */
  #sanitizeNodeToFragment(node: Node): DocumentFragment {
    const fragment = document.createDocumentFragment();
    // Sanitize inside an INERT document (no browsing context): its elements never
    // fetch resources or run event handlers, so a dangerous node — e.g. an
    // <img onerror> cloned from server-rendered slotted markup — cannot fire while
    // we walk it. importNode copies `node` in (leaving the caller's node untouched);
    // the wrapper lets #sanitizeDomNode unwrap even a single disallowed top-level
    // element. Only the cleaned survivors are imported back into the live document.
    // This matches the string path, which parses inertly via DOMParser.
    const inert = document.implementation.createHTMLDocument('');
    const holder = inert.createElement('div');
    holder.appendChild(inert.importNode(node, true));
    this.#sanitizeDomNode(holder);
    while (holder.firstChild) {
      const clean = holder.firstChild;
      holder.removeChild(clean);
      fragment.appendChild(document.importNode(clean, true));
    }
    return fragment;
  }

  /**
   * Sanitize an HTML string using the strict tag/attribute allowlist.
   *
   * ⚠ `DOMParser.parseFromString` IS a Trusted Types sink. Under
   * `require-trusted-types-for 'script'` with no default policy it throws a
   * TypeError. The try/catch degrades that one cell to plain text and emits a
   * `secure-audit` (`html_blocked_by_trusted_types`) event, so a single HTML cell
   * can never bring down the whole table. The parsed document is inert — no script
   * runs — and we walk/strip it before moving survivors into the fragment.
   * data-* attributes are preserved for action delegation; event handlers and
   * javascript:/data: URIs are always stripped.
   * @private
   */
  #sanitizeHtmlStringToFragment(html: string, columnKey: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (!html) return fragment;
    try {
      const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}`, 'text/html');
      this.#sanitizeDomNode(doc.body);
      while (doc.body.firstChild) fragment.appendChild(doc.body.firstChild);
      return fragment;
    } catch {
      fragment.appendChild(document.createTextNode(html));
      internals(this).audit('html_blocked_by_trusted_types', { columnKey });
      return fragment;
    }
  }

  #sanitizeDomNode(node: Node): void {
    // Walk children with a live cursor rather than a snapshot. When a disallowed
    // element is unwrapped, its children are moved up into `node` and MUST be
    // re-examined — a snapshot (Array.from) would skip them, letting a dangerous
    // element nested inside a disallowed wrapper (e.g. <p><img onerror>) survive.
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;

      if (child.nodeType === Node.TEXT_NODE) {
        child = next;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        node.removeChild(child);
        child = next;
        continue;
      }

      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!SecureTable.#ALLOWED_CELL_TAGS.has(tag)) {
        // Unwrap: move children up before removing the wrapper, then resume the
        // walk at the first moved child so they are sanitized in turn.
        const firstMoved = el.firstChild;
        while (el.firstChild) node.insertBefore(el.firstChild, el);
        node.removeChild(el);
        child = firstMoved ?? next;
        continue;
      }

      // Strip disallowed or dangerous attributes
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (SecureTable.#URL_ATTRS.has(name) && !SecureTable.#isSafeUrl(attr.value)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (!SecureTable.#ALLOWED_CELL_ATTRS.has(name) && !name.startsWith('data-')) {
          el.removeAttribute(attr.name);
        }
      }
      this.#sanitizeDomNode(el);
      child = next;
    }
  }

  // Returns raw (unescaped) display text. The caller sets it via textContent,
  // which escapes for the DOM — escaping here too would double-encode.
  #maskValue(value: unknown, tier: string | undefined): string {
    if (value === null || value === undefined || value === '') return '-';

    const strValue = String(value);

    if (tier === SecurityTier.SENSITIVE && strValue.length > 4) {
      return '•'.repeat(strValue.length - 4) + strValue.slice(-4);
    }

    if (tier === SecurityTier.CRITICAL) {
      return '•'.repeat(strValue.length);
    }

    return strValue;
  }

  // Fills a <td> with the cell's content using DOM APIs only — no HTML strings.
  #buildCell(td: HTMLElement, value: unknown, row: Record<string, unknown>, column: TableColumnDefinition): void {
    // ⚠ SECURITY: masking wins over HTML pass-through, and is decided first.
    //
    // The HTML branch used to run before masking, and #parseSlottedTable creates
    // `${key}_html` for EVERY cell that contains markup. So a CRITICAL or
    // SENSITIVE column rendered its value in full whenever the server had wrapped
    // it in any markup at all — even a <span> or a stray <br>. A column declared
    // `data-tier="critical"` showed a complete SSN after upgrade.
    if (column.tier === SecurityTier.SENSITIVE || column.tier === SecurityTier.CRITICAL) {
      td.textContent = this.#maskValue(value, column.tier);
      return;
    }

    if (typeof column.render === 'function') {
      td.appendChild(this.#toSanitizedFragment(column.render(value, row, column.key), column.key));
      return;
    }

    const htmlKey = `${column.key}_html`;
    if (Object.hasOwn(row, htmlKey) && row[htmlKey]) {
      td.appendChild(this.#toSanitizedFragment(row[htmlKey] as string | Node, column.key));
      return;
    }

    td.textContent = this.#maskValue(value, column.tier);
  }

  // Build the table body and pagination as DOM nodes. Returns null pagination
  // when a single page (or empty) — the caller clears the pagination container.
  #buildTableContent(): { content: Node; pagination: Node | null } {
    const totalPages = Math.ceil(this.#filteredData.length / this.#pagination.pageSize);
    const startIndex = (this.#pagination.currentPage - 1) * this.#pagination.pageSize;
    const endIndex = startIndex + this.#pagination.pageSize;
    const pageData = this.#filteredData.slice(startIndex, endIndex);

    if (pageData.length === 0 || this.#columns.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';

      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🔍';

      const heading = document.createElement('h3');
      heading.textContent = this.#columns.length === 0 ? 'No columns configured' : 'No results found';

      const body = document.createElement('p');
      body.textContent = this.#columns.length === 0
        ? 'Set the columns property to configure the table'
        : 'Try adjusting your search term';

      empty.append(icon, heading, body);
      return { content: empty, pagination: null };
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of this.#columns) {
      const isSorted = this.#sortConfig.column === col.key;
      const sortable = col.sortable !== false;

      const th = document.createElement('th');
      if (sortable) th.classList.add('sortable');
      if (isSorted) th.classList.add('sorted');
      th.setAttribute('data-column', col.key);

      if (sortable) {
        th.setAttribute('aria-sort', isSorted ? (this.#sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none');

        // The sort control is a real <button>, not a click handler on the <th>.
        // A <th> is not focusable and ignores Enter/Space, so sorting used to be
        // mouse-only (WCAG 2.1.1 fail). A button is focusable and fires click on
        // Enter and Space for free. #applySort restores focus to this button by
        // its data-sort-button key after the re-render.
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sort-button';
        button.setAttribute('data-sort-button', col.key);
        button.append(document.createTextNode(col.label));

        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.textContent = isSorted ? (this.#sortConfig.direction === 'asc' ? '▲' : '▼') : '▲';
        button.append(indicator);

        button.addEventListener('click', () => this.#applySort(col.key));
        th.append(button);
      } else {
        th.append(document.createTextNode(col.label));
      }

      if (col.tier) {
        const badge = document.createElement('span');
        badge.className = 'security-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = col.tier;
        th.append(badge);
      }

      headRow.append(th);
    }
    thead.append(headRow);

    const tbody = document.createElement('tbody');
    for (const row of pageData) {
      const tr = document.createElement('tr');
      for (const col of this.#columns) {
        const td = document.createElement('td');
        this.#buildCell(td, row[col.key], row, col);
        tr.append(td);
      }
      tbody.append(tr);
    }

    table.append(thead, tbody);
    wrapper.append(table);

    const pagination = totalPages > 1
      ? this.#buildPagination(totalPages, startIndex, endIndex)
      : null;

    return { content: wrapper, pagination };
  }

  #buildPagination(totalPages: number, startIndex: number, endIndex: number): HTMLElement {
    const pagination = document.createElement('div');
    pagination.className = 'pagination';

    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, this.#filteredData.length)} of ${this.#filteredData.length} results`;

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-button';
    prevBtn.id = 'prevBtn';
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = this.#pagination.currentPage === 1;
    prevBtn.addEventListener('click', () => this.#goToPage(this.#pagination.currentPage - 1));

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-button';
    nextBtn.id = 'nextBtn';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = this.#pagination.currentPage === totalPages;
    nextBtn.addEventListener('click', () => this.#goToPage(this.#pagination.currentPage + 1));

    controls.append(prevBtn);
    for (const btn of this.#buildPageNumbers(totalPages)) controls.append(btn);
    controls.append(nextBtn);

    pagination.append(info, controls);
    return pagination;
  }

  #render(): void {
    if (!internals(this).root) return;

    // Clear child nodes (adoptedStyleSheets survive this). replaceChildren is
    // Trusted-Types-safe; `innerHTML = ''` throws under `trusted-types 'none'`.
    internals(this).root.replaceChildren();
    // The #tableContent container is recreated below, so its delegated listener
    // is gone with it and must be bound again.
    this.#actionListenerAttached = false;

    // Inject styles via addComponentStyles — handles both URL (ESM/dev mode) and
    // inlined CSS text (bundle mode) transparently.
    internals(this).addComponentStyles(internals(this).getBaseStylesheetUrl());
    internals(this).addComponentStyles(new URL('./secure-table.css', import.meta.url).href);

    // Slot for server-rendered table fallback.
    const slot = document.createElement('slot');
    slot.name = 'table';
    internals(this).root.appendChild(slot);

    const container = document.createElement('div');
    container.className = 'table-container';

    const header = document.createElement('div');
    header.className = 'table-header';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'search-input';
    search.placeholder = 'Search across all columns...';
    search.value = this.#filterTerm;
    search.id = 'searchInput';
    // Wire the search handler on the created element, not via a later query.
    search.addEventListener('input', (e: Event) => {
      this.#applyFilter((e.target as HTMLInputElement).value);
    });
    header.append(search);

    const tableContent = document.createElement('div');
    tableContent.id = 'tableContent';

    const paginationContent = document.createElement('div');
    paginationContent.id = 'paginationContent';

    container.append(header, tableContent, paginationContent);
    internals(this).root.appendChild(container);

    // Action delegation binds once to the persistent #tableContent container.
    this.#attachActionDelegation(tableContent);
    this.#fillTableContent(tableContent, paginationContent);
  }

  // Partial re-render: replaces table body and pagination without touching the search input.
  #updateTableContent(): void {
    if (!internals(this).root) return;

    const tableContainer = internals(this).root.getElementById('tableContent');
    const paginationContainer = internals(this).root.getElementById('paginationContent');
    if (!tableContainer) {
      // Fallback to full render if containers don't exist yet
      this.#render();
      return;
    }

    this.#fillTableContent(tableContainer, paginationContainer);
  }

  // Populate the table and pagination containers with freshly built nodes.
  // Table/pagination listeners are wired during node construction, so there is
  // nothing to re-attach here. The delegated action listener lives on the
  // persistent #tableContent container and survives replaceChildren.
  #fillTableContent(tableContainer: Element, paginationContainer: Element | null): void {
    const { content, pagination } = this.#buildTableContent();
    tableContainer.replaceChildren(content);
    if (paginationContainer) {
      if (pagination) {
        paginationContainer.replaceChildren(pagination);
      } else {
        paginationContainer.replaceChildren();
      }
    }
  }

  #buildPageNumbers(totalPages: number): HTMLButtonElement[] {
    const maxButtons = 5;
    let startPage = Math.max(1, this.#pagination.currentPage - Math.floor(maxButtons / 2));
    const endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    const buttons: HTMLButtonElement[] = [];
    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = 'pagination-button';
      if (i === this.#pagination.currentPage) btn.classList.add('active');
      btn.setAttribute('data-page', String(i));
      btn.textContent = String(i);
      const page = i;
      btn.addEventListener('click', () => this.#goToPage(page));
      buttons.push(btn);
    }
    return buttons;
  }

  #attachActionDelegation(tableContent: Element): void {
    // Action button delegation — dispatches 'table-action' CustomEvent on the host
    // element when any [data-action] element inside the table is clicked.
    // This allows page-level scripts to handle action buttons without needing
    // access to the closed shadow DOM.
    // Attach exactly once. #fillTableContent() replaces only the inner nodes,
    // so this container survives every sort, filter keystroke and page change —
    // and each call used to add another distinct closure. Eight search keystrokes
    // then one "delete" click fired nine secure-table-action events: nine real
    // deletions from one user click, and nine audit entries for one action.
    if (this.#actionListenerAttached) return;
    this.#actionListenerAttached = true;
    tableContent.addEventListener('click', (e: Event) => {
      const target = (e.target as HTMLElement).closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      // Collect all data-* attributes from the action element
      const detail = Object.create(null) as Record<string, string>;
      detail['action'] = action!;
      for (const attr of Array.from(target.attributes)) {
        if (attr.name.startsWith('data-') && attr.name !== 'data-action') {
          // Convert data-user-id to userId style key
          const key = attr.name.slice(5).replace(/-([a-z])/g, (_match: string, c: string) => c.toUpperCase());
          // Guard against prototype pollution via data-__proto__ style attributes
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
          }
          detail[key] = attr.value;
        }
      }

      this.dispatchEvent(new CustomEvent('secure-table-action', {
        bubbles: true,
        composed: true,
        detail
      }));

      internals(this).audit('table_action', detail);
    });
  }
}

customElements.define('secure-table', SecureTable);
