/**
 * SecureCard Unit Tests
 *
 * Tests initialization, card type detection, field formatting,
 * validation, public API, events, and form participation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureCard } from '../../src/components/secure-card/secure-card.js';

if (!customElements.get('secure-card')) {
  customElements.define('secure-card', SecureCard);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getNumberInput(card: SecureCard): HTMLInputElement {
  return card.shadowRoot!.querySelector<HTMLInputElement>('.card-number-input')!;
}
function getExpiryInput(card: SecureCard): HTMLInputElement {
  return card.shadowRoot!.querySelector<HTMLInputElement>('input[autocomplete="cc-exp"]')!;
}
function getCvcInput(card: SecureCard): HTMLInputElement {
  return card.shadowRoot!.querySelector<HTMLInputElement>('input[autocomplete="cc-csc"]')!;
}
function getNameInput(card: SecureCard): HTMLInputElement {
  return card.shadowRoot!.querySelector<HTMLInputElement>('input[autocomplete="cc-name"]')!;
}
function getCardEl(card: SecureCard): HTMLElement {
  return card.shadowRoot!.querySelector<HTMLElement>('.card')!;
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('blur'));
}
function focus(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('focus'));
}

/** Fill all fields to produce a valid card. */
function fillValid(card: SecureCard): void {
  typeInto(getNumberInput(card), '4111111111111111'); // valid Visa
  typeInto(getExpiryInput(card), '1230');             // 12/30
  typeInto(getCvcInput(card), '123');
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SecureCard', () => {
  let card: SecureCard;

  beforeEach(() => {
    card = document.createElement('secure-card') as SecureCard;
  });

  afterEach(() => {
    card.remove();
  });

  // ── Initialization ────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('creates the component', () => {
      document.body.appendChild(card);
      expect(card).toBeInstanceOf(HTMLElement);
      expect(card.tagName.toLowerCase()).toBe('secure-card');
    });

    it('has a shadow DOM', () => {
      document.body.appendChild(card);
      expect(card.shadowRoot).toBeDefined();
      expect(card.shadowRoot).not.toBeNull();
    });

    it('defaults to CRITICAL security tier', () => {
      document.body.appendChild(card);
      expect(card.securityTier).toBe('critical');
    });

    it('renders the decorative card scene', () => {
      document.body.appendChild(card);
      const scene = card.shadowRoot!.querySelector('.card-scene');
      expect(scene).not.toBeNull();
      expect(scene!.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders front and back card faces', () => {
      document.body.appendChild(card);
      expect(card.shadowRoot!.querySelector('.card-front')).not.toBeNull();
      expect(card.shadowRoot!.querySelector('.card-back')).not.toBeNull();
    });

    it('renders card number input with correct attributes', () => {
      document.body.appendChild(card);
      const input = getNumberInput(card);
      expect(input).not.toBeNull();
      expect(input.getAttribute('inputmode')).toBe('numeric');
      expect(input.getAttribute('autocomplete')).toBe('cc-number');
    });

    it('renders expiry input with correct attributes', () => {
      document.body.appendChild(card);
      const input = getExpiryInput(card);
      expect(input).not.toBeNull();
      expect(input.getAttribute('autocomplete')).toBe('cc-exp');
      expect(input.getAttribute('placeholder')).toBe('MM/YY');
    });

    it('renders CVC input as type=password', () => {
      document.body.appendChild(card);
      const input = getCvcInput(card);
      expect(input).not.toBeNull();
      expect(input.type).toBe('password');
      expect(input.getAttribute('autocomplete')).toBe('cc-csc');
    });

    it('hides name field by default', () => {
      document.body.appendChild(card);
      const nameGroup = card.shadowRoot!.querySelector<HTMLElement>('[id$="-name-group"]');
      expect(nameGroup!.hidden).toBe(true);
    });

    it('shows name field when show-name attribute is set', () => {
      card.setAttribute('show-name', '');
      document.body.appendChild(card);
      const nameGroup = card.shadowRoot!.querySelector<HTMLElement>('[id$="-name-group"]');
      expect(nameGroup!.hidden).toBe(false);
    });

    it('renders label when provided', () => {
      card.setAttribute('label', 'Payment details');
      document.body.appendChild(card);
      expect(card.shadowRoot!.innerHTML).toContain('Payment details');
    });

    it('creates hidden inputs in the light DOM', () => {
      card.setAttribute('name', 'payment');
      document.body.appendChild(card);
      const hiddens = card.querySelectorAll('input[type="hidden"]');
      expect(hiddens.length).toBe(3); // number (last4), expiry, name
    });

    it('does not create a hidden CVC input', () => {
      card.setAttribute('name', 'payment');
      document.body.appendChild(card);
      const names = Array.from(card.querySelectorAll('input[type="hidden"]'))
        .map(el => (el as HTMLInputElement).name);
      expect(names.every(n => !n.includes('cvc'))).toBe(true);
    });

    it('skips hidden inputs when name attribute is absent', () => {
      document.body.appendChild(card);
      expect(card.querySelectorAll('input[type="hidden"]').length).toBe(0);
    });
  });

  // ── Card type detection ────────────────────────────────────────────────────

  describe('Card type detection', () => {
    beforeEach(() => document.body.appendChild(card));

    it('starts as unknown', () => {
      expect(card.cardType).toBe('unknown');
    });

    it('detects Visa from prefix 4', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      expect(card.cardType).toBe('visa');
    });

    it('detects Mastercard from prefix 5x', () => {
      typeInto(getNumberInput(card), '5500005555555559');
      expect(card.cardType).toBe('mastercard');
    });

    it('detects Amex from prefix 37', () => {
      typeInto(getNumberInput(card), '378282246310005');
      expect(card.cardType).toBe('amex');
    });

    it('detects Discover from prefix 6011', () => {
      typeInto(getNumberInput(card), '6011111111111117');
      expect(card.cardType).toBe('discover');
    });

    it('detects Diners from prefix 3006', () => {
      typeInto(getNumberInput(card), '30569309025904');
      expect(card.cardType).toBe('diners');
    });

    it('detects JCB from prefix 3530', () => {
      typeInto(getNumberInput(card), '3530111333300000');
      expect(card.cardType).toBe('jcb');
    });

    it('adds card type class to .card element', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      expect(getCardEl(card).classList.contains('card--visa')).toBe(true);
    });

    it('switches card type class when number prefix changes', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      typeInto(getNumberInput(card), '5500005555555559');
      expect(getCardEl(card).classList.contains('card--mastercard')).toBe(true);
      expect(getCardEl(card).classList.contains('card--visa')).toBe(false);
    });

    it('updates card type label text', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      const label = card.shadowRoot!.querySelector('.card-type-label');
      expect(label!.textContent).toBe('Visa');
    });
  });

  // ── Card number formatting ─────────────────────────────────────────────────

  describe('Card number formatting', () => {
    beforeEach(() => document.body.appendChild(card));

    it('formats a Visa number with spaces (4-4-4-4)', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      expect(getNumberInput(card).value).toBe('4111 1111 1111 1111');
    });

    it('formats an Amex number (4-6-5)', () => {
      typeInto(getNumberInput(card), '378282246310005');
      expect(getNumberInput(card).value).toBe('3782 822463 10005');
    });

    it('strips non-digit characters', () => {
      typeInto(getNumberInput(card), '4111-1111-1111-1111');
      expect(getNumberInput(card).value).toBe('4111 1111 1111 1111');
    });

    it('limits to 16 digits for standard cards', () => {
      typeInto(getNumberInput(card), '41111111111111119999');
      expect(getNumberInput(card).value.replace(/\s/g, '').length).toBeLessThanOrEqual(16);
    });

    it('limits to 15 digits for Amex', () => {
      typeInto(getNumberInput(card), '3782822463100053');
      expect(getNumberInput(card).value.replace(/\s/g, '').length).toBeLessThanOrEqual(15);
    });

    it('updates the card face number display', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      const display = card.shadowRoot!.querySelector('.card-number-display');
      expect(display!.textContent).toContain('4111');
    });
  });

  // ── Expiry formatting ──────────────────────────────────────────────────────

  describe('Expiry formatting', () => {
    beforeEach(() => document.body.appendChild(card));

    it('auto-inserts slash after 2 digits', () => {
      typeInto(getExpiryInput(card), '1225');
      expect(getExpiryInput(card).value).toBe('12/25');
    });

    it('does not insert slash for fewer than 3 digits', () => {
      typeInto(getExpiryInput(card), '12');
      expect(getExpiryInput(card).value).toBe('12');
    });

    it('strips non-digits', () => {
      typeInto(getExpiryInput(card), '12/25');
      expect(getExpiryInput(card).value).toBe('12/25');
    });

    it('limits to MM/YY (4 digits)', () => {
      typeInto(getExpiryInput(card), '122599');
      expect(getExpiryInput(card).value).toBe('12/25');
    });

    it('updates the card face expiry display', () => {
      typeInto(getExpiryInput(card), '1230');
      const display = card.shadowRoot!.querySelector('.card-expiry-display');
      expect(display!.textContent).toBe('12/30');
    });
  });

  // ── CVC field ─────────────────────────────────────────────────────────────

  describe('CVC field', () => {
    beforeEach(() => document.body.appendChild(card));

    it('accepts numeric CVC', () => {
      typeInto(getCvcInput(card), '123');
      expect(getCvcInput(card).value).toBe('123');
    });

    it('strips non-digits from CVC', () => {
      typeInto(getCvcInput(card), '1a2b3');
      expect(getCvcInput(card).value).toBe('123');
    });

    it('has maxlength 3 by default', () => {
      expect(getCvcInput(card).getAttribute('maxlength')).toBe('4'); // initially 4 attr
    });

    it('updates CVC maxlength to 4 for Amex', () => {
      typeInto(getNumberInput(card), '378282246310005');
      expect(getCvcInput(card).getAttribute('maxlength')).toBe('4');
    });

    it('limits CVC to 3 digits for non-Amex', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      typeInto(getCvcInput(card), '12345');
      expect(getCvcInput(card).value.length).toBeLessThanOrEqual(3);
    });

    it('shows bullets on card back (never actual CVC)', () => {
      typeInto(getCvcInput(card), '123');
      const display = card.shadowRoot!.querySelector('.card-cvc-display');
      expect(display!.textContent).toBe('•••');
      expect(display!.textContent).not.toContain('123');
    });
  });

  // ── Card flip ─────────────────────────────────────────────────────────────

  describe('Card flip', () => {
    beforeEach(() => document.body.appendChild(card));

    it('flips to back when CVC input is focused', () => {
      focus(getCvcInput(card));
      expect(getCardEl(card).classList.contains('is-flipped')).toBe(true);
    });

    it('flips to front when CVC input loses focus', () => {
      focus(getCvcInput(card));
      blur(getCvcInput(card));
      expect(getCardEl(card).classList.contains('is-flipped')).toBe(false);
    });

    it('stays on front when expiry input is focused', () => {
      focus(getExpiryInput(card));
      expect(getCardEl(card).classList.contains('is-flipped')).toBe(false);
    });
  });

  // ── valid getter ──────────────────────────────────────────────────────────

  describe('valid getter', () => {
    beforeEach(() => document.body.appendChild(card));

    it('returns false when all fields are empty', () => {
      expect(card.valid).toBe(false);
    });

    it('returns true when all required fields are valid', () => {
      fillValid(card);
      expect(card.valid).toBe(true);
    });

    it('returns false with invalid Luhn number', () => {
      typeInto(getNumberInput(card), '4111111111111112'); // bad Luhn
      typeInto(getExpiryInput(card), '1230');
      typeInto(getCvcInput(card), '123');
      expect(card.valid).toBe(false);
    });

    it('returns false with expired card', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      typeInto(getExpiryInput(card), '0120'); // Jan 2020
      typeInto(getCvcInput(card), '123');
      expect(card.valid).toBe(false);
    });

    it('returns false with short CVC', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      typeInto(getExpiryInput(card), '1230');
      typeInto(getCvcInput(card), '12');
      expect(card.valid).toBe(false);
    });

    it('returns false when show-name set and name is empty', () => {
      card.setAttribute('show-name', '');
      fillValid(card);
      expect(card.valid).toBe(false);
    });

    it('returns true when show-name set and name is provided', () => {
      card.setAttribute('show-name', '');
      fillValid(card);
      typeInto(getNameInput(card), 'John Smith');
      expect(card.valid).toBe(true);
    });
  });

  // ── last4 and cardType getters ─────────────────────────────────────────────

  describe('last4 and cardType', () => {
    beforeEach(() => document.body.appendChild(card));

    it('last4 returns the last 4 digits of the card number', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      expect(card.last4).toBe('1111');
    });

    it('last4 returns empty string when no number entered', () => {
      expect(card.last4).toBe('');
    });

    it('cardType returns detected type', () => {
      typeInto(getNumberInput(card), '5500005555555559');
      expect(card.cardType).toBe('mastercard');
    });
  });

  // ── getCardData ────────────────────────────────────────────────────────────

  describe('getCardData()', () => {
    beforeEach(() => document.body.appendChild(card));

    it('returns null when form is not valid', () => {
      expect(card.getCardData()).toBeNull();
    });

    it('returns card data object when valid', () => {
      fillValid(card);
      const data = card.getCardData();
      expect(data).not.toBeNull();
      expect(data!.number).toBe('4111111111111111');
      expect(data!.expiry).toBe('12/30');
      expect(data!.cvc).toBe('123');
    });

    it('returned number contains no spaces', () => {
      fillValid(card);
      const data = card.getCardData();
      expect(data!.number).not.toContain(' ');
    });
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  describe('reset()', () => {
    beforeEach(() => document.body.appendChild(card));

    it('clears all input fields', () => {
      fillValid(card);
      card.reset();
      expect(getNumberInput(card).value).toBe('');
      expect(getExpiryInput(card).value).toBe('');
      expect(getCvcInput(card).value).toBe('');
    });

    it('resets valid to false', () => {
      fillValid(card);
      card.reset();
      expect(card.valid).toBe(false);
    });

    it('resets cardType to unknown', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      card.reset();
      expect(card.cardType).toBe('unknown');
    });

    it('resets card face displays', () => {
      fillValid(card);
      card.reset();
      const display = card.shadowRoot!.querySelector('.card-number-display');
      expect(display!.textContent).toContain('•');
    });

    it('flips back to front', () => {
      focus(getCvcInput(card));
      card.reset();
      expect(getCardEl(card).classList.contains('is-flipped')).toBe(false);
    });
  });

  // ── focus() ───────────────────────────────────────────────────────────────

  it('focus() focuses the card number input', () => {
    document.body.appendChild(card);
    const spy = vi.spyOn(getNumberInput(card), 'focus');
    card.focus();
    expect(spy).toHaveBeenCalled();
  });

  // ── name getter ───────────────────────────────────────────────────────────

  it('name getter returns the name attribute', () => {
    card.setAttribute('name', 'payment');
    document.body.appendChild(card);
    expect(card.name).toBe('payment');
  });

  // ── Events ────────────────────────────────────────────────────────────────

  describe('Events', () => {
    beforeEach(() => document.body.appendChild(card));

    it('fires secure-card event on number input', () => {
      const handler = vi.fn();
      card.addEventListener('secure-card', handler);
      typeInto(getNumberInput(card), '4111111111111111');
      expect(handler).toHaveBeenCalled();
    });

    it('event detail contains cardType and last4, not full PAN', () => {
      const handler = vi.fn();
      card.addEventListener('secure-card', handler);
      typeInto(getNumberInput(card), '4111111111111111');
      const detail = handler.mock.calls[0]![0].detail;
      expect(detail.cardType).toBe('visa');
      expect(detail.last4).toBe('1111');
      expect(detail).not.toHaveProperty('number');
      expect(detail).not.toHaveProperty('cvc');
    });

    it('event detail contains valid flag', () => {
      const handler = vi.fn();
      card.addEventListener('secure-card', handler);
      fillValid(card);
      const detail = handler.mock.calls[handler.mock.calls.length - 1]![0].detail;
      expect(detail.valid).toBe(true);
    });

    it('fires secure-card event on expiry input', () => {
      const handler = vi.fn();
      card.addEventListener('secure-card', handler);
      typeInto(getExpiryInput(card), '1230');
      expect(handler).toHaveBeenCalled();
    });

    it('fires secure-card event on CVC input', () => {
      const handler = vi.fn();
      card.addEventListener('secure-card', handler);
      typeInto(getCvcInput(card), '123');
      expect(handler).toHaveBeenCalled();
    });

    it('event bubbles and is composed', () => {
      const handler = vi.fn();
      document.addEventListener('secure-card', handler);
      typeInto(getNumberInput(card), '4111111111111111');
      expect(handler).toHaveBeenCalled();
      document.removeEventListener('secure-card', handler);
    });
  });

  // ── Disabled attribute ────────────────────────────────────────────────────

  describe('Disabled attribute', () => {
    it('disables all inputs on render when disabled is set', () => {
      card.setAttribute('disabled', '');
      document.body.appendChild(card);
      expect(getNumberInput(card).disabled).toBe(true);
      expect(getExpiryInput(card).disabled).toBe(true);
      expect(getCvcInput(card).disabled).toBe(true);
    });

    it('disables inputs after connection via handleAttributeChange', () => {
      document.body.appendChild(card);
      card.setAttribute('disabled', '');
      expect(getNumberInput(card).disabled).toBe(true);
    });

    it('re-enables inputs when disabled attribute is removed', () => {
      card.setAttribute('disabled', '');
      document.body.appendChild(card);
      card.removeAttribute('disabled');
      expect(getNumberInput(card).disabled).toBe(false);
    });
  });

  // ── show-name toggle ──────────────────────────────────────────────────────

  describe('show-name toggle via attribute', () => {
    it('shows name group when show-name added after connection', () => {
      document.body.appendChild(card);
      card.setAttribute('show-name', '');
      const group = card.shadowRoot!.querySelector<HTMLElement>('[id$="-name-group"]');
      expect(group!.hidden).toBe(false);
    });

    it('hides name group when show-name removed', () => {
      card.setAttribute('show-name', '');
      document.body.appendChild(card);
      card.removeAttribute('show-name');
      const group = card.shadowRoot!.querySelector<HTMLElement>('[id$="-name-group"]');
      expect(group!.hidden).toBe(true);
    });
  });

  // ── Hidden input sync ─────────────────────────────────────────────────────

  describe('Hidden input sync', () => {
    beforeEach(() => {
      card.setAttribute('name', 'payment');
      document.body.appendChild(card);
    });

    it('syncs last4 to the primary hidden input', () => {
      typeInto(getNumberInput(card), '4111111111111111');
      const hidden = card.querySelector<HTMLInputElement>('input[type="hidden"][name="payment"]');
      expect(hidden!.value).toBe('1111');
    });

    it('syncs expiry to the expiry hidden input', () => {
      typeInto(getExpiryInput(card), '1230');
      const hidden = card.querySelector<HTMLInputElement>('input[type="hidden"][name="payment-expiry"]');
      expect(hidden!.value).toBe('12/30');
    });

    it('syncs cardholder name to the holder hidden input', () => {
      card.setAttribute('show-name', '');
      typeInto(getNameInput(card), 'Jane Doe');
      const hidden = card.querySelector<HTMLInputElement>('input[type="hidden"][name="payment-holder"]');
      expect(hidden!.value).toBe('Jane Doe');
    });
  });

  // ── disconnectedCallback ──────────────────────────────────────────────────

  describe('disconnectedCallback', () => {
    it('clears all fields on removal', () => {
      document.body.appendChild(card);
      fillValid(card);
      card.remove();
      expect(card.valid).toBe(false);
      expect(card.last4).toBe('');
      expect(card.getCardData()).toBeNull();
    });
  });

  // ── Cardholder name field ──────────────────────────────────────────────────

  describe('Cardholder name input', () => {
    beforeEach(() => {
      card.setAttribute('show-name', '');
      document.body.appendChild(card);
    });

    it('accepts letters, spaces, hyphens, and apostrophes', () => {
      typeInto(getNameInput(card), "O'Brien-Smith");
      expect(getNameInput(card).value).toBe("O'Brien-Smith");
    });

    it('strips invalid characters', () => {
      typeInto(getNameInput(card), 'John123!');
      expect(getNameInput(card).value).toBe('John');
    });

    it('limits to 50 characters', () => {
      typeInto(getNameInput(card), 'A'.repeat(60));
      expect(getNameInput(card).value.length).toBeLessThanOrEqual(50);
    });

    it('updates the card face name display in uppercase', () => {
      typeInto(getNameInput(card), 'Jane Doe');
      const display = card.shadowRoot!.querySelector('.card-name-display');
      expect(display!.textContent).toBe('JANE DOE');
    });
  });
});
