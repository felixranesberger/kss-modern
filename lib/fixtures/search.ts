/**
 * Valid assignments: `safeParse` decides, a local search repairs, and a coverage table tracks
 * which value pairs (or triples) a set of cases holds.
 */
import type { SlotContent } from '../component-schema.ts'
import type { BuildContext, Dimension, Plan } from './plan.ts'
import type { ParseIssue } from './zod-internals.ts'
import { activeOf, buildProps, buildSlots } from './plan.ts'
import { createFaker, createRandom, shuffle } from './values.ts'
import { parseIssues } from './zod-internals.ts'

export interface Evaluation {
  valid: boolean
  /** Number of zod issues. */
  cost: number
  /** Dimensions named by the issue paths, tried first by {@link repair}. */
  focus: number[]
  issues: string[]
}

const VALID: Evaluation = { valid: true, cost: 0, focus: [], issues: [] }

export interface SearchSource {
  name: string
  schema: unknown
  examples?: unknown
  slots?: Record<string, SlotContent>
}

export interface Search {
  plan: Plan
  random: () => number
  evaluate: (assignment: readonly number[]) => Evaluation
  /** Props with the search's values, the same for every assignment. */
  props: (assignment: readonly number[]) => Record<string, unknown>
  slots: (assignment: readonly number[]) => Record<string, string>
}

/** Props with `overlay` on top, `undefined` there leaves the prop out. */
export function applyOverlay(props: Record<string, unknown>, overlay: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!overlay)
    return props
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined)
      delete props[key]
    else
      props[key] = value
  }
  return props
}

function issueKey(path: readonly PropertyKey[]): string {
  let key = ''
  for (const segment of path) {
    if (typeof segment === 'number')
      key += '[]'
    else
      key += key ? `.${String(segment)}` : String(segment)
  }
  return key
}

/** `inner` is `outer` or a path below it. */
export function within(outer: string, inner: string): boolean {
  return inner === outer || inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`)
}

function related(dimensionKey: string, key: string): boolean {
  return key !== '' && (within(key, dimensionKey) || within(dimensionKey, key))
}

function focusOf(dims: readonly Dimension[], issues: readonly ParseIssue[]): number[] {
  const keys = issues.flatMap(issue => issue.keys?.length
    ? issue.keys.map(key => issueKey([...issue.path, key]))
    : [issueKey(issue.path)])
  return dims.flatMap((dimension, index) => keys.some(key => related(dimension.key, key)) ? [index] : [])
}

/** Validity ignores slots and dimensions that do not count. */
function validityKey(dims: readonly Dimension[], assignment: readonly number[]): string {
  const active = activeOf(dims, assignment)
  let key = ''
  for (let index = 0; index < dims.length; index++)
    key += active[index] && dims[index].kind !== 'slot' ? `${assignment[index]},` : '-,'
  return key
}

export function createSearch(source: SearchSource, plan: Plan, options: { seed: number, overlay?: Record<string, unknown> }): Search {
  const context: BuildContext = { faker: createFaker(options.seed), memo: new Map() }
  const cache = new Map<string, Evaluation>()
  const props = (assignment: readonly number[]): Record<string, unknown> =>
    applyOverlay(buildProps(plan, assignment, source.examples, context), options.overlay)
  const evaluate = (assignment: readonly number[]): Evaluation => {
    const key = validityKey(plan.dims, assignment)
    let evaluation = cache.get(key)
    if (!evaluation) {
      const issues = parseIssues(source.schema, props(assignment))
      evaluation = issues
        ? { valid: false, cost: Math.max(1, issues.length), focus: focusOf(plan.dims, issues), issues: issues.map(issue => `${issueKey(issue.path) || '(root)'}: ${issue.message}`) }
        : VALID
      cache.set(key, evaluation)
    }
    return evaluation
  }
  return {
    plan,
    random: createRandom(options.seed),
    evaluate,
    props,
    slots: assignment => buildSlots(plan, assignment, source.slots, context),
  }
}

export function randomAssignment(dims: readonly Dimension[], random: () => number): number[] {
  return dims.map(dimension => Math.floor(random() * dimension.values.length))
}

/**
 * Change one free dimension at a time while the number of issues drops, the dimensions from the
 * issue paths first. `locked` dimensions keep their value. Returns the last evaluation.
 */
export function repair(search: Search, assignment: number[], locked: readonly boolean[]): Evaluation {
  const { dims } = search.plan
  let current = search.evaluate(assignment)
  for (let step = 0; !current.valid && step < dims.length * 2; step++) {
    const active = activeOf(dims, assignment)
    const focus = new Set(current.focus)
    const rest = shuffle([...dims.keys()].filter(index => !focus.has(index)), search.random)
    let improved = false
    for (const index of [...current.focus, ...rest]) {
      if (locked[index] || !active[index] || dims[index].kind === 'slot')
        continue
      const keep = assignment[index]
      for (let value = 0; value < dims[index].values.length && !improved; value++) {
        if (value === keep)
          continue
        assignment[index] = value
        const next = search.evaluate(assignment)
        if (next.cost < current.cost) {
          current = next
          improved = true
        }
        else {
          assignment[index] = keep
        }
      }
      if (improved)
        break
    }
    if (!improved)
      break
  }
  return current
}

interface Tuple {
  dims: number[]
  strides: number[]
  sizes: number[]
  covered: Uint8Array
}

export interface Coverage {
  tuples: Tuple[]
  byDim: Tuple[][]
  remaining: number
  next: number
}

function* combinations(n: number, size: number, start = 0, prefix: number[] = []): Generator<number[]> {
  if (prefix.length === size) {
    yield prefix
    return
  }
  for (let index = start; index < n; index++)
    yield* combinations(n, size, index + 1, [...prefix, index])
}

function valueAt(tuple: Tuple, index: number, position: number): number {
  return Math.floor(index / tuple.strides[position]) % tuple.sizes[position]
}

/** A child value only pairs with a value of its parent that switches it on. */
function consistent(dims: readonly Dimension[], tuple: Tuple, index: number): boolean {
  return tuple.dims.every((dimension) => {
    for (let child = dimension, parent = dims[child].parent; parent >= 0; child = parent, parent = dims[parent].parent) {
      const position = tuple.dims.indexOf(parent)
      if (position >= 0 && !dims[child].gate.has(valueAt(tuple, index, position)))
        return false
    }
    return true
  })
}

export function createCoverage(dims: readonly Dimension[], strength: number): Coverage {
  const size = Math.min(strength, dims.length)
  const coverage: Coverage = { tuples: [], byDim: dims.map(() => []), remaining: 0, next: 0 }
  if (size < 1)
    return coverage
  for (const tupleDims of combinations(dims.length, size)) {
    const sizes = tupleDims.map(index => dims[index].values.length)
    const strides = sizes.map((_, position) => sizes.slice(position + 1).reduce((product, value) => product * value, 1))
    const tuple: Tuple = { dims: tupleDims, sizes, strides, covered: new Uint8Array(sizes.reduce((product, value) => product * value, 1)) }
    for (let index = 0; index < tuple.covered.length; index++) {
      if (consistent(dims, tuple, index))
        coverage.remaining++
      else
        tuple.covered[index] = 1
    }
    coverage.tuples.push(tuple)
    for (const index of tupleDims)
      coverage.byDim[index].push(tuple)
  }
  return coverage
}

function tupleIndex(tuple: Tuple, assignment: readonly number[]): number {
  let index = 0
  for (let position = 0; position < tuple.dims.length; position++)
    index += assignment[tuple.dims[position]] * tuple.strides[position]
  return index
}

/** Marks what the case covers, returns how many tuples were new. */
export function markCovered(coverage: Coverage, dims: readonly Dimension[], assignment: readonly number[]): number {
  const active = activeOf(dims, assignment)
  let count = 0
  for (const tuple of coverage.tuples) {
    if (!tuple.dims.every(index => active[index]))
      continue
    const index = tupleIndex(tuple, assignment)
    if (!tuple.covered[index]) {
      tuple.covered[index] = 1
      coverage.remaining--
      count++
    }
  }
  return count
}

/** Uncovered tuples the case would cover through `dimension`, with `active` for the case. */
export function gainOf(coverage: Coverage, assignment: readonly number[], active: readonly boolean[], dimension: number): number {
  let count = 0
  for (const tuple of coverage.byDim[dimension]) {
    if (tuple.dims.every(index => active[index]) && !tuple.covered[tupleIndex(tuple, assignment)])
      count++
  }
  return count
}

export interface Target {
  dims: number[]
  values: number[]
  tuple: Tuple
  index: number
}

export function nextTarget(coverage: Coverage): Target | undefined {
  for (; coverage.next < coverage.tuples.length; coverage.next++) {
    const tuple = coverage.tuples[coverage.next]
    const index = tuple.covered.indexOf(0)
    if (index >= 0)
      return { dims: tuple.dims, values: tuple.dims.map((_, position) => valueAt(tuple, index, position)), tuple, index }
  }
  return undefined
}

export function dropTarget(coverage: Coverage, target: Target): void {
  if (!target.tuple.covered[target.index]) {
    target.tuple.covered[target.index] = 1
    coverage.remaining--
  }
}

/** Drops every tuple with this value, e.g. because no valid case can hold it. */
export function dropValue(coverage: Coverage, dimension: number, value: number): void {
  for (const tuple of coverage.byDim[dimension]) {
    const position = tuple.dims.indexOf(dimension)
    for (let index = 0; index < tuple.covered.length; index++) {
      if (!tuple.covered[index] && valueAt(tuple, index, position) === value) {
        tuple.covered[index] = 1
        coverage.remaining--
      }
    }
  }
}

/** The uncovered tuples as value indexes. */
export function uncoveredTuples(coverage: Coverage): { dims: number[], values: number[] }[] {
  return coverage.tuples.flatMap(tuple => [...tuple.covered.keys()]
    .filter(index => !tuple.covered[index])
    .map(index => ({ dims: tuple.dims, values: tuple.dims.map((_, position) => valueAt(tuple, index, position)) })))
}
