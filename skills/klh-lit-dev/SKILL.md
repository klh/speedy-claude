---
name: klh-lit-dev
description: Use when creating Lit web components with TypeScript decorators, JSDoc documentation, Zod validation, and Playwright testing. Use for building reusable web components, design systems, or shareable UI elements that work across frameworks.
---

# Lit Web Components

> Part of [klh/skills](https://github.com/klh/skills) — personal agent skills by [Klaus L. Hougesen](https://github.com/klh).
> Install: `npx skills add klh/skills --skill klh-lit-dev`

## Tech Stack

| Tool | Purpose | Version |
|------|---------|---------|
| **Lit** | Web component library | Latest (`lit`) |
| **TypeScript** | Type-safe development | Latest |
| **Zod** | Schema validation & type inference | Latest |
| **Playwright** | E2E/component testing | Latest (`@playwright/test`) |
| **ESLint** | Linting | Latest with Lit configs |
| **Turborepo** | Monorepo build system | Latest |
| **pnpm** | Package management | Latest (strict peer dependencies) |

**Setup commands:**
```bash
pnpm create turbo@latest  # or pnpm init
pnpm add lit zod @playwright/test
pnpm add -D typescript @types/node eslint eslint-plugin-lit
```

## Overview

Lit is a lightweight library (~5KB) for building fast, standards-based web components. At its core: reactive state, scoped styles, and declarative templates via tagged template literals.

**Core principle:** Every Lit component is a standard web component—interoperable across any framework or vanilla HTML.

## When to Use

- When creating Lit web components with TypeScript decorators, JSDoc documentation, Zod validation, and Playwright testing
- When building reusable web components, design systems, or shareable UI elements that work across frameworks

## Component Structure Pattern

Follow this 7-point pattern for every Lit component:

```
components/
  my-component/
    my-component.ts          # Component definition
    my-component.zod.ts      # Zod schemas + TS types
    my-component.spec.tsx    # Playwright tests
    fixtures/
      basic.html             # Fixture for testing
      interactive.html
    index.ts                 # Barrel export
  index.ts                   # Root barrel export
```

### 1. Component Directory Structure

Each component gets its own directory under `components/`:

```bash
mkdir -p components/my-component/fixtures
touch components/my-component/my-component.ts
touch components/my-component/my-component.zod.ts
touch components/my-component/my-component.spec.tsx
touch components/my-component/fixtures/basic.html
touch components/my-component/index.ts
```

### 2. Barrel Exports

Each component exports via `index.ts`:

```typescript
// components/my-component/index.ts
export { MyComponent } from './my-component.js';
export type { MyComponentProps } from './my-component.zod.js';
```

Root re-exports all components:

```typescript
// components/index.ts
export * from './my-component/index.js';
export * from './another-component/index.js';
```

### 3. Component Definition with Decorators

```typescript
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { MyComponentProps } from './my-component.zod.js';

/**
 * A brief component description.
 *
 * @fires {CustomEvent<{value: string}>} change - Dispatched when value changes
 * @cssprop [--primary-color=#005fcc] - Primary accent color
 * @slot - Default slot for content
 */
@customElement('my-component')
export class MyComponent extends LitElement {
  /** Public API property */
  @property({ type: String, reflect: true })
  value: string = '';

  /** Internal reactive state */
  @state()
  private _isEditing = false;

  render() {
    return html`
      <input
        type="text"
        .value=${this.value}
        @input=${this._handleInput}
        aria-label="${ifDefined(this.value || undefined)}"
      />
    `;
  }

  private _handleInput(e: InputEvent) {
    const target = e.target as HTMLInputElement;
    this.value = target.value;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }
}
```

### 4. Zod Schemas + TypeScript Types

```typescript
// components/my-component/my-component.zod.ts
import { z } from 'zod';

/** Schema for my-component properties */
export const myComponentPropsSchema = z.object({
  /** The current value */
  value: z.string().default(''),
  /** Maximum length */
  maxlength: z.number().int().positive().optional(),
});

/** Schema for change event detail */
export const myComponentChangeSchema = z.object({
  value: z.string(),
});

/** Infer TypeScript types from Zod schemas */
export type MyComponentProps = z.infer<typeof myComponentPropsSchema>;
export type MyComponentChange = z.infer<typeof myComponentChangeSchema>;

/** Runtime validator */
export function validateMyComponentProps(props: unknown): MyComponentProps {
  return myComponentPropsSchema.parse(props);
}
```

### 5. Playwright Tests Fixtures

**Fixture HTML (served via http-server/vite):**

```html
<!-- components/my-component/fixtures/basic.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Component Fixture</title>
  <script type="module" src="../../../test-helpers.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui; }
    my-component { display: block; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Basic Usage</h1>
  <my-component id="basic"></my-component>

  <h1>With Initial Value</h1>
  <my-component id="with-value" value="Hello"></my-component>

  <h1>Event Logging</h1>
  <my-component id="events"></my-component>
  <pre id="log"></pre>
</body>
</html>
```

**Playwright Test:**

```typescript
// components/my-component/my-component.spec.tsx
import { test, expect } from '@playwright/test';

test.describe('my-component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/my-component/fixtures/basic.html');
  });

  test('renders initial value', async ({ page }) => {
    const component = page.locator('#with-value');
    await expect(component).toHaveAttribute('value', 'Hello');
    const input = component.locator('input');
    await expect(input).toHaveValue('Hello');
  });

  test('dispatches change event on user input', async ({ page }) => {
    const component = page.locator('#events');
    const input = component.locator('input');
    await input.fill('test value');

    const event = await page.evaluate((el) => {
      return new Promise((resolve) => {
        el.addEventListener('change', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    }, await component.elementHandle());

    expect(event).toEqual({ value: 'test value' });
  });
});
```

### 6. Comprehensive JSDoc Documentation

Required JSDoc tags for components:

```typescript
/**
 * One-line component description.
 *
 * Longer description explaining purpose and usage.
 *
 * @tag my-component
 * @fires {CustomEvent<MyComponentChange>} change - Dispatched when value changes
 * @cssprop [--my-component-size=300px] - Component width
 * @slot default - Content between tags
 * @slot prefix - Content before main content
 */
```

### 7. Test Server Setup

For Playwright to access fixtures, serve them via:

**Playwright config:**
```typescript
// playwright.config.ts
export default defineConfig({
  use: { baseURL: 'http://localhost:8080' },
  webServer: {
    command: 'npx http-server . -p 8080 --cors -c-1',
    port: 8080,
    reuseExisting: true,
  },
});
```

## Quick Reference

| Decorator | Purpose | Options |
|-----------|---------|---------|
| `@customElement('name')` | Register element | - |
| `@property()` | Public reactive property | `type`, `attribute`, `reflect`, `converter` |
| `@state()` | Internal reactive state | `hasChanged` |
| `@query()` | Query shadow DOM | - |
| `@queryAll()` | Query all matches | - |
| `@queryAsync()` | Query with async resolution | - |
| `@queryAssignedElements()` | Query slotted elements | `slot`, `flatten`, `selector` |
| `@queryAssignedNodes()` | Query slotted nodes | `slot`, `flatten` |

## Property Options

```typescript
@property({
  type: String,           // String, Number, Boolean, Array, Object
  attribute: 'my-attr',   // Custom attr name, or false for no attr
  reflect: true,          // Reflect property to attribute
  converter: {            // Custom conversion
    fromAttribute: (val) => val,
    toAttribute: (val) => val,
  },
  hasChanged: (new, old) => new !== old,  // Custom change detection
})
```

## Template Expressions

| Type | Syntax | Example |
|------|--------|---------|
| Child | `${value}` | `html`<div>${name}</div>` |
| Attribute | `attr="${value}"` | `html`<div class="${activeClass}">` |
| Boolean | `?attr="${value}"` | `html`<div ?hidden="${!show}">` |
| Property | `.prop="${value}"` | `html`<input .value="${val}">` |
| Event | `@event="${handler}"` | `html`<button @click="${handler}">` |

**Removing content/attributes:**
```typescript
import { nothing, ifDefined } from 'lit';

html`<div>${this.value ?? nothing}</div>`           // Remove child
html`<button aria-label="${this.label || nothing}">`  // Remove attribute
html`<img src="/images/${ifDefined(this.path)}">`     // ifDefined = value ?? nothing
```

## Template Directives

All directives are tree-shakable - import only what you use.

```typescript
// Conditionals
import { when, choose } from 'lit/directives/when.js';

html`${when(this.loading,
  () => html`Loading...`,
  () => html`<slot></slot>`
)}`
html`${choose(this.view, [
  ['list', () => html`<list-view>`],
  ['grid', () => html`<grid-view>`]
], () => html`<not-found>`)}`

// Lists - use map for simple cases, repeat for reordering
import { repeat } from 'lit/directives/repeat.js';

html`${repeat(this.items, (i) => i.id, (i) => html`<li>${i.name}</li>`)}`  // with keys
html`${this.items.map(i => html`<li>${i.name}</li>`)}`  // simpler, no diffing

// Dynamic classes/styles
import { classMap, styleMap } from 'lit/directives/class-map.js';

html`<div class="${classMap({ active: this.isActive })}">`
html`<div style="${styleMap({ '--color': this.color })}">`

// Performance & caching
import { cache, guard, live } from 'lit/directives/cache.js';
import { guard } from 'lit/directives/guard.js';
import { live } from 'lit/directives/live.js';

html`${cache(this.viewA ? expensiveA() : expensiveB())}`  // cache DOM
html`${guard([this.dep], () => computeExpensive())}`  // only recompute when deps change
html`<input .value=${live(this.value)}>`  // sync with live DOM value

// DOM references
import { ref, createRef } from 'lit/directives/ref.js';

private _input = createRef();
html`<input ${ref(this._input)}>`
```

## Async Tasks (@lit/task)

For managing async data with proper state tracking:

```typescript
import { Task, TaskStatus } from '@lit/task';

class MyElement extends LitElement {
  @property() productId?: string;

  private _productTask = new Task(this, {
    task: async ([productId], {signal}) => {
      const response = await fetch(`http://example.com/product/${productId}`, {signal});
      if (!response.ok) throw new Error(response.status);
      return response.json() as Product;
    },
    args: () => [this.productId]
  });

  render() {
    return this._productTask.render({
      pending: () => html`<p>Loading...</p>`,
      complete: (product) => html`<h1>${product.name}</h1>`,
      error: (e) => html`<p>Error: ${e}</p>`
    });
  }
}
```

Task states: `INITIAL`, `PENDING`, `COMPLETE`, `ERROR`.

## Signals (@lit-labs/signals)

For shared observable state (TC39 Signals Proposal):

```typescript
import { SignalWatcher, watch, signal } from '@lit-labs/signals';

// Create shared signal
const count = signal(0);

@customElement('shared-counter')
export class SharedCounter extends SignalWatcher(LitElement) {
  render() {
    return html`
      <p>Count: ${watch(count)}</p>
      <button @click=${() => count.set(count.get() + 1)}>+</button>
    `;
  }
}
```

## Mixins

For "is-a" composition (adding behavior to class prototype):

```typescript
import { LitElement } from 'lit';
type Constructor<T = {}> = new (...args: any[]) => T;

// Define mixin
export const MyMixin = <T extends Constructor<LitElement>>(superClass: T) => {
  class MyMixinClass extends superClass {
    @property() mode = 'on';

    connectedCallback() {
      super.connectedCallback();
      // Mixin behavior
    }
  };
  return MyMixinClass as T & Constructor<{ mode: string }>;
};

// Apply mixin
@customElement('my-element')
export class MyElement extends MyMixin(LitElement) {
  // Has .mode property from mixin
}
```

**Important:** In TypeScript, declare a class then return it - don't use class expressions directly with decorators.

## Controllers

For "has-a" composition (reusable logic with own identity):

```typescript
import { ReactiveController, ReactiveControllerHost } from 'lit';

class ResizeController implements ReactiveController {
  private _observer?: ResizeObserver;

  constructor(private host: ReactiveControllerHost, private target: HTMLElement) {
    host.addController(this);
  }

  hostConnected() {
    this._observer = new ResizeObserver(() => this.host.requestUpdate());
    this._observer.observe(this.target);
  }

  hostDisconnected() {
    this._observer?.disconnect();
  }
}

// Usage
@customElement('my-component')
export class MyComponent extends LitElement {
  private _resize = new ResizeController(this, this);
}
```

**Controller lifecycle:** `hostConnected()`, `hostUpdate()`, `hostUpdated()`, `hostDisconnected()`

## Custom Directives

For stateful, DOM-accessing template extensions:

```typescript
import { Directive, directive, AsyncDirective } from 'lit/directive.js';

// Simple directive
class HelloDirective extends Directive {
  render() {
    return `Hello!`;
  }
}
const hello = directive(HelloDirective);

// Async directive
class AsyncDataDirective extends AsyncDirective {
  render(promise: Promise<unknown>) {
    Promise.resolve(promise).then((value) => {
      this.setValue(value);  // Update outside render cycle
    });
    return `Loading...`;
  }

  disconnected() {
    // Cleanup resources
  }

  reconnected() {
    // Restore after disconnection
  }
}
export const asyncData = directive(AsyncDataDirective);
```

## Shadow DOM & Slots

**Query decorators:**
```typescript
@query('input') _input!: HTMLInputElement;
@queryAll('button') _buttons!: NodeListOf<HTMLButtonElement>;
@queryAsync('.heavy') _heavy!: Promise<HTMLElement>;
@queryAssignedElements({ slot: 'items', selector: '.item' }) _items!: Array<HTMLElement>;
@queryAssignedNodes({ slot: 'header', flatten: true }) _header!: Array<Node>;
```

**Slot patterns:**
```typescript
// Default slot
html`<div><slot></slot></div>`

// Named slot
html`<div><slot name="header"></slot></div>`
// Usage: <span slot="header">Title</span>

// Slot with fallback
html`<slot>No children provided</slot>`

// Access slotted content
get slottedChildren() {
  const slot = this.shadowRoot?.querySelector('slot');
  return slot?.assignedElements({ flatten: true }) ?? [];
}
```

## Scoped Styles

```typescript
static styles = css`
  :host {
    display: block;
    --primary-color: #005fcc;
  }

  :host([hidden]) {
    display: none;
  }

  * {
    box-sizing: border-box;
  }

  ::slotted(*) {
    margin: 8px;
  }
`;
```

## TypeScript Config

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mutating array property doesn't update | Use immutable pattern: `this.items = [...this.items, newItem]` |
| Forgetting `composed: true` on events | Events won't escape shadow DOM |
| Boolean prop defaulting to `true` | Can't be set to false from markup; use inverted name |
| Using `map` when list reorders | Use `repeat` with keys for stable DOM on reordering |
| Changing `literal` values frequently | Causes full re-render; only use for static values |

## Event Dispatching Pattern

```typescript
private _dispatchChange(detail: MyComponentChange) {
  this.dispatchEvent(new CustomEvent('change', {
    detail,
    bubbles: true,      // Allow event delegation
    composed: true,     // Escape shadow DOM
  }));
}
```

## Lifecycle Methods

```typescript
import { PropertyValues } from 'lit';

// Constructor - set defaults, NOT reactive
constructor() {
  super();
  this.value = '';
}

// Connected - add external listeners
override connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._handleResize);
}

// Disconnected - cleanup
override disconnectedCallback() {
  window.removeEventListener('resize', this._handleResize);
  super.disconnectedCallback();
}

// Will update - compute derived state
override willUpdate(changed: PropertyValues) {
  super.willUpdate(changed);
  if (changed.has('firstName') || changed.has('lastName')) {
    this._fullName = `${this.firstName} ${this.lastName}`;
  }
}

// First updated - one-time DOM setup
override async firstUpdated(changed: PropertyValues) {
  super.firstUpdated(changed);
  this._input?.focus();
}

// Updated - post-render work
override updated(changed: PropertyValues) {
  super.updated(changed);
  if (changed.has('active')) {
    this._animateHeight();
  }
}
```

## Context (Dependency Injection)

```typescript
import { createContext, provide, consume } from '@lit/context';

export const loggerContext = createContext<Logger>(Symbol('logger'));

// Provider
@customElement('my-app')
export class MyApp extends LitElement {
  @provide({context: loggerContext})
  @property({attribute: false})
  logger = new ConsoleLogger();
}

// Consumer
@customElement('my-component')
export class MyComponent extends LitElement {
  @consume({context: loggerContext})
  @property({attribute: false})
  logger?: Logger;
}
```

## Lit Labs (Experimental Packages)

**@lit-labs scope packages under active development:**

| Package | Purpose |
|---------|---------|
| `signals` | TC39 Signals Proposal integration |
| `ssr` | Server-side rendering |
| `virtualizer` | Viewport virtualization |
| `motion` | Animation helpers |
| `observers` | Reactive controllers for platform observers |
| `testing` | Testing utilities including SSR fixtures |

**Note:** Breaking changes more likely. Projects graduate to `@lit` scope when stable.

## Static HTML (lit/static-html.js)

For dynamic tag/attribute names (rare, use sparingly):

```typescript
import { html, literal, unsafeStatic } from 'lit/static-html.js';

class MyButton extends LitElement {
  tag = literal`button`;  // Changes cause full re-render

  render() {
    // Safe: developer-controlled strings only
    return html`<${this.tag} class="btn">Click</${this.tag}>`;
  }
}
```

**⚠️ `unsafeStatic()` must only receive trusted, developer-controlled content - XSS risk otherwise.**

## Project Configuration Files

### package.json (root of monorepo)

```json
{
  "name": "lit-design-system",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@types/node": "latest",
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    "eslint": "latest",
    "eslint-plugin-lit": "latest",
    "turbo": "latest",
    "typescript": "latest"
  },
  "dependencies": {
    "lit": "latest",
    "zod": "latest"
  },
  "packageManager": "pnpm@latest"
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'components/*'
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  },
  "include": ["packages", "components"],
  "references": []
}
```

### eslint.config.js (flat config)

```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import lit from 'eslint-plugin-lit';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      }
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-member-accessibility': 'error',
    }
  },
  {
    files: ['**/*.ts'],
    plugins: { lit },
    rules: {
      ...lit.configs['flat/recommended'].rules,
      'lit/no-legacy-template-syntax': 'error',
      'lit/no-property-change-update': 'error'
    }
  }
];
```

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './**/*.spec.tsx',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx http-server . -p 8080 --cors -c-1',
    port: 8080,
    reuseExisting: true,
  },
});
```

### Component package.json (per component)

```json
{
  "name": "@my-design-system/button",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/button.js",
  "module": "./dist/button.js",
  "types": "./dist/button.d.ts",
  "exports": {
    ".": {
      "import": "./dist/button.js",
      "types": "./dist/button.d.ts"
    },
    "./button.js": {
      "import": "./dist/button.js",
      "types": "./dist/button.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "playwright test",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "lit": "^3.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "typescript": "latest"
  }
}
```

### Component tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["*.ts"],
  "references": [
    { "path": "../other-component" }
  ]
}
```

### Vite config (for dev server)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    strictPort: true,
  },
  build: {
    lib: {
      entry: './components/index.ts',
      formats: ['es'],
    },
  },
});
```

## Integration with Other Skills

- **klh-core-components** — use core component patterns when building Lit-based design systems
- **klh-testing-patterns** — apply testing patterns for Lit component test suites
- **klh-zod-validation** — validate component properties and form data with Zod schemas
