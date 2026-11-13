import { z } from 'zod'
import { link } from './shared/fields'

const input = z.strictObject({
  title: z.string().min(1),
  variant: z.enum(['default', 'highlight']).default('default'),
  cta: link.optional(),
  byline: z.strictObject({
    author: z.strictObject({ name: z.string().min(1) }),
  }).optional(),
}).describe('Teaser whose schema lives in a .schema.ts file')

type Input = z.output<typeof input>

export const teaser = {
  name: 'organisms/Teaser',
  schema: input.transform((p: Input) => ({ ...p, isHighlighted: p.variant === 'highlight', hasCta: p.cta !== undefined })),
  examples: { title: 'Teaser title' },
}
