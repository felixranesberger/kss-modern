import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineComponent, withFake } from '../../../../lib/component-schema.ts'
import { evaluateComponentDefinition, evaluateMixinSchema } from '../../../../lib/mixins/schema.ts'

// what a project without the optional peer sees
vi.mock('@faker-js/faker', () => {
  throw new Error('Cannot find package \'@faker-js/faker\'')
})

describe('examples without @faker-js/faker', () => {
  it('writes plain examples as they are', async () => {
    const result = await evaluateMixinSchema(z, 'defineComponent({ schema: z.object({ label: z.string(), cta: z.object({ text: z.string() }) }), examples: { label: \'Go\', cta: { text: \'More\' } } }, props)', 'defineComponent')

    expect(result).toMatchObject({ jsonSchema: { properties: { label: { examples: ['Go'] }, cta: { examples: [{ text: 'More' }] } } } })
  })

  it('names the fake and the package to install for a Faker function', async () => {
    const result = await evaluateMixinSchema(z, 'defineComponent({ schema: z.object({ items: z.array(z.object({ text: z.string() })) }), examples: { items: [{ text: f => f.lorem.word() }] } }, props)', 'defineComponent')

    expect(result).toEqual({ error: expect.stringContaining('`examples.items[0].text` is made with Faker, which needs @faker-js/faker. Install it with `npm i -D @faker-js/faker`.') })
  })

  it('reports a withFake fragment without an example the same way', async () => {
    const image = withFake(z.object({ src: z.string() }), f => ({ src: f.system.fileName() }))
    const teaser = defineComponent({ name: 'molecules/Teaser', schema: z.object({ title: z.string(), image }), examples: { title: 'Hello' } })

    expect(await evaluateComponentDefinition(z, teaser, teaser.name)).toEqual({ error: expect.stringContaining('`examples.image` is made with Faker') })
    expect(await evaluateComponentDefinition(z, { ...teaser, examples: { title: 'Hello', image: { src: 'a.jpg' } } }, teaser.name))
      .toMatchObject({ jsonSchema: { properties: { image: { examples: [{ src: 'a.jpg' }] } } } })
  })
})
