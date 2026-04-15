
import { SecureBaseComponent } from '../../core/base-component.js';
import { SecurityTier } from '../../core/security-config.js';

export class SecureInput extends SecureBaseComponent {
  // text/search/url get threat feedback on by default.
  // password: feedback is confusing on masked fields.
  // email/tel: browser-enforced character restrictions limit injection surface.
  // number: detectInjection is skipped entirely (browser enforces numeric).
  static readonly #FEEDBACK_DEFAULT_TYPES: ReadonlySet<string> = new Set(['text', 'url', 'search']);

  #inputElement: HTMLInputElement | null = null;
  #labelElement: HTMLLabelElement | null = null;
  #errorContainer: HTMLDivElement | null = null;
  // Separate from #errorContainer so #clearErrors() never clobbers an active threat message.
  #threatContainer: HTMLDivElement | null = null;
  #actualValue: string = '';
  #isMasked: boolean = false;
  #hiddenInput: HTMLInputElement | null = null;
  // Clipboard text captured on paste so #handleInput has the real string even
  // when InputEvent.data is null (Firefox).
  #pendingPaste: string | null = null;
  #instanceId: string = `secure-input-${Math.random().toString(36).substring(2, 11)}`;

  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'type',
      'label',
      'placeholder',
      'required',
      'pattern',
      'minlength',
      'maxlength',
      'autocomplete',
      'value'
    ];
  }

  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'input-container';
    container.setAttribute('part', 'container');

    // Create label
    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);
      this.#labelElement.setAttribute('part', 'label');

      container.appendChild(this.#labelElement);
    }

    // Create input wrapper for progressive enhancement
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';
    inputWrapper.setAttribute('part', 'wrapper');

    // Create the actual input element
    this.#inputElement = document.createElement('input');
    this.#inputElement.id = this.#instanceId;
    this.#inputElement.className = 'input-field';
    this.#inputElement.setAttribute('part', 'input');

    // Apply attributes from web component to native input
    this.#applyInputAttributes();

    // Set up event listeners
    this.#attachEventListeners();

    inputWrapper.appendChild(this.#inputElement);
    container.appendChild(inputWrapper);

    // Create error container
    // role="alert" already implies aria-live="assertive" — do not override with polite
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('part', 'error');
    this.#errorContainer.id = `${this.#instanceId}-error`;
    container.appendChild(this.#errorContainer);

    // Threat feedback container — only rendered visibly when threat-feedback attribute
    // is present and detectInjection() fires. Kept separate from #errorContainer so
    // #clearErrors() (called on every input event) never clobbers a threat message.
    this.#threatContainer = document.createElement('div');
    this.#threatContainer.className = 'threat-container hidden';
    this.#threatContainer.setAttribute('role', 'alert');
    this.#threatContainer.setAttribute('part', 'threat');
    this.#threatContainer.id = `${this.#instanceId}-threat`;
    container.appendChild(this.#threatContainer);

    // CRITICAL: Create hidden input in light DOM for native form submission
    // The actual input is in Shadow DOM and can't participate in form submission
    this.#createHiddenInputForForm();

    // CRITICAL: Neutralize native fallback inputs in light DOM.
    // The server renders native <input> elements inside <secure-input> for no-JS
    // progressive enhancement. Now that JS has loaded and the shadow DOM input is
    // active, these native fallbacks must be neutralized:
    // 1. They are hidden by shadow DOM so users can't interact with them
    // 2. They still have 'required' attributes that trigger HTML5 constraint
    //    validation, silently blocking form submission (browser can't show the
    //    validation popup for a hidden element, so "nothing happens" on click)
    // 3. They still have 'name' attributes causing duplicate empty form fields
    this.#neutralizeFallbackInputs();

    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  // Creates a light-DOM hidden input to sync the shadow input value for native
  // form submission. Skipped when inside <secure-form>, which handles its own sync.
  #createHiddenInputForForm(): void {
    const name = this.getAttribute('name');
    if (!name) return;

    if (this.closest('secure-form')) return;

    this.#hiddenInput = document.createElement('input');
    this.#hiddenInput.type = 'hidden';
    this.#hiddenInput.name = name;
    this.#hiddenInput.value = this.#actualValue || '';

    // Append to light DOM (this element, not shadow root)
    this.appendChild(this.#hiddenInput);
  }

  #syncHiddenInput(): void {
    if (this.#hiddenInput) {
      this.#hiddenInput.value = this.#actualValue || '';
    }
  }

  // Server-rendered fallback inputs must be neutralised after JS upgrade:
  // active required/name attributes cause silent validation blocks and duplicate fields.
  #neutralizeFallbackInputs(): void {
    const fallbacks = this.querySelectorAll('input, textarea, select');
    fallbacks.forEach((el) => {
      // Skip the hidden input we created for form submission
      if (el === this.#hiddenInput) return;

      const input = el as HTMLInputElement;
      // Remove attributes that interfere with form submission
      input.removeAttribute('required');
      input.removeAttribute('name');
      input.removeAttribute('minlength');
      input.removeAttribute('maxlength');
      input.removeAttribute('pattern');
      // Mark as inert so it's completely non-interactive
      input.setAttribute('tabindex', '-1');
      input.setAttribute('aria-hidden', 'true');
    });
  }

  #applyInputAttributes(): void {
    const config = this.config;

    const name = this.getAttribute('name');
    if (name) {
      this.#inputElement!.name = this.sanitizeValue(name);
    }

    // Accessible name fallback when no visible label is provided.
    if (!this.getAttribute('label') && name) {
      this.#inputElement!.setAttribute('aria-label', this.sanitizeValue(name));
    }

    this.#inputElement!.setAttribute('aria-describedby', `${this.#instanceId}-error`);

    const type = this.getAttribute('type') || 'text';
    this.#inputElement!.type = type;

    const placeholder = this.getAttribute('placeholder');
    if (placeholder) {
      this.#inputElement!.placeholder = this.sanitizeValue(placeholder);
    }

    if (this.hasAttribute('required') || config.validation.required) {
      this.#inputElement!.required = true;
      this.#inputElement!.setAttribute('aria-required', 'true');
    }

    const pattern = this.getAttribute('pattern');
    if (pattern) {
      this.#inputElement!.pattern = pattern;
    }

    const minLength = this.getAttribute('minlength');
    if (minLength) {
      this.#inputElement!.minLength = parseInt(minLength, 10);
    }

    const maxLength = this.getAttribute('maxlength') || config.validation.maxLength;
    if (maxLength) {
      this.#inputElement!.maxLength = parseInt(String(maxLength), 10);
    }

    // SENSITIVE/CRITICAL: disable autocomplete to prevent browser storage of sensitive data.
    if (config.storage.allowAutocomplete) {
      const autocomplete = this.getAttribute('autocomplete') || 'on';
      this.#inputElement!.autocomplete = autocomplete as AutoFill;
    } else {
      // Explicitly disable autocomplete for sensitive data
      this.#inputElement!.autocomplete = 'off';
      if (this.#inputElement!.type === 'password') {
        this.#inputElement!.autocomplete = 'new-password';
      }
    }

    if (this.hasAttribute('disabled')) {
      this.#inputElement!.disabled = true;
    }

    if (this.hasAttribute('readonly')) {
      this.#inputElement!.readOnly = true;
    }

    const value = this.getAttribute('value');
    if (value) {
      this.#setValue(value);
    }

    // Apply masking if configured for this tier.
    // Never mask format-validated types (email, url, tel): the browser runs
    // checkValidity() against the displayed value, and users must see their
    // input to verify correctness. Masking is only appropriate for opaque
    // text fields such as account numbers or SSNs (type="text").
    const NON_MASKABLE_TYPES = new Set(['email', 'url', 'tel']);
    if (config.masking.enabled && this.#inputElement!.type !== 'password' && !NON_MASKABLE_TYPES.has(this.#inputElement!.type)) {
      this.#isMasked = true;
    }
  }

  #attachEventListeners(): void {
    this.#inputElement!.addEventListener('focus', () => {
      this.recordTelemetryFocus();
      this.audit('input_focused', {
        name: this.#inputElement!.name
      });
    });

    this.#inputElement!.addEventListener('input', (e: Event) => {
      this.recordTelemetryInput(e);
      this.#handleInput(e);
    });

    this.#inputElement!.addEventListener('blur', () => {
      this.recordTelemetryBlur();
      this.#validateAndShowErrors();
      this.audit('input_blurred', {
        name: this.#inputElement!.name,
        hasValue: this.#actualValue.length > 0
      });
    });

    // Paste event — capture clipboard text before the browser masks it.
    // InputEvent.data is null in Firefox for paste, so we read it here and
    // stash it for #handleInput to consume.
    this.#inputElement!.addEventListener('paste', (e: ClipboardEvent) => {
      if (this.#isMasked) {
        this.#pendingPaste = e.clipboardData?.getData('text/plain') ?? null;
      }
    });

    this.#inputElement!.addEventListener('change', () => {
      this.audit('input_changed', {
        name: this.#inputElement!.name,
        valueLength: this.#actualValue.length
      });
    });
  }

  #handleInput(event: Event): void {
    // For masked inputs (except password which browser handles), we need to track
    // the actual unmasked value separately because the input element shows masked chars
    if (this.#isMasked && this.#inputElement!.type !== 'password') {
      const inputEvent = event as InputEvent;
      const inputType = inputEvent.inputType;
      const data = inputEvent.data || '';

      const cursorPos = this.#inputElement!.selectionStart || 0;

      // Handle different input types by reconstructing the actual value
      if (inputType === 'deleteContentBackward') {
        // Backspace: remove character before cursor
        if (cursorPos < this.#actualValue.length) {
          this.#actualValue = this.#actualValue.substring(0, cursorPos) +
                             this.#actualValue.substring(cursorPos + 1);
        }
      } else if (inputType === 'deleteContentForward') {
        // Delete key: character at cursor already removed, cursor position is correct
        this.#actualValue = this.#actualValue.substring(0, cursorPos) +
                           this.#actualValue.substring(cursorPos + 1);
      } else if (inputType === 'insertText') {
        // User typed a character - insert at cursor position
        this.#actualValue = this.#actualValue.substring(0, cursorPos - data.length) +
                           data +
                           this.#actualValue.substring(cursorPos - data.length);
      } else if (inputType === 'insertFromPaste') {
        // Use the text captured from the paste event. InputEvent.data is null in
        // Firefox, so #pendingPaste is the reliable cross-browser source.
        const pasted = this.#pendingPaste ?? data;
        this.#pendingPaste = null;
        if (pasted) {
          this.#actualValue = this.#actualValue.substring(0, cursorPos - pasted.length) +
                             pasted +
                             this.#actualValue.substring(cursorPos - pasted.length);
        }
      } else {
        // Unhandled inputType (IME composition, cut, drag-and-drop, etc.) on a masked
        // field. We cannot reconstruct the actual value from the masked display — the
        // display shows only '•' characters. Clear the field to prevent storing mask
        // characters as real data.
        this.#actualValue = '';
        this.#inputElement!.value = '';
      }

      // Now apply masking to the display
      const maskedValue = this.#maskValue(this.#actualValue);
      this.#inputElement!.value = maskedValue;

      // Restore cursor position
      this.#inputElement!.setSelectionRange(cursorPos, cursorPos);
    } else {
      // For non-masked inputs, just read the value normally
      this.#actualValue = this.#inputElement!.value;
    }

    const inputType = this.#inputElement!.type;
    if (inputType !== 'number') {
      this.detectInjection(
        this.#actualValue,
        this.#inputElement!.name,
        SecureInput.#FEEDBACK_DEFAULT_TYPES.has(inputType)
      );
    }

    this.#clearErrors();
    this.#syncHiddenInput();
    this.dispatchEvent(
      new CustomEvent('secure-input-change', {
        detail: {
          name: this.#inputElement!.name,
          value: this.#actualValue, // Parent can access actual value
          masked: this.#isMasked,
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  #maskValue(value: string): string {
    const config = this.config;
    const maskChar = config.masking.character;

    if (!config.masking.partial || this.securityTier === SecurityTier.CRITICAL) {
      // Mask everything
      return maskChar.repeat(value.length);
    }

    // Partial masking: show last 4 characters
    if (value.length <= 4) {
      return maskChar.repeat(value.length);
    }

    const maskedPart = maskChar.repeat(value.length - 4);
    const visiblePart = value.slice(-4);
    return maskedPart + visiblePart;
  }

  #validatePasswordStrength(value: string): string | null {
    if (!this.#inputElement || this.#inputElement.type !== 'password') {
      return null;
    }

    // Skip strength check on empty values — required check handles that
    if (!value || value.length === 0) {
      return null;
    }

    const tier = this.securityTier;

    if (tier === 'critical') {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
      if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must include a number';
      if (!/[^a-zA-Z0-9]/.test(value)) return 'Password must include a special character';
    } else if (tier === 'sensitive') {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
      if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must include a number';
    } else if (tier === 'authenticated') {
      if (value.length < 6) return 'Password must be at least 6 characters';
    }

    return null;
  }

  #validateNumberOverflow(value: string): string | null {
    if (!this.#inputElement || this.#inputElement.type !== 'number') {
      return null;
    }

    // Skip on empty values — required check handles that
    if (!value || value.length === 0) {
      return null;
    }

    const num = Number(value);

    if (!Number.isFinite(num)) {
      return 'Value must be a valid number';
    }

    // Check safe integer range for integer values (no decimal point)
    if (!value.includes('.') && !Number.isSafeInteger(num)) {
      return 'Value exceeds safe integer range';
    }

    // Enforce min/max attributes
    const minAttr = this.getAttribute('min');
    const maxAttr = this.getAttribute('max');

    if (minAttr !== null) {
      const min = Number(minAttr);
      if (Number.isFinite(min) && num < min) {
        return `Value must be at least ${min}`;
      }
    }

    if (maxAttr !== null) {
      const max = Number(maxAttr);
      if (Number.isFinite(max) && num > max) {
        return `Value must be at most ${max}`;
      }
    }

    return null;
  }

  #validateAndShowErrors(): void {
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.#showError(
        `Too many attempts. Please wait ${Math.ceil(rateLimitCheck.retryAfter / 1000)} seconds.`
      );
      return;
    }

    const patternAttr = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    let compiledPattern: RegExp | null = null;
    if (patternAttr) {
      try {
        // eslint-disable-next-line security/detect-non-literal-regexp
        compiledPattern = new RegExp(patternAttr);
      } catch {
        // Invalid regex from attribute — treat as no pattern
      }
    }

    const validation = this.validateInput(this.#actualValue, {
      required: this.hasAttribute('required') || this.config.validation.required,
      pattern: compiledPattern,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      this.#showError(validation.errors.join(', '));
      return;
    }

    const passwordError = this.#validatePasswordStrength(this.#actualValue);
    if (passwordError) {
      this.#showError(passwordError);
      return;
    }

    const numberError = this.#validateNumberOverflow(this.#actualValue);
    if (numberError) {
      this.#showError(numberError);
      return;
    }

    // Native constraint validation: email, url, number format, date, etc.
    // For masked inputs, checkValidity() would run against the displayed mask
    // characters — temporarily swap in the actual value, capture the result,
    // then restore the mask.
    if (this.#inputElement && this.#actualValue) {
      let isValid: boolean;
      let validationMsg: string;
      if (this.#isMasked) {
        const prev = this.#inputElement.value;
        this.#inputElement.value = this.#actualValue;
        isValid = this.#inputElement.checkValidity();
        validationMsg = this.#inputElement.validationMessage;
        this.#inputElement.value = prev;
      } else {
        isValid = this.#inputElement.checkValidity();
        validationMsg = this.#inputElement.validationMessage;
      }
      if (!isValid) {
        this.#showError(validationMsg);
        return;
      }
    }
  }

  #showError(message: string): void {
    this.#errorContainer!.textContent = message;
    // Force reflow so browser registers the hidden state with content,
    // then remove hidden to trigger the CSS transition
    void this.#errorContainer!.offsetHeight;
    this.#errorContainer!.classList.remove('hidden');
    this.#inputElement!.classList.add('error');
    this.#inputElement!.setAttribute('aria-invalid', 'true');
  }

  #clearErrors(): void {
    // Start the hide animation first, clear text only after transition ends
    this.#errorContainer!.classList.add('hidden');
    this.#errorContainer!.addEventListener('transitionend', () => {
      if (this.#errorContainer!.classList.contains('hidden')) {
        this.#errorContainer!.textContent = '';
      }
    }, { once: true });
    this.#inputElement!.classList.remove('error');
    this.#inputElement!.removeAttribute('aria-invalid');
  }

  #setValue(value: string): void {
    this.#actualValue = value;

    if (this.#isMasked && this.#inputElement!.type !== 'password') {
      this.#inputElement!.value = this.#maskValue(value);
    } else {
      this.#inputElement!.value = value;
    }

    // Sync hidden input for form submission
    this.#syncHiddenInput();
  }

  #getComponentStyles(): string {
    return new URL('./secure-input.css', import.meta.url).href;
  }

  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#inputElement) return;

    switch (name) {
      case 'disabled':
        this.#inputElement.disabled = this.hasAttribute('disabled');
        break;
      case 'readonly':
        this.#inputElement.readOnly = this.hasAttribute('readonly');
        break;
      case 'value':
        if (newValue !== this.#actualValue) {
          this.#setValue(newValue || '');
        }
        break;
    }
  }

  get value(): string {
    return this.#actualValue;
  }

  set value(value: string) {
    this.#setValue(value || '');
  }

  get name(): string {
    return this.#inputElement ? this.#inputElement.name : '';
  }

  get valid(): boolean {
    const patternAttr = this.getAttribute('pattern');
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    let compiledPattern: RegExp | null = null;
    if (patternAttr) {
      try {
        // eslint-disable-next-line security/detect-non-literal-regexp
        compiledPattern = new RegExp(patternAttr);
      } catch {
        // Invalid regex from attribute — treat as no pattern
      }
    }

    const validation = this.validateInput(this.#actualValue, {
      required: this.hasAttribute('required') || this.config.validation.required,
      pattern: compiledPattern,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      return false;
    }

    if (this.#validatePasswordStrength(this.#actualValue) !== null) {
      return false;
    }

    if (this.#validateNumberOverflow(this.#actualValue) !== null) {
      return false;
    }

    // Delegate to the browser's native constraint validation for type-specific
    // format checking (email, url, number, date, etc.). This catches invalid
    // emails, malformed URLs, out-of-range numbers and more without duplicating
    // browser logic. Only relevant when there is a value to validate.
    // For masked inputs, validate the actual value not the displayed mask.
    if (this.#inputElement && this.#actualValue) {
      let checkValid: boolean;
      if (this.#isMasked) {
        const prev = this.#inputElement.value;
        this.#inputElement.value = this.#actualValue;
        checkValid = this.#inputElement.checkValidity();
        this.#inputElement.value = prev;
      } else {
        checkValid = this.#inputElement.checkValidity();
      }
      if (!checkValid) {
        return false;
      }
    }

    return true;
  }

  focus(): void {
    if (this.#inputElement) {
      this.#inputElement.focus();
    }
  }

  blur(): void {
    if (this.#inputElement) {
      this.#inputElement.blur();
    }
  }

  protected override showThreatFeedback(patternId: string): void {
    if (!this.#threatContainer || !this.#inputElement) return;

    // Build content with DOM methods — CSP-safe, no innerHTML
    this.#threatContainer.textContent = '';

    const msg = document.createElement('span');
    msg.className = 'threat-message';
    msg.textContent = this.getThreatLabel(patternId);

    const patternBadge = document.createElement('span');
    patternBadge.className = 'threat-badge';
    patternBadge.textContent = patternId;

    this.#threatContainer.appendChild(msg);
    this.#threatContainer.appendChild(patternBadge);

    // Force reflow so the browser registers the hidden state before removing it,
    // ensuring the CSS transition fires correctly.
    void this.#threatContainer.offsetHeight;
    this.#threatContainer.classList.remove('hidden');
    this.#inputElement.classList.add('threat');
    this.#inputElement.setAttribute('aria-invalid', 'true');
  }

  protected override clearThreatFeedback(): void {
    if (!this.#threatContainer || !this.#inputElement) return;
    this.#threatContainer.classList.add('hidden');
    this.#threatContainer.addEventListener('transitionend', () => {
      if (this.#threatContainer!.classList.contains('hidden')) {
        this.#threatContainer!.textContent = '';
      }
    }, { once: true });
    this.#inputElement.classList.remove('threat');
    this.#inputElement.removeAttribute('aria-invalid');
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    this.#actualValue = '';
    this.#pendingPaste = null;
    if (this.#inputElement) {
      this.#inputElement.value = '';
    }
  }
}

customElements.define('secure-input', SecureInput);
