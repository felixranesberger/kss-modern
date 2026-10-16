import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../../lib/component-schema.ts'

describe('defineComponent of kss-modern/schema', () => {
  const schema = z.strictObject({
    text: z.string(),
    variant: z.enum(['primary', 'outline']).optional(),
    cta: z.strictObject({ text: z.string(), href: z.string() }).optional(),
  })

  it('returns the definition unchanged', () => {
    const definition = { name: 'atoms/Button', schema, examples: { text: 'Learn more' } }
    expect(defineComponent(definition)).toBe(definition)
  })

  it('keeps the literal name and checks the examples against the props', () => {
    const button = defineComponent({ name: 'atoms/Button', schema, examples: { variant: 'primary' } })
    expectTypeOf(button.name).toEqualTypeOf<'atoms/Button'>()

    // @ts-expect-error a value outside the enum
    defineComponent({ name: 'atoms/Button', schema, examples: { variant: 'ghost' } })
    // @ts-expect-error a prop the schema does not have
    defineComponent({ name: 'atoms/Button', schema, examples: { label: 'Learn more' } })
    // @ts-expect-error a field of an object prop with the wrong type
    defineComponent({ name: 'atoms/Button', schema, examples: { cta: { text: 'More', href: 1 } } })
  })

  it('takes the props a transform starts from', () => {
    const intro = defineComponent({
      name: 'organisms/Intro',
      schema: schema.transform(p => ({ ...p, isPrimary: p.variant === 'primary' })),
      examples: { text: 'Hello' },
    })
    expectTypeOf(intro.examples).toEqualTypeOf<Partial<z.input<typeof schema>> | undefined>()
  })
})
