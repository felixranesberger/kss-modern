# The styleguide UI

Everything on this page happens in the browser of whoever opens the styleguide. None of it needs configuration unless stated.

## Navigation

The sidebar lists every category and page. Pages with a `Status:` show a colored dot. The **Previous** and **Next** links at the bottom of each page follow the sidebar order.

| Shortcut | Action |
|---|---|
| <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> | Open search |
| <kbd>←</kbd> | Previous page |
| <kbd>→</kbd> | Next page |

## Search

Search looks through the titles and descriptions of all sections with fuzzy matching. Results are grouped by category, and tabs at the top narrow them to one category. A result that matches a subsection jumps straight to it.

![The search dialog](screenshots/search.png)

## Previews

Each preview is an iframe with the section's markup and your preview assets. Below it you find:

- **Show code** with the highlighted markup. In production builds it is formatted with Biome.
- **Copy** to copy the markup.
- **Audit** to run the [accessibility audit](accessibility-audit.md) for this preview.
- A link that opens the preview on its own page.

Sections with modifiers show one extra preview per modifier, each with the class name next to its title. Clicking the class name copies it.

Standalone preview pages accept two query parameters. `?modifier=.btn--ghost` applies a modifier and `?theme=theme-dusk` applies a theme. The links in the styleguide set both automatically.

## Color scheme

The toggle in the header switches between **System**, **Light** and **Dark**. The choice is stored in the visitor's browser.

The toggle sets `color-scheme` on every preview, so previews built on `light-dark()` or the `color-scheme` property follow along. Styles that only react to `@media (prefers-color-scheme: dark)` follow the operating system instead, since a page can't override that media query. Figma embeds reload with the matching theme.

`deactivateDarkMode: true` hides the toggle.

## Themes

Preview themes let visitors see components in another context, such as a brand variant. There are two dropdowns.

The **global dropdown** in the header appears when the configuration declares [`previewThemes`](configuration.md#previewthemes). It applies the theme to every preview on every page.

A **section dropdown** appears above the previews of a section with a [`Themes:`](writing-sections.md#themes) property. It overrides the global choice for that section only. Setting it back to **Default** hands the section back to the global theme.

Both work the same way. The theme's classes are added to the `<html>` element of each preview, and its stylesheets, if any, are switched on. The styleguide UI itself never receives the classes. Both choices are stored in the visitor's browser, and the links to standalone previews carry them as `?theme=`.

![The pricing pattern in the Ocean theme](screenshots/theme-ocean.png)

## Copy to clipboard

Swatches in a `Colors:` block copy their value, icons in an `Icons:` gallery copy their markup, and the Copy button copies a preview's markup. Modifier class names copy the class.

## Open in editor

With [`launchInEditor`](configuration.md#launchineditor) set and `mode: 'development'`, every section links to its CSS file and its template. The header lets visitors choose between VS Code and PhpStorm.
