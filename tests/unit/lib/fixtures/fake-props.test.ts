import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent, withFake } from '../../../../lib/component-schema.ts'
import { fakeProps } from '../../../../lib/fixtures/index.ts'

const image = withFake(
  z.strictObject({ src: z.string().min(1), alt: z.string().default('') }),
  f => ({ src: f.helpers.arrayElement(['university/2', 'people/3']), alt: f.lorem.words(3) }),
)

const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({
    variant: z.enum(['tile', 'large', 'teaser']),
    reverse: z.boolean().default(false),
    title: z.string().min(1),
    text: z.string().optional(),
    href: z.string().optional(),
    target: z.string().optional(),
    tags: z.array(z.string()).optional(),
    image: image.optional(),
  }).superRefine((props, context) => {
    if (props.reverse && props.variant !== 'large')
      context.addIssue({ code: 'custom', path: ['reverse'], message: 'reverse requires variant large' })
    if (props.target && !props.href)
      context.addIssue({ code: 'custom', path: ['target'], message: 'target requires href' })
  }),
  examples: {
    variant: 'tile',
    title: 'Scholarship',
    text: f => f.lorem.sentence(),
    href: f => f.internet.url(),
    target: '_blank',
    tags: ['a', 'b'],
  },
})

describe('fakeProps', () => {
  it('fills every prop with an example or a fake and takes enums from the examples', () => {
    const props = fakeProps(card)
    expect(props).toEqual({
      variant: 'tile',
      title: 'Scholarship',
      text: expect.any(String),
      href: expect.stringMatching(/^https?:\/\//),
      target: '_blank',
      tags: ['a'],
      image: { src: expect.any(String), alt: expect.any(String) },
    })
    expect(card.schema.safeParse(props).success).toBe(true)
  })

  it('is deterministic per seed', () => {
    expect(fakeProps(card, { seed: 7 })).toEqual(fakeProps(card, { seed: 7 }))
    expect(fakeProps(card, { seed: 7 })).not.toEqual(fakeProps(card, { seed: 8 }))
  })

  it('fixes the values of with and lets the others yield', () => {
    expect(fakeProps(card, { with: { variant: 'large', reverse: true } })).toMatchObject({ variant: 'large', reverse: true })
    const withoutLink = fakeProps(card, { with: { href: undefined } })
    expect(withoutLink).not.toHaveProperty('href')
    expect(withoutLink).not.toHaveProperty('target')
    expect(card.schema.safeParse(withoutLink).success).toBe(true)
  })

  it('throws a clear error when with allows no valid props', () => {
    expect(() => fakeProps(card, { with: { variant: 'tile', reverse: true } }))
      .toThrow('fakeProps(molecules/Card): with { variant, reverse } give no valid props. reverse: reverse requires variant large')
    expect(() => fakeProps(card, { with: { title: '' } })).toThrow('title: Too small')
  })
})
