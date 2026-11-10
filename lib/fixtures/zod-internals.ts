/**
 * Read the structure of a zod 4 schema through `_zod.def`, without importing zod: the schemas of
 * `.schema.ts` modules come from the project's or the playground's copy of zod.
 */

interface ZodCheckDef {
  check?: string
  minimum?: number
  maximum?: number
  value?: unknown
  inclusive?: boolean
}

interface ZodDef {
  type?: string
  innerType?: unknown
  in?: unknown
  shape?: Record<string, unknown>
  element?: unknown
  entries?: Record<string, string | number>
  values?: unknown[]
  options?: unknown[]
  discriminator?: string
  defaultValue?: unknown
  checks?: { _zod?: { def?: ZodCheckDef } }[]
}

/** Wrappers whose input is the input of their inner type, give or take `undefined` and `null`. */
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'readonly', 'nonoptional', 'catch'])

export function getDef(schema: unknown): ZodDef | undefined {
  if (typeof schema !== 'object' || schema === null)
    return undefined
  return (schema as { _zod?: { def?: ZodDef } })._zod?.def
}

/** The schema under the wrappers and the input side of a pipe (`.transform()`). */
export function unwrapSchema(schema: unknown): unknown {
  return inspectSchema(schema).inner
}

export interface InspectedSchema {
  /** The schema under the wrappers. */
  inner: unknown
  /** The prop may be left out, because of `.optional()` or a default. */
  optional: boolean
  hasDefault: boolean
  defaultValue?: unknown
}

/** Unwrap a schema and remember what the wrappers said. The outermost default wins. */
export function inspectSchema(schema: unknown): InspectedSchema {
  const result: InspectedSchema = { inner: schema, optional: false, hasDefault: false }
  for (let def = getDef(result.inner); def; def = getDef(result.inner)) {
    if (def.type === 'pipe') {
      result.inner = def.in
      continue
    }
    if (!def.type || !WRAPPERS.has(def.type))
      break
    if (def.type === 'optional')
      result.optional = true
    if ((def.type === 'default' || def.type === 'prefault') && !result.hasDefault) {
      result.optional = true
      result.hasDefault = true
      result.defaultValue = def.defaultValue
    }
    result.inner = def.innerType
  }
  return result
}

/** The fields of an object schema, `undefined` for anything else. */
export function getObjectShape(schema: unknown): Record<string, unknown> | undefined {
  const def = getDef(unwrapSchema(schema))
  return def?.type === 'object' ? def.shape : undefined
}

/** The element schema of an array schema, `undefined` for anything else. */
export function getArrayElement(schema: unknown): unknown {
  const def = getDef(unwrapSchema(schema))
  return def?.type === 'array' ? def.element : undefined
}

/** A check like `min_length` or `greater_than` of the schema under the wrappers. */
export function getCheck(schema: unknown, name: string): ZodCheckDef | undefined {
  for (const check of getDef(unwrapSchema(schema))?.checks ?? []) {
    if (check._zod?.def?.check === name)
      return check._zod.def
  }
  return undefined
}

/** The first `.describe()` text along the wrappers, zod passes it on to clones like `.meta()`. */
export function getDescription(schema: unknown): string | undefined {
  let current = schema
  for (let def = getDef(current); def; def = getDef(current)) {
    const description = (current as { description?: unknown }).description
    if (typeof description === 'string')
      return description
    if (!def.type || !WRAPPERS.has(def.type))
      return undefined
    current = def.innerType
  }
  return undefined
}

export interface ParseIssue {
  path: PropertyKey[]
  message: string
  keys?: string[]
}

/** Runs the schema's own `safeParse`, `undefined` when the value is valid. */
export function parseIssues(schema: unknown, value: unknown): ParseIssue[] | undefined {
  const result = (schema as { safeParse: (value: unknown) => { success: boolean, error?: { issues: ParseIssue[] } } }).safeParse(value)
  return result.success ? undefined : result.error?.issues ?? []
}
