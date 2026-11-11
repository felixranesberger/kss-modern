import type { FixtureDefinition, TestCase } from '../../../../lib/fixtures/index.ts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent, withFake } from '../../../../lib/component-schema.ts'
import { explainCases, testCases } from '../../../../lib/fixtures/index.ts'
import { markupFeatures } from '../../../../lib/fixtures/markup.ts'

const image = withFake(
  z.strictObject({ src: z.string().min(1), alt: z.string().default('') }),
  f => ({ src: f.helpers.arrayElement(['university/2', 'people/3']), alt: f.lorem.words(3) }),
)

function expectValid(definition: FixtureDefinition, cases: TestCase[]): void {
  for (const testCase of cases)
    expect(definition.schema.safeParse(testCase.props).success, testCase.name).toBe(true)
}

/** Every value pair of two enum props occurs in some case. */
function missingPairs(cases: TestCase[], values: Record<string, readonly string[]>): string[] {
  const keys = Object.keys(values)
  const seen = new Set(cases.flatMap((testCase) => {
    const props = testCase.props as Record<string, string>
    return keys.flatMap(a => keys.map(b => `${a}=${props[a]} ${b}=${props[b]}`))
  }))
  return keys.flatMap((a, index) => keys.slice(index + 1).flatMap(b =>
    values[a].flatMap(x => values[b].map(y => `${a}=${x} ${b}=${y}`)).filter(pair => !seen.has(pair))))
}

const small = defineComponent({
  name: 'atoms/Small',
  schema: z.strictObject({
    variant: z.enum(['a', 'b', 'c']),
    reverse: z.boolean().default(false),
    text: z.string().optional(),
  }),
  examples: { text: 'Text' },
})

describe('the hybrid of full product and stages', () => {
  it('tests every combination up to the limit', () => {
    const cases = testCases(small)
    expect(cases).toHaveLength(12)
    expect(new Set(cases.map(testCase => testCase.stage))).toEqual(new Set(['full']))
    expect(cases[0]).toMatchObject({ name: 'minimal', props: { variant: 'a' } })
    expect(cases.map(testCase => testCase.name)).toContain('variant=c +reverse +text')
    expect(explainCases(small)).toMatchObject({ mode: 'full', product: 12, cases: { full: 12 } })
  })

  it('chooses in stages above the limit', () => {
    const report = explainCases(small, { limit: 11 })
    expect(report).toMatchObject({ mode: 'pairwise', strength: 2, cases: { full: 0, minimal: 1, single: 4 } })
    expect(report.cases.pair).toBeGreaterThan(0)
  })

  it('stops after single values with strength 1', () => {
    expect(explainCases(small, { limit: 1, strength: 1 }).cases).toEqual({ full: 0, minimal: 1, single: 4, pair: 0, shape: 0, named: 0 })
  })

  it('names only what differs from the minimal case', () => {
    const names = testCases(small, { limit: 1 }).map(testCase => testCase.name)
    expect(names).toEqual(expect.arrayContaining(['minimal', 'variant=b', '+reverse', '+text']))
  })
})

describe('pair coverage', () => {
  const levels = ['x', 'y', 'z'] as const
  const values = { a: levels, b: levels, c: levels, d: levels, e: levels }
  const grid = defineComponent({
    name: 'atoms/Grid',
    schema: z.strictObject({ a: z.enum(levels), b: z.enum(levels), c: z.enum(levels), d: z.enum(levels), e: z.enum(levels) }),
    examples: {},
  })

  it('holds every value pair of two dimensions in far fewer cases than the product', () => {
    const cases = testCases(grid, { limit: 10 })
    expect(missingPairs(cases, values)).toEqual([])
    expect(cases.length).toBeLessThan(30)
  })

  it('holds every triple with strength 3', () => {
    const cases = testCases(grid, { limit: 10, strength: 3 })
    const props = cases.map(testCase => testCase.props as Record<string, string>)
    for (const x of levels) {
      for (const y of levels) {
        for (const z of levels)
          expect(props.some(p => p.a === x && p.c === y && p.e === z), `${x} ${y} ${z}`).toBe(true)
      }
    }
  })

  it('reports the pairs a superRefine forbids', () => {
    const ruled = defineComponent({
      name: 'atoms/Ruled',
      schema: grid.schema.superRefine((props, context) => {
        if (props.a === 'x' && props.b === 'y')
          context.addIssue({ code: 'custom', path: ['b'], message: 'x excludes y' })
      }),
      examples: {},
    })
    const report = explainCases(ruled, { limit: 10 })
    expect(report.impossible).toEqual([['a=x', 'b=y']])
    expect(report.unreachable).toEqual([])
    expect(explainCases(ruled).impossible).toEqual([['a=x', 'b=y']])
  })
})

describe('repair', () => {
  const picture = defineComponent({
    name: 'atoms/media/Image',
    schema: z.strictObject({
      image: image.optional(),
      srcset: z.string().optional(),
      sizes: z.enum(['full', 'half', 'third']).optional(),
      ratio: z.enum(['1:1', '4:3', '16:9']).default('4:3'),
      caption: z.string().optional(),
    }).superRefine((props, context) => {
      if (Boolean(props.image) === Boolean(props.srcset))
        context.addIssue({ code: 'custom', path: ['srcset'], message: 'image xor srcset' })
    }),
    examples: { srcset: 'a.jpg 1x, b.jpg 2x', caption: f => f.lorem.sentence() },
  })

  it('finds valid cases for both branches of image xor srcset', () => {
    const cases = testCases(picture, { limit: 1 })
    expectValid(picture, cases)
    expect(cases.some(testCase => 'image' in testCase.props)).toBe(true)
    expect(cases.some(testCase => 'srcset' in testCase.props)).toBe(true)
    const report = explainCases(picture, { limit: 1 })
    expect(report.unreachable).toEqual([])
    expect(report.impossible).toEqual(expect.arrayContaining([['-image', '-srcset'], ['+image', '+srcset']]))
  })

  it('reports values no valid case can hold', () => {
    const broken = defineComponent({
      name: 'atoms/Broken',
      schema: z.strictObject({ variant: z.enum(['a', 'b']), muted: z.boolean().default(false) }).superRefine((props, context) => {
        if (props.variant === 'b')
          context.addIssue({ code: 'custom', path: ['variant'], message: 'b is never valid' })
      }),
      examples: {},
    })
    expect(explainCases(broken).unreachable).toEqual(['variant=b'])
    expect(explainCases(broken, { limit: 1 }).unreachable).toEqual(['variant=b'])
    expect(testCases(broken, { limit: 1 }).every(testCase => (testCase.props as { variant: string }).variant === 'a')).toBe(true)
  })
})

describe('dimensions', () => {
  it('tests arrays with 0, 1 and 3 elements, rotating the templates', () => {
    const list = defineComponent({
      name: 'molecules/List',
      schema: z.strictObject({
        items: z.array(z.strictObject({ text: z.string(), highlight: z.boolean().default(false) })),
        tags: z.array(z.string()).min(1),
      }),
      examples: { items: [{ text: 'first' }, { text: f => f.lorem.word() }], tags: ['tag'] },
    })
    const report = explainCases(list)
    expect(report.dimensions).toEqual([
      { key: 'items', values: ['items=0', 'items=1', 'items=3'] },
      { key: 'items[].highlight', values: ['items[].highlight=false', '+items[].highlight'] },
      { key: 'tags', values: ['tags=1', 'tags=3'] },
    ])
    const cases = testCases(list)
    expect(cases.map(testCase => testCase.props.items.length).sort()).toEqual([0, 0, 1, 1, 1, 1, 3, 3, 3, 3])
    const three = cases.find(testCase => testCase.props.items.length === 3)!
    expect(three.props.items.map(item => item.text)).toEqual(['first', expect.any(String), 'first'])
    expect(cases.some(testCase => testCase.props.items.some(item => item.highlight))).toBe(true)
  })

  it('counts the fields of an optional object only when it is set', () => {
    const teaser = defineComponent({
      name: 'molecules/Teaser',
      schema: z.strictObject({ cta: z.strictObject({ text: z.string(), variant: z.enum(['primary', 'outline']).default('outline') }).optional() }),
      examples: { cta: { text: 'More' } },
    })
    expect(testCases(teaser).map(testCase => testCase.name).sort()).toEqual(['+cta', '+cta cta.variant=primary', 'minimal'])
  })

  it('gives optional booleans without default a third value', () => {
    const report = explainCases(defineComponent({ name: 'a', schema: z.strictObject({ open: z.boolean().optional(), shut: z.boolean() }), examples: {} }))
    expect(report.dimensions).toEqual([
      { key: 'open', values: ['-open', 'open=false', '+open'] },
      { key: 'shut', values: ['shut=false', '+shut'] },
    ])
  })

  it('takes every option of a union as a value', () => {
    const choice = defineComponent({
      name: 'atoms/Choice',
      schema: z.strictObject({
        size: z.union([z.literal('auto'), z.number().int().positive()]),
        target: z.discriminatedUnion('type', [
          z.strictObject({ type: z.literal('page'), id: z.number() }),
          z.strictObject({ type: z.literal('url'), href: z.string() }),
        ]).optional(),
      }),
      examples: { size: 12, target: { type: 'url', href: 'https://example.org' } },
    })
    const report = explainCases(choice)
    expect(report.dimensions).toEqual([
      { key: 'size', values: ['size=auto', 'size=1'] },
      { key: 'target', values: ['-target', 'target=page', 'target=url'] },
    ])
    expect(report.unreachable).toEqual([])
    const cases = testCases(choice)
    expectValid(choice, cases)
    expect(cases.map(testCase => testCase.props.size)).toEqual(expect.arrayContaining(['auto', 12]))
    expect(cases.map(testCase => testCase.props.target?.type)).toEqual(expect.arrayContaining([undefined, 'page', 'url']))
  })
})

describe('slots', () => {
  const box = defineComponent({
    name: 'molecules/Box',
    schema: z.strictObject({ dark: z.boolean().default(false) }),
    examples: {},
    slots: { header: '<b>Header</b>' },
  })

  it('tests each slot empty and filled, with a placeholder without content', () => {
    const cases = testCases(box, { slotNames: ['default'] })
    expect(explainCases(box, { slotNames: ['default'] }).dimensions.map(dimension => dimension.key)).toEqual(['dark', 'slot:default', 'slot:header'])
    expect(cases).toHaveLength(8)
    expect(cases.map(testCase => testCase.slots)).toContainEqual({ default: '<p data-slot="default">Slot default</p>', header: '<b>Header</b>' })
    expect(cases[0].slots).toEqual({})
  })
})

describe('named cases', () => {
  const card = defineComponent({
    name: 'molecules/Card',
    schema: z.strictObject({
      variant: z.enum(['tile', 'teaser']),
      title: z.string().optional(),
      text: z.string().optional(),
      href: z.string().optional(),
    }).superRefine((props, context) => {
      if (!props.title && props.variant !== 'teaser')
        context.addIssue({ code: 'custom', path: ['title'], message: 'title required' })
    }),
    examples: { variant: 'tile', title: 'Title', text: f => f.lorem.sentence(), href: 'https://example.org' },
    cases: { 'teaser without title': { props: { variant: 'teaser', title: undefined, text: 'Text only' }, slots: { default: '<p>x</p>' } } },
  })

  it('come as stage named, filled with the examples', () => {
    const named = testCases(card).filter(testCase => testCase.stage === 'named')
    expect(named).toEqual([{
      id: expect.stringMatching(/^[0-9a-f]{8}$/),
      name: 'teaser without title',
      stage: 'named',
      props: { variant: 'teaser', text: 'Text only', href: 'https://example.org' },
      slots: { default: '<p>x</p>' },
      files: [],
    }])
    expect(explainCases(card).cases.named).toBe(1)
  })

  it('fail loudly when no valid props hold them', () => {
    const broken = { ...card, cases: { 'tile without title': { props: { variant: 'tile', title: undefined } } } }
    expect(() => testCases(broken)).toThrow('tile without title: title: title required')
    expect(explainCases(broken).namedErrors).toEqual(['tile without title: title: title required'])
  })
})

describe('files', () => {
  const card = defineComponent({
    name: 'molecules/Card',
    schema: z.strictObject({
      image: image.optional(),
      cover: z.string().describe('In Fluid a FileReference').optional(),
      icon: z.string().describe('Name of the icon').optional(),
      meta: z.array(z.strictObject({ image })).optional(),
    }),
    examples: { cover: 'people/3', icon: 'arrow', meta: [{}] },
  })

  it('lists image props per case: FileReference in the description or image.src', () => {
    const cases = testCases(card)
    const full = cases.find(testCase => testCase.name === '+image +cover +icon meta=3')!
    expect(full.files).toEqual(['image.src', 'cover', 'meta[0].image.src', 'meta[1].image.src', 'meta[2].image.src'])
    expect(cases[0].files).toEqual([])
  })

  it('takes the rule as an option', () => {
    const cases = testCases(card, { isFile: path => path === 'icon' })
    expect(new Set(cases.flatMap(testCase => testCase.files))).toEqual(new Set(['icon']))
  })
})

describe('determinism', () => {
  const profile = defineComponent({
    name: 'molecules/Profile',
    schema: z.strictObject({
      layout: z.enum(['row', 'column', 'grid', 'stack']),
      name: z.string(),
      bio: z.string().optional(),
      links: z.array(z.strictObject({ text: z.string(), external: z.boolean().default(false) })).optional(),
      avatar: image.optional(),
      badge: z.enum(['new', 'pro', 'team']).optional(),
    }),
    examples: { name: f => f.person.fullName(), bio: f => f.lorem.sentence(), links: [{ text: f => f.lorem.words(2) }] },
  })

  it('gives the same cases for the same seed and other values for another', () => {
    const first = testCases(profile, { seed: 3, limit: 10 })
    expect(testCases(profile, { seed: 3, limit: 10 })).toEqual(first)
    const other = testCases(profile, { seed: 4, limit: 10 })
    expect(other.map(testCase => testCase.props)).not.toEqual(first.map(testCase => testCase.props))
  })

  it('keeps the id of a case independent of the seed', () => {
    const ids = (seed: number): Map<string, string> => new Map(testCases(profile, { seed }).map(testCase => [testCase.name, testCase.id]))
    expect(ids(3)).toEqual(ids(4))
    const values = [...ids(3).values()]
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('the stage shape', () => {
  const levels = ['p', 'q', 'r'] as const
  const panel = defineComponent({
    name: 'organisms/Panel',
    schema: z.strictObject({ a: z.enum(levels), b: z.enum(levels), c: z.enum(levels), d: z.enum(levels), e: z.enum(levels), f: z.enum(levels) }),
    examples: {},
  })
  type PanelProps = z.input<typeof panel.schema>
  // a three-way interaction that pairs alone may miss
  const render = (props: PanelProps): string => `<div class="c-panel c-panel--${props.a}">${props.a === 'r' && props.b === 'r' && props.c === 'r' ? '<span class="c-panel__rare" data-rare></span>' : ''}</div>`

  it('adds cases until every markup feature of the random samples occurs', () => {
    const cases = testCases(panel, { limit: 10, render })
    const features = new Set(cases.flatMap(testCase => [...markupFeatures(render(testCase.props))]))
    expect(features).toContain('el:div.c-panel > span.c-panel__rare')
    expect(features).toContain('attr:data-rare')
    const report = explainCases(panel, { limit: 10, render })
    expect(report.cases.shape).toBe(cases.filter(testCase => testCase.stage === 'shape').length)
  })

  it('needs render and the pairwise mode', () => {
    expect(explainCases(panel, { limit: 10 }).cases.shape).toBe(0)
    expect(explainCases(panel, { render }).cases.shape).toBe(0)
  })

  it('reports render errors on valid props instead of throwing', () => {
    const report = explainCases(panel, {
      limit: 10,
      render: (props) => {
        if (props.d === 'q')
          throw new Error('unknown icon q')
        return '<div></div>'
      },
    })
    expect(report.renderErrors).toEqual([{ case: expect.stringContaining('d=q'), message: 'unknown icon q' }])
  })
})

describe('markupFeatures', () => {
  it('reads elements with class paths, modifiers and attribute names', () => {
    expect(markupFeatures('<article class="c-card c-card--large is-active"><h3 class=c-card__title id="x">T<br/></h3><img src="a" alt=""></article>')).toEqual(new Set([
      'attr:class',
      'mod:c-card--large',
      'mod:is-active',
      'el:article.c-card',
      'attr:id',
      'el:article.c-card > h3.c-card__title',
      'el:article.c-card > h3.c-card__title > br',
      'attr:src',
      'attr:alt',
      'el:article.c-card > img',
    ]))
  })

  it('keeps further classes out of the path, so a theme class does not repeat every element', () => {
    expect(markupFeatures('<article class="c-card theme-green"><p class="c-card__text"></p></article>')).toEqual(new Set([
      'attr:class',
      'class:theme-green',
      'el:article.c-card',
      'el:article.c-card > p.c-card__text',
    ]))
  })
})
