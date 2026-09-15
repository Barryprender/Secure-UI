/**
 * Regression tests for the 0.5.1 submit-button enabling bug.
 *
 * <secure-submit-button> subscribed to a hand-written list of four change
 * events and queried a hand-written list of five field tags. <secure-form>
 * kept its own, longer list. 0.5.0 added secure-card and
 * secure-password-confirm to the form's copy and missed the button's, so the
 * button never learned that completing a card, a file upload or a password
 * pair had made the form valid: it kept the verdict from the last event it did
 * hear, and a form whose only field emitted an unheard event stayed
 * unsubmittable for ever.
 *
 * Each test drives the real failing sequence — complete the unheard field
 * LAST, with no later keystroke in a heard field to mask the bug — and is
 * paired with a control proving the button still refuses an incomplete form.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecureSubmitButton } from '../../src/components/secure-submit-button/secure-submit-button.js';
import { SecureForm } from '../../src/components/secure-form/secure-form.js';
import { SecureInput } from '../../src/components/secure-input/secure-input.js';
import { SecureCard } from '../../src/components/secure-card/secure-card.js';
import { SecurePasswordConfirm } from '../../src/components/secure-password-confirm/secure-password-confirm.js';
import {
  SECURE_FIELD_CHANGE_EVENTS,
  SECURE_FIELD_COMPONENTS,
  SECURE_FIELD_SELECTOR
} from '../../src/core/security-config.js';
import { shadowOf } from '../helpers/internals.js';

const REGISTRATIONS = [
  ['secure-submit-button', SecureSubmitButton],
  ['secure-form', SecureForm],
  ['secure-input', SecureInput],
  ['secure-card', SecureCard],
  ['secure-password-confirm', SecurePasswordConfirm]
] as const;

for (const [tag, ctor] of REGISTRATIONS) {
  if (!customElements.get(tag)) {
    customElements.define(tag, ctor as unknown as CustomElementConstructor);
  }
}

/** The button defers form discovery to a microtask in connectedCallback. */
async function settle(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 10));
}

function buttonEl(button: SecureSubmitButton): HTMLButtonElement {
  return shadowOf(button)!.querySelector<HTMLButtonElement>('button')!;
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function cardInput(card: SecureCard, part: string): HTMLInputElement {
  return shadowOf(card)!.querySelector<HTMLInputElement>('input[part="' + part + '"]')!;
}

/** Fill a <secure-card> so that card.valid becomes true. */
function fillCard(card: SecureCard): void {
  typeInto(
    shadowOf(card)!.querySelector<HTMLInputElement>('.card-number-input')!,
    '4111111111111111'
  );
  typeInto(cardInput(card, 'expiry-input'), '1230');
  typeInto(cardInput(card, 'cvc-input'), '123');
}

function passwordInputs(el: SecurePasswordConfirm): NodeListOf<HTMLInputElement> {
  return shadowOf(el)!.querySelectorAll<HTMLInputElement>('input[type="password"]');
}

describe('the shared secure-field registry', () => {
  it('pairs every field tag with exactly one change event', () => {
    expect(SECURE_FIELD_COMPONENTS.length).toBe(SECURE_FIELD_CHANGE_EVENTS.length);
    expect(new Set(SECURE_FIELD_CHANGE_EVENTS).size).toBe(SECURE_FIELD_CHANGE_EVENTS.length);
  });

  it('covers the three tags the button used to ignore', () => {
    const tags = SECURE_FIELD_COMPONENTS.map(f => f.tag);
    expect(tags).toContain('secure-card');
    expect(tags).toContain('secure-password-confirm');
    expect(tags).toContain('secure-file-upload');
    expect(SECURE_FIELD_SELECTOR).toContain('secure-card');
    expect(SECURE_FIELD_SELECTOR).toContain('secure-password-confirm');
  });
});

describe('SecureSubmitButton enables on the last field completed', () => {
  let form: SecureForm;
  let button: SecureSubmitButton;

  beforeEach(() => {
    document.body.replaceChildren();
    form = document.createElement('secure-form') as SecureForm;
    form.setAttribute('security-tier', 'critical');
    form.setAttribute('csrf-token', 'test-token');
    button = document.createElement('secure-submit-button') as SecureSubmitButton;
  });

  it('enables when a secure-card is completed last', async () => {
    const amount = document.createElement('secure-input') as SecureInput;
    amount.setAttribute('name', 'amount');
    amount.setAttribute('security-tier', 'authenticated');
    amount.setAttribute('required', '');
    const card = document.createElement('secure-card') as SecureCard;
    card.setAttribute('name', 'card');
    card.setAttribute('required', '');

    form.append(amount, card, button);
    document.body.appendChild(form);
    await settle();

    // Amount first. The button hears this event, and correctly stays disabled
    // because the card is still empty.
    amount.value = '49.99';
    amount.dispatchEvent(new CustomEvent('secure-input-change', {
      detail: { name: 'amount', masked: false, tier: 'authenticated' },
      bubbles: true,
      composed: true
    }));
    await settle();
    expect(buttonEl(button).disabled).toBe(true);

    // Card last, and nothing touches the amount afterwards. This is the exact
    // sequence that used to leave "Pay" disabled for ever.
    fillCard(card);
    await settle();

    expect(card.valid).toBe(true);
    expect(form.valid).toBe(true);
    expect(buttonEl(button).disabled).toBe(false);
  });

  it('still refuses when the card is left incomplete', async () => {
    const card = document.createElement('secure-card') as SecureCard;
    card.setAttribute('name', 'card');
    card.setAttribute('required', '');

    form.append(card, button);
    document.body.appendChild(form);
    await settle();

    // Valid PAN, no expiry, no CVC.
    typeInto(
      shadowOf(card)!.querySelector<HTMLInputElement>('.card-number-input')!,
      '4111111111111111'
    );
    await settle();

    expect(card.valid).toBe(false);
    expect(buttonEl(button).disabled).toBe(true);
  });

  it('enables when a secure-password-confirm is matched last', async () => {
    const email = document.createElement('secure-input') as SecureInput;
    email.setAttribute('name', 'email');
    email.setAttribute('type', 'email');
    email.setAttribute('security-tier', 'public');
    email.setAttribute('required', '');
    const passwords = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
    passwords.setAttribute('name', 'password');
    passwords.setAttribute('required', '');

    form.append(email, passwords, button);
    document.body.appendChild(form);
    await settle();

    email.value = 'user@example.com';
    email.dispatchEvent(new CustomEvent('secure-input-change', {
      detail: { name: 'email', masked: false, tier: 'public' },
      bubbles: true,
      composed: true
    }));
    await settle();
    expect(buttonEl(button).disabled).toBe(true);

    const inputs = passwordInputs(passwords);
    typeInto(inputs[0]!, 'Str0ngDemoPass!23');
    typeInto(inputs[1]!, 'Str0ngDemoPass!23');
    await settle();

    expect(passwords.valid).toBe(true);
    expect(buttonEl(button).disabled).toBe(false);
  });

  it('still refuses when the two passwords do not match', async () => {
    const passwords = document.createElement('secure-password-confirm') as SecurePasswordConfirm;
    passwords.setAttribute('name', 'password');
    passwords.setAttribute('required', '');

    form.append(passwords, button);
    document.body.appendChild(form);
    await settle();

    const inputs = passwordInputs(passwords);
    typeInto(inputs[0]!, 'Str0ngDemoPass!23');
    typeInto(inputs[1]!, 'Str0ngDemoPass!24');
    await settle();

    expect(passwords.valid).toBe(false);
    expect(buttonEl(button).disabled).toBe(true);
  });

  it('subscribes to every change event in the registry', async () => {
    const heard: string[] = [];
    const originalAdd = HTMLElement.prototype.addEventListener;
    HTMLElement.prototype.addEventListener = function (
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void {
      if (this === form) heard.push(type);
      originalAdd.call(this, type, listener, options);
    };

    try {
      form.appendChild(button);
      document.body.appendChild(form);
      await settle();
    } finally {
      HTMLElement.prototype.addEventListener = originalAdd;
    }

    for (const changeEvent of SECURE_FIELD_CHANGE_EVENTS) {
      expect(heard).toContain(changeEvent);
    }
  });
});
