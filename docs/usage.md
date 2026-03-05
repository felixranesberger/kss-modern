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

Define live HTML previews for components. Supports raw HTML or Pug templates:

```scss
/*
Button

Markup: <button class="btn {{modifier_class}}">Click me</button>

Styleguide 2.1
*/
```

With Pug templates:

```scss
/*
Card

Markup: <insert-vite-pug src="templates/source/card.pug" modifierClass="{{modifier_class}}"></insert-vite-pug>

Styleguide 3.1
*/
```

The `src` path is relative to `contentDir`. Pug templates are compiled via a worker thread pool.

The `{{modifier_class}}` placeholder is replaced with each modifier's CSS class in the live previews.

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

Markup: <insert-vite-pug src="templates/source/card.pug" modifierClass="{{modifier_class}}"></insert-vite-pug>

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
