import { z } from 'zod'
import { defineComponent } from './component-schema.ts'
import { additionalAttributes, image, link } from './schema-fragments.ts'

const ICONS = ['calendar-days', 'map-pin', 'clock'] as const

export const intro = defineComponent({
  name: 'organisms/Intro',
  schema: z.strictObject({
    title: z.string().min(1),
    variant: z.enum(['large', 'text', 'event', 'article-detail']).optional(),
    meta: z.array(z.strictObject({
      text: z.string().optional(),
      icon: z.string().optional(),
      href: z.string().optional(),
    })).optional(),
    cta: link.optional(),
    image: image({ loading: 'eager' }).optional(),
    additionalAttributes,
  }),
  examples: {
    title: f => f.lorem.sentence(),
    // Ein Element als Vorlage. Der Generator variiert Anzahl und gesetzte Felder.
    // Der Icon-String kommt aus einer festen Auswahl, weil atoms/Icon ein Enum erwartet.
    meta: [
      { icon: f => f.helpers.arrayElement(ICONS), text: f => f.date.future().toLocaleDateString('de-DE'), href: f => f.internet.url() },
    ],
  },
})
