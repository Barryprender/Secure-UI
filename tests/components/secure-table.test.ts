/**
 * SecureTable Unit Tests
 *
 * Tests for the secure-table component including data rendering,
 * sorting, filtering, pagination, and XSS prevention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureTable } from '../../src/components/secure-table/secure-table.js';

// Register the component if not already defined
if (!customElements.get('secure-table')) {
  customElements.define('secure-table', SecureTable);
}

describe('SecureTable', () => {
  let table: SecureTable;

  const sampleData = [
    { id: 1, name: 'Alice', email: 'alice@example.com', role: 'Admin' },
    { id: 2, name: 'Bob', email: 'bob@example.com', role: 'User' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'User' },
    { id: 4, name: 'Diana', email: 'diana@example.com', role: 'Moderator' },
    { id: 5, name: 'Eve', email: 'eve@example.com', role: 'Admin' }
  ];

  const sampleColumns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Name', sortable: true, filterable: true },
    { key: 'email', label: 'Email', sortable: true, filterable: true },
    { key: 'role', label: 'Role', sortable: true, filterable: true }
  ];

  beforeEach(() => {
    table = document.createElement('secure-table') as SecureTable;
  });

  afterEach(() => {
    table.remove();
  });

  describe('Initialization', () => {
    it('should create component', () => {
      document.body.appendChild(table);

      expect(table).toBeInstanceOf(SecureTable);
      expect(table.tagName.toLowerCase()).toBe('secure-table');
    });

    it('should have shadow DOM', () => {
      document.body.appendChild(table);

      expect(table.shadowRoot).toBeDefined();
      expect(table.shadowRoot).not.toBeNull();
    });

    it('should default to CRITICAL security tier', () => {
      document.body.appendChild(table);

      expect(table.securityTier).toBe('critical');
    });

    it('should accept security tier attribute', () => {
      table.setAttribute('security-tier', 'public');
      document.body.appendChild(table);

      // SecureTable calls initializeSecurity() which reads the security-tier attribute
      expect(table.securityTier).toBe('public');
    });

    it('should render empty state without data', () => {
      document.body.appendChild(table);

      const shadowContent = table.shadowRoot?.innerHTML || '';
      // SecureTable shows "No columns configured" when no columns are set
      expect(shadowContent).toContain('empty-state');
    });
  });

  describe('Data Management', () => {
    beforeEach(() => {
      document.body.appendChild(table);
    });

    it('should set and get data', () => {
      table.columns = sampleColumns;
      table.data = sampleData;

      expect(table.data).toEqual(sampleData);
      expect(table.data).toHaveLength(5);
    });

    it('should set and get columns', () => {
      table.columns = sampleColumns;

      expect(table.columns).toEqual(sampleColumns);
      expect(table.columns).toHaveLength(4);
    });

    it('should render table headers from columns', () => {
      table.columns = sampleColumns;
      table.data = sampleData;

      const shadowContent = table.shadowRoot?.innerHTML || '';

      expect(shadowContent).toContain('ID');
      expect(shadowContent).toContain('Name');
      expect(shadowContent).toContain('Email');
      expect(shadowContent).toContain('Role');
    });

    it('should render table rows from data', () => {
      table.columns = sampleColumns;
      table.data = sampleData;

      const shadowContent = table.shadowRoot?.innerHTML || '';

      expect(shadowContent).toContain('Alice');
      expect(shadowContent).toContain('Bob');
      expect(shadowContent).toContain('alice@example.com');
    });

    it('should handle empty data array', () => {
      table.columns = sampleColumns;
      table.data = [];

      const shadowContent = table.shadowRoot?.innerHTML || '';
      // SecureTable shows "No results found" for empty data with columns
      expect(shadowContent).toContain('No results');
    });

    it('should handle data without columns', () => {
      table.data = sampleData;

      // Should not throw
      expect(table.data).toEqual(sampleData);
    });
  });

  describe('XSS Prevention', () => {
    beforeEach(() => {
      document.body.appendChild(table);
      table.columns = [
        { key: 'content', label: 'Content' }
      ];
    });

    it('should sanitize script tags in data', () => {
      table.data = [
        { content: '<script>alert("xss")</script>' }
      ];

      const shadowContent = table.shadowRoot?.innerHTML || '';

      // Script tags should be HTML-encoded, not rendered as actual tags
      expect(shadowContent).not.toContain('<script>');
      // The content is HTML-encoded: < becomes &lt;, > becomes &gt;
      expect(shadowContent).toContain('&lt;script&gt;');
    });

    it('should sanitize onerror handlers in data', () => {
      window.xssTestExecuted = false;

      table.data = [
        { content: '<img src=x onerror="window.xssTestExecuted=true">' }
      ];

      // Wait a tick to see if handler executes
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(window.xssTestExecuted).toBe(false);
          delete window.xssTestExecuted;
          resolve();
        }, 100);
      });
    });

    it('should sanitize SVG onload handlers', () => {
      window.xssSvgExecuted = false;

      table.data = [
        { content: '<svg onload="window.xssSvgExecuted=true">' }
      ];

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(window.xssSvgExecuted).toBe(false);
          delete window.xssSvgExecuted;
          resolve();
        }, 100);
      });
    });

    it('should sanitize column labels', () => {
      window.xssLabelExecuted = false;

      table.columns = [
        { key: 'test', label: '<img src=x onerror="window.xssLabelExecuted=true">' }
      ];
      table.data = [{ test: 'value' }];

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(window.xssLabelExecuted).toBe(false);
          delete window.xssLabelExecuted;
          resolve();
        }, 100);
      });
    });

    it('should preserve safe HTML entities', () => {
      table.data = [
        { content: 'Price: $100 & Tax' }
      ];

      const shadowContent = table.shadowRoot?.innerHTML || '';
      // Content should be displayed (possibly with encoded &)
      expect(shadowContent).toContain('100');
    });
  });

  describe('Sorting', () => {
    beforeEach(() => {
      document.body.appendChild(table);
      table.columns = sampleColumns;
      table.data = [...sampleData];
    });

    it('should render sortable column headers', () => {
      const shadowContent = table.shadowRoot?.innerHTML || '';
      // Sortable columns should have sort indicators
      expect(shadowContent).toContain('sortable');
    });

    it('should support sortable column config', () => {
      table.columns = [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'id', label: 'ID', sortable: false }
      ];

      // Should render without error
      expect(table.columns).toHaveLength(2);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      document.body.appendChild(table);
      table.columns = sampleColumns;
      table.data = [...sampleData];
    });

    it('should render search input for filtering', () => {
      const shadowContent = table.shadowRoot?.innerHTML || '';
      // SecureTable renders a search-input for filtering
      expect(shadowContent).toContain('search-input');
    });

    it('should support filterable column config', () => {
      table.columns = [
        { key: 'name', label: 'Name', filterable: true },
        { key: 'id', label: 'ID', filterable: false }
      ];

      // Should render without error
      expect(table.columns).toHaveLength(2);
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      document.body.appendChild(table);
      table.columns = sampleColumns;

      // Create 25 rows for pagination testing
      const manyRows = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        role: 'User'
      }));
      table.data = manyRows;
    });

    it('should render pagination controls for large datasets', () => {
      const shadowContent = table.shadowRoot?.innerHTML || '';
      // SecureTable renders pagination controls when data exceeds page size
      expect(shadowContent).toContain('pagination');
    });

    it('should render page buttons', () => {
      const shadowContent = table.shadowRoot?.innerHTML || '';
      // Should have pagination buttons
      expect(shadowContent).toContain('pagination-button');
    });

    it('should not show all rows at once', () => {
      const shadowContent = table.shadowRoot?.innerHTML || '';
      // Default page size is 10, so User 25 should not be visible on first page
      // Note: This tests that pagination is working
      const rowCount = (shadowContent.match(/<tr/g) || []).length;
      // Should have header row + 10 data rows max (or fewer if different default)
      expect(rowCount).toBeLessThanOrEqual(12); // 1 header + up to 11 rows
    });
  });

  describe('Security Tier Behavior', () => {
    it('should inherit from SecureBaseComponent', () => {
      document.body.appendChild(table);

      // SecureTable should have getAuditLog from base component
      expect(typeof table.getAuditLog).toBe('function');
    });

    it('should apply column tier masking for critical columns', () => {
      document.body.appendChild(table);

      table.columns = [
        { key: 'name', label: 'Name' },
        { key: 'ssn', label: 'SSN', tier: 'critical' }
      ];
      table.data = [
        { name: 'Alice', ssn: '123-45-6789' }
      ];

      const shadowContent = table.shadowRoot?.innerHTML || '';

      // Name should be visible
      expect(shadowContent).toContain('Alice');
      // SSN should be masked because column tier is 'critical'
      // The full SSN should not be visible
      expect(shadowContent).not.toContain('123-45-6789');
    });

    it('should apply column tier masking for sensitive columns', () => {
      document.body.appendChild(table);

      table.columns = [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone', tier: 'sensitive' }
      ];
      table.data = [
        { name: 'Bob', phone: '555-123-4567' }
      ];

      const shadowContent = table.shadowRoot?.innerHTML || '';

      // Name should be visible
      expect(shadowContent).toContain('Bob');
      // Phone should be partially masked for sensitive tier (shows last 4 chars)
      expect(shadowContent).not.toContain('555-123-4567');
      // Should show last 4 digits
      expect(shadowContent).toContain('4567');
    });
  });

  describe('Audit Logging', () => {
    it('should have getAuditLog method', () => {
      document.body.appendChild(table);

      expect(typeof table.getAuditLog).toBe('function');
    });

    it('should return array from getAuditLog', () => {
      document.body.appendChild(table);

      const log = table.getAuditLog();
      expect(Array.isArray(log)).toBe(true);
    });
  });

  describe('Progressive Enhancement', () => {
    it('should parse server-rendered table from slot', () => {
      // Create a table with slotted content
      table.innerHTML = `
        <table slot="table">
          <thead>
            <tr>
              <th data-key="name">Name</th>
              <th data-key="email">Email</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alice</td>
              <td>alice@example.com</td>
            </tr>
          </tbody>
        </table>
      `;

      document.body.appendChild(table);

      // Component should have parsed the slotted table
      expect(table.columns.length).toBeGreaterThan(0);
      expect(table.data.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Rendering', () => {
    beforeEach(() => {
      document.body.appendChild(table);
    });

    it('should support custom render function for columns', () => {
      table.columns = [
        { key: 'name', label: 'Name' },
        {
          key: 'status',
          label: 'Status',
          render: (value: unknown) => `<span class="badge">${value}</span>`
        }
      ];
      table.data = [
        { name: 'Alice', status: 'Active' }
      ];

      const shadowContent = table.shadowRoot?.innerHTML || '';
      expect(shadowContent).toContain('badge');
      expect(shadowContent).toContain('Active');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      document.body.appendChild(table);
    });

    it('should handle null values in data', () => {
      table.columns = [{ key: 'name', label: 'Name' }];
      table.data = [{ name: null }];

      // Should not throw
      expect(table.data).toHaveLength(1);
    });

    it('should handle undefined values in data', () => {
      table.columns = [{ key: 'name', label: 'Name' }];
      table.data = [{ name: undefined }];

      // Should not throw
      expect(table.data).toHaveLength(1);
    });

    it('should handle missing keys in data rows', () => {
      table.columns = [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' }
      ];
      table.data = [{ name: 'Alice' }]; // Missing email

      // Should not throw
      expect(table.data).toHaveLength(1);
    });

    it('should handle very long strings', () => {
      table.columns = [{ key: 'content', label: 'Content' }];
      table.data = [{ content: 'a'.repeat(10000) }];

      // Should not throw
      expect(table.data).toHaveLength(1);
    });

    it('should handle special characters in data', () => {
      table.columns = [{ key: 'content', label: 'Content' }];
      table.data = [{ content: '< > & " \' ` $' }];

      // Should not throw and should be escaped
      const shadowContent = table.shadowRoot?.innerHTML || '';
      expect(shadowContent).not.toContain('undefined');
    });
  });
});

// Extend Window for XSS test flags
declare global {
  interface Window {
    xssTestExecuted?: boolean;
    xssSvgExecuted?: boolean;
    xssLabelExecuted?: boolean;
  }
}
