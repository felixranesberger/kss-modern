// Copy of hss.de atoms/button/button.schema.ts, examples completed for the required entries.
import { z } from 'zod'
import { defineComponent } from '../../../lib/component-schema.ts'
import { additionalAttributes } from './schema-fragments.ts'

export const button = defineComponent({
  name: 'atoms/Button',
  schema: z.strictObject({
    text: z.string().describe('Label, only exposed to screen readers with variant icon-only').min(1),
    type: z.enum(['button', 'submit']).describe('Type of the button element, not with href').default('button'),
    variant: z.enum([
      'primary',
      'primary-subtle',
      'secondary',
      'outline',
      'text',
      'icon-only',
      'w-fixed',
    ]).describe('Without a variant: default button').optional(),
    href: z.string().describe('Renders an a element instead of a button').optional(),
    icon: z.string().describe('Icon after the label').optional(),
    iconBefore: z.string().describe('Icon before the label').optional(),
    muted: z.boolean().describe('Looks disabled but stays operable, e.g. a booked-up event').default(false),
    sliderArrow: z.enum(['prev', 'next']).describe('Makes the button an arrow of a Splide carousel, used by organisms/Carousel').optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    value: z.string().optional(),
    form: z.string().optional(),
    target: z.string().optional(),
    download: z.boolean().optional(),
    disabled: z.boolean().optional(),
    formnovalidate: z.boolean().optional(),
    command: z.string().describe('Invoker command, e.g. show-modal or close').optional(),
    commandfor: z.string().describe('Id of the element the command controls').optional(),
    ariaLabel: z.string().optional(),
    additionalAttributes,
  }).describe('Button, or a link styled as a button').superRefine((p, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({
        code: 'custom',
        path: [path],
        message,
      })
    }
    const isLink = p.href !== undefined
    for (const key of ['target', 'download'] as const) {
      if (!isLink && p[key] !== undefined) {
        fail(key, `${key} requires href`)
      }
    }
    for (const key of [
      'name',
      'value',
      'form',
      'disabled',
      'formnovalidate',
      'command',
      'commandfor',
    ] as const) {
      if (isLink && p[key] !== undefined) {
        fail(key, `${key} only applies to a button element, not with href`)
      }
    }
    if (isLink && p.type === 'submit') {
      fail('type', 'type submit only applies to a button element, not with href')
    }
    if (p.variant === 'icon-only' && !p.icon && !p.iconBefore) {
      fail('variant', 'icon-only needs icon or iconBefore')
    }
    if (Boolean(p.command) !== Boolean(p.commandfor)) {
      fail('commandfor', 'command and commandfor go together')
    }
    if (p.sliderArrow && (isLink || p.type !== 'button')) {
      fail('sliderArrow', 'sliderArrow requires type button without href')
    }
  }),
  examples: {
    text: 'Learn more',
    variant: 'primary',
    icon: 'chevrons-inline-start',
    href: f => f.internet.url(),
    iconBefore: f => f.helpers.arrayElement(['arrow-right', 'download']),
    id: f => `button-${f.number.int({ min: 1, max: 99 })}`,
    name: 'action',
    value: f => f.lorem.word(),
    form: 'form-1',
    target: '_blank',
    command: 'show-modal',
    commandfor: 'dialog-1',
    ariaLabel: f => f.lorem.words(2),
  },
})
