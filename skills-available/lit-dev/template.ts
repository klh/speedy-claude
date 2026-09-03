/**
 * Template for creating new Lit components with Zod validation
 * Copy this file to start a new component
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { when } from 'lit/directives/when.js';
import type { ComponentNameProps } from './component-name.zod.js';
import { componentNamePropsSchema } from './component-name.zod.js';

/**
 * Brief component description.
 *
 * @element component-name
 *
 * @fires {CustomEvent<{value: string}>} change - Dispatched when value changes
 * @fires {CustomEvent<void>} open - Dispatched when dropdown opens
 *
 * @cssprop [--component-size=300px] - Component width
 * @cssprop [--component-color=#333] - Text color
 *
 * @slot default - Default content
 * @slot prefix - Content before main content
 *
 * @example
 * ```html
 * <component-name value="initial">
 *   <span slot="prefix">$</span>
 * </component-name>
 * ```
 */
@customElement('component-name')
export class ComponentName extends LitElement {
  // ========== Properties (Public API) ==========

  /** The current value */
  @property({ type: String, reflect: true })
  value: string = '';

  /** Maximum length */
  @property({ type: Number, attribute: 'maxlength' })
  maxlength?: number;

  /** Disabled state */
  @property({ type: Boolean, reflect: true })
  disabled = false;

  /** Variant for styling */
  @property({ type: String, reflect: true })
  variant: 'primary' | 'secondary' = 'primary';

  // ========== State (Internal) ==========

  @state()
  private _isOpen = false;

  @state()
  private _focused = false;

  // ========== Queries ==========

  @query('input')
  private _input!: HTMLInputElement;

  // ========== Styles ==========

  static styles = css`
    :host {
      display: inline-block;
      --component-size: 300px;
      --component-color: #333;
      --component-bg: #fff;
      --component-border: #ccc;
    }

    :host([disabled]) {
      opacity: 0.6;
      pointer-events: none;
    }

    .wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wrapper.primary {
      --component-bg: #e3f2fd;
      --component-border: #2196f3;
    }

    .wrapper.secondary {
      --component-bg: #f5f5f5;
      --component-border: #9e9e9e;
    }

    input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--component-border);
      border-radius: 4px;
      background: var(--component-bg);
      color: var(--component-color);
      font: inherit;
    }

    input:focus {
      outline: 2px solid var(--component-border);
      outline-offset: 2px;
    }

    ::slotted([slot="prefix"]) {
      color: var(--component-color);
    }

    ::slotted(*) {
      margin: 4px;
    }
  `;

  // ========== Lifecycle ==========

  override async firstUpdated() {
    await this.updateComplete;
    // Safe to query DOM here
  }

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('value')) {
      // Compute derived state before render
    }
  }

  // ========== Render ==========

  render() {
    return html`
      <div class="wrapper ${classMap({ [this.variant]: true })}">
        <slot name="prefix"></slot>
        <input
          type="text"
          .value=${this.value}
          .disabled=${this.disabled}
          .maxLength=${this.maxlength ?? Number.MAX_SAFE_INTEGER}
          @input=${this._handleInput}
          @focus=${this._handleFocus}
          @blur=${this._handleBlur}
          aria-label="${this.value || 'Empty'}"
          aria-disabled="${this.disabled}"
        />
        <slot></slot>
        ${when(
          this._isOpen,
          () => html`<div class="dropdown">Dropdown content</div>`,
        )}
      </div>
    `;
  }

  // ========== Event Handlers ==========

  private _handleInput(e: InputEvent) {
    const target = e.target as HTMLInputElement;
    this.value = target.value;

    this._dispatchChange({ value: this.value });
  }

  private _handleFocus() {
    this._focused = true;
  }

  private _handleBlur() {
    this._focused = false;
    this._isOpen = false;
  }

  // ========== Event Dispatching ==========

  private _dispatchChange(detail: ComponentNameProps) {
    const validated = componentNamePropsSchema.parse(detail);
    this.dispatchEvent(new CustomEvent('change', {
      detail: validated,
      bubbles: true,
      composed: true,
    }));
  }

  private _dispatchOpen() {
    this.dispatchEvent(new CustomEvent('open', {
      bubbles: true,
      composed: true,
    }));
  }

  // ========== Public Methods ==========

  /** Focuses the input element */
  focus() {
    this._input?.focus();
  }

  /** Selects all text */
  select() {
    this._input?.select();
  }
}
