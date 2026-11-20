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

// like atoms/media/Image of hss.de: the examples hold both sides of an either-or
const imageLike = defineComponent({
  name: 'atoms/media/Image',
  schema: z.strictObject({
    image: z.string().optional(),
    ratio: z.enum(['16:9', '1:1']).optional(),
    widths: z.array(z.int().positive()).optional(),
    srcset: z.string().optional(),
    width: z.int().positive(),
    height: z.int().positive().optional(),
    loading: z.enum(['lazy', 'eager']).default('lazy'),
  }).superRefine((p, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (Boolean(p.image) === Boolean(p.srcset))
      fail('image', 'set either image or srcset')
    if (p.image && (!p.ratio || !p.widths))
      fail('image', 'image requires ratio and widths')
    if (!p.image && (p.ratio || p.widths))
      fail('ratio', 'ratio and widths require image')
    if (p.srcset && !p.height)
      fail('height', 'srcset requires height')
    if (p.image && p.height)
      fail('height', 'height follows from ratio with image')
  }),
  examples: { image: 'university/2', ratio: '16:9', widths: [400, 800], width: 800, srcset: 'a.jpg 400w', height: 450 },
})

describe('fakeProps with examples a refinement forbids together', () => {
  it('keeps the larger valid side of an either-or', () => {
    const props = fakeProps(imageLike)
    expect(imageLike.schema.safeParse(props).success).toBe(true)
    expect(props).toEqual({ image: 'university/2', ratio: '16:9', widths: [400], width: 800 })
  })

  it('is deterministic per seed and still fixes with', () => {
    expect(fakeProps(imageLike, { seed: 3 })).toEqual(fakeProps(imageLike, { seed: 3 }))
    const srcset = fakeProps(imageLike, { with: { srcset: 'b.jpg 800w' } })
    expect(srcset).toEqual({ srcset: 'b.jpg 800w', width: 800, height: 450 })
    expect(() => fakeProps(imageLike, { with: { image: 'x', srcset: 'y' } })).toThrow('give no valid props')
  })

  it('drops the prop that excludes the most others', () => {
    // a requires b, c excludes b: keeping a and b and dropping c sets the most props
    const chain = defineComponent({
      name: 'atoms/Chain',
      schema: z.strictObject({ a: z.string().optional(), b: z.string().optional(), c: z.string().optional() }).superRefine((p, ctx) => {
        if (p.a && !p.b)
          ctx.addIssue({ code: 'custom', path: ['a'], message: 'a requires b' })
        if (p.c && p.b)
          ctx.addIssue({ code: 'custom', path: ['c'], message: 'c excludes b' })
      }),
      examples: { a: 'A', b: 'B', c: 'C' },
    })
    const props = fakeProps(chain)
    expect(props).toEqual({ a: 'A', b: 'B' })
  })

  it('stays well under 100 ms', () => {
    const start = performance.now()
    fakeProps(imageLike, { seed: 11 })
    fakeProps(card, { seed: 11 })
    expect(performance.now() - start).toBeLessThan(100)
  })
})
