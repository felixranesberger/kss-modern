/**
 * The test matrix of a schema: its dimensions and a tree that builds props from one value per
 * dimension. An assignment is an array of value indexes, one per dimension.
 */
import type { Faker } from '@faker-js/faker'
import type { Fake, SlotContent } from '../component-schema.ts'
import { getFake } from '../component-schema.ts'
import { fallbackValue, isPlainObject, resolveValue } from './values.ts'
import { getCheck, getDef, getDescription, inspectSchema, parseIssues, unwrapSchema } from './zod-internals.ts'

export const ABSENT = Symbol('absent')
export const PRESENT = Symbol('present')
const SKIP = Symbol('skip')

export interface Dimension {
  /** Prop path, `[]` for array elements, or `slot:<name>`. */
  key: string
  kind: 'choice' | 'presence' | 'count' | 'union' | 'slot'
  /** {@link ABSENT}, {@link PRESENT}, enum values, array lengths or union option indexes. */
  values: unknown[]
  labels: string[]
  minimal: number
  /** The dimension that switches this one on, -1 for none. */
  parent: number
  /** The values of `parent` under which this dimension counts. */
  gate: ReadonlySet<number>
  depth: number
  schema: unknown
}

type Node = ChoiceNode | LeafNode | ObjectNode | ArrayNode | UnionNode

interface ChoiceNode { kind: 'choice', dim: number, schema: unknown, fixed: unknown, hasDefault: boolean, defaultValue: unknown }
interface LeafNode { kind: 'leaf', dim: number, schema: unknown }
interface ObjectNode { kind: 'object', dim: number, schema: unknown, fields: { key: string, node: Node }[] }
interface ArrayNode { kind: 'array', dim: number, schema: unknown, element: Node, count: number }
interface UnionNode { kind: 'union', dim: number, schema: unknown, options: Standalone[] }

/** A union option: built with its own minimal choice, its values are not part of the matrix. */
interface Standalone { schema: unknown, node: Node, dims: Dimension[], minimal: number[] }

export interface Plan {
  root: ObjectNode
  dims: Dimension[]
}

interface Scope {
  dims: Dimension[]
  parent: number
  gate: ReadonlySet<number>
  depth: number
}

const NO_GATE: ReadonlySet<number> = new Set()

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key
}

function addDimension(scope: Scope, dimension: Pick<Dimension, 'key' | 'kind' | 'values' | 'labels' | 'minimal' | 'schema'>): number {
  scope.dims.push({ ...dimension, parent: scope.parent, gate: scope.gate, depth: scope.depth })
  return scope.dims.length - 1
}

function below(scope: Scope, parent: number, gate: ReadonlySet<number>): Scope {
  return { dims: scope.dims, parent, gate, depth: scope.depth + 1 }
}

function addPresence(scope: Scope, key: string, schema: unknown): number {
  return addDimension(scope, { key, kind: 'presence', values: [ABSENT, PRESENT], labels: [`-${key}`, `+${key}`], minimal: 0, schema })
}

function choiceLabel(key: string, value: unknown): string {
  if (value === ABSENT)
    return `-${key}`
  return value === true ? `+${key}` : `${key}=${String(value)}`
}

function optionLabel(option: unknown, discriminator: string | undefined, index: number): string {
  const def = getDef(unwrapSchema(option))
  if (def?.type === 'literal' && def.values?.length === 1)
    return String(def.values[0])
  const tag = discriminator ? getDef(unwrapSchema(def?.shape?.[discriminator])) : undefined
  return tag?.type === 'literal' && tag.values?.length === 1 ? String(tag.values[0]) : String(index)
}

function compileStandalone(schema: unknown): Standalone {
  const dims: Dimension[] = []
  const node = compileNode(schema, '', { dims, parent: -1, gate: NO_GATE, depth: 0 })
  return { schema, node, dims, minimal: dims.map(dimension => dimension.minimal) }
}

function compileNode(schema: unknown, key: string, scope: Scope): Node {
  const { inner, optional, hasDefault, defaultValue } = inspectSchema(schema)
  const def = getDef(inner)
  const absent = optional && !hasDefault
  switch (def?.type) {
    case 'enum':
    case 'literal':
    case 'boolean': {
      const options = def.type === 'boolean' ? [false, true] : def.type === 'enum' ? Object.values(def.entries ?? {}) : [...def.values ?? []]
      const values = absent ? [ABSENT, ...options] : options
      if (values.length < 2)
        return { kind: 'choice', dim: -1, schema, fixed: values[0], hasDefault, defaultValue }
      const minimal = absent ? 0 : Math.max(0, values.indexOf(hasDefault ? defaultValue : false))
      const dim = addDimension(scope, { key, kind: 'choice', values, labels: values.map(value => choiceLabel(key, value)), minimal, schema })
      return { kind: 'choice', dim, schema, fixed: undefined, hasDefault, defaultValue }
    }
    case 'object': {
      const dim = optional ? addPresence(scope, key, schema) : -1
      const inside = dim < 0 ? scope : below(scope, dim, new Set([1]))
      const fields = Object.entries(def.shape ?? {}).map(([field, fieldSchema]) => ({ key: field, node: compileNode(fieldSchema, join(key, field), inside) }))
      return { kind: 'object', dim, schema, fields }
    }
    case 'array': {
      const min = getCheck(inner, 'min_length')?.minimum ?? 0
      const max = getCheck(inner, 'max_length')?.maximum ?? Number.POSITIVE_INFINITY
      const counts = [...new Set([0, 1, 3].map(count => Math.min(Math.max(count, min), max)))]
      const values = absent ? [ABSENT, ...counts] : counts
      if (values.length < 2)
        return { kind: 'array', dim: -1, schema, element: compileNode(def.element, `${key}[]`, scope), count: counts[0] }
      const dim = addDimension(scope, { key, kind: 'count', values, labels: values.map(value => value === ABSENT ? `-${key}` : `${key}=${String(value)}`), minimal: 0, schema })
      const gate = new Set(values.flatMap((value, index) => typeof value === 'number' && value > 0 ? [index] : []))
      return { kind: 'array', dim, schema, element: compileNode(def.element, `${key}[]`, below(scope, dim, gate)), count: 0 }
    }
    case 'union': {
      const options = (def.options ?? []).map(compileStandalone)
      const labels = (def.options ?? []).map((option, index) => optionLabel(option, def.discriminator, index))
      const values = absent ? [ABSENT, ...options.keys()] : [...options.keys()]
      const dim = values.length < 2
        ? -1
        : addDimension(scope, { key, kind: 'union', values, labels: values.map(value => value === ABSENT ? `-${key}` : `${key}=${labels[value as number]}`), minimal: 0, schema })
      return { kind: 'union', dim, schema, options }
    }
    default:
      return { kind: 'leaf', dim: optional ? addPresence(scope, key, schema) : -1, schema }
  }
}

/** The matrix of a component: the props' dimensions, then one per slot. */
export function compilePlan(schema: unknown, slotNames: readonly string[], name = 'component'): Plan {
  const dims: Dimension[] = []
  const root = compileNode(unwrapSchema(schema), '', { dims, parent: -1, gate: NO_GATE, depth: 0 })
  if (root.kind !== 'object')
    throw new Error(`${name}: the schema must be an object`)
  for (const slot of slotNames) {
    const key = `slot:${slot}`
    dims.push({ key, kind: 'slot', values: [ABSENT, PRESENT], labels: [`-${key}`, `+${key}`], minimal: 0, parent: -1, gate: NO_GATE, depth: 0, schema: undefined })
  }
  return { root, dims }
}

/** Which dimensions count under this assignment. Parents come before their children. */
export function activeOf(dims: readonly Dimension[], assignment: readonly number[]): boolean[] {
  const active: boolean[] = Array.from({ length: dims.length })
  for (let index = 0; index < dims.length; index++) {
    const { parent, gate } = dims[index]
    active[index] = parent < 0 || (active[parent] && gate.has(assignment[parent]))
  }
  return active
}

/** The dimensions above `index`, nearest first. */
export function ancestorsOf(dims: readonly Dimension[], index: number): number[] {
  const ancestors: number[] = []
  for (let parent = dims[index].parent; parent >= 0; parent = dims[parent].parent)
    ancestors.push(parent)
  return ancestors
}

/** Switch on the dimensions above `index` so it counts. */
export function activate(dims: readonly Dimension[], assignment: number[], index: number): void {
  for (let child = index, parent = dims[index].parent; parent >= 0; child = parent, parent = dims[parent].parent) {
    const { gate } = dims[child]
    if (!gate.has(assignment[parent]))
      assignment[parent] = Math.min(...gate)
  }
}

/** The labels of the dimensions that count, e.g. `['variant=large', '+reverse']`. */
export function labelsOf(dims: readonly Dimension[], assignment: readonly number[]): string[] {
  const active = activeOf(dims, assignment)
  return dims.flatMap((dimension, index) => active[index] ? [dimension.labels[assignment[index]]] : [])
}

export interface BuildContext {
  faker: Faker
  /** Values by path, so a search builds every value once. */
  memo: Map<string, unknown>
}

/** The rule of the PHP data generator in hss.de: "FileReference" in the description or `image.src`. */
export function isImageFile(path: string, schema: unknown): boolean {
  if (getDef(unwrapSchema(schema))?.type !== 'string')
    return false
  const description = getDescription(schema)
  if (description !== undefined)
    return description.includes('FileReference')
  const segments = path.replace(/\[\d+\]/g, '').split('.')
  return segments.at(-1) === 'src' && segments.at(-2) === 'image'
}

function remember(context: BuildContext, key: string, make: () => unknown): unknown {
  if (context.memo.has(key))
    return context.memo.get(key)
  const value = make()
  context.memo.set(key, value)
  return value
}

function resolveLeaf(schema: unknown, example: unknown, faker: Faker): unknown {
  if (example !== undefined)
    return resolveValue(faker, schema, example)
  const fake = getFake(schema)
  return fake ? fake(faker) : fallbackValue(schema, faker)
}

/** The example of an object: a plain example, else what its fake or the fragment's fake made. */
function objectSource(schema: unknown, example: unknown, key: string, context: BuildContext): Record<string, unknown> | undefined {
  if (isPlainObject(example))
    return example
  const make = typeof example === 'function' ? example as Fake<unknown> : getFake(schema)
  const made = make && remember(context, `${key}()`, () => make(context.faker))
  return isPlainObject(made) ? made : undefined
}

function arraySource(schema: unknown, example: unknown, key: string, context: BuildContext): unknown[] {
  if (Array.isArray(example))
    return example
  const make = typeof example === 'function' ? example as Fake<unknown> : getFake(schema)
  const made = make && remember(context, `${key}()`, () => make(context.faker))
  return Array.isArray(made) ? made : []
}

interface Walk {
  dims: readonly Dimension[]
  assignment: readonly number[]
  context: BuildContext
}

/** `key` is the memo key: the prop path, with the option index inside a union. */
function buildNode(walk: Walk, node: Node, example: unknown, key: string): unknown {
  const value = node.dim < 0 ? undefined : walk.dims[node.dim].values[walk.assignment[node.dim]]
  if (value === ABSENT)
    return SKIP
  const { context } = walk
  switch (node.kind) {
    case 'choice': {
      const choice = node.dim < 0 ? node.fixed : value
      return choice === ABSENT || (node.hasDefault && Object.is(choice, node.defaultValue)) ? SKIP : choice
    }
    case 'leaf': {
      return remember(context, key, () => resolveLeaf(node.schema, example, context.faker))
    }
    case 'object': {
      const source = objectSource(node.schema, example, key, context)
      const object: Record<string, unknown> = {}
      for (const field of node.fields) {
        const built = buildNode(walk, field.node, source?.[field.key], join(key, field.key))
        if (built !== SKIP)
          object[field.key] = built
      }
      return object
    }
    case 'array': {
      const templates = arraySource(node.schema, example, key, context)
      const count = node.dim < 0 ? node.count : value as number
      return Array.from({ length: count }, (_, index) => {
        const template = templates.length > 0 ? templates[index % templates.length] : undefined
        const built = buildNode(walk, node.element, template, `${key}[${index}]`)
        return built === SKIP ? undefined : built
      })
    }
    case 'union': {
      const index = node.dim < 0 ? 0 : value as number
      const option = node.options[index]
      const optionKey = `${key}|${index}`
      if (example !== undefined) {
        const fitting = remember(context, `${optionKey}?`, () => {
          const resolved = resolveValue(context.faker, option.schema, example)
          return parseIssues(option.schema, resolved) ? SKIP : resolved
        })
        if (fitting !== SKIP)
          return fitting
      }
      return buildNode({ dims: option.dims, assignment: option.minimal, context }, option.node, undefined, `${optionKey}:`)
    }
  }
}

/** The props of an assignment, values from `examples`, the fragments' fakes or a fallback. */
export function buildProps(plan: Plan, assignment: readonly number[], examples: unknown, context: BuildContext): Record<string, unknown> {
  return buildNode({ dims: plan.dims, assignment, context }, plan.root, isPlainObject(examples) ? examples : undefined, '') as Record<string, unknown>
}

/** The filled slots: content from `slots`, else a placeholder. */
export function buildSlots(plan: Plan, assignment: readonly number[], contents: Record<string, SlotContent> | undefined, context: BuildContext): Record<string, string> {
  const slots: Record<string, string> = {}
  plan.dims.forEach((dimension, index) => {
    if (dimension.kind !== 'slot' || assignment[index] !== 1)
      return
    const name = dimension.key.slice('slot:'.length)
    const content = contents?.[name]
    slots[name] = String(remember(context, dimension.key, () => typeof content === 'function'
      ? content(context.faker)
      : content ?? `<p data-slot="${name}">Slot ${name}</p>`))
  })
  return slots
}

/** Paths of the props that hold files, read from the final props. */
export function collectFiles(plan: Plan, props: Record<string, unknown>, isFile: (path: string, schema: unknown) => boolean): string[] {
  const files: string[] = []
  const walk = (node: Node, value: unknown, path: string): void => {
    if (value === undefined)
      return
    if (node.kind === 'leaf' && isFile(path, node.schema))
      files.push(path)
    else if (node.kind === 'object' && isPlainObject(value))
      node.fields.forEach(field => walk(field.node, value[field.key], join(path, field.key)))
    else if (node.kind === 'array' && Array.isArray(value))
      value.forEach((item, index) => walk(node.element, item, `${path}[${index}]`))
    else if (node.kind === 'union')
      node.options.filter(option => !parseIssues(option.schema, value)).slice(0, 1).forEach(option => walk(option.node, value, path))
  }
  walk(plan.root, props, '')
  return files
}
