/**
 * @fileoverview SecureCard — composite credit card input Web Component
 *
 * Renders card number, expiry date, CVC, and optional cardholder name
 * fields inside a closed Shadow DOM with a live 3D card preview.
 *
 * Security model:
 * - Full PAN is never included in events, audit logs, or hidden inputs
 * - CVC is never in events, hidden inputs, or audit logs
 * - Card number masked to last-4 on blur
 * - Security tier is locked to CRITICAL (immutable, fail-secure default)
 * - Luhn validation on card number
 * - Rate limiting and audit logging via SecureBaseComponent
 * - All sensitive fields cleared on disconnectedCallback
 *
 * PCI note: These fields provide a secure UI layer only. Raw card data
 * must be passed to a PCI-compliant payment processor's SDK — never to
 * your own server. Use getCardData() exclusively for SDK tokenisation.
 *
 * @module secure-card
 * @license MIT
 */

import { SecureBaseComponent } from '../../core/base-component.js';
import type { CardType } from '../../core/types.js';

export type { CardType };

interface CardTypeConfig {
  readonly type: CardType;
  readonly pattern: RegExp;
  readonly format: readonly number[];
  readonly cvcLength: number;
  readonly lengths: readonly number[];
  readonly label: string;
}

// Ordered most-specific first to avoid false positives (e.g. Diners before Visa)
const CARD_TYPES: readonly CardTypeConfig[] = Object.freeze([
  {
    type: 'amex' as const,
    pattern: /^3[47]/,
    format: [4, 6, 5] as const,
    cvcLength: 4,
    lengths: [15],
    label: 'Amex',
  },
  {
    type: 'diners' as const,
    pattern: /^3(?:0[0-5]|[68])/,
    format: [4, 6, 4] as const,
    cvcLength: 3,
    lengths: [14],
    label: 'Diners',
  },
  {
    type: 'discover' as const,
    pattern: /^6(?:011|5[0-9]{2})/,
    format: [4, 4, 4, 4] as const,
    cvcLength: 3,
    lengths: [16],
    label: 'Discover',
  },
  {
    type: 'jcb' as const,
    pattern: /^(?:2131|1800|35\d{3})/,
    format: [4, 4, 4, 4] as const,
    cvcLength: 3,
    lengths: [16],
    label: 'JCB',
  },
  {
    type: 'mastercard' as const,
    pattern: /^(?:5[1-5]|2[2-7])/,
    format: [4, 4, 4, 4] as const,
    cvcLength: 3,
    lengths: [16],
    label: 'Mastercard',
  },
  {
    type: 'visa' as const,
    pattern: /^4/,
    format: [4, 4, 4, 4] as const,
    cvcLength: 3,
    lengths: [13, 16, 19],
    label: 'Visa',
  },
]);

// ── Utilities ──────────────────────────────────────────────────────────────

function detectCardType(digits: string): CardTypeConfig | null {
  if (!digits) return null;
  return CARD_TYPES.find(ct => ct.pattern.test(digits)) ?? null;
}

function formatDigits(digits: string, format: readonly number[]): string {
  let result = '';
  let pos = 0;
  for (let i = 0; i < format.length; i++) {
    const chunk = digits.slice(pos, pos + format[i]);
    if (!chunk) break;
    if (i > 0) result += ' ';
    result += chunk;
    pos += format[i];
  }
  return result;
}

function maskCardForDisplay(digits: string, format: readonly number[]): string {
  const totalLen = format.reduce((a, b) => a + b, 0);
  if (!digits) {
    return formatDigits('•'.repeat(totalLen), format);
  }
  const padded = digits.padEnd(totalLen, '•').slice(0, totalLen);
  const last4Start = Math.max(0, padded.length - 4);
  const masked = '•'.repeat(last4Start) + padded.slice(last4Start);
  return formatDigits(masked, format);
}

function luhnValid(digits: string): boolean {
  if (!digits || digits.length < 12) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const ch = digits[i];
    if (!ch) return false;
    const n0 = parseInt(ch, 10);
    if (isNaN(n0)) return false;
    let n = n0;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function isExpiryValid(month: number, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
}

let instanceCounter = 0;

// ── Component ──────────────────────────────────────────────────────────────

export class SecureCard extends SecureBaseComponent {
  // Shadow DOM input elements
  #numberInput: HTMLInputElement | null = null;
  #expiryInput: HTMLInputElement | null = null;
  #cvcInput: HTMLInputElement | null = null;
  #nameInput: HTMLInputElement | null = null;

  // Card visual elements
  #cardEl: HTMLElement | null = null;
  #cardNumberDisplay: HTMLElement | null = null;
  #cardExpiryDisplay: HTMLElement | null = null;
  #cardNameDisplay: HTMLElement | null = null;
  #cardTypeLabel: HTMLElement | null = null;
  #cardCvcDisplay: HTMLElement | null = null;

  // Error containers
  #numberError: HTMLElement | null = null;
  #expiryError: HTMLElement | null = null;
  #cvcError: HTMLElement | null = null;
  #nameError: HTMLElement | null = null;

  // Light DOM hidden inputs for form participation
  #hiddenNumber: HTMLInputElement | null = null;
  #hiddenExpiry: HTMLInputElement | null = null;
  #hiddenName: HTMLInputElement | null = null;

  // Sensitive state — cleared on disconnect
  #cardDigits = '';
  #cvcDigits = '';
  #expiryValue = '';
  #cardholderName = '';
  #cardTypeConfig: CardTypeConfig | null = null;

  #instanceId: string;

  constructor() {
    super();
    this.#instanceId = `secure-card-${++instanceCounter}`;
  }

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'name', 'label', 'show-name'];
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  protected override render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();
    const disabled = this.hasAttribute('disabled');
    const showName = this.hasAttribute('show-name');
    const label = this.getAttribute('label') ?? '';

    // ── Outer container ─────────────────────────────────────────────────────
    const container = document.createElement('div');
    container.className = 'card-container';
    container.setAttribute('part', 'container');

    // ── Card visual (aria-hidden — purely decorative) ────────────────────────
    const scene = document.createElement('div');
    scene.className = 'card-scene';
    scene.setAttribute('aria-hidden', 'true');

    this.#cardEl = document.createElement('div');
    this.#cardEl.className = 'card';

    // Front face
    const front = document.createElement('div');
    front.className = 'card-face card-front';

    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';

    const chip = document.createElement('div');
    chip.className = 'card-chip';

    this.#cardTypeLabel = document.createElement('div');
    this.#cardTypeLabel.className = 'card-type-label';

    topRow.appendChild(chip);
    topRow.appendChild(this.#cardTypeLabel);
    front.appendChild(topRow);

    this.#cardNumberDisplay = document.createElement('div');
    this.#cardNumberDisplay.className = 'card-number-display';
    this.#cardNumberDisplay.textContent = '•••• •••• •••• ••••';
    front.appendChild(this.#cardNumberDisplay);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'card-bottom-row';

    const nameSection = document.createElement('div');
    nameSection.className = 'card-name-section';
    const nameFieldLabel = document.createElement('div');
    nameFieldLabel.className = 'card-field-label';
    nameFieldLabel.textContent = 'Card holder';
    this.#cardNameDisplay = document.createElement('div');
    this.#cardNameDisplay.className = 'card-name-display';
    this.#cardNameDisplay.textContent = 'FULL NAME';
    nameSection.appendChild(nameFieldLabel);
    nameSection.appendChild(this.#cardNameDisplay);

    const expirySection = document.createElement('div');
    expirySection.className = 'card-expiry-section';
    const expiryFieldLabel = document.createElement('div');
    expiryFieldLabel.className = 'card-field-label';
    expiryFieldLabel.textContent = 'Expires';
    this.#cardExpiryDisplay = document.createElement('div');
    this.#cardExpiryDisplay.className = 'card-expiry-display';
    this.#cardExpiryDisplay.textContent = 'MM/YY';
    expirySection.appendChild(expiryFieldLabel);
    expirySection.appendChild(this.#cardExpiryDisplay);

    bottomRow.appendChild(nameSection);
    bottomRow.appendChild(expirySection);
    front.appendChild(bottomRow);

    // Back face
    const back = document.createElement('div');
    back.className = 'card-face card-back';

    const strip = document.createElement('div');
    strip.className = 'card-strip';

    const cvcArea = document.createElement('div');
    cvcArea.className = 'card-cvc-area';
    const cvcAreaLabel = document.createElement('div');
    cvcAreaLabel.className = 'card-cvc-label';
    cvcAreaLabel.textContent = 'CVC';
    this.#cardCvcDisplay = document.createElement('div');
    this.#cardCvcDisplay.className = 'card-cvc-display';
    this.#cardCvcDisplay.textContent = '•••';
    cvcArea.appendChild(cvcAreaLabel);
    cvcArea.appendChild(this.#cardCvcDisplay);

    back.appendChild(strip);
    back.appendChild(cvcArea);

    this.#cardEl.appendChild(front);
    this.#cardEl.appendChild(back);
    scene.appendChild(this.#cardEl);

    // ── Input fields ──────────────────────────────────────────────────────────
    const fields = document.createElement('div');
    fields.className = 'card-fields';

    if (label) {
      const legend = document.createElement('div');
      legend.className = 'card-legend';
      legend.setAttribute('part', 'label');
      legend.textContent = this.sanitizeValue(label);
      fields.appendChild(legend);
    }

    // Card number
    const numberGroup = this.#makeFieldGroup(`${this.#instanceId}-number`);
    const numberLabel = numberGroup.querySelector('label')!;
    numberLabel.textContent = 'Card number';

    this.#numberInput = document.createElement('input');
    this.#numberInput.id = `${this.#instanceId}-number`;
    this.#numberInput.className = 'card-input card-number-input';
    this.#numberInput.setAttribute('type', 'text');
    this.#numberInput.setAttribute('inputmode', 'numeric');
    this.#numberInput.setAttribute('autocomplete', 'cc-number');
    this.#numberInput.setAttribute('placeholder', '0000 0000 0000 0000');
    this.#numberInput.setAttribute('maxlength', '23');
    this.#numberInput.setAttribute('aria-required', 'true');
    this.#numberInput.setAttribute('aria-describedby', `${this.#instanceId}-number-error`);
    this.#numberInput.setAttribute('part', 'number-input');
    if (disabled) this.#numberInput.disabled = true;

    this.#numberError = numberGroup.querySelector('.error-container')!;
    this.#numberError.id = `${this.#instanceId}-number-error`;

    numberGroup.querySelector('.input-wrapper')!.appendChild(this.#numberInput);
    fields.appendChild(numberGroup);

    // Expiry + CVC side by side
    const fieldRow = document.createElement('div');
    fieldRow.className = 'field-row';

    const expiryGroup = this.#makeFieldGroup(`${this.#instanceId}-expiry`);
    expiryGroup.querySelector('label')!.textContent = 'Expiry date';

    this.#expiryInput = document.createElement('input');
    this.#expiryInput.id = `${this.#instanceId}-expiry`;
    this.#expiryInput.className = 'card-input';
    this.#expiryInput.setAttribute('type', 'text');
    this.#expiryInput.setAttribute('inputmode', 'numeric');
    this.#expiryInput.setAttribute('autocomplete', 'cc-exp');
    this.#expiryInput.setAttribute('placeholder', 'MM/YY');
    this.#expiryInput.setAttribute('maxlength', '5');
    this.#expiryInput.setAttribute('aria-required', 'true');
    this.#expiryInput.setAttribute('aria-describedby', `${this.#instanceId}-expiry-error`);
    this.#expiryInput.setAttribute('part', 'expiry-input');
    if (disabled) this.#expiryInput.disabled = true;

    this.#expiryError = expiryGroup.querySelector('.error-container')!;
    this.#expiryError.id = `${this.#instanceId}-expiry-error`;

    expiryGroup.querySelector('.input-wrapper')!.appendChild(this.#expiryInput);

    const cvcGroup = this.#makeFieldGroup(`${this.#instanceId}-cvc`);
    cvcGroup.querySelector('label')!.textContent = 'Security code';

    this.#cvcInput = document.createElement('input');
    this.#cvcInput.id = `${this.#instanceId}-cvc`;
    this.#cvcInput.className = 'card-input cvc-input';
    // type=password: browser masks natively, avoids screen capture of CVC
    this.#cvcInput.setAttribute('type', 'password');
    this.#cvcInput.setAttribute('inputmode', 'numeric');
    this.#cvcInput.setAttribute('autocomplete', 'cc-csc');
    this.#cvcInput.setAttribute('placeholder', '•••');
    this.#cvcInput.setAttribute('maxlength', '4');
    this.#cvcInput.setAttribute('aria-required', 'true');
    this.#cvcInput.setAttribute('aria-describedby', `${this.#instanceId}-cvc-error`);
    this.#cvcInput.setAttribute('part', 'cvc-input');
    if (disabled) this.#cvcInput.disabled = true;

    this.#cvcError = cvcGroup.querySelector('.error-container')!;
    this.#cvcError.id = `${this.#instanceId}-cvc-error`;

    cvcGroup.querySelector('.input-wrapper')!.appendChild(this.#cvcInput);

    fieldRow.appendChild(expiryGroup);
    fieldRow.appendChild(cvcGroup);
    fields.appendChild(fieldRow);

    // Cardholder name (optional)
    const nameGroup = this.#makeFieldGroup(`${this.#instanceId}-name`);
    nameGroup.id = `${this.#instanceId}-name-group`;
    nameGroup.querySelector('label')!.textContent = 'Cardholder name';
    if (!showName) nameGroup.hidden = true;

    this.#nameInput = document.createElement('input');
    this.#nameInput.id = `${this.#instanceId}-name`;
    this.#nameInput.className = 'card-input';
    this.#nameInput.setAttribute('type', 'text');
    this.#nameInput.setAttribute('autocomplete', 'cc-name');
    this.#nameInput.setAttribute('placeholder', 'Name as it appears on card');
    this.#nameInput.setAttribute('spellcheck', 'false');
    this.#nameInput.setAttribute('aria-describedby', `${this.#instanceId}-name-error`);
    this.#nameInput.setAttribute('part', 'name-input');
    if (disabled) this.#nameInput.disabled = true;

    this.#nameError = nameGroup.querySelector('.error-container')!;
    this.#nameError.id = `${this.#instanceId}-name-error`;

    nameGroup.querySelector('.input-wrapper')!.appendChild(this.#nameInput);
    fields.appendChild(nameGroup);

    container.appendChild(scene);
    container.appendChild(fields);

    // ── Light DOM hidden inputs ───────────────────────────────────────────────
    this.#createHiddenInputs();

    // ── Component styles ──────────────────────────────────────────────────────
    this.addComponentStyles(new URL('./secure-card.css', import.meta.url).href);

    // ── Event listeners ───────────────────────────────────────────────────────
    // Telemetry hooks aggregate signals across all card inputs into one
    // composite behavioral fingerprint for the overall card interaction.
    this.#numberInput.addEventListener('input', (e) => { this.recordTelemetryInput(e); this.#handleNumberInput(e); });
    this.#numberInput.addEventListener('focus', () => { this.recordTelemetryFocus(); this.#handleNumberFocus(); });
    this.#numberInput.addEventListener('blur', () => { this.recordTelemetryBlur(); this.#handleNumberBlur(); });

    this.#expiryInput.addEventListener('input', (e) => { this.recordTelemetryInput(e); this.#handleExpiryInput(e); });
    this.#expiryInput.addEventListener('focus', () => { this.recordTelemetryFocus(); this.#flipCard(false); });
    this.#expiryInput.addEventListener('blur', () => { this.recordTelemetryBlur(); this.#handleExpiryBlur(); });

    this.#cvcInput.addEventListener('input', (e) => { this.recordTelemetryInput(e); this.#handleCvcInput(e); });
    this.#cvcInput.addEventListener('focus', () => { this.recordTelemetryFocus(); this.#flipCard(true); });
    this.#cvcInput.addEventListener('blur', () => { this.recordTelemetryBlur(); this.#handleCvcBlur(); });

    this.#nameInput.addEventListener('input', (e) => { this.recordTelemetryInput(e); this.#handleNameInput(e); });
    this.#nameInput.addEventListener('focus', () => { this.recordTelemetryFocus(); this.#flipCard(false); });
    this.#nameInput.addEventListener('blur', () => { this.recordTelemetryBlur(); this.#handleNameBlur(); });

    fragment.appendChild(container);
    return fragment;
  }

  // ── Field group builder ────────────────────────────────────────────────────

  #makeFieldGroup(id: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'field-group';

    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'field-label';

    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';
    wrapper.setAttribute('part', 'wrapper');

    const err = document.createElement('div');
    err.className = 'error-container hidden';
    err.setAttribute('role', 'alert');
    err.setAttribute('part', 'error');

    group.appendChild(lbl);
    group.appendChild(wrapper);
    group.appendChild(err);
    return group;
  }

  // ── Attribute change handler ───────────────────────────────────────────────

  protected override handleAttributeChange(
    name: string,
    _oldValue: string | null,
    newValue: string | null
  ): void {
    if (!this.shadowRoot) return;

    switch (name) {
      case 'disabled': {
        const d = newValue !== null;
        if (this.#numberInput) this.#numberInput.disabled = d;
        if (this.#expiryInput) this.#expiryInput.disabled = d;
        if (this.#cvcInput) this.#cvcInput.disabled = d;
        if (this.#nameInput) this.#nameInput.disabled = d;
        break;
      }
      case 'show-name': {
        const group = this.shadowRoot.querySelector<HTMLElement>(
          `#${this.#instanceId}-name-group`
        );
        if (group) group.hidden = newValue === null;
        break;
      }
    }
  }

  // ── Card number handlers ───────────────────────────────────────────────────

  #handleNumberInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');

    const prevType = this.#cardTypeConfig?.type;
    this.#cardTypeConfig = detectCardType(digits);
    const format = this.#cardTypeConfig?.format ?? [4, 4, 4, 4];
    const maxLen = format.reduce((a, b) => a + b, 0);

    this.#cardDigits = digits.slice(0, maxLen);
    input.value = formatDigits(this.#cardDigits, format);

    // Update CVC length when card type changes
    if (this.#cardTypeConfig?.type !== prevType) {
      const maxWithSpaces = maxLen + format.length - 1;
      input.setAttribute('maxlength', String(maxWithSpaces));
      const cvcLen = this.#cardTypeConfig?.cvcLength ?? 3;
      if (this.#cvcInput) {
        this.#cvcInput.setAttribute('maxlength', String(cvcLen));
      }
      this.#updateCardType();
    }

    // Update card visual front face
    if (this.#cardNumberDisplay) {
      this.#cardNumberDisplay.textContent =
        input.value || formatDigits('•'.repeat(maxLen), format);
    }

    this.#clearError(this.#numberError);
    this.#syncHiddenInputs();
    this.#dispatchChangeEvent();
  }

  #handleNumberFocus(): void {
    // Restore formatted digits on focus (undo blur masking)
    if (this.#numberInput && this.#cardDigits) {
      const format = this.#cardTypeConfig?.format ?? [4, 4, 4, 4];
      const formatted = formatDigits(this.#cardDigits, format);
      this.#numberInput.value = formatted;
      if (this.#cardNumberDisplay) this.#cardNumberDisplay.textContent = formatted;
    }
    this.#flipCard(false);
    this.#clearError(this.#numberError);
  }

  #handleNumberBlur(): void {
    const rl = this.checkRateLimit();
    if (!rl.allowed) {
      this.#showError(
        this.#numberError,
        `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 1000)}s.`
      );
      return;
    }

    if (!this.#cardDigits) {
      this.#showError(this.#numberError, 'Card number is required');
      this.#numberInput?.setAttribute('aria-invalid', 'true');
    } else if (!luhnValid(this.#cardDigits)) {
      this.#showError(this.#numberError, 'Invalid card number');
      this.#numberInput?.setAttribute('aria-invalid', 'true');
    } else {
      this.#clearError(this.#numberError);
      this.#numberInput?.removeAttribute('aria-invalid');
    }

    // Mask middle digits on blur — last 4 remain visible
    this.#applyNumberMask();
    this.audit('card-number-blur', { cardType: this.#cardTypeConfig?.type ?? 'unknown' });
  }

  #applyNumberMask(): void {
    const format = this.#cardTypeConfig?.format ?? [4, 4, 4, 4];
    const masked = maskCardForDisplay(this.#cardDigits, format);
    if (this.#numberInput) this.#numberInput.value = masked;
    if (this.#cardNumberDisplay) this.#cardNumberDisplay.textContent = masked;
  }

  // ── Expiry handlers ───────────────────────────────────────────────────────

  #handleExpiryInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    input.value = formatted;
    this.#expiryValue = formatted;

    if (this.#cardExpiryDisplay) {
      this.#cardExpiryDisplay.textContent = formatted || 'MM/YY';
    }

    this.#clearError(this.#expiryError);
    this.#syncHiddenInputs();
    this.#dispatchChangeEvent();
  }

  #handleExpiryBlur(): void {
    const parts = this.#expiryValue.split('/');
    if (!this.#expiryValue) {
      this.#showError(this.#expiryError, 'Expiry date is required');
      this.#expiryInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    const mm = parseInt(parts[0] ?? '', 10);
    const yy = parseInt(parts[1] ?? '', 10);

    if (isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12 || (parts[1] ?? '').length < 2) {
      this.#showError(this.#expiryError, 'Enter a valid expiry date (MM/YY)');
      this.#expiryInput?.setAttribute('aria-invalid', 'true');
    } else if (!isExpiryValid(mm, yy)) {
      this.#showError(this.#expiryError, 'This card has expired');
      this.#expiryInput?.setAttribute('aria-invalid', 'true');
    } else {
      this.#clearError(this.#expiryError);
      this.#expiryInput?.removeAttribute('aria-invalid');
    }

    this.audit('card-expiry-blur', {});
  }

  // ── CVC handlers ──────────────────────────────────────────────────────────

  #handleCvcInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const maxLen = this.#cardTypeConfig?.cvcLength ?? 3;
    this.#cvcDigits = digits.slice(0, maxLen);
    input.value = this.#cvcDigits;

    // Card back shows bullet count matching typed length — value never shown
    if (this.#cardCvcDisplay) {
      this.#cardCvcDisplay.textContent =
        this.#cvcDigits.length > 0 ? '•'.repeat(this.#cvcDigits.length) : '•••';
    }

    this.#clearError(this.#cvcError);
    this.#dispatchChangeEvent();
  }

  #handleCvcBlur(): void {
    const maxLen = this.#cardTypeConfig?.cvcLength ?? 3;
    if (!this.#cvcDigits) {
      this.#showError(this.#cvcError, 'Security code is required');
      this.#cvcInput?.setAttribute('aria-invalid', 'true');
    } else if (this.#cvcDigits.length < maxLen) {
      this.#showError(this.#cvcError, `Security code must be ${maxLen} digits`);
      this.#cvcInput?.setAttribute('aria-invalid', 'true');
    } else {
      this.#clearError(this.#cvcError);
      this.#cvcInput?.removeAttribute('aria-invalid');
    }

    this.#flipCard(false);
    // CVC value is never audited
    this.audit('card-cvc-blur', {});
  }

  // ── Name handlers ─────────────────────────────────────────────────────────

  #handleNameInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    // Letters, spaces, hyphens, apostrophes only
    const sanitized = input.value.replace(/[^a-zA-Z\s\-']/g, '').slice(0, 50);
    input.value = sanitized;
    this.#cardholderName = sanitized;

    if (this.#cardNameDisplay) {
      this.#cardNameDisplay.textContent = sanitized.toUpperCase() || 'FULL NAME';
    }

    this.#clearError(this.#nameError);
    this.#syncHiddenInputs();
    this.#dispatchChangeEvent();
  }

  #handleNameBlur(): void {
    if (!this.hasAttribute('show-name')) return;
    if (!this.#cardholderName.trim()) {
      this.#showError(this.#nameError, 'Cardholder name is required');
      this.#nameInput?.setAttribute('aria-invalid', 'true');
    } else {
      this.#clearError(this.#nameError);
      this.#nameInput?.removeAttribute('aria-invalid');
    }
  }

  // ── Card visual ───────────────────────────────────────────────────────────

  #flipCard(toBack: boolean): void {
    this.#cardEl?.classList.toggle('is-flipped', toBack);
  }

  #updateCardType(): void {
    if (!this.#cardEl) return;
    for (const ct of CARD_TYPES) {
      this.#cardEl.classList.remove(`card--${ct.type}`);
    }
    const type = this.#cardTypeConfig?.type;
    if (type) this.#cardEl.classList.add(`card--${type}`);
    if (this.#cardTypeLabel) {
      this.#cardTypeLabel.textContent = this.#cardTypeConfig?.label ?? '';
    }
  }

  // ── Error helpers ─────────────────────────────────────────────────────────

  #showError(container: HTMLElement | null, message: string): void {
    if (!container) return;
    container.textContent = '';
    const span = document.createElement('span');
    span.textContent = message;
    container.appendChild(span);
    container.classList.remove('hidden');
  }

  #clearError(container: HTMLElement | null): void {
    if (!container) return;
    container.textContent = '';
    container.classList.add('hidden');
  }

  // ── Hidden inputs for light DOM form participation ─────────────────────────

  #createHiddenInputs(): void {
    const fieldName = this.getAttribute('name');
    if (!fieldName) return;

    // Card number: stores last4 only — full PAN must never reach your server
    this.#hiddenNumber = document.createElement('input');
    this.#hiddenNumber.type = 'hidden';
    this.#hiddenNumber.name = fieldName;
    this.appendChild(this.#hiddenNumber);

    this.#hiddenExpiry = document.createElement('input');
    this.#hiddenExpiry.type = 'hidden';
    this.#hiddenExpiry.name = `${fieldName}-expiry`;
    this.appendChild(this.#hiddenExpiry);

    this.#hiddenName = document.createElement('input');
    this.#hiddenName.type = 'hidden';
    this.#hiddenName.name = `${fieldName}-holder`;
    this.appendChild(this.#hiddenName);

    // No hidden input for CVC — never submit CVC to your own server
  }

  #syncHiddenInputs(): void {
    if (this.#hiddenNumber) this.#hiddenNumber.value = this.#cardDigits.slice(-4);
    if (this.#hiddenExpiry) this.#hiddenExpiry.value = this.#expiryValue;
    if (this.#hiddenName) this.#hiddenName.value = this.#cardholderName;
  }

  // ── Event dispatch ────────────────────────────────────────────────────────

  #dispatchChangeEvent(): void {
    const [rawMonth, rawYear] = this.#expiryValue.split('/');
    this.dispatchEvent(
      new CustomEvent('secure-card-change', {
        bubbles: true,
        composed: true,
        detail: {
          name: this.getAttribute('name') ?? '',
          cardType: this.#cardTypeConfig?.type ?? 'unknown',
          last4: this.#cardDigits.slice(-4),
          expiryMonth: parseInt(rawMonth ?? '0', 10) || 0,
          expiryYear: parseInt(rawYear ?? '0', 10) || 0,
          cardholderName: this.#cardholderName,
          valid: this.valid,
          tier: this.securityTier,
          // Full PAN and CVC are intentionally absent — use getCardData() for SDK calls
        },
      })
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  override disconnectedCallback(): void {
    // Wipe all sensitive state from memory
    this.#cardDigits = '';
    this.#cvcDigits = '';
    this.#expiryValue = '';
    this.#cardholderName = '';

    if (this.#numberInput) this.#numberInput.value = '';
    if (this.#expiryInput) this.#expiryInput.value = '';
    if (this.#cvcInput) this.#cvcInput.value = '';
    if (this.#nameInput) this.#nameInput.value = '';
    if (this.#hiddenNumber) this.#hiddenNumber.value = '';
    if (this.#hiddenExpiry) this.#hiddenExpiry.value = '';
    if (this.#hiddenName) this.#hiddenName.value = '';

    super.disconnectedCallback();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * True when all visible, required fields pass validation.
   */
  get valid(): boolean {
    const numberOk = this.#cardDigits.length >= 12 && luhnValid(this.#cardDigits);

    const [mm, yy] = this.#expiryValue.split('/');
    const month = parseInt(mm ?? '', 10);
    const year = parseInt(yy ?? '', 10);
    const expiryOk =
      !isNaN(month) &&
      !isNaN(year) &&
      month >= 1 &&
      month <= 12 &&
      (yy ?? '').length >= 2 &&
      isExpiryValid(month, year);

    const cvcLen = this.#cardTypeConfig?.cvcLength ?? 3;
    const cvcOk = this.#cvcDigits.length === cvcLen;

    const nameOk =
      !this.hasAttribute('show-name') || this.#cardholderName.trim().length > 0;

    return numberOk && expiryOk && cvcOk && nameOk;
  }

  /**
   * Card type detected from the entered number prefix.
   */
  get cardType(): CardType {
    return this.#cardTypeConfig?.type ?? 'unknown';
  }

  /**
   * Last 4 digits of the entered card number. Safe to display and log.
   */
  get last4(): string {
    return this.#cardDigits.slice(-4);
  }

  /**
   * The name attribute value.
   */
  get name(): string {
    return this.getAttribute('name') ?? '';
  }

  /**
   * Returns raw card data for immediate handoff to a payment SDK tokeniser.
   *
   * SECURITY: Pass this data only to a PCI-compliant processor's client SDK
   * (e.g. Stripe.js createToken, Braintree tokenizeCard). Never send raw card
   * numbers or CVCs to your own server.
   *
   * Returns null if the form is not yet valid.
   */
  getCardData(): {
    number: string;
    expiry: string;
    cvc: string;
    name: string;
  } | null {
    if (!this.valid) return null;
    return {
      number: this.#cardDigits,
      expiry: this.#expiryValue,
      cvc: this.#cvcDigits,
      name: this.#cardholderName,
    };
  }

  /**
   * Clears all fields and resets component state.
   */
  reset(): void {
    this.#cardDigits = '';
    this.#cvcDigits = '';
    this.#expiryValue = '';
    this.#cardholderName = '';
    this.#cardTypeConfig = null;

    if (this.#numberInput) this.#numberInput.value = '';
    if (this.#expiryInput) this.#expiryInput.value = '';
    if (this.#cvcInput) this.#cvcInput.value = '';
    if (this.#nameInput) this.#nameInput.value = '';

    this.#syncHiddenInputs();
    this.#flipCard(false);
    this.#updateCardType();

    const defaultFormat = [4, 4, 4, 4] as const;
    if (this.#cardNumberDisplay) {
      this.#cardNumberDisplay.textContent = formatDigits('•'.repeat(16), defaultFormat);
    }
    if (this.#cardExpiryDisplay) this.#cardExpiryDisplay.textContent = 'MM/YY';
    if (this.#cardNameDisplay) this.#cardNameDisplay.textContent = 'FULL NAME';
    if (this.#cardCvcDisplay) this.#cardCvcDisplay.textContent = '•••';

    this.#clearError(this.#numberError);
    this.#clearError(this.#expiryError);
    this.#clearError(this.#cvcError);
    this.#clearError(this.#nameError);

    this.audit('card-reset', {});
  }

  /**
   * Focuses the card number input.
   */
  focus(): void {
    this.#numberInput?.focus();
  }
}

customElements.define('secure-card', SecureCard);
