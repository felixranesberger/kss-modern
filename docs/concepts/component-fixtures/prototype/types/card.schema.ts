import { z } from 'zod'
import { defineComponent } from './component-schema.ts'
import { additionalAttributes, headingTag } from './schema-fragments.ts'

export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({
    variant: z.enum(['highlight', 'tile', 'teaser', 'large', 'news', 'bignews', 'topnews', 'news-slider', 'newsroom', 'topic', 'small-topic']),
    border: z.boolean().default(false),
    diamond: z.boolean().default(false),
    reverse: z.boolean().default(false),
    theme: z.enum(['green', 'red', 'berry', 'sand', 'orange', 'cappuccino']).optional(),
    title: z.string().min(1).optional(),
    titleTag: headingTag('h3', 'h2'),
    href: z.string().optional(),
    roofline: z.string().optional(),
    text: z.string().optional(),
    cta: z.strictObject({
      text: z.string(),
      href: z.string(),
      variant: z.enum(['primary', 'secondary', 'outline']).default('outline'),
    }).optional(),
    image: z.strictObject({
      src: z.string().describe('In Fluid a FileReference'),
      alt: z.string().default(''),
      loading: z.enum(['lazy', 'eager']).default('lazy'),
    }).optional(),
    additionalAttributes,
  }).superRefine((p, ctx) => {
    if (!p.title && p.variant !== 'teaser') ctx.addIssue({ code: 'custom', path: ['title'], message: 'title' })
    if (p.reverse && p.variant !== 'large') ctx.addIssue({ code: 'custom', path: ['reverse'], message: 'reverse' })
  }),
  examples: {
    variant: 'tile',
    title: 'Scholarship: Young Journalists',
    text: f => f.lorem.sentence(),
    href: f => f.internet.url(),
    roofline: f => f.lorem.words(4),
    cta: { text: 'Read article', href: f => f.internet.url() },
    image: { src: f => f.helpers.arrayElement(['university/2', 'people/3']), alt: f => f.lorem.words(3) },
  },
  slots: {},
  cases: {
    'teaser ohne Titel (Ticket 1234)': { props: { variant: 'teaser', title: undefined, text: 'Nur Text' } },
  },
})
