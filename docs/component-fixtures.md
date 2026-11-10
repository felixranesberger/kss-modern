# Component test fixtures

A component that declares its props with `defineComponent` can produce its own test cases. kss-modern combines the values of its schema, fills the free values from `examples` and renders every case with the Pug mixin. The result is a set of props, slots and the expected markup per component. A backend that renders the same component with its own templates, for example a Fluid component in TYPO3, renders the same props and compares.

The fixtures need [`@faker-js/faker`](https://fakerjs.dev) and [zod](https://zod.dev) 4, both optional peer dependencies:

```bash
npm i -D @faker-js/faker zod
```

## Values: `examples`, `withFake` and `slots`

`examples` is the only source of values. Every prop with a free value (string, number, array, object without default) needs an entry, optional ones included. tsc names each missing one. An entry is a fixed value or a function that gets a Faker instance:

```ts
import { defineComponent } from 'kss-modern/schema'
import { z } from 'zod'
import { image, link } from '../schema-fragments'

export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({
    variant: z.enum(['tile', 'teaser', 'large']).default('tile'),
    title: z.string().min(1),
    text: z.string().optional(),
    reverse: z.boolean().default(false),
    image: image().optional(),
    cta: link.optional(),
  }),
  examples: {
    variant: 'tile', // the explorer starts with it, the cases still combine every variant
    title: 'Scholarship: Young Journalists',
    text: f => f.lorem.sentence(),
  },
  slots: { footer: f => `<p>${f.lorem.words(4)}</p>` },
})
```

Enums, booleans, literals, props with a default and records need no entry. Named, they only set the starting value of the explorer. A list takes a list of templates, the cases use 0, 1 and 3 elements (from its `min`) and rotate through the templates. A choice among fixed strings is Faker as well: `f => f.helpers.arrayElement(['arrow', 'pin'])`.

`withFake` attaches a fake to a shared fragment, so no component using it repeats the value:

```ts
import { withFake } from 'kss-modern/schema'

export const link = withFake(
  z.strictObject({ text: z.string().min(1), href: z.string().min(1) }),
  f => ({ text: f.lorem.words(2), href: f.internet.url() }),
)
```

The mark survives `.optional()`, `.default()`, `.describe()` and `.meta()`. A prop using the fragment may still have an entry in `examples`, which wins.

The slots come from the Pug mixin. The build reads them while it looks for mixins: `default` for a `block`, and the named slots of a mixin that splits its block with `const slots = pug_mixins.$fragments.collect(block)` and reads `slots.<name>`. The manifest lists them in `slots`. `slots` in `defineComponent` only provides the content, as HTML or a fake. A slot without an entry gets `<p data-slot="name">Slot name</p>`. Every slot is tested empty and filled.

The JSON Schema export and the explorer resolve the fakes once with seed 1, so they still see plain values.

## How the cases are chosen

The generator splits the schema into dimensions: every enum and literal value, `false` and `true` of a boolean, set or not set for an optional prop, 0, 1 or 3 elements for a list, the fields of an object or list element under the value that switches them on, empty or filled for a slot. `schema.safeParse()` decides which combinations are valid, so `refine` and `superRefine` apply without the generator knowing the rules.

Up to 10,000 combinations every one is tested (stage `full`). Most components stay below. Above the limit the cases are chosen in stages:

| Stage | Cases |
|---|---|
| `minimal` | all defaults, no optional prop |
| `single` | every value once against the minimal case |
| `pair` | until every value pair of two dimensions occurs (with `strength: 3` every triple) |
| `shape` | 3,000 random valid cases rendered with Pug, kept when the markup has a new feature: an element with its class path, a modifier class or an attribute name |
| `named` | the cases from `cases` |

An invalid candidate is repaired by changing single dimensions, the ones zod's issues name first. A pair that no valid case can hold is reported as impossible. `strength` in `defineComponent` sets the coverage of a component above the limit: 1 every value, 2 every pair (default), 3 every triple, for example in a nightly run.

`cases` adds named cases that are always tested, for example a bug from a ticket. Their props are values as in `examples`, `undefined` leaves a prop out, and the props they do not name are filled like in `fakeProps`:

```ts
cases: {
  'teaser without text': { props: { variant: 'teaser', text: undefined } },
},
```

## In code: `kss-modern/fixtures`

```ts
import { explainCases, fakeProps, testCases } from 'kss-modern/fixtures'

fakeProps(card) // one valid, filled props set, seed 1
fakeProps(card, { seed: 7, with: { variant: 'large', reverse: true } }) // `with` is typed against the props

for (const c of testCases(card, { slotNames: ['footer'] })) {
  c.id // 'f3231f34', a hash of the case's dimension values
  c.name // 'variant=large +reverse', what differs from the minimal case
  c.stage // 'full' | 'minimal' | 'single' | 'pair' | 'shape' | 'named'
  c.props // z.input of the schema
  c.slots // HTML of the filled slots
  c.files // ['image.src'], the props that hold images
}

explainCases(card) // mode, product, dimensions, cases per stage, impossible, unreachable, errors
```

`testCases` and `explainCases` take the same options: `seed`, `strength`, `limit` (default 10,000), `slotNames`, `isFile`, `render` and `samples`. Without `render` there is no stage `shape`. `testCases` throws when a named case has no valid props. `selectTestCases` returns cases and report in one pass and lists such cases in the report instead.

## The build option `mixinFixtureDir`

Set `mixinFixtureDir` and the build writes the fixtures of every mixin with a schema, one file per component in the folders of its name, like [`mixinJsonSchemaDir`](mixin-playground.md#json-schema-files): `name: 'molecules/Card'` becomes `<dir>/molecules/Card.json`.

```js
mixinJsonSchemaDir: '../../app/packages/hss_components/Schema',
mixinFixtureDir: '../../app/packages/hss_components/Tests/Functional/Fixtures/GeneratedCases',
```

```json
{
  "inputHash": "4c1e…",
  "component": "molecules/Card",
  "seed": 1,
  "report": { "mode": "pairwise", "strength": 2, "product": 4730880, "dimensions": […], "cases": { "full": 0, "minimal": 1, "single": 34, "pair": 85, "shape": 18, "named": 0 }, "impossible": […], "unreachable": [], "renderErrors": [], "valueErrors": [], "namedErrors": [] },
  "errors": [],
  "cases": [
    {"id":"9a1c03d2","name":"minimal","stage":"minimal","props":{"title":"…"},"slots":{},"files":[],"html":"<!-- START CARD--><article class=\"c-card\">…"},
    …
  ]
}
```

- `props` are the props as a caller passes them, `z.input` of the schema. Defaults are not filled in and transforms have not run. The mixin parses them with `defineComponent` like on any page, and the backend gets the same input. That is what the comparison tests: a default or a derived value the backend computes differently shows up as a difference.
- `slots` holds the HTML of the filled slots by name. `default` is the block of the call, a named slot is passed as `+fragment('<name>')`.
- `html` is the markup of the mixin, rendered with the same compiled module, locals and START/END markers as the playground. A case whose render threw has `error` instead.
- `files` lists the props that hold images, see below.
- `report` is `explainCases()` of the component. `renderErrors` also lists the cases whose render threw.

A file is only computed and written when its `inputHash` changes. The hash covers the schema (the `defineComponent` block, or the definition of a `.schema.ts` file with its fakes), the compiled template with its includes, the slots, the seed and the versions of kss-modern, zod and Faker. The hash is read from the file on disk as well, so a restarted build reuses unchanged files. A file whose component is gone is removed, also when the component went away before the process started. Files in the directory that are not fixtures stay.

A component with problems still gets its file. The build logs the problems: a render error on valid props, a value no valid case can hold, a fake that breaks the schema, a named case without valid props, or a missing `@faker-js/faker`. In production they fail the build, like an invalid schema. Impossible pairs are not a problem, they are the readable form of a rule.

The cases are made on the main thread. For the 133 components of hss.de (about 19,000 cases and 21 MB, measured before the shape stage stopped counting theme classes in element paths, so the number is lower now) the first build takes about 5 seconds, a build without changes about 0.3 seconds in a new process and a few milliseconds in watch mode.

## The report

Set `mixinFixtureReport` to log the report after a build that changed fixtures: `true` for an overview of all components, a component name or a list of names for the full report.

```js
mixinFixtureReport: ['molecules/Card'],
```

```text
molecules/Card: 342 cases, pairwise, strength 2
product: 4,730,880 combinations of 16 dimensions
cases per stage: minimal 1, single 34, pair 85, shape 18
dimensions (16):
  variant: variant=highlight variant=tile variant=teaser …
  border: border=false +border
  …
impossible combinations (39):
  variant=highlight & +reverse
  variant=tile & +reverse
  …
```

`formatMixinFixtureReport(directory, component?)` from `kss-modern` prints the same from the written files, without a build. A project can put it behind a script of its own:

```js
// scripts/fixtures.mjs: node scripts/fixtures.mjs molecules/Card
import { formatMixinFixtureReport } from 'kss-modern'

console.log(await formatMixinFixtureReport('../../app/packages/hss_components/Tests/Functional/Fixtures/GeneratedCases', process.argv[2]))
```

kss-modern has no command of its own. The configuration lives in the project's build script, often inside another toolchain, and a command would need all of it again to find and render the mixins.

## Images

A prop holds an image when it is a string and its `.describe()` contains `FileReference`, or, without a description, when its path ends in `image.src`. `files` lists these paths per case, with list indexes: `image.src`, `items[0].image.src`. `isFile` in the options of `testCases` replaces the rule.

The placeholder values of an image fake do not exist in the backend. Before it renders, the test replaces the values at these paths with a real file, and the comparison masks `src`, `srcset` and `data-srcset` on `img` and `source` on both sides. `width`, `height`, `sizes`, `loading`, `alt` and the classes stay in the comparison.

## Using the files in a backend test

A test reads every file of the directory and renders each case with the backend's own template:

```php
foreach (glob($directory . '/**/*.json') as $path) {
    $fixture = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    foreach ($fixture['cases'] as $case) {
        $props = $case['props'];
        foreach ($case['files'] as $file) {
            $props = setAtPath($props, $file, 'EXT:my_components/Tests/Functional/Fixtures/cover.jpg');
        }
        $actual = renderComponent($fixture['component'], $props, $case['slots']);
        // compare normalize($actual) with normalize($case['html']), name, id and stage in the message
    }
}
```

The comments around the mixin markup (`<!-- START CARD-->`) are part of `html`. Strip them in the normalization when the backend does not write them. A useful failure message names the case, its id and stage, and the values the failing cases share, for example `4 of 91 cases differ, shared: titleTag=h4 +href`.
