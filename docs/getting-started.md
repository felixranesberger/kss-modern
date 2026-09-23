# Getting started

## Installation

```bash
npm install --save-dev kss-modern
```

kss-modern runs on Node.js and is used from a small build script. There is no CLI.

## Your first styleguide

Document a component with a KSS comment right next to its CSS:

```css
/*
Button

The main call to action.

.btn--secondary - Secondary action
.btn--danger - Destructive action

Markup: <button class="btn {{modifier_class}}">Save changes</button>

Styleguide 2.1
*/

.btn { /* … */ }
```

Every section also needs a parent. Declare the category once, for example at the top of your main stylesheet:

```css
/*
Elements

Buttons, form controls and other building blocks.

Styleguide 2
*/
```

Then create a build script, for example `styleguide.mjs`:

```js
import { buildStyleguide } from 'kss-modern'

await buildStyleguide({
  mode: 'production',
  outDir: './styleguide',
  contentDir: './src/css/',
  projectTitle: 'My Design System',
  brandColor: '#005075',
  html: {
    lang: 'en',
    assets: {
      css: [{ src: 'css/styles.css' }],
      js: [],
    },
  },
})
```

Run it with `node styleguide.mjs`. kss-modern scans every `.css` and `.scss` file below `contentDir` and writes the styleguide to `outDir`.

## Load your CSS into the previews

The previews render in iframes, and kss-modern only builds the HTML around them. Your own stylesheets and scripts come in through `html.assets`. The paths are URLs as the browser requests them from the styleguide pages, so the files have to exist in `outDir` or on the server that hosts it. Your build tool usually writes them there, or you copy them:

```js
import fs from 'fs-extra'

await fs.copy('./dist/css', './styleguide/css')
```

Assets without a `type` only reach the preview iframes. They never style the styleguide UI itself. See [Configuration](configuration.md#html) for scripts, extra attributes and styleguide overrides.

## Project layout

A typical project keeps the styleguide next to the code it documents:

```
my-project/
├── src/
│   ├── css/
│   │   ├── styles.css              # category sections (Styleguide 1, 2, 3 …)
│   │   ├── 01-foundations/
│   │   │   ├── colors.css          # Colors: block
│   │   │   └── icons.css           # Icons: block
│   │   └── 02-elements/
│   │       ├── buttons.css         # KSS comment + button styles
│   │       └── buttons.md          # longer docs, referenced with Markdown:
│   └── templates/
│       ├── mixins/_icon.pug
│       └── source/02-elements/buttons.pug
├── styleguide/                     # generated, add it to .gitignore
└── styleguide.mjs                  # build script
```

All paths inside KSS comments (`Markdown:`, `Markup:`) are relative to `contentDir`.

## Watch mode

`watchStyleguide()` builds once and then rebuilds when content changes. Pair it with any static dev server, for example Vite:

```js
import { createServer } from 'vite'
import { watchStyleguide } from 'kss-modern'

await watchStyleguide(
  {
    mode: 'development',
    outDir: './styleguide',
    contentDir: './src/css/',
    projectTitle: 'My Design System',
    brandColor: '#005075',
    html: { lang: 'en', assets: { css: [{ src: 'css/styles.css' }], js: [] } },
  },
  change => console.log(change.type === 'markup' ? `Rebuilt ${change.sections.join(', ')}` : 'Rebuilt styleguide'),
  error => console.error(error),
)

const server = await createServer({ root: './styleguide' })
await server.listen()
server.printUrls()
```

The watcher reacts to two kinds of changes:

- A KSS comment in a `.css` or `.scss` file changed, or any `.md` file changed. This triggers a full rebuild. Edits to plain CSS rules outside the comments trigger nothing, your own build pipeline handles those.
- A `.pug` or `.html` template changed. Only the sections that use it are rebuilt, including sections that reach it through `include`, `extends` or `<insert-markup>`.

In `development` mode a Pug compile error shows up as an overlay inside the affected preview, and the watcher keeps running.

Events are collected for 300 ms and handled as one batch, and rebuilds run one at a time. A branch switch or a bulk find-and-replace causes a single rebuild.

Bind mounts in Docker Desktop and DDEV don't forward file system events into the container. The watcher detects containers and switches to polling on its own. Set `FORCE_POLLING=1` to force polling anywhere else.

## Deployment

The output is plain static files. Upload `outDir` to any web server, object storage or static host.

Generated pages link each other and their own assets with relative URLs, so a styleguide works from a subdirectory such as `https://example.com/styleguide/`. Your own `html.assets` and `previewThemes[].css` paths are written as given. Use relative paths like `css/styles.css` for files inside `outDir`, then the whole styleguide can move to any path. Root-absolute paths like `/css/styles.css` have to include the subdirectory.

Every build writes a `robots.txt` and a matching `<meta name="robots">` that keep search engines out. Set `allowSearchEngineIndexing: true` for a public styleguide.

### GitHub Pages

Project pages are served from `/<repository>/`, which works out of the box with relative asset paths. Publish `outDir` with the official Pages actions:

```yaml
- run: node styleguide.mjs
- uses: actions/upload-pages-artifact@v4
  with:
    path: styleguide
- uses: actions/deploy-pages@v4
```

Also write an empty `.nojekyll` file into `outDir`, otherwise Pages runs the output through Jekyll. The workflow in [`.github/workflows/demo.yml`](../.github/workflows/demo.yml) and the script in [`demo/build.mjs`](../demo/build.mjs) show a complete setup.
