# Mixin playground

A Pug mixin that describes its props with a [zod](https://zod.dev) schema becomes a public component of your styleguide. It is listed in the **Mixins** explorer and gets a playground: a form generated from the schema that re-renders the mixin live while you edit its props, inside the styleguide and on a standalone page of its own. Mixins without a schema count as internal building blocks and are not shown.

## Requirements

The playground needs zod 4 in your project. kss-modern declares it as an optional peer dependency:

```bash
npm install --save-dev zod
```

Without zod the mixin explorer is left out, the build logs one line saying so, and everything else works as before.

## Declaring a component

Give the mixin a single `props` argument and call `defineComponent` in an unbuffered code block of its own, as the first statement of the mixin. It takes the component's `name` and its zod `schema`, parses `props` and returns the result:

```pug
include _icon

mixin atomButton(props)
  -
    const p = defineComponent({
      name: 'atoms/Button',
      schema: z.strictObject({
        label: z.string().describe('Button text'),
        variant: z.enum(['primary', 'ghost']).default('primary'),
        icon: z.string().optional(),
      }).describe('The main action of a view'),
    }, props)

  button(class=['btn', 'btn--' + p.variant] id=useId('btn'))
    if p.icon
      +icon(p.icon)
    = p.label
```

`z` and `defineComponent` are available in every template, in the playground and in regular section markup, so sections can keep calling `+atomButton({ label: 'Save' })`. `defineComponent` applies the defaults and throws on invalid props, one line per problem with the component name, the Pug mixin, the prop and the reason:

```text
atoms/Button (+atomButton): label: Invalid input: expected string, received undefined
```

In the playground those errors appear next to the matching control. In a section they fail the compile like any other Pug error. A mixin that does not need the parsed props can call `- defineComponent({ … }, props || {})` without assigning the result.

The build evaluates the `defineComponent` block on its own to build the form. It runs the block with a `defineComponent` that only records the definition and returns an empty object, and without any props. The block may therefore only use `z`. It must not read `props` beyond passing them, or any other template variable. Keep computations on the parsed props in a code block after it. When the block throws, does not call `defineComponent` with a zod `schema`, or uses a feature outside the supported set below, a production build fails. In development the build logs a warning and the explorer shows the error in place of the playground.

### The older form: `mixinSchema` and `mixinName`

Mixins written before `defineComponent` declare the schema as a `mixinSchema` variable and the explorer name as a `mixinName` variable. This form still works and is treated exactly like `defineComponent`:

```pug
mixin atomButton(props)
  - var mixinName = 'atoms/Button'
  -
    var mixinSchema = z.strictObject({ /* … */ })
  - const p = mixinSchema.parse(props)
```

`mixinName` must be a plain string literal. When a mixin body contains both forms, `defineComponent` wins. New mixins should use `defineComponent`.

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
| `z.strictObject({ … })` as a prop, whose fields are any of the above | group of fields under the prop's label; an optional object gets a **Pass** switch | every field |
| `.optional()`, `.default()` | an empty control leaves the prop out: empty text or number field, or the empty choice **—** of a select (an optional boolean becomes a select with **—**, true, false) | |
| `.describe()`, `.meta({ examples })` | help text, starting value | |

Not supported are objects inside an object prop, records of objects or lists, nullable props, unions of different types, arrays of arrays, lists or objects inside a list entry, dates and other types JSON Schema cannot describe, and loose objects.

A list of entries, like the questions of an FAQ or the links of a footer column, is an array of flat objects. A fresh entry starts with the default of every field that has one and an empty value for every other required field. The Pug call leaves out entry fields equal to their default:

```js
schema: z.object({
  items: z.array(z.strictObject({
    question: z.string().min(1),
    answer: z.string().min(1),
    isOpen: z.boolean().default(false),
  })).min(1).meta({ examples: [[{ question: 'How do I apply?', answer: 'Online, until 15 March.' }]] }),
}),
```

Props that only make sense together, like the parts of an image or a call to action, can be an object prop. The object takes one level of nesting: its fields may be scalars, lists and records, but no further objects. An optional object starts switched off. Switched on, it starts with the default or first example of every field and an empty value for every other required field. The props of an optional object are all-or-nothing, so a refine like "text and href go together" becomes unnecessary. Issues of a field show at that field, and the Pug call leaves out fields equal to their default:

```js
schema: z.object({
  cta: z.strictObject({
    text: z.string().min(1),
    href: z.string().min(1),
    variant: z.enum(['primary', 'outline']).default('outline'),
  }).describe('Button below the text').optional(),
}),
```

In Fluid an object prop becomes flat arguments: the prop name plus the field name with a capital first letter. `cta.text` and `cta.href` become `ctaText` and `ctaHref`. That is why objects stop at one level, a second one would end in names like `cardImageHref`, which usually means the component needs a child component. Name the main field of an object the same way everywhere, e.g. `src` for an image and `text` for a button or link, so the rule needs no exceptions. List entries stay flat, an entry already is an array in Fluid.

`.refine()`, `.superRefine()` and `.transform()` are allowed. JSON Schema cannot express them, so the form does not check them while you type. `defineComponent` still runs them on every render, and their errors appear next to the control as well.

`.describe('…')` on a prop becomes the help text under its control. `.describe('…')` on the schema object itself is the mixin's description, shown under its name in the explorer:

```js
schema: z.object({ /* … */ }).describe('The main action of a view'),
```

A control starts with the schema default, else with the first example from `.meta({ examples: [...] })`, else empty.

### Folders in the explorer

The `name` passed to `defineComponent` places the mixin in the explorer. Every `/` opens a folder, the last segment is the label, so atoms, molecules and organisms each get a folder of their own: `name: 'atoms/Button'` lists the mixin as **Button** in the folder **atoms**.

Write `name` as a plain string literal. The explorer takes the evaluated value, but the start and end markers below are added at compile time without running any code and read the literal. A mixin without `name` (or `mixinName` in the older form) is listed with its Pug name at the top level.

### Start and end markers

kss-modern wraps the output of every mixin with a schema in two HTML comments, so the delivered markup shows where each component begins and ends:

```html
<!-- START CARD--><article class="card">…</article><!-- END CARD-->
```

The name is the last segment of the `defineComponent` `name` (or of `mixinName`), split into words and upper-cased (`organisms/form/FileUpload` becomes `FILE UPLOAD`). Without one the mixin's own name is used. The markers appear in section previews, fullpages and the playground alike. A mixin that writes its own `// START …` comment at the top level of its body keeps it and gets no second pair. Mixins without a schema are left alone.

A map whose keys are not known in advance, like additional HTML attributes on the root element, is a record. A new entry of a record that allows booleans starts as `true`:

```js
schema: z.object({
  additionalAttributes: z.record(
    z.string().regex(/^(data-[a-z][a-z0-9-]*|aria-[a-z]+|hidden)$/),
    z.union([z.string(), z.boolean()]),
  ).optional(),
}),
```

### JSON Schema files

Set [`mixinJsonSchemaDir`](configuration.md#optional-options) to get the schema of every mixin as a JSON Schema file, for example to check props in a backend. Without the option no files are written.

```js
mixinJsonSchemaDir: 'build/mixin-schemas',
```

Each mixin gets one file in the folders of its `name`. `name: 'atoms/Button'` becomes `build/mixin-schemas/atoms/Button.json`, a mixin without `name` is written as `<pug name>.json` at the top level. The content is the same JSON Schema the playground uses (`io: 'input'`, so props with a default are optional). A mixin with a broken schema gets no file. The path is relative to the working directory.

When a mixin goes away during a build or watch run, its file is removed. Other files in the directory stay untouched, and so do files from mixins removed before the process started.

## Mixin explorer

The **Mixins** entry in the sidebar, which appears once at least one mixin is found, opens the explorer at `mixins.html`. It works like Storybook:

- **List** on the left: every mixin with a schema, in the folders of its `name`, with a filter field that also searches folder names. Folders can be collapsed. Red marks a compile error, amber a schema that could not be evaluated. Arrow keys move through the list.
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
