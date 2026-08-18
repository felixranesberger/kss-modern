# Usage Guide

## Writing KSS Comments

KSS comment blocks live inside your CSS/SCSS files. Each block documents a section of your design system using standard block comments.

### Basic Structure

```scss
/*
Section Title

Description of this section.

Styleguide 1.1
*/
```

The `Styleguide` reference is the only required field. It defines the section's position in the hierarchy.

### Section Hierarchy

Sections are organized using dotted numeric references:

| Level | Reference | Usage |
|---|---|---|
| First level | `X` or `X.0` | Top-level category (e.g., "Settings", "Components") |
| Second level | `X.Y` | Individual page in the styleguide |
| Third level | `X.Y.Z` | Sub-section within a page |

First-level sections become categories in the sidebar. Second-level sections become pages. Third-level sections appear as sub-sections on their parent page.

```scss
/* Settings            — Styleguide 1     */
/* Colors              — Styleguide 1.1   */
/* Brand Colors        — Styleguide 1.1.1 */
/* Neutral Colors      — Styleguide 1.1.2 */
/* Typography          — Styleguide 1.2   */
```

### Weight (Sorting)

Control the display order of sections within the same level:

```scss
/*
Typography

Weight: 20

Styleguide 1.2
*/
```

Lower values appear first. Sections without a weight are sorted by their reference number.

---

## KSS Properties

### Markup

Define live HTML previews for components. The `Markup:` field accepts three formats:

**1. Inline HTML**

```scss
/*
Button

Markup: <button class="btn {{modifier_class}}">Click me</button>

Styleguide 2.1
*/
```

**2. Static `.html` file**

A bare path ending in `.html` is read from disk and inlined as-is.

```scss
/*
Badge

Markup: templates/source/components/badge.html

Styleguide 3.1
*/
```

**3. Static `.pug` file**

A bare path ending in `.pug` is compiled to HTML at build time.

```scss
/*
Tag

Markup: templates/source/components/tag.pug

Styleguide 3.2
*/
```

File paths are resolved relative to `contentDir`. Pug compilation runs in a Node.js worker thread pool sized to the available CPU cores. The `{{modifier_class}}` placeholder is replaced with each modifier's CSS class in the live previews.

In Pug you can place the modifier without writing the literal token: the global `modifierClass` variable defaults to `{{modifier_class}}`, so `.c-tabs(class=modifierClass)` compiles to `class="c-tabs {{modifier_class}}"`. The modifier applies to **every** element that carries it — including markup pulled in via `include` — so place `class=modifierClass` only on the elements that should react to the section's modifier. To embed a child in a fixed variant instead, pass it explicitly with `<insert-vite-pug src="child.pug" modifierClass="child--variant">`, which bakes the class at build time.

### Including Markup From Other Sections

Reference another section's markup with the `<insert-markup>` tag. Useful for composing examples without duplicating HTML.

| Form | Effect |
|---|---|
| `<insert-markup>4.95.10</insert-markup>` | Inline the markup of section `4.95.10` |
| `<insert-markup>4.95.10-</insert-markup>` | Identical to the bare reference (trailing dash, no index) |
| `<insert-markup>4.95.10-0</insert-markup>` | Inline the markup of section `4.95.10` and substitute every `{{modifier_class}}` with the name of the referenced section's `modifiers[0]` |

```scss
/*
Source Button

.button--primary - Primary variant

Markup: <button class="button {{modifier_class}}">Click me</button>

Styleguide 4.95.10
*/

/*
Primary Button In Context

Markup: <div class="container"><insert-markup>4.95.10-0</insert-markup></div>

Styleguide 4.95.20
*/
```

The cross-reference is resolved before Pug compilation, so an included section may itself reference Pug files or further `<insert-markup>` tags — nested includes work recursively.

If the referenced section does not exist, the modifier index is out of range, or a circular reference is detected, the build does not fail; an inline `<pre class="kss-modern-insert-markup-error">` block is rendered and a warning is logged to the console.

### Modifiers

Define CSS class variants. List them after the description, one per line — a dot-prefixed class followed by a dash and description:

```scss
/*
Button

A basic button component.

.btn--primary - Primary action button
.btn--danger - Destructive action button
.btn--outline - Outlined variant
.btn--large - Large size variant

Markup: <button class="btn {{modifier_class}}">Click me</button>

Styleguide 2.1
*/
```

Each modifier gets its own live preview iframe. Users can copy the class name with one click.

### Colors

Document color palettes with a clickable, copy-to-clipboard grid:

```scss
/*
Brand Colors

Colors:
color-primary: var(--color-primary)
color-primary-light: var(--color-primary-light)
color-accent: #E85D04
color-success: hsl(152deg 69% 40%)
color-warning: rgb(255, 200, 0)

Styleguide 1.1
*/
```

**Format:** `name: value`

**Supported color formats:** hex (`#fff`, `#ffffff`), CSS custom properties (`var(--color-*)`), `rgb()`/`rgba()`, `hsl()`/`hsla()`, named CSS colors.

### Icons

Document icon sets with a searchable gallery:

```scss
/*
Icons

Icons:
arrow-right: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
search: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/></svg>
home: <i class="icon-home"></i>

Styleguide 1.2
*/
```

**Format:** `name: <svg>...</svg>` or `name: <i class="..."></i>`

The gallery includes real-time search/filter and copies SVG content to clipboard on click.

### Markdown Descriptions

Use Markdown for rich descriptions — either inline or from an external file:

**Inline:**
```scss
/*
Card

Markdown: A flexible card component.

## Variants
- Default: neutral background
- Primary: branded surface color

Styleguide 3.1
*/
```

**External file** (path relative to `contentDir`):
```scss
/*
Buttons

Markdown: sass/02-elements/buttons.md

Styleguide 2.1
*/
```

#### Markdown Components

Custom block-level components are available inside Markdown content:

**Alert:**
```markdown
:::alert{type="warning" title="Breaking Change"}
The API for this component changed in v2.0.
:::
```
Types: `info`, `warning`, `error`

**Accordion:**
```markdown
:::accordion{title="Implementation Details"}
This component uses CSS Grid internally for layout.
:::
```
Set `open=true` to expand by default.

### Status

Mark sections with a development status badge displayed in the sidebar:

```scss
/*
Card

Status: Complete

Styleguide 3.1
*/
```

**Supported values:** `complete`, `in-progress`, `awaits-feedback`, `pending`

Sections with descriptions starting with `Deprecated:` or `Experimental:` are automatically tagged with those statuses.

### Figma

Embed Figma designs directly in the styleguide:

```scss
/*
Blockquote

Figma: https://embed.figma.com/design/YOUR_FILE_ID?node-id=123-456

Markup: <blockquote>Example</blockquote>

Styleguide 2.2
*/
```

When both `Figma` and `Markup` are present, the styleguide shows "Preview" and "Design" tabs. Figma embeds automatically switch between light and dark themes.

### Wrapper

Wrap component markup in a container element for the fullpage preview:

```scss
/*
Card

Wrapper: <div class="container" style="max-width: 400px">{{wrapper-content}}</div>

Markup: <div class="c-card">...</div>

Styleguide 3.1
*/
```

The `<wrapper-content/>` or `{{wrapper-content}}` placeholder is replaced with the component markup.

### HTML/Body Classes

Apply custom CSS classes to the `<html>` or `<body>` element of the fullpage (iframe) preview:

```scss
/*
Card

bodyclass: bg-neutral
htmlclass: theme-alternate

Markup: <div class="c-card">...</div>

Styleguide 3.1
*/
```

Useful for components that need a specific background color or theme context.

---

## Complete KSS Block Example

Here's a section using every available property:

```scss
/*
Card

Markdown: A flexible card component for displaying grouped content.

## Variants
- Default: neutral background
- Primary: branded surface color
- Outlined: border-only style

Status: Complete

bodyclass: bg-neutral

Figma: https://embed.figma.com/design/FILE_ID?node-id=123-456

.c-card--primary - Primary branded surface
.c-card--outlined - Border-only variant

Wrapper: <div style="max-width: 400px">{{wrapper-content}}</div>

Markup: templates/source/card.pug

Styleguide 3.10
*/

.c-card {
  /* component styles */
}
```

---

## Styleguide UI Features

### Search

Press `Cmd+K` (Mac) or `Ctrl+K` to open the global search dialog. Searches across all section titles and descriptions. Click a result to jump directly to that section.

### Theme Toggle

Three-way toggle: **System**, **Light**, **Dark**. The preference is persisted in `localStorage` across sessions. Figma embeds automatically reload with the matching theme.

### Accessibility Audit

Each component preview includes a **Code Audit** button that runs two checks in parallel:
- **axe-core** — WCAG compliance
- **html-validate** — HTML structure validation

Results are grouped by severity (violations, warnings, passes) with links to rule documentation.

### Accessibility Audit API (`window.kssAudit`)

The same audit is available programmatically on every preview page, for CI scripts, browser automation and AI agents. `window.kssAudit()` runs axe-core and html-validate inside **every** component preview on the page and resolves with a plain JSON object — no clicking, no dialog, no screenshots.

```js
const report = await window.kssAudit()
```

No readiness dance needed: the preview bundle is a deferred module script, so the API is installed before `DOMContentLoaded` — every normal navigation command (Playwright's `page.goto`, a browser tool's `navigate`) already waits at least that long. The audit itself then waits for the preview iframes to finish rendering.

Only code that evaluates *during* page load, before `DOMContentLoaded`, can arrive too early. For that case, poll for the function itself:

```js
await page.waitForFunction(() => typeof window.kssAudit === 'function')
```

#### Options

```js
await window.kssAudit({
  sections: ['3.10', '3.20'], // default: all sections on the page
  include: 'violations',      // 'violations' (default) | 'all'
  modifiers: true,            // default: also audit modifier previews
  timeout: 30000,             // per-iframe timeout in ms, default: 30000
})
```

| Option | Effect |
|---|---|
| `sections` | Restrict the run. Accepts KSS references (`'3.10'`), dashed ids (`'3-10'`) or DOM ids (`'section-3-10'`). References that match nothing come back in `unmatchedSections` instead of failing the run. |
| `include` | `'violations'` reports violations and incomplete ("needs review") — the actionable groups. `'all'` adds passes and inapplicable, which is many times larger. Counts always cover all four groups regardless. |
| `modifiers` | Modifier previews are pure class swaps, so only their color-contrast is re-checked. Set to `false` to skip them on pages with many modifiers. |
| `timeout` | How long one preview may take before it is reported as `"status": "failed"`. Raise it on slow CI machines. |

#### Report shape

```jsonc
{
  "generatedAt": "2026-08-12T09:12:44.201Z",
  "page": { "url": "http://localhost:3000/preview-3.10.html", "title": "Card" },
  "options": { "include": "violations", "modifiers": true },
  "totals": { "sections": 4, "failed": 0, "violations": 3, "incomplete": 1 },
  "sections": [
    {
      "reference": "3.10",
      "header": "Card",
      "url": "http://localhost:3000/fullpage-3.10.html",
      "sourceFile": "css/03-components/card.css",
      "sourceLine": 43,
      "markupFile": "templates/source/03-components/card.pug",
      "status": "audited",
      "counts": { "violations": 2, "incomplete": 1, "passes": 61, "inapplicable": 42 },
      "findings": [
        {
          "source": "axe",
          "group": "violations",
          "id": "color-contrast",
          "impact": "serious",
          "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
          "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/color-contrast",
          "mode": "dark",
          "modifier": ".c-card--primary",
          "nodes": [
            {
              "target": ".c-card--primary .c-card__title",
              "html": "<h3 class=\"c-card__title\">Title</h3>",
              "failureSummary": "Fix any of the following: Element has insufficient color contrast of 2.4:1",
              "measured": { "ratio": 2.4, "required": 4.5, "passed": false }
            }
          ]
        }
      ]
    }
  ]
}
```

Every finding carries the context needed to act on it without a second lookup:

- **`sourceFile` / `sourceLine` / `markupFile`** — the section's KSS comment and template, so a violation maps straight onto a file to edit. Paths are relative to `contentDir`.
- **`mode`** — the color scheme a theme-dependent finding was produced under (`light` or `dark`).
- **`modifier`** — set when the finding comes from a modifier variant rather than the base preview.
- **`measured` / `reviewReason`** — for text over background images, either the measured contrast ratio or the concrete reason it still needs a manual review.
- **`source`** — `axe` for WCAG rules, `html-validate` for HTML structure; html-validate findings additionally carry `line` / `column` within the rendered preview document.

#### What the report does and does not cover

- One page at a time. A styleguide renders one page per second-level section, so automation iterates the pages linked in the sidebar and audits each.
- A preview whose iframe never answers is reported as `"status": "failed"` with an `error` — the remaining sections still get audited, and `totals.failed` says how many are missing.
- A modifier preview that fails is downgraded to an entry in the section's `warnings`, so partial coverage is never silent.
- The `region` and `landmark-one-main` rules are disabled: a component preview is a fragment, not a document, and would fail both by construction.
- Styling switched purely via `@media (prefers-color-scheme: dark)` cannot be flipped at runtime and is therefore only evaluated in its light appearance. Themes built on `light-dark()` or `color-scheme` are audited in both.

#### Driving it from automation

```js
// Playwright
await page.goto('/preview-3.10.html')
const report = await page.evaluate(() => window.kssAudit())

const blocking = report.sections
  .flatMap(section => section.findings.map(finding => ({ ...finding, file: section.sourceFile })))
  .filter(finding => finding.group === 'violations')
```

The report is deliberately free of `Map`s and DOM references, so it survives `page.evaluate`, CDP-based browser tools and `JSON.stringify` unchanged.

### Open in Editor

When `launchInEditor` is configured, each component shows links to open its source CSS/SCSS file and Pug template directly in **VSCode** or **PHPStorm**. Switch between editors via the header dropdown.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Open search |
| `Arrow Left` | Previous page |
| `Arrow Right` | Next page |

### Copy to Clipboard

Everything is one click away:
- **Color swatches** — copies the color value
- **Icons** — copies the SVG/HTML markup
- **Code blocks** — copies the component markup
- **Modifier classes** — copies the CSS class name
