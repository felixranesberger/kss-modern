import type * as Zod from 'zod'
import { createRequire } from 'node:module'
import { logger } from './logger.ts'

export type ZodNamespace = typeof Zod.z

const nodeRequire = createRequire(import.meta.url)

/** `null` once we know zod 4 is not available. */
let zodVersion: string | null | undefined
let zodNamespace: ZodNamespace | undefined

/**
 * The installed zod version, or undefined without zod 4 (the optional peer dependency behind the
 * mixin playground). Only reads zod's `package.json`, so checking costs nothing: zod itself loads
 * when a template or a schema actually uses it, see {@link requireZod}. Logs once when it is missing.
 */
export function getZodVersion(): string | undefined {
  if (zodVersion === undefined) {
    try {
      const { version } = nodeRequire('zod/package.json') as { version: string }
      zodVersion = version.startsWith('4.') ? version : null
      if (zodVersion === null)
        logger.info(`Mixin playground disabled: it needs zod 4, but zod ${version} is installed.`)
    }
    catch {
      zodVersion = null
      logger.info('Mixin playground disabled: zod is not installed. Install it with `npm i -D zod` to enable it.')
    }
  }
  return zodVersion ?? undefined
}

/**
 * zod's `z`, loaded on first use. Synchronous (zod ships a CommonJS build), so it can sit behind a
 * getter on the template locals: a template that never mentions `z` never loads zod, which keeps
 * it off every pug worker thread's start-up path.
 */
export function requireZod(): ZodNamespace | undefined {
  if (!getZodVersion())
    return undefined
  zodNamespace ??= (nodeRequire('zod') as { z: ZodNamespace }).z
  return zodNamespace
}
