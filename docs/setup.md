# Setup Guide

## Installation

```bash
npm install kss-modern
```

## Basic Setup

Create a build script that calls `buildStyleguide()`:

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

## Configuration Reference

### Required Options

| Option | Type | Description |
|---|---|---|
| `mode` | `'development' \| 'production'` | Controls caching and build optimizations. |
| `outDir` | `string` | Output directory for the generated styleguide. |
| `contentDir` | `` `${string}/` `` | Root directory containing your CSS/SCSS files. Must end with `/`. |
| `projectTitle` | `string` | Project name displayed in the styleguide header. |
| `theme` | `string \| { light: string, dark: string }` | Theme accent color as hex value. Pass an object to set separate light/dark mode colors. |
| `html` | `object` | HTML configuration (see below). |

### `html` Options

```ts
html: {
  lang: 'en',
  assets: {
    css: [
      { src: '/css/styles.css' },                                // your project CSS (preview iframes)
      { src: '/css/styleguide-overrides.css', type: 'overwriteStyleguide' }, // customize the styleguide UI
    ],
    js: [
      { src: '/js/app.js' },
      { src: '/js/module.js', additionalAttributes: { type: 'module' } },
    ],
  },
}
```

#### CSS Asset Types

- **No type / `'regular'`** (default) — injected into the preview iframes only. Use this to load your project's own stylesheets so components render correctly without any CSS bleeding into the styleguide UI.
- **`'overwriteStyleguide'`** — loaded in the styleguide UI itself, allowing you to further style or customize the styleguide shell (sidebar, header, layout, etc.).

#### JS Asset Types

- **No type / `'regular'`** (default) — loaded in the preview iframes.
- **`'overwriteStyleguide'`** — loaded in the styleguide UI.

Use `additionalAttributes` to add custom attributes like `type="module"` or `defer=""` to script tags.

### Optional Options

| Option | Type | Default | Description |
|---|---|---|---|
| `deactivateDarkMode` | `boolean` | `false` | Hides the theme toggle in the styleguide UI. |
| `launchInEditor` | `boolean \| { rootDir: string }` | `undefined` | Enables "Open in Editor" links (VSCode/PHPStorm). Set `rootDir` to the project root for correct file paths. |
| `logoSignet` | `{ href: string } \| { svgContent: string }` | `undefined` | Logo displayed in the header. Provide either an image URL or inline SVG content. |
| `plugins.ogImage` | `(section) => string` | `undefined` | Function that returns an OG image URL for each section (used in fullpage meta tags). |

### Full Configuration Example

```ts
import { buildStyleguide } from 'kss-modern'

await buildStyleguide({
  mode: 'production',
  outDir: './styleguide',
  contentDir: './src/sass/',
  projectTitle: 'My Design System',
  deactivateDarkMode: false,
  launchInEditor: {
    rootDir: '/absolute/path/to/project/',
  },
  theme: {
    light: '#005075',
    dark: '#ffffff',
  },
  logoSignet: {
    svgContent: '<svg viewBox="0 0 24 24">...</svg>',
  },
  html: {
    lang: 'en',
    assets: {
      css: [
        { src: '/css/tokens.css', type: 'overwriteStyleguide' },
        { src: '/css/components.css' },
      ],
      js: [
        { src: '/js/components.js', additionalAttributes: { type: 'module', defer: '' } },
      ],
    },
  },
  plugins: {
    ogImage: (section) => `https://og-image.example.com/${encodeURIComponent(section.header)}`,
  },
})
```

## Development Setup (Watch Mode)

Use `watchStyleguide()` for development. It builds once, then watches `contentDir` for KSS comment changes and rebuilds automatically. Only triggers when actual KSS comment blocks change — not on every file save.

```ts
import { watchStyleguide } from 'kss-modern'

await watchStyleguide(
  {
    mode: 'development',
    outDir: './styleguide-export',
    contentDir: './src/sass/',
    projectTitle: 'My Design System',
    theme: '#005075',
    html: { lang: 'en', assets: { css: [], js: [] } },
  },
  () => console.log('Styleguide rebuilt'),
  (errors) => console.error('Build errors:', errors),
)
```

Pair it with a dev server like Vite for live reloading:

```ts
import { createServer } from 'vite'
import { watchStyleguide } from 'kss-modern'

await watchStyleguide({
  mode: 'development',
  outDir: './styleguide-export',
  contentDir: './src/sass/',
  projectTitle: 'My Design System',
  theme: '#005075',
  html: { lang: 'en', assets: { css: [], js: [] } },
})

const server = await createServer({
  root: './styleguide-export',
  server: { host: true },
})
await server.listen()
server.printUrls()
```

## Project Structure

A typical project using kss-modern:

```
my-project/
├── src/
│   └── sass/
│       ├── 01-settings/
│       │   ├── _colors.scss         # Color palette documentation
│       │   ├── _icons.scss          # Icon gallery documentation
│       │   └── _typography.scss     # Typography documentation
│       ├── 02-elements/
│       │   ├── _buttons.scss        # Button documentation + styles
│       │   └── _headings.scss       # Heading documentation + styles
│       ├── 03-components/
│       │   ├── _card.scss           # Card documentation + styles
│       │   └── _alert.scss          # Alert documentation + styles
│       └── styles.scss              # Main stylesheet
├── templates/
│   └── source/
│       ├── 02-elements/
│       │   └── buttons.pug          # Button Pug template
│       └── 03-components/
│           └── card.pug             # Card Pug template
├── styleguide/                      # Generated output (gitignored)
└── styleguide.config.ts             # Build script
```

## API Reference

### `buildStyleguide(config): Promise<StyleguideBuildOutput>`

Builds the styleguide once and returns.

**Returns:** `{ errors?: { overwrittenSectionsIds?: string[] } }` — contains IDs of sections that had duplicate `Styleguide` references.

### `watchStyleguide(config, onChange?, onError?): Promise<void>`

Builds the styleguide and watches `contentDir` for changes. Only rebuilds when KSS comment blocks in CSS/SCSS files change, or when `.md` files change.

**Parameters:**
- `config` — `StyleguideConfiguration`
- `onChange` — `() => void` — called after each successful rebuild
- `onError` — `(errors) => void` — called when the build produces errors (e.g., duplicate section IDs)
