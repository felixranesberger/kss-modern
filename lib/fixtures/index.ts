/**
 * `kss-modern/fixtures`: props and test cases from the `examples` of a component definition.
 * Node only, needs `@faker-js/faker`.
 *
 * ```ts
 * import { fakeProps, testCases } from 'kss-modern/fixtures'
 *
 * fakeProps(card, { seed: 7, with: { variant: 'large' } })
 * for (const c of testCases(card)) render(c.props, c.slots)
 * ```
 */
import type { Faker } from '@faker-js/faker'
import type { z } from 'zod'
import type { SlotContent } from '../component-schema.ts'
import { DEFAULT_SEED, selectCases, solveProps } from './cases.ts'
import { compilePlan, isImageFile } from './plan.ts'
import { createFaker, isPlainObject, resolveObject } from './values.ts'
import { getObjectShape } from './zod-internals.ts'

export type { Faker }
export { createFaker, DEFAULT_SEED, isImageFile }

/**
 * What the fixtures read from a component definition. A `defineComponent` result fits, and so
 * does a plain definition loaded from a `.schema.ts` module.
 */
export interface FixtureDefinition<Schema extends z.ZodType = z.ZodType> {
  name: string
  schema: Schema
  examples?: unknown
  slots?: Record<string, SlotContent>
  cases?: Record<string, { props: object, slots?: Record<string, SlotContent> }>
  strength?: 1 | 2 | 3
}

type Props<D extends FixtureDefinition> = z.input<D['schema']>

export interface FakePropsOptions<D extends FixtureDefinition> {
  /** Default {@link DEFAULT_SEED}. */
  seed?: number
  /** Fixed values for this call, checked against the props. */
  with?: Partial<Props<D>>
}

export interface TestCaseOptions<D extends FixtureDefinition = FixtureDefinition> {
  /** Default {@link DEFAULT_SEED}. */
  seed?: number
  /** Overrides the definition's `strength`. 1 tests every value once, 2 every value pair of two dimensions, 3 every triple. */
  strength?: 1 | 2 | 3
  /** Up to this many combinations every one is tested (stage `full`), above it the cases are chosen in stages. Default 10,000. */
  limit?: number
  /** Slots the template declares, e.g. read from the Pug mixin. Joins the keys of the definition's `slots`. */
  slotNames?: readonly string[]
  /** Which props hold files, see {@link isImageFile} for the default. `path` is e.g. `items[0].image.src`. */
  isFile?: (path: string, schema: unknown) => boolean
  /** Renders a case to HTML. Enables the stage `shape` for components above the limit. */
  render?: (props: Props<D>, slots: Record<string, string>) => string
  /** Random cases the stage `shape` renders. Default 3,000. */
  samples?: number
}

/**
 * Why a case is there: `full` is one combination of the full product, the others are the stages
 * above the limit. `minimal` has all defaults and no optional prop, `single` changes one value of
 * it, `pair` covers value pairs, `shape` brings new markup, `named` comes from `cases`.
 */
export type TestCaseStage = 'full' | 'minimal' | 'single' | 'pair' | 'shape' | 'named'

export interface TestCase<D extends FixtureDefinition = FixtureDefinition> {
  /** A hash of the case's dimension values, stable while the dimensions stay, e.g. `f3231f34`. */
  id: string
  /** Only what differs from the minimal case, e.g. `variant=large +reverse -image`, or the key of a named case. */
  name: string
  stage: TestCaseStage
  props: Props<D>
  /** Content by slot name, only the slots the template declares and the case fills. */
  slots: Record<string, string>
  /** Paths of the props that hold image fakes, e.g. `image.src` or `items[0].image.src`. */
  files: string[]
}

/**
 * One axis of the test matrix, e.g. an enum, a boolean, set or not set, an array length or a slot.
 * Values are labels as they appear in case names: `variant=large`, `+reverse`, `-image`, `meta=3`.
 */
export interface CaseDimension {
  /** Prop path or `slot:<name>`, e.g. `variant`, `cta.variant`, `meta`, `slot:default`. */
  key: string
  values: string[]
}

/** What `--explain` prints. */
export interface CasesReport {
  /** `full` when the product of all dimensions is within the limit, else the staged selection. */
  mode: 'full' | 'pairwise'
  /** The strength the stages used, see {@link TestCaseOptions.strength}. */
  strength: 1 | 2 | 3
  /** Number of combinations of all dimensions. */
  product: number
  dimensions: CaseDimension[]
  /** Number of cases per stage. */
  cases: Record<TestCaseStage, number>
  /**
   * Value tuples no valid case could hold although each value occurs, e.g. `['variant=tile', '+reverse']`
   * from a `superRefine`. Pairs, or triples with strength 3. Exact in mode `full`, a heuristic above.
   */
  impossible: string[][]
  /** Values that occur in no valid case, an error in the schema or in `examples`. */
  unreachable: string[]
  /** Valid props that `render` threw on: the schema checks too little. One entry per message. */
  renderErrors: { case: string, message: string }[]
  /** Cases whose fakes broke the schema. They fall back to the values of the search. */
  valueErrors: string[]
  /** Named cases that no valid props can hold. {@link testCases} throws on them. */
  namedErrors: string[]
}

/**
 * `examples` as plain values: fakes are called, objects and arrays resolved per field and per
 * element, and a prop without an entry whose fragment has a `withFake` gets that fake's value. Other
 * props without an entry stay out, enums, booleans and defaults included. The same seed gives the
 * same values. What the JSON Schema export and the explorer start with.
 */
export function resolveExamples<D extends FixtureDefinition>(definition: D, { seed = DEFAULT_SEED }: { seed?: number } = {}): Partial<Props<D>> {
  const examples = isPlainObject(definition.examples) ? definition.examples : {}
  return resolveObject(createFaker(seed), getObjectShape(definition.schema), examples) as Partial<Props<D>>
}

/**
 * One valid, filled set of props: every prop with an example or a fake is set, enums take their
 * value from `examples`, the rest stays minimal. `with` is fixed, the others yield where the schema
 * forbids a combination. Throws when `with` allows no valid props.
 */
export function fakeProps<D extends FixtureDefinition>(definition: D, options: FakePropsOptions<D> = {}): Props<D> {
  const overlay = (options.with ?? {}) as Record<string, unknown>
  const plan = compilePlan(definition.schema, [], definition.name)
  const solved = solveProps(definition, plan, { seed: options.seed ?? DEFAULT_SEED, overlay, isFile: isImageFile })
  if (!solved.props) {
    const keys = Object.keys(overlay)
    const cause = keys.length > 0 ? `with { ${keys.join(', ')} }` : 'the examples'
    throw new Error(`fakeProps(${definition.name}): ${cause} give no valid props. ${solved.issues.join('; ')}`)
  }
  return solved.props as Props<D>
}

/** The test cases of a component, see {@link TestCaseStage} for how they are chosen. */
export function testCases<D extends FixtureDefinition>(definition: D, options: TestCaseOptions<D> = {}): TestCase<D>[] {
  const { cases, report } = selectCases(definition, options as TestCaseOptions)
  if (report.namedErrors.length > 0)
    throw new Error(`testCases(${definition.name}): named cases without valid props. ${report.namedErrors.join('; ')}`)
  return cases as TestCase<D>[]
}

/**
 * {@link testCases} and {@link explainCases} in one pass. Does not throw on named cases without
 * valid props, they are left out and listed in `report.namedErrors`.
 */
export function selectTestCases<D extends FixtureDefinition>(definition: D, options: TestCaseOptions<D> = {}): { cases: TestCase<D>[], report: CasesReport } {
  const { cases, report } = selectCases(definition, options as TestCaseOptions)
  return { cases: cases as TestCase<D>[], report }
}

/** The dimensions, the cases per stage, the impossible tuples and the unreachable values. */
export function explainCases<D extends FixtureDefinition>(definition: D, options: TestCaseOptions<D> = {}): CasesReport {
  return selectCases(definition, options as TestCaseOptions).report
}
