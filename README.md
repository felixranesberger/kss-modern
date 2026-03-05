# kss-modern

A modern, KSS-compatible styleguide generator. Parses KSS comment blocks from CSS/SCSS files and generates a static, accessible styleguide with live component previews.

## Features

- KSS-compatible comment parsing from CSS/SCSS files
- Live component previews with modifier variants
- Pug template support via worker thread pool
- Color palette and icon gallery documentation
- Figma embed integration with light/dark theme sync
- Accessibility auditing (axe-core) and HTML validation
- Markdown descriptions with custom components (alerts, accordions)
- Dark mode with three-way toggle (System/Light/Dark)
- Global search, keyboard navigation, and "Open in Editor" links
- Watch mode with smart rebuild (only on KSS comment changes)

## Installation

```bash
npm install kss-modern
```

## Quick Start

```ts
import { buildStyleguide } from 'kss-modern'

await buildStyleguide({
  mode: 'production',
  outDir: './styleguide',
  contentDir: './src/sass/',
  projectTitle: 'My Design System',
  theme: '#005075',
  html: {
    lang: 'en',
    assets: {
      css: [{ src: '/css/styles.css' }],
      js: [],
    },
  },
})
```

This scans all `.css` and `.scss` files in `contentDir` for KSS comment blocks and generates a complete static styleguide in `outDir`.

## Documentation

- **[Setup Guide](docs/setup.md)** — Installation, configuration reference, watch mode, project structure, and API reference
- **[Usage Guide](docs/usage.md)** — Writing KSS comments, all available properties (markup, modifiers, colors, icons, Markdown, Figma, status, etc.), and styleguide UI features
- **[Changelog](CHANGELOG.md)** — Version history and release notes

## Basic KSS Example

```scss
/*
Button

A basic button component.

.btn--primary - Primary action button
.btn--outline - Outlined variant

Markup: <button class="btn {{modifier_class}}">Click me</button>

Styleguide 2.1
*/

.btn { /* styles */ }
```

## Development

```bash
bun install
bun run build          # Build: Vite (client assets) then Unbuild (Node.js library)
bun run dev            # Build + run dev server with Deno (watches test/ content)
bun run lint           # ESLint
bun run test           # Vitest unit + integration tests
bun run release        # Lint + version bump via bumpp
```

## License

MIT
