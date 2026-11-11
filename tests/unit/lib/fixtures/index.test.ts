import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent, withFake } from '../../../../lib/component-schema.ts'
import { createFaker, resolveExamples } from '../../../../lib/fixtures/index.ts'

const image = withFake(
  z.strictObject({ src: z.string().min(1), alt: z.string().default('') }),
  f => ({ src: f.helpers.arrayElement(['university/2', 'people/3', 'city/1']), alt: f.lorem.words(3) }),
)
const additionalAttributes = withFake(
  z.record(z.string(), z.union([z.string(), z.boolean()])),
  () => ({ 'data-test': 'x', 'hidden': true }),
).optional()

const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({
    variant: z.enum(['tile', 'teaser']),
    reverse: z.boolean().default(false),
    theme: z.enum(['green', 'red']).optional(),
    title: z.string().min(1),
    text: z.string().optional(),
    count: z.int().optional(),
    tags: z.array(z.string()).optional(),
    meta: z.array(z.strictObject({ text: z.string(), image: image.optional() })).optional(),
    cta: z.strictObject({ text: z.string(), href: z.string(), variant: z.enum(['primary', 'outline']).default('outline') }).optional(),
    image: image.describe('In Fluid a FileReference').optional(),
    additionalAttributes,
  }).transform(props => ({ ...props, isTile: props.variant === 'tile' })),
  examples: {
    theme: 'red',
    title: 'Scholarship: Young Journalists',
    text: f => f.lorem.sentence(),
    count: f => f.number.int({ min: 1, max: 99 }),
    tags: ['fixed', f => f.lorem.word()],
    meta: [{ text: f => f.lorem.words(2) }],
    cta: { text: 'Read article', href: f => f.internet.url() },
  },
})

describe('resolveExamples', () => {
  it('gives the same values for the same seed', () => {
    expect(resolveExamples(card, { seed: 3 })).toEqual(resolveExamples(card, { seed: 3 }))
    expect(resolveExamples(card)).toEqual(resolveExamples(card, { seed: 1 }))
    expect(resolveExamples(card, { seed: 3 })).not.toEqual(resolveExamples(card, { seed: 4 }))
  })

  it('calls the fakes, keeps fixed values and resolves objects and arrays per field and element', () => {
    const resolved = resolveExamples(card, { seed: 5 })
    expect(resolved).toMatchObject({
      theme: 'red',
      title: 'Scholarship: Young Journalists',
      text: expect.any(String),
      count: expect.any(Number),
      tags: ['fixed', expect.any(String)],
      cta: { text: 'Read article', href: expect.stringMatching(/^https?:\/\//) },
    })
    expect(card.schema.safeParse({ variant: 'tile', ...resolved }).success).toBe(true)
  })

  it('fills props without an entry from their withFake fragment, also nested', () => {
    const resolved = resolveExamples(card)
    expect(resolved.image).toEqual({ src: expect.stringMatching(/^(university\/2|people\/3|city\/1)$/), alt: expect.any(String) })
    expect(resolved.additionalAttributes).toEqual({ 'data-test': 'x', 'hidden': true })
    expect(resolved.meta).toEqual([{ text: expect.any(String), image: { src: expect.any(String), alt: expect.any(String) } }])
  })

  it('leaves out enums, booleans and defaults without an entry', () => {
    const resolved = resolveExamples(card)
    expect(resolved).not.toHaveProperty('variant')
    expect(resolved).not.toHaveProperty('reverse')
    expect(resolved.cta).not.toHaveProperty('variant')
  })

  it('takes an example over the fragment\'s fake', () => {
    const teaser = defineComponent({
      name: 'molecules/Teaser',
      schema: z.strictObject({ image: image.optional() }),
      examples: { image: { src: 'people/3' } },
    })
    expect(resolveExamples(teaser)).toEqual({ image: { src: 'people/3' } })
  })

  it('handles a definition without examples', () => {
    expect(resolveExamples({ name: 'plain', schema: z.strictObject({ variant: z.enum(['a', 'b']) }) })).toEqual({})
  })
})

describe('createFaker', () => {
  it('is deterministic per seed', () => {
    expect(createFaker(9).lorem.words(5)).toBe(createFaker(9).lorem.words(5))
    expect(createFaker(9).word.words(5)).not.toBe(createFaker(10).word.words(5))
  })

  it('prefers German data', () => {
    expect(createFaker(1).rawDefinitions.metadata?.code).toBe('de')
  })
})
