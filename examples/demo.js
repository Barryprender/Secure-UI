// Secure-UI component gallery — demo wiring.
// Externalized from index.html so the page satisfies a strict
// Content-Security-Policy (script-src 'self', no inline scripts).
    await Promise.all([
      customElements.whenDefined('secure-table'),
      customElements.whenDefined('secure-form'),
      customElements.whenDefined('secure-submit-button'),
      customElements.whenDefined('secure-card'),
      customElements.whenDefined('secure-telemetry-provider'),
      customElements.whenDefined('secure-password-confirm'),
    ]);

    // ── Sortable / filterable table ──────────────────────────────────────
    const demoTable = document.getElementById('demo-table');
    if (demoTable) {
      demoTable.columns = [
        { key: 'id',     label: 'ID',     sortable: true, width: '56px' },
        { key: 'name',   label: 'Name',   sortable: true, filterable: true },
        { key: 'email',  label: 'Email',  sortable: true, filterable: true },
        { key: 'role',   label: 'Role',   sortable: true, filterable: true },
        { key: 'status', label: 'Status', sortable: true },
      ];
      demoTable.data = [
        { id: 1,  name: 'Alice Johnson', email: 'alice@example.com',  role: 'Admin',  status: 'Active'   },
        { id: 2,  name: 'Bob Smith',     email: 'bob@example.com',    role: 'Editor', status: 'Active'   },
        { id: 3,  name: 'Carol White',   email: 'carol@example.com',  role: 'Viewer', status: 'Inactive' },
        { id: 4,  name: 'David Brown',   email: 'david@example.com',  role: 'Editor', status: 'Active'   },
        { id: 5,  name: 'Eve Davis',     email: 'eve@example.com',    role: 'Admin',  status: 'Active'   },
        { id: 6,  name: 'Frank Wilson',  email: 'frank@example.com',  role: 'Viewer', status: 'Inactive' },
        { id: 7,  name: 'Grace Lee',     email: 'grace@example.com',  role: 'Editor', status: 'Active'   },
        { id: 8,  name: 'Hank Miller',   email: 'hank@example.com',   role: 'Viewer', status: 'Active'   },
        { id: 9,  name: 'Ivy Chen',      email: 'ivy@example.com',    role: 'Admin',  status: 'Active'   },
        { id: 10, name: 'Jack Taylor',   email: 'jack@example.com',   role: 'Editor', status: 'Inactive' },
        { id: 11, name: 'Karen Moore',   email: 'karen@example.com',  role: 'Viewer', status: 'Active'   },
        { id: 12, name: 'Leo Garcia',    email: 'leo@example.com',    role: 'Editor', status: 'Active'   },
      ];
    }

    // ── Masked-column table ──────────────────────────────────────────────
    const maskedTable = document.getElementById('masked-table');
    if (maskedTable) {
      maskedTable.columns = [
        { key: 'id',    label: 'ID',    width: '56px', tier: 'public'    },
        { key: 'name',  label: 'Name',  tier: 'public'                   },
        { key: 'email', label: 'Email', tier: 'sensitive'                },
        { key: 'ssn',   label: 'SSN',   tier: 'critical'                 },
        { key: 'phone', label: 'Phone', tier: 'sensitive'                },
      ];
      maskedTable.data = [
        { id: 1, name: 'Alice Johnson', email: 'alice@example.com', ssn: '123-45-6789', phone: '555-0101' },
        { id: 2, name: 'Bob Smith',     email: 'bob@example.com',   ssn: '987-65-4321', phone: '555-0102' },
        { id: 3, name: 'Carol White',   email: 'carol@example.com', ssn: '456-78-9012', phone: '555-0103' },
      ];
    }

    // ── Empty table ──────────────────────────────────────────────────────
    const emptyTable = document.getElementById('empty-table');
    if (emptyTable) {
      emptyTable.columns = [
        { key: 'id',    label: 'ID'    },
        { key: 'name',  label: 'Name'  },
        { key: 'value', label: 'Value' },
      ];
      emptyTable.data = [];
    }

    // ── Form submit → dialog ─────────────────────────────────────────────
    const dialog    = document.getElementById('form-dialog');
    const dialogRows = document.getElementById('dialog-rows');

    dialog.querySelectorAll('.dialog-close-btn').forEach(btn => {
      btn.addEventListener('click', () => dialog.close());
    });

    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

    // tp-form and pcd-form have their own dedicated handlers below
    document.querySelectorAll('secure-form:not(#tp-form):not(#pcd-form)').forEach(form => {
      form.addEventListener('secure-form-submit', e => {
        e.preventDefault(); // cancels the fetch; re-enables the form
        document.getElementById('dialog-heading').textContent = 'Form Payload';
        const data = form.getData();
        dialogRows.innerHTML = '';
        for (const [key, value] of Object.entries(data)) {
          const tr = document.createElement('tr');
          const th = document.createElement('th');
          th.textContent = key;
          const td = document.createElement('td');
          td.textContent = (value !== '' && value != null) ? String(value) : '(empty)';
          tr.append(th, td);
          dialogRows.appendChild(tr);
        }
        dialog.showModal();
      });
    });

    // ── secure-password-confirm demo ─────────────────────────────────────────
    const pcdStandalone = document.getElementById('pcd-standalone');
    const pcdOutput     = document.getElementById('pcd-output');
    const pcdEventLog   = document.getElementById('pcd-event-log');

    document.getElementById('pcd-get-value')?.addEventListener('click', () => {
      const val = pcdStandalone?.getPasswordValue?.();
      pcdOutput.textContent = val !== null ? `getPasswordValue() → "${val}"` : 'getPasswordValue() → null (no match yet)';
    });

    document.getElementById('pcd-check-valid')?.addEventListener('click', () => {
      pcdOutput.textContent = `valid → ${pcdStandalone?.valid}`;
    });

    const logEvent = (type, detail) => {
      const entry = document.createElement('div');
      entry.className = type === 'secure-password-match' ? 'pcd-event-log-entry--match' : 'pcd-event-log-entry--mismatch';
      entry.textContent = `${type} · name="${detail.name}" · matched=${detail.matched}`;
      pcdEventLog.prepend(entry);
      if (pcdEventLog.children.length > 5) pcdEventLog.lastElementChild?.remove();
    };

    pcdStandalone?.addEventListener('secure-password-match',    e => logEvent('secure-password-match',    e.detail));
    pcdStandalone?.addEventListener('secure-password-mismatch', e => logEvent('secure-password-mismatch', e.detail));

    // Prevent the demo form from making a real request
    document.getElementById('pcd-form')?.addEventListener('secure-form-submit', e => e.preventDefault());

    // ── Telemetry provider: scan signals ─────────────────────────────────────
    const tp = document.getElementById('tp-demo');
    const signalsOutput = document.getElementById('signals-output');

    document.getElementById('scan-signals-btn')?.addEventListener('click', () => {
      const signals = tp?.getEnvironmentalSignals?.();
      if (!signals || !signalsOutput) return;

      signalsOutput.innerHTML = '';
      const rows = document.createElement('div');
      rows.className = 'signal-rows';

      // Flag values that indicate potential automation
      const flaggedKeys = new Set([
        'webdriverDetected', 'headlessDetected', 'domMutationDetected', 'devtoolsOpen', 'suspiciousScreenSize',
      ]);

      for (const [key, value] of Object.entries(signals)) {
        const row = document.createElement('div');
        const isFlagged = flaggedKeys.has(key) && value === true;
        const isClean  = flaggedKeys.has(key) && value === false;
        row.className = `signal-row${isFlagged ? ' is-flagged' : ''}${isClean ? ' is-clean' : ''}`;
        const keyEl = document.createElement('span');
        keyEl.className = 'signal-key';
        keyEl.textContent = key;
        const valEl = document.createElement('span');
        valEl.className = 'signal-val';
        valEl.textContent = JSON.stringify(value);
        row.append(keyEl, valEl);
        rows.appendChild(row);
      }
      signalsOutput.appendChild(rows);
    });

    // ── Telemetry provider: intercept form submit ───────────────────────────
    if (tp) {
      tp.addEventListener('secure-form-submit', async (e) => {
        // Prevent the fetch synchronously — must happen before the first await
        e.preventDefault();
        // Wait for async HMAC signing to complete
        await new Promise(r => setTimeout(r, 100));

        const detail = e.detail;
        const tel = detail?.telemetry;

        dialogRows.innerHTML = '';
        document.getElementById('dialog-heading').textContent = 'Telemetry + Signed Envelope';

        const addRow = (key, value) => {
          const tr = document.createElement('tr');
          const th = document.createElement('th');
          th.textContent = key;
          const td = document.createElement('td');
          td.textContent = String(value ?? '—');
          tr.append(th, td);
          dialogRows.appendChild(tr);
        };

        if (tel) {
          addRow('riskScore',  tel.riskScore ?? 0);
          addRow('riskSignals', (tel.riskSignals ?? []).join(', ') || 'none');
          addRow('sessionDuration', `${tel.sessionDuration ?? 0}ms`);
          addRow('fieldCount', tel.fieldCount ?? (Array.isArray(tel.fields) ? tel.fields.length : 0));

          const env = tel._env;
          if (env) {
            addRow('— envelope —', '');
            addRow('_env.nonce',     env.nonce);
            addRow('_env.issuedAt',  env.issuedAt);
            addRow('_env.signature', env.signature ? `${env.signature.slice(0, 20)}…` : '(unsigned — non-secure context)');
            if (env.environment) {
              addRow('— environment —', '');
              for (const [k, v] of Object.entries(env.environment)) {
                addRow(`env.${k}`, JSON.stringify(v));
              }
            }
          } else {
            addRow('_env', '(signing pending or non-secure context)');
          }
        } else {
          addRow('telemetry', '(not available)');
        }

        dialog.showModal();
      });
    }

    // ── Active nav link on scroll ────────────────────────────────────────
    const sections = document.querySelectorAll('.component-section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
          });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(s => observer.observe(s));
