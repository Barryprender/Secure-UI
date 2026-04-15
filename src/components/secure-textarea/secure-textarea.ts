
import { SecureBaseComponent } from '../../core/base-component.js';

export class SecureTextarea extends SecureBaseComponent {
  #textareaElement: HTMLTextAreaElement | null = null;
  #labelElement: HTMLLabelElement | null = null;
  #errorContainer: HTMLDivElement | null = null;
  // Separate from #errorContainer so #clearErrors() never clobbers an active threat message.
  #threatContainer: HTMLDivElement | null = null;
  #charCountElement: HTMLSpanElement | null = null;
  #instanceId: string = `secure-textarea-${Math.random().toString(36).substring(2, 11)}`;

  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'label',
      'placeholder',
      'required',
      'minlength',
      'maxlength',
      'rows',
      'cols',
      'wrap',
      'value'
    ];
  }

  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'textarea-container';
    container.setAttribute('part', 'container');

    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);
      this.#labelElement.setAttribute('part', 'label');

      container.appendChild(this.#labelElement);
    }

    const textareaWrapper = document.createElement('div');
    textareaWrapper.className = 'textarea-wrapper';
    textareaWrapper.setAttribute('part', 'wrapper');

    this.#textareaElement = document.createElement('textarea');
    this.#textareaElement.id = this.#instanceId;
    this.#textareaElement.className = 'textarea-field';
    this.#textareaElement.setAttribute('part', 'textarea');

    this.#applyTextareaAttributes();
    this.#attachEventListeners();

    textareaWrapper.appendChild(this.#textareaElement);
    container.appendChild(textareaWrapper);

    this.#charCountElement = document.createElement('span');
    this.#charCountElement.className = 'char-count';
    this.#updateCharCount();
    container.appendChild(this.#charCountElement);

    // role="alert" already implies aria-live="assertive" — do not override with polite
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('part', 'error');
    this.#errorContainer.id = `${this.#instanceId}-error`;
    container.appendChild(this.#errorContainer);

    this.#threatContainer = document.createElement('div');
    this.#threatContainer.className = 'threat-container hidden';
    this.#threatContainer.setAttribute('role', 'alert');
    this.#threatContainer.setAttribute('part', 'threat');
    this.#threatContainer.id = `${this.#instanceId}-threat`;
    container.appendChild(this.#threatContainer);

    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  #applyTextareaAttributes(): void {
    const config = this.config;
    const name = this.getAttribute('name');
    if (name) {
      this.#textareaElement!.name = this.sanitizeValue(name);
    }

    if (!this.getAttribute('label') && name) {
      this.#textareaElement!.setAttribute('aria-label', this.sanitizeValue(name));
    }

    this.#textareaElement!.setAttribute('aria-describedby', `${this.#instanceId}-error`);

    const placeholder = this.getAttribute('placeholder');
    if (placeholder) {
      this.#textareaElement!.placeholder = this.sanitizeValue(placeholder);
    }

    if (this.hasAttribute('required') || config.validation.required) {
      this.#textareaElement!.required = true;
      this.#textareaElement!.setAttribute('aria-required', 'true');
    }

    const minLength = this.getAttribute('minlength');
    if (minLength) {
      this.#textareaElement!.minLength = parseInt(minLength, 10);
    }

    const maxLength = this.getAttribute('maxlength') || config.validation.maxLength;
    if (maxLength) {
      this.#textareaElement!.maxLength = parseInt(String(maxLength), 10);
    }

    const rows = this.getAttribute('rows') || 3;
    this.#textareaElement!.rows = parseInt(String(rows), 10);

    const cols = this.getAttribute('cols');
    if (cols) {
      this.#textareaElement!.cols = parseInt(cols, 10);
    }

    const wrap = this.getAttribute('wrap') || 'soft';
    this.#textareaElement!.wrap = wrap;

    // SENSITIVE/CRITICAL: disable autocomplete to prevent browser storage.
    if (config.storage.allowAutocomplete) {
      const autocomplete = this.getAttribute('autocomplete') || 'on';
      this.#textareaElement!.autocomplete = autocomplete as AutoFill;
    } else {
      this.#textareaElement!.autocomplete = 'off';
    }

    if (this.hasAttribute('disabled')) {
      this.#textareaElement!.disabled = true;
    }

    if (this.hasAttribute('readonly')) {
      this.#textareaElement!.readOnly = true;
    }

    const value = this.getAttribute('value');
    if (value) {
      this.#textareaElement!.value = value;
    }
  }

  #attachEventListeners(): void {
    this.#textareaElement!.addEventListener('focus', () => {
      this.recordTelemetryFocus();
      this.audit('textarea_focused', {
        name: this.#textareaElement!.name
      });
    });

    this.#textareaElement!.addEventListener('input', (e: Event) => {
      this.recordTelemetryInput(e);
      this.#handleInput(e);
    });

    this.#textareaElement!.addEventListener('blur', () => {
      this.recordTelemetryBlur();
      this.#validateAndShowErrors();
      this.audit('textarea_blurred', {
        name: this.#textareaElement!.name,
        hasValue: this.#textareaElement!.value.length > 0
      });
    });

    this.#textareaElement!.addEventListener('change', () => {
      this.audit('textarea_changed', {
        name: this.#textareaElement!.name,
        valueLength: this.#textareaElement!.value.length
      });
    });
  }

  #handleInput(_event: Event): void {
    this.detectInjection(this.#textareaElement!.value, this.#textareaElement!.name);
    this.#updateCharCount();
    this.#clearErrors();
    this.dispatchEvent(
      new CustomEvent('secure-textarea-change', {
        detail: {
          name: this.#textareaElement!.name,
          value: this.#textareaElement!.value,
          tier: this.securityTier
        },
        bubbles: true,
        composed: true
      })
    );
  }

  #updateCharCount(): void {
    const currentLength = this.#textareaElement!.value.length;
    const maxLength = this.#textareaElement!.maxLength;

    if (maxLength > 0) {
      this.#charCountElement!.textContent = `${currentLength} / ${maxLength}`;

      if (currentLength > maxLength * 0.9) {
        this.#charCountElement!.classList.add('warning');
      } else {
        this.#charCountElement!.classList.remove('warning');
      }
    } else {
      this.#charCountElement!.textContent = `${currentLength}`;
    }
  }

  #validateAndShowErrors(): void {
    const rateLimitCheck = this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.#showError(
        `Too many attempts. Please wait ${Math.ceil(rateLimitCheck.retryAfter / 1000)} seconds.`
      );
      return;
    }

    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    const validation = this.validateInput(this.#textareaElement!.value, {
      required: this.hasAttribute('required') || this.config.validation.required,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    if (!validation.valid) {
      this.#showError(validation.errors.join(', '));
    }
  }

  #showError(message: string): void {
    this.#errorContainer!.textContent = message;
    // Force reflow so browser registers the hidden state with content,
    // then remove hidden to trigger the CSS transition
    void this.#errorContainer!.offsetHeight;
    this.#errorContainer!.classList.remove('hidden');
    this.#textareaElement!.classList.add('error');
    this.#textareaElement!.setAttribute('aria-invalid', 'true');
  }

  #clearErrors(): void {
    this.#errorContainer!.classList.add('hidden');
    this.#errorContainer!.addEventListener('transitionend', () => {
      if (this.#errorContainer!.classList.contains('hidden')) {
        this.#errorContainer!.textContent = '';
      }
    }, { once: true });
    this.#textareaElement!.classList.remove('error');
    this.#textareaElement!.removeAttribute('aria-invalid');
  }

  #getComponentStyles(): string {
    return new URL('./secure-textarea.css', import.meta.url).href;
  }

  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#textareaElement) return;

    switch (name) {
      case 'disabled':
        this.#textareaElement.disabled = this.hasAttribute('disabled');
        break;
      case 'readonly':
        this.#textareaElement.readOnly = this.hasAttribute('readonly');
        break;
      case 'value':
        if (newValue !== this.#textareaElement.value) {
          this.#textareaElement.value = newValue || '';
          this.#updateCharCount();
        }
        break;
    }
  }

  get value(): string {
    return this.#textareaElement ? this.#textareaElement.value : '';
  }

  set value(value: string) {
    if (this.#textareaElement) {
      this.#textareaElement.value = value || '';
      this.#updateCharCount();
    }
  }

  get name(): string {
    return this.#textareaElement ? this.#textareaElement.name : '';
  }

  get valid(): boolean {
    const minLength = this.getAttribute('minlength');
    const maxLength = this.getAttribute('maxlength');

    const validation = this.validateInput(this.#textareaElement!.value, {
      required: this.hasAttribute('required') || this.config.validation.required,
      minLength: minLength ? parseInt(minLength, 10) : 0,
      maxLength: maxLength ? parseInt(maxLength, 10) : this.config.validation.maxLength
    });

    return validation.valid;
  }

  focus(): void {
    if (this.#textareaElement) {
      this.#textareaElement.focus();
    }
  }

  blur(): void {
    if (this.#textareaElement) {
      this.#textareaElement.blur();
    }
  }

  protected override showThreatFeedback(patternId: string): void {
    if (!this.#threatContainer || !this.#textareaElement) return;

    this.#threatContainer.textContent = '';

    const msg = document.createElement('span');
    msg.className = 'threat-message';
    msg.textContent = this.getThreatLabel(patternId);

    const patternBadge = document.createElement('span');
    patternBadge.className = 'threat-badge';
    patternBadge.textContent = patternId;

    this.#threatContainer.appendChild(msg);
    this.#threatContainer.appendChild(patternBadge);

    void this.#threatContainer.offsetHeight;
    this.#threatContainer.classList.remove('hidden');
    this.#textareaElement.classList.add('threat');
    this.#textareaElement.setAttribute('aria-invalid', 'true');
  }

  protected override clearThreatFeedback(): void {
    if (!this.#threatContainer || !this.#textareaElement) return;
    this.#threatContainer.classList.add('hidden');
    this.#threatContainer.addEventListener('transitionend', () => {
      if (this.#threatContainer!.classList.contains('hidden')) {
        this.#threatContainer!.textContent = '';
      }
    }, { once: true });
    this.#textareaElement.classList.remove('threat');
    this.#textareaElement.removeAttribute('aria-invalid');
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#textareaElement) {
      this.#textareaElement.value = '';
    }
  }
}

customElements.define('secure-textarea', SecureTextarea);
