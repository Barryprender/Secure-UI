import { SecureBaseComponent } from '../../core/base-component.js';

export class SecurePasswordConfirm extends SecureBaseComponent {
  #passwordInput: HTMLInputElement | null = null;
  #confirmInput: HTMLInputElement | null = null;
  #passwordError: HTMLDivElement | null = null;
  #confirmError: HTMLDivElement | null = null;
  #matchIndicator: HTMLDivElement | null = null;
  #passwordToggle: HTMLButtonElement | null = null;
  #confirmToggle: HTMLButtonElement | null = null;

  #passwordValue: string = '';
  #confirmValue: string = '';
  #confirmTouched: boolean = false;
  #passwordVisible: boolean = false;
  #confirmVisible: boolean = false;

  #hiddenInput: HTMLInputElement | null = null;
  #instanceId: string = `secure-password-confirm-${Math.random().toString(36).substring(2, 11)}`;

  // Strip any pre-set security-tier before the base reads it,
  // guaranteeing this component is always CRITICAL.
  connectedCallback(): void {
    this.removeAttribute('security-tier');
    super.connectedCallback();
  }

  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'label',
      'password-label',
      'confirm-label',
      'required',
      'minlength',
    ];
  }

  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'container';
    container.setAttribute('part', 'container');

    // Optional group label
    const groupLabelText = this.getAttribute('label');
    if (groupLabelText) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'group-label';
      groupLabel.textContent = this.sanitizeValue(groupLabelText);
      container.appendChild(groupLabel);
    }

    const isRequired = this.hasAttribute('required');

    // ── Password field ──────────────────────────────────────────────────────
    const passwordSection = this.#buildField({
      inputPart: 'password-input',
      wrapperPart: 'password-wrapper',
      labelPart: 'password-label',
      errorPart: 'password-error',
      togglePart: 'password-toggle',
      labelText: this.getAttribute('password-label') ?? 'New Password',
      inputId: `${this.#instanceId}-password`,
      errorId: `${this.#instanceId}-password-error`,
      isRequired,
    });
    this.#passwordInput = passwordSection.querySelector<HTMLInputElement>('[part="password-input"]')!;
    this.#passwordToggle = passwordSection.querySelector<HTMLButtonElement>('[part="password-toggle"]')!;
    this.#passwordError = passwordSection.querySelector<HTMLDivElement>('[part="password-error"]')!;

    // ── Confirm field ───────────────────────────────────────────────────────
    const confirmSection = this.#buildField({
      inputPart: 'confirm-input',
      wrapperPart: 'confirm-wrapper',
      labelPart: 'confirm-label',
      errorPart: 'confirm-error',
      togglePart: 'confirm-toggle',
      labelText: this.getAttribute('confirm-label') ?? 'Confirm Password',
      inputId: `${this.#instanceId}-confirm`,
      errorId: `${this.#instanceId}-confirm-error`,
      isRequired,
    });
    this.#confirmInput = confirmSection.querySelector<HTMLInputElement>('[part="confirm-input"]')!;
    this.#confirmToggle = confirmSection.querySelector<HTMLButtonElement>('[part="confirm-toggle"]')!;
    this.#confirmError = confirmSection.querySelector<HTMLDivElement>('[part="confirm-error"]')!;

    // ── Match indicator ─────────────────────────────────────────────────────
    this.#matchIndicator = document.createElement('div');
    this.#matchIndicator.setAttribute('part', 'match-indicator');
    this.#matchIndicator.className = 'match-indicator';
    this.#matchIndicator.setAttribute('aria-hidden', 'true');

    container.appendChild(passwordSection);
    container.appendChild(confirmSection);
    container.appendChild(this.#matchIndicator);

    this.#attachPasswordListeners();
    this.#attachConfirmListeners();
    this.#attachToggleListeners();
    this.#createHiddenInput();

    this.addComponentStyles(new URL('./secure-password-confirm.css', import.meta.url).href);

    fragment.appendChild(container);
    return fragment;
  }

  // ── DOM builders ──────────────────────────────────────────────────────────

  #buildField(opts: {
    inputPart: string;
    wrapperPart: string;
    labelPart: string;
    errorPart: string;
    togglePart: string;
    labelText: string;
    inputId: string;
    errorId: string;
    isRequired: boolean;
  }): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'field-section';

    const label = document.createElement('label');
    label.setAttribute('part', opts.labelPart);
    label.htmlFor = opts.inputId;
    label.textContent = this.sanitizeValue(opts.labelText);

    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';
    wrapper.setAttribute('part', opts.wrapperPart);

    const input = document.createElement('input');
    input.id = opts.inputId;
    input.type = 'password';
    input.autocomplete = 'new-password';
    input.setAttribute('part', opts.inputPart);
    input.setAttribute('aria-describedby', opts.errorId);
    if (opts.isRequired) {
      input.required = true;
      input.setAttribute('aria-required', 'true');
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle-btn';
    toggle.setAttribute('part', opts.togglePart);
    toggle.setAttribute('aria-label', 'Show password');
    toggle.appendChild(this.#createEyeIcon());

    wrapper.appendChild(input);
    wrapper.appendChild(toggle);

    const error = document.createElement('div');
    error.id = opts.errorId;
    error.setAttribute('part', opts.errorPart);
    error.setAttribute('role', 'alert');
    error.className = 'error-container hidden';

    section.appendChild(label);
    section.appendChild(wrapper);
    section.appendChild(error);
    return section;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  #attachPasswordListeners(): void {
    this.#passwordInput!.addEventListener('focus', () => {
      this.recordTelemetryFocus();
    });

    this.#passwordInput!.addEventListener('input', (e: Event) => {
      this.recordTelemetryInput(e);
      this.#passwordValue = this.#passwordInput!.value;
      if (this.#confirmTouched) {
        this.#checkMatch();
      }
      this.dispatchEvent(new CustomEvent('secure-input', {
        detail: { name: this.getAttribute('name') ?? '', field: 'password' },
        bubbles: true,
        composed: true,
      }));
    });

    this.#passwordInput!.addEventListener('blur', () => {
      this.recordTelemetryBlur();
      this.#validateStrength();
    });
  }

  #attachConfirmListeners(): void {
    this.#confirmInput!.addEventListener('input', () => {
      this.#confirmValue = this.#confirmInput!.value;
      if (this.#confirmTouched) {
        this.#checkMatch();
      }
    });

    this.#confirmInput!.addEventListener('blur', () => {
      this.#confirmTouched = true;
      this.#confirmValue = this.#confirmInput!.value;
      this.#checkMatch();
    });
  }

  #attachToggleListeners(): void {
    this.#passwordToggle!.addEventListener('click', () => {
      this.#passwordVisible = !this.#passwordVisible;
      this.#passwordInput!.type = this.#passwordVisible ? 'text' : 'password';
      this.#passwordToggle!.classList.toggle('is-visible', this.#passwordVisible);
      this.#passwordToggle!.setAttribute('aria-label', this.#passwordVisible ? 'Hide password' : 'Show password');
    });

    this.#confirmToggle!.addEventListener('click', () => {
      this.#confirmVisible = !this.#confirmVisible;
      this.#confirmInput!.type = this.#confirmVisible ? 'text' : 'password';
      this.#confirmToggle!.classList.toggle('is-visible', this.#confirmVisible);
      this.#confirmToggle!.setAttribute('aria-label', this.#confirmVisible ? 'Hide confirm password' : 'Show confirm password');
    });
  }

  // ── SVG icon ──────────────────────────────────────────────────────────────

  #createEyeIcon(): Element {
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'eye-icon');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');

    // Outer eye shape
    const outline = document.createElementNS(ns, 'path');
    outline.setAttribute('class', 'eye-outline');
    outline.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');

    // Pupil
    const pupil = document.createElementNS(ns, 'circle');
    pupil.setAttribute('class', 'eye-pupil');
    pupil.setAttribute('cx', '12');
    pupil.setAttribute('cy', '12');
    pupil.setAttribute('r', '3');

    // Slash — drawn in when password is visible (eye-off state)
    // Line (3,3)→(21,21): length = √(18²+18²) ≈ 25.46 → dasharray 26
    const slash = document.createElementNS(ns, 'line');
    slash.setAttribute('class', 'eye-slash');
    slash.setAttribute('x1', '3');
    slash.setAttribute('y1', '3');
    slash.setAttribute('x2', '21');
    slash.setAttribute('y2', '21');

    svg.append(outline, pupil, slash);
    return svg;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  #validateStrength(): void {
    const err = this.#strengthError(this.#passwordValue);
    if (err) {
      this.#showError(this.#passwordError!, this.#passwordInput!, err);
    } else {
      this.#clearError(this.#passwordError!, this.#passwordInput!);
    }
  }

  #strengthError(value: string): string | null {
    if (!value) return null;
    if (value.length < 8)           return 'Password must be at least 8 characters';
    if (!/[a-z]/.test(value))       return 'Password must include a lowercase letter';
    if (!/[A-Z]/.test(value))       return 'Password must include an uppercase letter';
    if (!/[0-9]/.test(value))       return 'Password must include a number';
    if (!/[^a-zA-Z0-9]/.test(value)) return 'Password must include a special character';
    return null;
  }

  #checkMatch(): void {
    const matched = this.#passwordValue.length > 0 && this.#passwordValue === this.#confirmValue;
    this.#syncHiddenInput(matched);
    this.#updateMatchIndicator(matched);

    if (matched) {
      this.#clearError(this.#confirmError!, this.#confirmInput!);
      this.dispatchEvent(new CustomEvent('secure-password-match', {
        detail: { name: this.getAttribute('name') ?? '', matched: true },
        bubbles: true,
        composed: true,
      }));
    } else {
      const msg = this.#confirmValue.length > 0
        ? 'Passwords do not match'
        : 'Please confirm your password';
      this.#showError(this.#confirmError!, this.#confirmInput!, msg);
      this.dispatchEvent(new CustomEvent('secure-password-mismatch', {
        detail: { name: this.getAttribute('name') ?? '', matched: false },
        bubbles: true,
        composed: true,
      }));
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  #showError(container: HTMLDivElement, input: HTMLInputElement, message: string): void {
    container.textContent = message;
    container.classList.remove('hidden');
    input.setAttribute('aria-invalid', 'true');
  }

  #clearError(container: HTMLDivElement, input: HTMLInputElement): void {
    container.classList.add('hidden');
    container.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  #updateMatchIndicator(matched: boolean): void {
    if (!this.#matchIndicator) return;
    this.#matchIndicator.className = `match-indicator ${matched ? 'matched' : 'mismatched'}`;
    this.#matchIndicator.textContent = matched ? '✓ Passwords match' : '✗ Passwords do not match';
  }

  // ── Form participation ────────────────────────────────────────────────────

  #createHiddenInput(): void {
    const name = this.getAttribute('name');
    if (!name || this.closest('secure-form')) return;

    this.#hiddenInput = document.createElement('input');
    this.#hiddenInput.type = 'hidden';
    this.#hiddenInput.name = name;
    this.#hiddenInput.value = '';
    this.appendChild(this.#hiddenInput);
  }

  #syncHiddenInput(matched: boolean): void {
    if (!this.#hiddenInput) return;
    this.#hiddenInput.value = matched ? this.#passwordValue : '';
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getPasswordValue(): string | null {
    if (!this.#passwordValue || !this.#confirmValue) return null;
    if (this.#passwordValue !== this.#confirmValue) return null;
    return this.#passwordValue;
  }

  get valid(): boolean {
    if (!this.#passwordValue || !this.#confirmValue) return false;
    if (this.#passwordValue !== this.#confirmValue) return false;
    return this.#strengthError(this.#passwordValue) === null;
  }

  get name(): string {
    return this.getAttribute('name') ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#passwordValue = '';
    this.#confirmValue = '';
    if (this.#passwordInput) this.#passwordInput.value = '';
    if (this.#confirmInput) this.#confirmInput.value = '';
    if (this.#hiddenInput) this.#hiddenInput.value = '';
  }
}

customElements.define('secure-password-confirm', SecurePasswordConfirm);

export default SecurePasswordConfirm;
