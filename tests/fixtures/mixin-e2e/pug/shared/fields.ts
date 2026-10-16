import { z } from 'zod'

export const link = z.strictObject({
  text: z.string().min(1),
  href: z.string().min(1),
})
