# Configuration

`buildStyleguide()` and `watchStyleguide()` take the same configuration object.

```js
import { buildStyleguide } from 'kss-modern'

await buildStyleguide({
  mode: 'production',
  outDir: './styleguide',
  contentDir: './src/css/',
  projectTitle: 'Verdant',
  brandColor: { light: '#15803d', dark: '#4ade80' },
  logoSignet: { svgContent: '<svg viewBox="0 0 24 24">…</svg>' },
  allowSearchEngineIndexing: true,
  html: {
    lang: 'en',
    assets: {
      css: [{ src: 'assets/styles.css' }],
      js: [{ src: 'assets/main.js', additionalAttributes: { type: 'module' } }],
    },
  },
  previewThemes: [
    { value: 'theme-dusk', label: 'Dusk' },
    { value: 'theme-ocean', label: 'Ocean', css: ['assets/themes/ocean.css'] },
  ],
})
```

## Required options

| Option | Type | Description |
|---|---|---|
| `mode` | `'development' \| 'production'` | See [Modes](#modes). |
| `outDir` | `string` | Directory the styleguide is written to. |
| `contentDir` | `` `${string}/` `` | Directory that is scanned for `.css` and `.scss` files. It must end with `/`. All paths in KSS comments are relative to it. |
| `projectTitle` | `string` | Name shown in the header and the page titles. |
| `brandColor` | `string \| { light: string, dark: string }` | Accent color of the styleguide UI as a hex value. It drives the highlight color, `<meta name="theme-color">` and the generated favicons. Pass an object for separate light and dark values. |
| `html` | `object` | Language and assets of the preview documents, see [html](#html). |

## Optional options

| Option | Type | Default | Description |
|---|---|---|---|
| `previewThemes` | `PreviewTheme[]` | none | Adds a global **Theme** dropdown to the header, see [previewThemes](#previewthemes). |
| `reloadPreviewsOnThemeChange` | `boolean` | `false` | Reload a preview when its theme changes instead of swapping classes in place. |
| `deactivateDarkMode` | `boolean` | `false` | Hides the System/Light/Dark toggle and skips the dark pass of the contrast audit. |
| `allowSearchEngineIndexing` | `boolean` | `false` | Lets search engines index the styleguide. |
| `launchInEditor` | `boolean \| { rootDir: string }` | none | Adds "Open in editor" links in development mode. |
| `logoSignet` | `{ href: string } \| { svgContent: string }` | none | Logo shown before the project title in the header, as an image URL or inline SVG. |
| `plugins.ogImage` | `(section) => string` | none | Returns an Open Graph image URL for each preview document. |

## Modes

`mode` switches between a fast feedback loop and a clean, reproducible output.

| | `development` | `production` |
|---|---|---|
| Pug compile error | shown as an overlay in the preview, the build continues | fails the build |
| Code shown in "Show code" | Pug's pretty output | formatted with Biome |
| "Open in editor" links | shown when `launchInEditor` is set | never shown |
| Old HTML files in `outDir` | kept | removed before the build |

Use `development` with `watchStyleguide()` and `production` for anything you deploy.

## html

```js
html: {
  lang: 'en',
  assets: {
    css: [
      { src: 'assets/styles.css' },
      { src: 'assets/styleguide-tweaks.css', type: 'overwriteStyleguide' },
    ],
    js: [
      { src: 'assets/main.js', additionalAttributes: { type: 'module' } },
    ],
  },
},
```

`lang` sets the `lang` attribute of every page.

Each asset has a `src` and an optional `type`:

- Without a `type`, or with `type: 'regular'`, the asset is loaded into the preview iframes only. This is where your component CSS and JavaScript belong. It never leaks into the styleguide UI.
- With `type: 'overwriteStyleguide'`, the asset is loaded into the styleguide UI instead. Use it to adjust the look of the styleguide itself, or to define the custom properties that `var()` color swatches need.

`src` is written into the pages as given. All pages sit in the root of `outDir`, so a relative path such as `assets/styles.css` resolves against `outDir` and keeps working when the styleguide is served from a subdirectory. Scripts accept `additionalAttributes`, for example `{ type: 'module' }` or `{ defer: '' }`.

## previewThemes

Preview themes are alternative contexts your components can be viewed in, such as a brand variant or a high-contrast mode. They are unrelated to `brandColor` and to the System/Light/Dark toggle.

```js
previewThemes: [
  { value: 'theme-dusk', label: 'Dusk' },
  { value: '.theme-ocean.compact', label: 'Ocean compact', css: ['assets/themes/ocean.css'] },
],
```

| Field | Description |
|---|---|
| `value` | Class or class list added to the `<html>` of every preview while the theme is selected. The leading dot is optional. |
| `label` | Text in the dropdown. |
| `css` | Optional stylesheets that load on top of `html.assets.css` while the theme is selected. |

Theme stylesheets are linked into every preview from the start with `media="not all"`. The browser downloads them once and applies nothing until the theme is selected, so switching is instant and never flashes. A theme without `css` is classes only. Selecting it turns every other theme's stylesheet off.

A section's own `Themes:` entry picks up the same stylesheets when it resolves to the same classes. [The styleguide UI](styleguide-ui.md#themes) explains how the global and the section dropdowns work together.

### reloadPreviewsOnThemeChange

A theme change normally swaps classes and stylesheets inside the loaded preview. That is instant and keeps the preview's state, but the preview's own JavaScript doesn't run again. Components that read styles once at startup, such as charts, canvas drawings or web components that cache tokens, keep the old theme.

Set `reloadPreviewsOnThemeChange: true` to reload the affected previews instead. Only previews whose theme changed are reloaded, and the initial page load never reloads anything.

## launchInEditor

```js
launchInEditor: { rootDir: '/Users/me/projects/my-app/' },
```

In development mode every section gets links that open its CSS file and its template in VS Code or PhpStorm. Visitors pick the editor in the header. `rootDir` is the absolute project path the editor should resolve files against. `true` uses the current working directory. Set `rootDir` when the build runs in a container whose paths differ from your machine.

## allowSearchEngineIndexing

Every build writes a `robots.txt` into `outDir` and a `<meta name="robots">` into every page. While this option is `false` they say `Disallow: /` and `noindex, nofollow`. With `true` they allow indexing.

## plugins.ogImage

```js
plugins: {
  ogImage: section => `https://og.example.com/${encodeURIComponent(section.header)}.png`,
},
```

The function receives the section and returns an image URL for the `og:image` tag of its preview document.

## Deprecated names

`theme` was renamed to `brandColor`, and `themes` to `previewThemes`. The old names still work and log a warning.

## JavaScript API

### `buildStyleguide(config)`

Builds the styleguide once. It resolves with `{ errors }`, where `errors.overwrittenSectionsIds` lists references that were defined more than once.

### `watchStyleguide(config, onChange?, onError?)`

Builds once and keeps watching `contentDir`. [Getting started](getting-started.md#watch-mode) explains what triggers a rebuild.

`onChange` runs after every rebuild except the first one and receives what changed:

```ts
type StyleguideChange
  = | { type: 'structural' }
    | { type: 'markup', files: string[], sections: string[] }
```

A `markup` change lists every template file of the batch and every section that was recompiled because of it. `onError` receives build errors such as duplicate references. The watcher keeps running after an error.

### `logger` and `createLogger()`

The logger kss-modern uses for its own output, exported so build scripts can log in the same format.
