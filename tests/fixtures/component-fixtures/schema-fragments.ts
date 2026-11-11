// Copy of hss.de build/frontend/src/templates/mixins/schema-fragments.ts, with the fakes of the concept.
import { z } from 'zod'
import { withFake } from '../../../lib/component-schema.ts'

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

type HeadingLevel = typeof HEADING_LEVELS[number]

/** Heading level of a component title, from `from` down to h6. */
export function headingTag(fallback: HeadingLevel, from: HeadingLevel = 'h1') {
  const levels = HEADING_LEVELS.slice(HEADING_LEVELS.indexOf(from)) as [HeadingLevel, ...HeadingLevel[]]
  return z.enum(levels).default(fallback)
}

/** In Fluid `src` is a FileReference. */
export function image({ loading = 'lazy' }: { loading?: 'lazy' | 'eager' } = {}) {
  return withFake(
    z.strictObject({
      src: z.string().min(1),
      alt: z.string().default(''),
      loading: z.enum(['lazy', 'eager']).default(loading),
      fetchpriority: z.enum(['high', 'low', 'auto']).optional(),
    }),
    f => ({ src: f.helpers.arrayElement(['university/2', 'people/3']), alt: f.lorem.words(3) }),
  )
}

export const link = withFake(
  z.strictObject({
    text: z.string().min(1),
    href: z.string().min(1),
  }),
  f => ({ text: f.lorem.words(2), href: f.internet.url() }),
)

/** The last prop of every component that accepts JS hooks on its root element. */
export const additionalAttributes = withFake(
  z.record(z.string().regex(/^(?:data-[a-z][a-z0-9-]*|aria-[a-z]+|hidden)$/), z.union([
    z.string(),
    z.boolean(),
  ])),
  () => ({ 'data-test': 'x', 'hidden': true }),
)
  .describe('JS hooks and state on the root element: data-*, aria-* or hidden. true renders the bare attribute, false leaves it out')
  .optional()
