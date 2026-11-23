/**
 * Type checks for `examples`, `withFake` and `kss-modern/fixtures`, compiled by
 * tests/unit/lib/component-schema-types.test.ts. Every `@ts-expect-error` names a piece of the
 * message the line below must produce. The lines without a directive must compile.
 */
import { z } from 'zod'
import { defineComponent, withFake } from '../../../lib/component-schema.ts'
import { fakeProps, resolveExamples, testCases } from '../../../lib/fixtures/index.ts'

function image({ loading = 'lazy' }: { loading?: 'lazy' | 'eager' } = {}) {
  return withFake(
    z.strictObject({
      src: z.string().min(1),
      alt: z.string().default(''),
      loading: z.enum(['lazy', 'eager']).default(loading),
    }),
    f => ({ src: f.helpers.arrayElement(['university/2', 'people/3']), alt: f.lorem.words(3) }),
  )
}

const link = withFake(
  z.strictObject({ text: z.string().min(1), href: z.string().min(1) }),
  f => ({ text: f.lorem.words(2), href: f.internet.url() }),
)

const additionalAttributes = withFake(
  z.record(z.string().regex(/^data-[a-z-]+$/), z.union([z.string(), z.boolean()])),
  f => ({ 'data-test': f.lorem.word() }),
).optional()

const schema = z.strictObject({
  title: z.string().min(1),
  count: z.int().optional(),
  variant: z.enum(['a', 'b']).default('a'),
  open: z.boolean().default(false),
  alt: z.string().default(''),
  tags: z.array(z.string()).optional(),
  cta: z.strictObject({ text: z.string(), variant: z.enum(['x', 'y']).default('x') }).optional(),
  image: image().optional(),
  link: link.describe('A described fragment keeps its fake'),
  additionalAttributes,
})

// every prop with a free value is there, enums, booleans, defaults and fragments with a fake may be missing
const ok = defineComponent({
  name: 'ok',
  schema,
  examples: { title: 'T', count: 3, tags: [f => f.lorem.word(), 'b'], cta: { text: f => f.lorem.words(2) } },
  slots: { default: f => `<p>${f.lorem.sentence()}</p>`, aside: '<p>Aside</p>' },
  cases: { 'without count': { props: { count: undefined, variant: 'b' }, slots: { default: '' } } },
  strength: 3,
})

// a transform still reads the examples from the input shape
defineComponent({ name: 'transform', schema: schema.transform(p => ({ ...p, isB: p.variant === 'b' })), examples: ok.examples })

fakeProps(ok, { seed: 7, with: { variant: 'b', open: true } })
resolveExamples(ok, { seed: 2 })
for (const c of testCases(ok)) {
  const title: string = c.props.title
  void title
}

// a missing prop
// @ts-expect-error Property 'count' is missing
defineComponent({ name: 'e1', schema, examples: { title: 'T', tags: [], cta: { text: 'x' } } })

defineComponent({ name: 'e2', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' },
  // @ts-expect-error 'titel' does not exist
  titel: 'x' } })

// a value outside the enum
// @ts-expect-error Type '"c"' is not assignable
defineComponent({ name: 'e3', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' }, variant: 'c' } })

// a fake with the wrong return type
// @ts-expect-error Type 'number' is not assignable to type 'string'
defineComponent({ name: 'e4', schema, examples: { title: f => f.number.int({ min: 1, max: 2 }), count: 1, tags: [], cta: { text: 'x' } } })

// a missing field of a nested object
// @ts-expect-error Type '{}' is not assignable to type '{ text: string
defineComponent({ name: 'e5', schema, examples: { title: 'T', count: 1, tags: [], cta: {} } })

// the wrong element type in a list
// @ts-expect-error Type 'number' is not assignable
defineComponent({ name: 'e6', schema, examples: { title: 'T', count: 1, tags: [1], cta: { text: 'x' } } })

// the parameter of a fake is Faker, not any
// @ts-expect-error Property 'wort' does not exist on type 'LoremModule'
defineComponent({ name: 'e7', schema, examples: { title: f => f.lorem.wort(), count: 1, tags: [], cta: { text: 'x' } } })

// withFake checks the fake against the fragment
// @ts-expect-error Property 'href' is missing
withFake(z.strictObject({ text: z.string(), href: z.string() }), f => ({ text: f.lorem.word() }))

// `with` checks its values
// @ts-expect-error Type '"huge"' is not assignable
fakeProps(ok, { with: { variant: 'huge' } })

defineComponent({ name: 'e10', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' } },
  // @ts-expect-error 'titel' does not exist
  cases: { broken: { props: { titel: 'x' } } } })

// a fake for a list returns a single value
// @ts-expect-error Type 'string' is not assignable to type 'string[]'
defineComponent({ name: 'e11', schema, examples: { title: 'T', count: 1, tags: f => f.lorem.word(), cta: { text: 'x' } } })

// Faker stays typed in list elements and nested objects
// @ts-expect-error Property 'wort' does not exist on type 'LoremModule'
defineComponent({ name: 'e12', schema, examples: { title: 'T', count: 1, tags: [f => f.lorem.wort()], cta: { text: 'x' } } })
// @ts-expect-error Property 'wort' does not exist on type 'LoremModule'
defineComponent({ name: 'e13', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: f => f.lorem.wort() } } })

// an enum in a nested object
// @ts-expect-error Type '"z"' is not assignable
defineComponent({ name: 'e14', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x', variant: 'z' } } })

// a fragment without withFake needs an example
// @ts-expect-error Property 'link' is missing
defineComponent({ name: 'e15', schema: z.strictObject({ link: z.strictObject({ text: z.string() }).optional() }), examples: {} })

// a slot is HTML or a fake of it
// @ts-expect-error Type 'number' is not assignable
defineComponent({ name: 'e16', schema, examples: ok.examples, slots: { default: f => f.number.int() } })

// strength is 1, 2 or 3
// @ts-expect-error Type '4' is not assignable
defineComponent({ name: 'e17', schema, examples: ok.examples, strength: 4 })
