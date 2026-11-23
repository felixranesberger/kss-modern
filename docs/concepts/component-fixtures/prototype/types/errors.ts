import { z } from 'zod'
import { defineComponent } from './component-schema.ts'
import { additionalAttributes, image } from './schema-fragments.ts'
import { card } from './card.schema.ts'
import { fakeProps } from './fixtures.ts'

const schema = z.strictObject({
  title: z.string().min(1),
  count: z.int().optional(),
  variant: z.enum(['a', 'b']).default('a'),
  open: z.boolean().default(false),
  alt: z.string().default(''),
  tags: z.array(z.string()).optional(),
  cta: z.strictObject({ text: z.string(), variant: z.enum(['x', 'y']).default('x') }).optional(),
  image: image().optional(),
  additionalAttributes,
})

// ok: alle Wert-Props da, Enums/Booleans/Defaults/Fragmente mit Fake fehlen erlaubt
defineComponent({ name: 'ok', schema, examples: { title: 'T', count: 3, tags: [f => f.lorem.word(), 'b'], cta: { text: f => f.lorem.words(2) } } })

// 1. Pflichtangabe vergessen (count)
// @ts-expect-error count fehlt
defineComponent({ name: 'e1', schema, examples: { title: 'T', tags: [], cta: { text: 'x' } } })

// 2. Tippfehler im Prop-Namen
defineComponent({ name: 'e2', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' },
  // @ts-expect-error unbekannte Prop
  titel: 'x' } })

// 3. Wert außerhalb des Enums
// @ts-expect-error 'c' ist kein variant
defineComponent({ name: 'e3', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' }, variant: 'c' } })

// 4. Faker-Funktion liefert falschen Typ
// @ts-expect-error Zahl statt String
defineComponent({ name: 'e4', schema, examples: { title: f => f.number.int({ min: 1, max: 2 }), count: 1, tags: [], cta: { text: 'x' } } })

// 5. Pflichtfeld im verschachtelten Objekt vergessen
// @ts-expect-error cta.text fehlt
defineComponent({ name: 'e5', schema, examples: { title: 'T', count: 1, tags: [], cta: {} } })

// 6. Falscher Elementtyp in der Liste
// @ts-expect-error Zahl in string[]
defineComponent({ name: 'e6', schema, examples: { title: 'T', count: 1, tags: [1], cta: { text: 'x' } } })

// 7. Callback-Parameter ist Faker, nicht any: unbekannte Faker-Methode ist ein Fehler
// @ts-expect-error lorem.wort gibt es nicht
defineComponent({ name: 'e7', schema, examples: { title: f => f.lorem.wort(), count: 1, tags: [], cta: { text: 'x' } } })

// 8. withFake prüft den Rückgabewert gegen das Fragment
import { withFake } from './component-schema.ts'
// @ts-expect-error href fehlt im Fake
withFake(z.strictObject({ text: z.string(), href: z.string() }), f => ({ text: f.lorem.word() }))

// 9. fakeProps: with prüft Werte
// @ts-expect-error 'huge' ist keine Variante
fakeProps(card, { with: { variant: 'huge' } })

// 10. Eigener Fall mit unbekannter Prop
defineComponent({ name: 'e10', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x' } },
  // @ts-expect-error unbekannte Prop im Fall
  cases: { kaputt: { props: { titel: 'x' } } } })

// 11. Fake-Funktion statt fester Liste für ein Array, falscher Rückgabewert
// @ts-expect-error string statt string[]
defineComponent({ name: 'e11', schema, examples: { title: 'T', count: 1, tags: f => f.lorem.word(), cta: { text: 'x' } } })

// 12. Faker-Typ bleibt auch in Listen-Elementen und verschachtelten Objekten erhalten
// @ts-expect-error lorem.wort gibt es nicht
defineComponent({ name: 'e12', schema, examples: { title: 'T', count: 1, tags: [f => f.lorem.wort()], cta: { text: 'x' } } })
// @ts-expect-error lorem.wort gibt es nicht
defineComponent({ name: 'e13', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: f => f.lorem.wort() } } })

// 14. Enum im verschachtelten Objekt
// @ts-expect-error 'z' ist kein cta.variant
defineComponent({ name: 'e14', schema, examples: { title: 'T', count: 1, tags: [], cta: { text: 'x', variant: 'z' } } })
