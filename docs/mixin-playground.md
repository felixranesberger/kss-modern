# Mixin playground

A Pug mixin that describes its props with a [zod](https://zod.dev) schema becomes a public component of your styleguide. It is listed in the **Mixins** explorer and gets a playground: a form generated from the schema that re-renders the mixin live while you edit its props, inside the styleguide and on a standalone page of its own. Mixins without a schema count as internal building blocks and are not shown.

## Requirements

The playground needs zod 4 in your project. kss-modern declares it as an optional peer dependency:

```bash
npm install --save-dev zod
```

Without zod the mixin explorer is left out, the build logs one line saying so, and everything else works as before.

## Declaring a schema

Give the mixin a single `props` argument and declare its schema as `mixinSchema` in an unbuffered code block of its own, ideally the first statement of the mixin:

```pug
include _icon

mixin button(props)
  -
    var mixinSchema = z.object({
      label: z.string().describe('Button text'),
      variant: z.enum(['primary', 'ghost']).default('primary'),
      icon: z.string().optional(),
    })
  - const p = mixinSchema.parse(props)
  button(class=['btn', 'btn--' + p.variant] id=useId('btn'))
    if p.icon
      +icon(p.icon)
    = p.label
```

`z` is available in every template, in the playground and in regular section markup, so sections can keep calling `+button({ label: 'Save' })`. `mixinSchema.parse(props)` applies the defaults and throws on invalid props. In the playground those errors appear next to the matching control. In a section they fail the compile like any other Pug error.

The build evaluates the schema block on its own to build the form. The block may therefore only use `z`. It must not read `props` or any other template variable. When the block throws, or uses a feature outside the supported set below, a production build fails. In development the build logs a warning and the explorer shows the error in place of the playground.

### Supported zod features

The playground creates a control for every prop and checks the schema's constraints while you type, so a schema may only use the zod features below. Anything else stops a production build with the mixin, the prop and the reason. In development the explorer shows the same message in place of the playground.

| Schema | Control | Checked while typing |
|---|---|---|
| `z.string()` with `.min()`, `.max()`, `.length()`, `.regex()`, `.email()`, `.url()`, `.startsWith()`, `.endsWith()`, `.includes()` | text input | length, pattern, email, URL |
| `z.number()`, `z.int()` with `.min()`, `.max()`, `.gt()`, `.lt()`, `.multipleOf()` | number input | range, whole number, step |
| `z.boolean()` | checkbox | |
| `z.enum([...])`, `z.literal()`, unions of literals | select | allowed value |
| `z.array()` of any of the above, with `.min()`, `.max()`, `.length()` | list editor (add, remove, reorder) | number of entries, every entry |
| `z.array(z.strictObject({ … }))` whose fields are any of the scalars above | list editor with one group of fields per entry | number of entries, every field of every entry |
| `z.record(z.string(), …)` with scalar values or a union of `z.string()`, `z.number()`, `z.boolean()`; keys may use `.regex()`, `.min()`, `.max()` | key-value editor; with several value types a select picks `true`, `false` or a typed value | every key, every value |
| `.optional()`, `.default()` | an empty control leaves the prop out: empty text or number field, or the empty choice **—** of a select (an optional boolean becomes a select with **—**, true, false) | |
| `.describe()`, `.meta({ examples })` | help text, starting value | |

Not supported are nested objects, records of objects or lists, nullable props, unions of different types, arrays of arrays, lists or objects inside a list entry, dates and other types JSON Schema cannot describe, and loose objects.

A list of entries, like the questions of an FAQ or the links of a footer column, is an array of flat objects. A fresh entry starts with the default of every field that has one and an empty value for every other required field. The Pug call leaves out entry fields equal to their default:

```js
var mixinSchema = z.object({
  items: z.array(z.strictObject({
    question: z.string().min(1),
    answer: z.string().min(1),
    isOpen: z.boolean().default(false),
  })).min(1).meta({ examples: [[{ question: 'How do I apply?', answer: 'Online, until 15 March.' }]] }),
})
```

`.refine()`, `.superRefine()` and `.transform()` are allowed. JSON Schema cannot express them, so the form does not check them while you type. The mixin's own `mixinSchema.parse(props)` still runs them on every render, and their errors appear next to the control as well.

`.describe('…')` on a prop becomes the help text under its control. `.describe('…')` on the schema object itself is the mixin's description, shown under its name in the explorer:

```js
var mixinSchema = z.object({ /* … */ }).describe('The main action of a view')
```

A control starts with the schema default, else with the first example from `.meta({ examples: [...] })`, else empty.

### Folders in the explorer

Give a mixin a `mixinName` to place it in the explorer. Every `/` opens a folder, the last segment is the label, so atoms, molecules and organisms each get a folder of their own:

```pug
mixin button(props)
  - var mixinName = 'atoms/Button'
  -
    var mixinSchema = z.object({ /* … */ })
```

`mixinName` is read from the template at build time and must be a plain string literal, a computed value is ignored. In the template it is an ordinary local variable and changes nothing. A mixin without `mixinName` is listed with its Pug name at the top level.

### Start and end markers

kss-modern wraps the output of every mixin with a `mixinSchema` in two HTML comments, so the delivered markup shows where each component begins and ends:

```html
<!-- START CARD--><article class="card">…</article><!-- END CARD-->
```

The name is the last segment of `mixinName`, split into words and upper-cased (`organisms/form/FileUpload` becomes `FILE UPLOAD`). Without a `mixinName` the mixin's own name is used. The markers appear in section previews, fullpages and the playground alike. A mixin that writes its own `// START …` comment at the top level of its body keeps it and gets no second pair. Mixins without a schema are left alone.

A map whose keys are not known in advance, like additional HTML attributes on the root element, is a record. A new entry of a record that allows booleans starts as `true`:

```js
var mixinSchema = z.object({
  additionalAttributes: z.record(
    z.string().regex(/^(data-[a-z][a-z0-9-]*|aria-[a-z]+|hidden)$/),
    z.union([z.string(), z.boolean()]),
  ).optional(),
})
```

## Mixin explorer

The **Mixins** entry in the sidebar, which appears once at least one mixin is found, opens the explorer at `mixins.html`. It works like Storybook:

- **List** on the left: every mixin with a schema, in the folders of its `mixinName`, with a filter field that also searches folder names. Folders can be collapsed. Red marks a compile error, amber a schema that could not be evaluated. Arrow keys move through the list.
- **Canvas** in the middle: the selected mixin, rendered with your `html.assets`. It follows the theme dropdown and the color scheme like every other preview.
- **Tabs** below: **Controls** with the form generated from the schema, **Code** with the rendered HTML and **Pug call** with the call for the current props (props equal to their default are left out). The copy buttons next to the tabs copy the Pug call or the HTML.

The header above the canvas shows the selected mixin's name, its schema description, its signature and file. It also links to its standalone page, runs the accessibility audit, and, in development with `launchInEditor`, opens the file in your editor.

Switching mixins never reloads the page. The selection and the props live in the hash (`mixins.html#mixin=button&props=…`), so you can share a link to any state. The search lists every mixin and jumps straight to it.

## Mixins used by a section

Every section preview whose markup calls public mixins gets a **Show mixins** row below **Show code**. It opens a tree of those mixins, nested the way they are called, each linking to the mixin in the explorer. A count like **×2** shows repeated calls.

The tree records the calls the preview actually makes while it renders: a mixin inside an `if` that is not taken does not appear, and the mixins called in a block passed to another mixin are listed under that mixin. Internal mixins (without a schema) are left out, and the public mixins they call move up to the nearest public mixin. A section calling `+card`, whose internal helper renders two `+button`s, shows the buttons directly under the card.

## Standalone page

`mixins-<name>-standalone.html` renders the mixin outside the styleguide. The page loads only your `html.assets`, the theme handling and the mixin, and the component renders straight into the page. Viewport units, media and container queries and `position: fixed` behave as in production.

The controls live in a shadow root, so your CSS cannot change them and their CSS cannot reach your component. You can dock them right or bottom, resize them, collapse them and toggle them with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. The layout is remembered per browser.

| Parameter | Effect |
|---|---|
| `?props=<url-encoded JSON>` | Starting props. While you edit, the hash holds the current props. |
| `?controls=0` | The component only, without controls or extra markup. Suited for visual regression screenshots and iframes. |
| `?theme=<class list>` | Applies a preview theme, as on the fullpage previews. |
| `?scheme=light` / `?scheme=dark` | Forces a color scheme. |

Invalid props from the URL are shown in the controls. With `controls=0` the page shows a small error box instead.

```js
// Playwright visual regression
await page.goto(`/mixins-button-standalone.html?controls=0&props=${encodeURIComponent(JSON.stringify({ label: 'Save' }))}`)
await expect(page).toHaveScreenshot()
```

### Your JavaScript on the playground

Your `html.assets.js` scripts start after the component is in the page, so code that initialises components on load finds it. After every re-render the playground dispatches `kss-modern:playground-render` on `document`:

```js
document.addEventListener('kss-modern:playground-render', () => initComponents(document))
```

If your components only initialise on page load, set [`reloadPlaygroundOnChange`](configuration.md#reloadplaygroundonchange) and the preview reloads with the new props instead.

## Development and caching

Every mixin with a schema is compiled once per build into a small render module (a few KB, without a Pug compiler). The browser only changes prop values, never the template. Module file names carry a content hash, so an unchanged mixin keeps its URL and stays in the browser cache.

The build caches what it found per `.pug` file, every evaluated schema and every compiled module, and stores that cache in `node_modules/.cache/kss-modern/`. A rebuild without template changes compiles nothing, also after a restart. Changing a partial recompiles only the mixins that include it, and a schema is only evaluated again when its own source changed. CSS and Markdown edits leave the mixins alone. Change the cache location with [`cacheDir`](configuration.md#optional-options).

In watch mode the playground follows rebuilds without a page reload and keeps the props you are editing. A Pug error in one mixin shows the error overlay over its last good render while all other mixins keep working. A production build fails on a mixin compile error, like it does for sections.

## Limitations

- The playground calls a mixin with exactly one argument, `+name(props)`, so a playground mixin takes a single `props` object.
- The schema block may only reference `z`.
- Only mixins defined at the top level of a file are found. Mixins defined inside a conditional, a tag or another mixin are ignored.
- A mixin is compiled together with the files its own file includes. A mixin that relies on another mixin only the calling page includes fails to render in the playground.
- The rendered markup is inserted as HTML. To keep a crafted link from injecting script, props from `?props=` or the hash are refused when a string contains `<` or starts with `javascript:`, `vbscript:` or `data:`. Values like that can still be typed into the controls.
