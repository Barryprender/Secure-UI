
import { SecureBaseComponent } from '../../core/base-component.js';

export class SecureSelect extends SecureBaseComponent {
  #selectElement: HTMLSelectElement | null = null;
  #labelElement: HTMLLabelElement | null = null;
  #errorContainer: HTMLDivElement | null = null;
  #instanceId: string = `secure-select-${Math.random().toString(36).substring(2, 11)}`;
  #validOptions: Set<string> = new Set();
  #optionsTransferred: boolean = false;
  #isMultiple: boolean = false;

  static get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'name',
      'label',
      'required',
      'multiple',
      'size',
      'value'
    ];
  }

  protected render(): DocumentFragment | HTMLElement | null {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'select-container';
    container.setAttribute('part', 'container');

    this.#isMultiple = this.hasAttribute('multiple');
    const label = this.getAttribute('label');
    if (label) {
      this.#labelElement = document.createElement('label');
      this.#labelElement.htmlFor = this.#instanceId;
      this.#labelElement.textContent = this.sanitizeValue(label);
      this.#labelElement.setAttribute('part', 'label');

      container.appendChild(this.#labelElement);
    }

    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'select-wrapper';
    selectWrapper.setAttribute('part', 'wrapper');

    this.#selectElement = document.createElement('select');
    this.#selectElement.id = this.#instanceId;
    this.#selectElement.className = 'select-field';
    this.#selectElement.setAttribute('part', 'select');

    this.#applySelectAttributes();
    this.#attachEventListeners();

    // Defer transferring options to allow light DOM to be fully parsed
    // This handles the case where the component is created before its children
    queueMicrotask(() => {
      this.#transferOptions();
    });

    selectWrapper.appendChild(this.#selectElement);
    container.appendChild(selectWrapper);

    // role="alert" already implies aria-live="assertive" — do not override with polite
    this.#errorContainer = document.createElement('div');
    this.#errorContainer.className = 'error-container hidden';
    this.#errorContainer.setAttribute('role', 'alert');
    this.#errorContainer.setAttribute('part', 'error');
    this.#errorContainer.id = `${this.#instanceId}-error`;
    container.appendChild(this.#errorContainer);

    this.addComponentStyles(this.#getComponentStyles());

    fragment.appendChild(container);

    return fragment;
  }

  #applySelectAttributes(): void {
    const config = this.config;
    const name = this.getAttribute('name');
    if (name) {
      this.#selectElement!.name = this.sanitizeValue(name);
    }

    if (!this.getAttribute('label') && name) {
      this.#selectElement!.setAttribute('aria-label', this.sanitizeValue(name));
    }

    this.#selectElement!.setAttribute('aria-describedby', `${this.#instanceId}-error`);

    if (this.hasAttribute('required') || config.validation.required) {
      this.#selectElement!.required = true;
      this.#selectElement!.setAttribute('aria-required', 'true');
    }

    if (this.hasAttribute('multiple')) {
      this.#selectElement!.multiple = true;
    }

    const size = this.getAttribute('size');
    if (size) {
      this.#selectElement!.size = parseInt(size, 10);
    }

    if (this.hasAttribute('disabled')) {
      this.#selectElement!.disabled = true;
    }

    if (!config.storage.allowAutocomplete) {
      this.#selectElement!.autocomplete = 'off';
    }
  }

  #transferOptions(): void {
    if (this.#optionsTransferred) return;
    this.#optionsTransferred = true;

    const options = Array.from(this.querySelectorAll('option'));
    if (options.length === 0) return;

    const selectedValues: string[] = [];

    options.forEach((option) => {
      const newOption = document.createElement('option');
      const value = option.getAttribute('value') || '';
      newOption.value = this.sanitizeValue(value);
      this.#validOptions.add(newOption.value);
      newOption.textContent = this.sanitizeValue(option.textContent || '');

      if (option.hasAttribute('selected')) {
        newOption.selected = true;
        selectedValues.push(newOption.value);
      }
      if (option.hasAttribute('disabled')) {
        newOption.disabled = true;
      }

      this.#selectElement!.appendChild(newOption);
    });

    // Attribute value takes precedence over the selected attribute on options.
    if (!this.#isMultiple) {
      const initialValue = this.getAttribute('value');
      if (initialValue) {
        this.#selectElement!.value = initialValue;
      } else if (selectedValues.length > 0) {
        this.#selectElement!.value = selectedValues[0];
      }
    }
  }

  #attachEventListeners(): void {
    this.#selectElement!.addEventListener('focus', () => {
      this.recordTelemetryFocus();
      this.audit('select_focused', {
        name: this.#selectElement!.name
      });
    });

    this.#selectElement!.addEventListener('change', (e: Event) => {
      this.recordTelemetryInput(e);
      this.#handleChange(e);
    });

    this.#selectElement!.addEventListener('blur', () => {
      this.recordTelemetryBlur();
      this.#validateAndShowErrors();
      this.audit('select_blurred', {
        name: this.#selectElement!.name,
        hasValue: this.#isMultiple
          ? this.#selectElement!.selectedOptions.length > 0
          : this.#selectElement!.value.length > 0
      });
    });
  }

  // Validates selected values against #validOptions to prevent value injection.
  #handleChange(_event: Event): void {
    if (this.#isMultiple) {
      const selectedValues = Array.from(this.#selectElement!.selectedOptions).map(opt => opt.value);
      const invalidValues = selectedValues.filter(v => v && !this.#validOptions.has(v));

      if (invalidValues.length > 0) {
        this.#showError('Invalid option selected');
        this.audit('invalid_option_detected', {
          name: this.#selectElement!.name,
          attemptedValues: invalidValues
        });
        return;
      }

      this.#clearErrors();
      this.audit('select_changed', { name: this.#selectElement!.name, values: selectedValues });
      this.dispatchEvent(new CustomEvent('secure-select-change', {
        detail: { name: this.#selectElement!.name, value: selectedValues, tier: this.securityTier },
        bubbles: true, composed: true
      }));
    } else {
      const selectedValue = this.#selectElement!.value;

      if (selectedValue && !this.#validOptions.has(selectedValue)) {
        this.#showError('Invalid option selected');
        this.audit('invalid_option_detected', {
          name: this.#selectElement!.name,
          attemptedValue: selectedValue
        });
        // Reset to empty value
        this.#selectElement!.value = '';
        return;
      }

      this.#clearErrors();
      this.audit('select_changed', { name: this.#selectElement!.name, value: selectedValue });
      this.dispatchEvent(new CustomEvent('secure-select-change', {
        detail: { name: this.#selectElement!.name, value: selectedValue, tier: this.securityTier },
        bubbles: true, composed: true
      }));
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

    const required = this.hasAttribute('required') || this.config.validation.required;

    if (this.#isMultiple) {
      const selectedValues = Array.from(this.#selectElement!.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');

      if (required && selectedValues.length === 0) {
        this.#showError('Please select at least one option');
        return;
      }

      const invalidValues = selectedValues.filter(v => !this.#validOptions.has(v));
      if (invalidValues.length > 0) {
        this.#showError('Invalid option selected');
        return;
      }
    } else {
      if (required && !this.#selectElement!.value) {
        this.#showError('Please select an option');
        return;
      }

      const selectedValue = this.#selectElement!.value;
      if (selectedValue && !this.#validOptions.has(selectedValue)) {
        this.#showError('Invalid option selected');
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
    this.#selectElement!.classList.add('error');
    this.#selectElement!.setAttribute('aria-invalid', 'true');
  }

  #clearErrors(): void {
    this.#errorContainer!.classList.add('hidden');
    this.#errorContainer!.addEventListener('transitionend', () => {
      if (this.#errorContainer!.classList.contains('hidden')) {
        this.#errorContainer!.textContent = '';
      }
    }, { once: true });
    this.#selectElement!.classList.remove('error');
    this.#selectElement!.removeAttribute('aria-invalid');
  }

  #getComponentStyles(): string {
    return new URL('./secure-select.css', import.meta.url).href;
  }

  protected handleAttributeChange(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.#selectElement) return;

    switch (name) {
      case 'disabled':
        this.#selectElement.disabled = this.hasAttribute('disabled');
        break;
      case 'value':
        if (newValue !== this.#selectElement.value) {
          this.#selectElement.value = newValue || '';
        }
        break;
    }
  }

  get value(): string | string[] {
    if (!this.#selectElement) return this.#isMultiple ? [] : '';

    if (this.#isMultiple) {
      return Array.from(this.#selectElement.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');
    }

    return this.#selectElement.value;
  }

  set value(value: string | string[]) {
    if (!this.#selectElement) return;

    if (this.#isMultiple) {
      const values = Array.isArray(value)
        ? value
        : value.split(',').map(v => v.trim()).filter(v => v !== '');
      Array.from(this.#selectElement.options).forEach(opt => { opt.selected = false; });
      values.forEach(v => {
        if (this.#validOptions.has(v)) {
          const opt = Array.from(this.#selectElement!.options).find(o => o.value === v);
          if (opt) opt.selected = true;
        }
      });
    } else {
      const str = Array.isArray(value) ? value[0] ?? '' : value;
      if (this.#validOptions.has(str)) {
        this.#selectElement.value = str;
      }
    }
  }

  get name(): string {
    return this.#selectElement ? this.#selectElement.name : '';
  }

  get selectedOptions(): string[] {
    if (!this.#selectElement) return [];
    return Array.from(this.#selectElement.selectedOptions).map(opt => opt.value);
  }

  get valid(): boolean {
    const required = this.hasAttribute('required') || this.config.validation.required;

    if (this.#isMultiple) {
      const selectedValues = Array.from(this.#selectElement!.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');
      if (required && selectedValues.length === 0) return false;
      return selectedValues.every(v => this.#validOptions.has(v));
    }

    if (required && !this.#selectElement!.value) {
      return false;
    }

    const selectedValue = this.#selectElement!.value;
    if (selectedValue && !this.#validOptions.has(selectedValue)) {
      return false;
    }

    return true;
  }

  focus(): void {
    if (this.#selectElement) {
      this.#selectElement.focus();
    }
  }

  blur(): void {
    if (this.#selectElement) {
      this.#selectElement.blur();
    }
  }

  addOption(value: string, text: string, selected: boolean = false): void {
    if (!this.#selectElement) return;

    const option = document.createElement('option');
    option.value = this.sanitizeValue(value);
    option.textContent = this.sanitizeValue(text);
    option.selected = selected;

    this.#validOptions.add(option.value);
    this.#selectElement.appendChild(option);
  }

  removeOption(value: string): void {
    if (!this.#selectElement) return;

    const options = Array.from(this.#selectElement.options);
    const option = options.find(opt => opt.value === value);

    if (option) {
      this.#selectElement.removeChild(option);
      this.#validOptions.delete(value);
    }
  }

  clearOptions(): void {
    if (!this.#selectElement) return;

    this.#selectElement.innerHTML = '';
    this.#validOptions.clear();
  }

  // #validOptions is intentionally NOT cleared on disconnect.
  // secure-form moves children into a <form>, triggering disconnect/reconnect;
  // clearing here would leave the set empty after reconnect, rejecting all selections.
  disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

customElements.define('secure-select', SecureSelect);
