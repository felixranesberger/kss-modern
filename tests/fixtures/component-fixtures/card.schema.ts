// Copy of hss.de molecules/card/card.schema.ts, examples completed for the required entries.
import { z } from 'zod'
import { defineComponent } from '../../../lib/component-schema.ts'
import { additionalAttributes, headingTag } from './schema-fragments.ts'

export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({
    variant: z.enum([
      'highlight',
      'tile',
      'teaser',
      'large',
      'news',
      'bignews',
      'topnews',
      'news-slider',
      'newsroom',
      'topic',
      'small-topic',
    ]).describe('Layout and image format. teaser is the small call to action, consecutive teasers alternate surface and image side. news-slider is a news card inside the news slider, newsroom a card in c-cards__newsroom, where the position in the grid sets the layout. small-topic is a link with the title only'),
    border: z.boolean().default(false),
    diamond: z.boolean().describe('Diamond decoration behind the card').default(false),
    reverse: z.boolean().describe('Text before the image, requires variant large').default(false),
    theme: z.enum([
      'green',
      'red',
      'berry',
      'sand',
      'orange',
      'cappuccino',
    ]).describe('Colour theme of the topic').optional(),
    title: z.string().describe('May contain inline HTML, optional only for variant teaser').min(1).optional(),
    titleTag: headingTag('h3', 'h2'),
    href: z.string().describe('Turns the title into a link').optional(),
    roofline: z.string().describe('Renders the header as hgroup').optional(),
    text: z.string().describe('May contain inline HTML').optional(),
    cta: z.strictObject({
      text: z.string().meta({
        examples: ['Read article'],
      }),
      href: z.string().meta({
        examples: ['#'],
      }),
      variant: z.enum(['primary', 'secondary', 'outline']).default('outline'),
    }).describe('Call to action below the text').optional(),
    image: z.strictObject({
      src: z.string().describe('Image file, the variant sets ratio and sizes. In Fluid a FileReference').meta({
        examples: ['university/2'],
      }),
      alt: z.string().default(''),
      loading: z.enum(['lazy', 'eager']).default('lazy'),
    }).optional(),
    additionalAttributes,
  }).describe('Card with title, optional roofline, text, call to action and image').superRefine((p, ctx) => {
    if (!p.title && p.variant !== 'teaser') {
      ctx.addIssue({
        code: 'custom',
        path: ['title'],
        message: `variant ${p.variant} requires title`,
      })
    }
    if (p.reverse && p.variant !== 'large') {
      ctx.addIssue({
        code: 'custom',
        path: ['reverse'],
        message: 'reverse requires variant large',
      })
    }
    if (p.variant === 'topic' || p.variant === 'small-topic') {
      for (const key of ['roofline', 'text', 'cta'] as const) {
        if (p[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} does not apply to variant ${p.variant}`,
          })
        }
      }
    }
    if (p.variant === 'small-topic') {
      if (!p.href) {
        ctx.addIssue({
          code: 'custom',
          path: ['href'],
          message: 'variant small-topic requires href',
        })
      }
      if (p.image) {
        ctx.addIssue({
          code: 'custom',
          path: ['image'],
          message: 'image does not apply to variant small-topic',
        })
      }
    }
  }),
  examples: {
    variant: 'tile',
    title: 'Scholarship: Young Journalists',
    text: 'Our funding program offers practical additional training in journalism.',
    href: f => f.internet.url(),
    roofline: f => f.lorem.words(3),
    cta: { text: 'Read article', href: f => f.internet.url() },
    image: { src: f => f.helpers.arrayElement(['university/2', 'people/3']), alt: f => f.lorem.words(3) },
  },
})
