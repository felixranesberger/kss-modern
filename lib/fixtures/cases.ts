/**
 * The selection of test cases: the full product up to the limit, else the stages minimal, single,
 * pair and shape. Named cases come on top in both modes.
 */
import type { CasesReport, FixtureDefinition, TestCase, TestCaseOptions, TestCaseStage } from './index.ts'
import type { Dimension, Plan } from './plan.ts'
import type { Coverage, Search } from './search.ts'
import { markupFeatures } from './markup.ts'
import { activate, activeOf, ancestorsOf, buildProps, buildSlots, collectFiles, compilePlan, isImageFile, labelsOf } from './plan.ts'
import { applyOverlay, createCoverage, createSearch, dropTarget, dropValue, gainOf, markCovered, nextTarget, randomAssignment, repair, uncoveredTuples, within } from './search.ts'
import { createFaker, hash, hashId, isPlainObject, resolveObject, resolveValue, shuffle } from './values.ts'
import { getDef, getObjectShape, parseIssues, unwrapSchema } from './zod-internals.ts'

export const DEFAULT_SEED = 1
export const DEFAULT_LIMIT = 10_000
export const DEFAULT_SAMPLES = 3_000
const MAX_RENDER_ERRORS = 20

interface Chosen {
  assignment: number[]
  stage: TestCaseStage
}

type IsFile = (path: string, schema: unknown) => boolean

interface Selection {
  cases: TestCase[]
  report: CasesReport
}

function emptyCounts(): Record<TestCaseStage, number> {
  return { full: 0, minimal: 0, single: 0, pair: 0, shape: 0, named: 0 }
}

function caseKey(dims: readonly Dimension[], assignment: readonly number[]): string {
  return labelsOf(dims, assignment).join(' ')
}

/** Only what differs from the reference case. A dimension the reference lacks compares with its minimal value. */
function nameOf(dims: readonly Dimension[], assignment: readonly number[], reference: readonly number[]): string {
  const active = activeOf(dims, assignment)
  const referenceActive = activeOf(dims, reference)
  const parts = dims.flatMap((dimension, index) => {
    const base = referenceActive[index] ? reference[index] : dimension.minimal
    return active[index] && assignment[index] !== base ? [dimension.labels[assignment[index]]] : []
  })
  return parts.join(' ') || 'minimal'
}

function unlocked(dims: readonly Dimension[]): boolean[] {
  return dims.map(() => false)
}

/** All defaults and no optional prop, repaired when the schema asks for more. */
function minimalCase(search: Search): { assignment: number[], valid: boolean } {
  const { dims } = search.plan
  const assignment = dims.map(dimension => dimension.minimal)
  if (repair(search, assignment, unlocked(dims)).valid)
    return { assignment, valid: true }
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomAssignment(dims, search.random)
    if (repair(search, candidate, unlocked(dims)).valid)
      return { assignment: candidate, valid: true }
  }
  return { assignment: dims.map(dimension => dimension.minimal), valid: false }
}

/** A valid case that holds `values` in `targets`, from the reference first, then from random starts. */
function findCase(search: Search, reference: readonly number[], targets: readonly number[], values: readonly number[]): { assignment: number[], locked: boolean[] } | undefined {
  const { dims } = search.plan
  for (let attempt = 0; attempt < 3; attempt++) {
    const assignment = attempt === 0 ? [...reference] : randomAssignment(dims, search.random)
    const locked = unlocked(dims)
    targets.forEach((target, position) => {
      assignment[target] = values[position]
    })
    for (const target of targets) {
      activate(dims, assignment, target)
      for (const index of [target, ...ancestorsOf(dims, target)])
        locked[index] = true
    }
    if (repair(search, assignment, locked).valid)
      return { assignment, locked }
  }
  return undefined
}

/** Greedy: give each free dimension the value that covers the most new tuples and keeps the case valid. */
function improve(search: Search, coverage: Coverage, assignment: number[], locked: readonly boolean[]): void {
  const { dims } = search.plan
  const order = shuffle([...dims.keys()].filter(index => !locked[index]), search.random)
    .sort((a, b) => dims[a].depth - dims[b].depth)
  for (const index of order) {
    const keep = assignment[index]
    const gainWith = (value: number): number => {
      assignment[index] = value
      const gain = gainOf(coverage, assignment, activeOf(dims, assignment), index)
      assignment[index] = keep
      return gain
    }
    const current = gainWith(keep)
    const options = [...dims[index].values.keys()]
      .filter(value => value !== keep)
      .map(value => ({ value, gain: gainWith(value) }))
      .filter(option => option.gain > current)
      .sort((a, b) => b.gain - a.gain)
    for (const { value } of options) {
      assignment[index] = value
      if (search.evaluate(assignment).valid)
        break
      assignment[index] = keep
    }
  }
}

interface Stages {
  search: Search
  reference: number[]
  chosen: Map<string, Chosen>
  add: (assignment: readonly number[], stage: TestCaseStage) => boolean
}

function fullStage({ search, add }: Stages): void {
  const { dims } = search.plan
  const sizes = dims.map(dimension => dimension.values.length)
  const product = sizes.reduce((total, size) => total * size, 1)
  const assignment = dims.map(() => 0)
  for (let combination = 0; combination < product; combination++) {
    let rest = combination
    for (let index = dims.length - 1; index >= 0; index--) {
      assignment[index] = rest % sizes[index]
      rest = Math.floor(rest / sizes[index])
    }
    if (search.evaluate(assignment).valid)
      add(assignment, 'full')
  }
}

/** Every value once against the reference. Values without a valid case leave the coverage. */
function singleStage({ search, reference, add }: Stages, coverage: Coverage): void {
  const { dims } = search.plan
  const referenceActive = activeOf(dims, reference)
  dims.forEach((dimension, index) => {
    for (let value = 0; value < dimension.values.length; value++) {
      if (referenceActive[index] && value === reference[index])
        continue
      const found = findCase(search, reference, [index], [value])
      if (!found) {
        dropValue(coverage, index, value)
        continue
      }
      add(found.assignment, 'single')
      markCovered(coverage, dims, found.assignment)
    }
  })
}

/** Cases until every tuple is covered or found impossible. */
function tupleStage({ search, reference, add }: Stages, coverage: Coverage): string[][] {
  const { dims } = search.plan
  const impossible: string[][] = []
  for (let target = nextTarget(coverage); target; target = nextTarget(coverage)) {
    const found = findCase(search, reference, target.dims, target.values)
    if (found) {
      improve(search, coverage, found.assignment, found.locked)
      markCovered(coverage, dims, found.assignment)
      add(found.assignment, 'pair')
    }
    else {
      impossible.push(target.dims.map((index, position) => dims[index].labels[target.values[position]]))
    }
    dropTarget(coverage, target)
  }
  return impossible
}

/** Random valid cases, kept when their markup brings a feature no case had. */
function shapeStage({ search, reference, chosen, add }: Stages, render: NonNullable<TestCaseOptions['render']>, samples: number): CasesReport['renderErrors'] {
  const { dims } = search.plan
  const features = new Set<string>()
  const renderErrors: CasesReport['renderErrors'] = []
  const messages = new Set<string>()
  const renderCase = (assignment: readonly number[]): string | undefined => {
    try {
      return render(search.props(assignment), search.slots(assignment))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!messages.has(message) && renderErrors.length < MAX_RENDER_ERRORS) {
        messages.add(message)
        renderErrors.push({ case: nameOf(dims, assignment, reference), message })
      }
      return undefined
    }
  }
  const collect = (html: string | undefined): boolean => {
    let fresh = false
    for (const feature of html === undefined ? [] : markupFeatures(html)) {
      if (!features.has(feature)) {
        features.add(feature)
        fresh = true
      }
    }
    return fresh
  }
  for (const { assignment } of [...chosen.values()])
    collect(renderCase(assignment))
  for (let sample = 0; sample < samples; sample++) {
    const assignment = randomAssignment(dims, search.random)
    if (!repair(search, assignment, unlocked(dims)).valid || chosen.has(caseKey(dims, assignment)))
      continue
    if (collect(renderCase(assignment)))
      add(assignment, 'shape')
  }
  return renderErrors
}

/** The values of the chosen cases, and the value pairs that never meet although both values occur. */
function reachability(dims: readonly Dimension[], chosen: Iterable<Chosen>, pairs: boolean): { unreachable: string[], impossible: string[][] } {
  const seen = dims.map(() => new Set<number>())
  const coverage = createCoverage(dims, pairs ? 2 : 0)
  for (const { assignment } of chosen) {
    const active = activeOf(dims, assignment)
    dims.forEach((_, index) => active[index] && seen[index].add(assignment[index]))
    markCovered(coverage, dims, assignment)
  }
  const unreachable = dims.flatMap((dimension, index) => dimension.labels.filter((_, value) => !seen[index].has(value)))
  const impossible = uncoveredTuples(coverage)
    .filter(tuple => tuple.dims.every((index, position) => seen[index].has(tuple.values[position])))
    .map(tuple => tuple.dims.map((index, position) => dims[index].labels[tuple.values[position]]))
  return { unreachable, impossible }
}

function slotNamesOf(definition: FixtureDefinition, slotNames: readonly string[] | undefined): string[] {
  return [...new Set([...slotNames ?? [], ...Object.keys(definition.slots ?? {})])]
}

/** The value at a dimension key, the first element for `[]`. */
function exampleAt(examples: unknown, key: string): unknown {
  let current = examples
  for (const segment of key.split('.')) {
    if (!isPlainObject(current))
      return undefined
    const name = segment.replace(/(?:\[\])+$/, '')
    current = current[name]
    for (let depth = (segment.length - name.length) / 2; depth > 0 && Array.isArray(current); depth--)
      current = current[0]
  }
  return current
}

/** Every prop with a value set, enums from the resolved `examples`, the rest minimal. */
function filledAssignment(plan: Plan, examples: unknown): number[] {
  return plan.dims.map((dimension) => {
    const example = exampleAt(examples, dimension.key)
    const hasSource = example !== undefined
    switch (dimension.kind) {
      case 'choice': {
        const index = dimension.values.indexOf(example)
        return index >= 0 ? index : dimension.minimal
      }
      case 'presence':
        return hasSource ? 1 : dimension.minimal
      case 'count': {
        const count = (index: number): number => typeof dimension.values[index] === 'number' ? dimension.values[index] : -1
        const positive = [...dimension.values.keys()].filter(index => count(index) > 0)
        const wanted = Array.isArray(example) ? example.length : 1
        return hasSource ? positive.filter(index => count(index) <= wanted).at(-1) ?? positive[0] ?? dimension.minimal : dimension.minimal
      }
      case 'union': {
        if (example === undefined)
          return dimension.minimal
        const option = (getDef(unwrapSchema(dimension.schema))?.options ?? []).findIndex(schema => !parseIssues(schema, example))
        return Math.max(0, dimension.values.indexOf(Math.max(0, option)))
      }
      default:
        return dimension.minimal
    }
  })
}

export interface Solved {
  props?: Record<string, unknown>
  files: string[]
  issues: string[]
}

/** One valid, filled set of props with `overlay` fixed, repaired around it. */
export function solveProps(definition: FixtureDefinition, plan: Plan, options: { seed: number, overlay: Record<string, unknown>, isFile: IsFile }): Solved {
  const search = createSearch(definition, plan, { seed: options.seed, overlay: options.overlay })
  const keys = Object.keys(options.overlay)
  const locked = plan.dims.map(dimension => keys.some(key => within(key, dimension.key)))
  // resolved, so the fragments' fakes count as values too, e.g. `alt` from an image fake
  const examples = isPlainObject(definition.examples) ? definition.examples : {}
  const assignment = filledAssignment(plan, resolveObject(createFaker(options.seed), getObjectShape(definition.schema), examples))
  const repaired = repair(search, assignment, locked)
  if (!repaired.valid)
    return { files: [], issues: repaired.issues }
  const context = { faker: createFaker(options.seed), memo: new Map<string, unknown>() }
  const props = applyOverlay(buildProps(plan, assignment, definition.examples, context), options.overlay)
  const issues = parseIssues(definition.schema, props)
  if (issues)
    return { files: [], issues: issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
  return { props, files: collectFiles(plan, props, options.isFile), issues: [] }
}

function namedCases(definition: FixtureDefinition, plan: Plan, seed: number, isFile: IsFile, errors: string[]): TestCase[] {
  const shape = getObjectShape(definition.schema)
  return Object.entries(definition.cases ?? {}).flatMap(([name, entry]) => {
    const caseSeed = hash(`named:${name}|${seed}`)
    const faker = createFaker(caseSeed)
    const overlay: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entry.props))
      overlay[key] = value === undefined ? undefined : resolveValue(faker, shape?.[key], value)
    const solved = solveProps(definition, plan, { seed: caseSeed, overlay, isFile })
    if (!solved.props) {
      errors.push(`${name}: ${solved.issues.join(', ')}`)
      return []
    }
    const slots: Record<string, string> = {}
    for (const [slot, content] of Object.entries(entry.slots ?? {}))
      slots[slot] = typeof content === 'function' ? content(faker) : content
    return [{ id: hashId(`named:${name}`), name, stage: 'named' as const, props: solved.props, slots, files: solved.files }]
  })
}

/** The final props of each case, from a Faker seeded with the case id and the base seed. */
function buildCases(definition: FixtureDefinition, stages: Stages, seed: number, isFile: IsFile, errors: string[]): TestCase[] {
  const { search, reference, chosen } = stages
  const { plan } = search
  const faker = createFaker(seed)
  return [...chosen.values()].map(({ assignment, stage }) => {
    const id = hashId(caseKey(plan.dims, assignment))
    const name = nameOf(plan.dims, assignment, reference)
    const caseSeed = hash(`${id}|${seed}`)
    faker.seed(caseSeed)
    const context = { faker, memo: new Map<string, unknown>() }
    let props = buildProps(plan, assignment, definition.examples, context)
    const slots = buildSlots(plan, assignment, definition.slots, context)
    const issues = parseIssues(definition.schema, props)
    if (issues) {
      errors.push(`${name} (${id}, seed ${caseSeed}): ${issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
      props = search.props(assignment)
    }
    return { id, name, stage, props, slots, files: collectFiles(plan, props, isFile) }
  })
}

export function selectCases(definition: FixtureDefinition, options: TestCaseOptions): Selection {
  const seed = options.seed ?? DEFAULT_SEED
  const strength = options.strength ?? definition.strength ?? 2
  const isFile = options.isFile ?? isImageFile
  const plan = compilePlan(definition.schema, slotNamesOf(definition, options.slotNames), definition.name)
  const { dims } = plan
  const search = createSearch(definition, plan, { seed: hash(`${definition.name}|${seed}`) })
  const product = dims.reduce((total, dimension) => total * dimension.values.length, 1)
  const mode = product <= (options.limit ?? DEFAULT_LIMIT) ? 'full' : 'pairwise'
  const minimal = minimalCase(search)
  const chosen = new Map<string, Chosen>()
  const add = (assignment: readonly number[], stage: TestCaseStage): boolean => {
    const key = caseKey(dims, assignment)
    if (chosen.has(key))
      return false
    chosen.set(key, { assignment: [...assignment], stage })
    return true
  }
  const stages: Stages = { search, reference: minimal.assignment, chosen, add }
  let impossible: string[][] = []
  let renderErrors: CasesReport['renderErrors'] = []

  if (mode === 'full') {
    if (minimal.valid)
      add(minimal.assignment, 'full')
    fullStage(stages)
  }
  else {
    if (minimal.valid)
      add(minimal.assignment, 'minimal')
    const coverage = createCoverage(dims, strength)
    if (minimal.valid)
      markCovered(coverage, dims, minimal.assignment)
    singleStage(stages, coverage)
    if (strength > 1)
      impossible = tupleStage(stages, coverage)
    if (options.render)
      renderErrors = shapeStage(stages, options.render, options.samples ?? DEFAULT_SAMPLES)
  }

  const reachable = reachability(dims, chosen.values(), mode === 'full')
  const valueErrors: string[] = []
  const namedErrors: string[] = []
  const cases = [
    ...buildCases(definition, stages, seed, isFile, valueErrors),
    ...namedCases(definition, plan, seed, isFile, namedErrors),
  ]
  const counts = emptyCounts()
  for (const testCase of cases)
    counts[testCase.stage]++
  const unreachable = new Set(reachable.unreachable)
  return {
    cases,
    report: {
      mode,
      strength,
      product,
      dimensions: dims.map(dimension => ({ key: dimension.key, values: dimension.labels })),
      cases: counts,
      impossible: mode === 'full'
        ? reachable.impossible
        : impossible.filter(tuple => tuple.every(label => !unreachable.has(label))),
      unreachable: reachable.unreachable,
      renderErrors,
      valueErrors,
      namedErrors,
    },
  }
}
