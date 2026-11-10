/**
 * The test fixtures of `mixinFixtureDir`: per component with a schema one JSON file with its test
 * cases and the markup its Pug mixin renders for each, so a backend test can render the same
 * props with its own templates and compare. See `docs/component-fixtures.md`.
 */
import type { CasesReport, FixtureDefinition, TestCaseStage } from '../fixtures/index.ts'
import type { MixinRender } from './compile.ts'
import type { MixinManifest, MixinManifestEntry } from './types.ts'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { hashContent } from '../file-signature.ts'
import { logicalWriteFile } from '../utils.ts'
import { loadMixinRender, MIXIN_SLOTS_LOCAL } from './compile.ts'
import { getMixinExportPaths } from './json-schema-export.ts'

/** Bump when the file format or the way cases are rendered changes, so every file is rewritten. */
const FIXTURE_FORMAT = 1
/** Every fixture file starts with this, so files of the directory that are not ours stay. */
const FILE_START = '{\n  "inputHash": '
const MAX_LISTED = 10

export interface MixinFixtureCase {
  /** A hash of the case's dimension values, stable while the dimensions stay. */
  id: string
  /** Only what differs from the minimal case, or the key of a named case. */
  name: string
  stage: TestCaseStage
  /** The props as a caller passes them (`z.input`), before the schema adds defaults or transforms. */
  props: Record<string, unknown>
  /** HTML by slot name, only the slots the case fills. */
  slots: Record<string, string>
  /** Paths of the props that hold images, e.g. `image.src` or `items[0].image.src`. */
  files: string[]
  /** The markup of the Pug mixin, START/END markers included. Missing when the render threw. */
  html?: string
  /** Why the render threw. */
  error?: string
}

export interface MixinFixtureFile {
  /** Hash of everything the file is made from: schema, `examples`, template, slots, seed, versions. */
  inputHash: string
  /** The component's explorer name, e.g. `molecules/Card`. */
  component: string
  seed: number
  /** `explainCases()` of the component. `renderErrors` also holds the cases whose render threw. */
  report: CasesReport
  /** Problems outside the report, e.g. a definition that could not be loaded. */
  errors: string[]
  cases: MixinFixtureCase[]
}

/** What the exporter needs of one public mixin. */
export interface MixinFixtureSource {
  entry: MixinManifestEntry
  /** Identifies the definition: the hash of its schema block, or a fingerprint of a `.schema.ts` definition. */
  definitionKey: string
  /** The mixin's render module, see `compileMixinModule`. */
  code: string
  /** The component definition, loaded only when the cases must be made anew. */
  loadDefinition: () => Promise<FixtureDefinition>
  /** `z`, `defineComponent` and the other locals a render needs besides props and slots. Called per render. */
  locals: () => Record<string, unknown>
}

export interface MixinFixtureSummary {
  component: string
  /** Relative to the fixture directory. */
  file: string
  report: CasesReport
  errors: string[]
}

export interface MixinFixtureResult {
  /** Every component, in manifest order. */
  summaries: MixinFixtureSummary[]
  /** The components whose cases were made in this call, the others came from the cache. */
  computed: string[]
}

type FixturesModule = typeof import('../fixtures/index.ts')

let fixturesModule: Promise<FixturesModule> | undefined

function loadFixtures(): Promise<FixturesModule> {
  fixturesModule ??= import('../fixtures/index.ts')
  fixturesModule.catch(() => {
    fixturesModule = undefined
  })
  return fixturesModule
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The problems a build reports for a component: everything but impossible tuples, which are rules. */
export function getFixtureProblems({ report, errors }: Pick<MixinFixtureSummary, 'report' | 'errors'>): string[] {
  const list = (label: string, values: string[]): string[] => values.length === 0
    ? []
    : [`${label}: ${values.slice(0, MAX_LISTED).join(', ')}${values.length > MAX_LISTED ? ` (+${values.length - MAX_LISTED})` : ''}`]
  return [
    ...errors,
    ...report.renderErrors.slice(0, MAX_LISTED).map(error => `render error in "${error.case}": ${error.message.split('\n')[0]}`),
    ...list('unreachable values', report.unreachable),
    ...list('fakes that break the schema', report.valueErrors),
    ...list('named cases without valid props', report.namedErrors),
  ]
}

/** A stable text of a value: functions by their source, zod schemas by their definition and fake. */
export function fingerprint(value: unknown, getFake: (schema: unknown) => unknown = () => undefined): string {
  const seen = new Map<object, number>()
  const walk = (current: unknown): unknown => {
    switch (typeof current) {
      case 'function':
        return `fn:${String(current)}`
      case 'bigint':
        return `${current}n`
      case 'symbol':
        return String(current)
      case 'undefined':
        return '~undefined'
      case 'object':
        break
      default:
        return current
    }
    if (current === null)
      return null
    if (seen.has(current))
      return `~ref:${seen.get(current)}`
    seen.set(current, seen.size)
    if (current instanceof RegExp || current instanceof Date)
      return `${current.constructor.name}:${String(current)}`
    if ('_zod' in current) {
      const schema = current as { _zod: { def: unknown }, description?: unknown }
      return { def: walk(schema._zod.def), description: schema.description, fake: walk(getFake(current)) }
    }
    if (Array.isArray(current))
      return current.map(walk)
    const record = current as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, walk(record[key])]))
  }
  return JSON.stringify(walk(value))
}

/** One case per line, so a diff or a grep shows whole cases. */
function serialize(file: MixinFixtureFile): string {
  const { cases, ...head } = file
  const json = JSON.stringify({ ...head, cases: [] }, null, 2)
  const body = cases.length === 0 ? '[]' : `[\n${cases.map(testCase => `    ${JSON.stringify(testCase)}`).join(',\n')}\n  ]`
  return `${json.slice(0, json.lastIndexOf('[]'))}${body}\n}\n`
}

function emptyReport(): CasesReport {
  return {
    mode: 'full',
    strength: 2,
    product: 0,
    dimensions: [],
    cases: { full: 0, minimal: 0, single: 0, pair: 0, shape: 0, named: 0 },
    impossible: [],
    unreachable: [],
    renderErrors: [],
    valueErrors: [],
    namedErrors: [],
  }
}

async function makeFixtureFile(source: MixinFixtureSource, inputHash: string, component: string, loadRender: () => MixinRender): Promise<MixinFixtureFile> {
  let fixtures: FixturesModule
  try {
    fixtures = await loadFixtures()
  }
  catch (error) {
    return { inputHash, component, seed: 1, report: emptyReport(), errors: [`The fixtures need @faker-js/faker. Install it with \`npm i -D @faker-js/faker\`. ${messageOf(error)}`], cases: [] }
  }
  const seed = fixtures.DEFAULT_SEED
  try {
    const definition = await source.loadDefinition()
    const renderModule = loadRender()
    // fresh locals per render, so `useId()` counts from zero in every case
    const render = (props: unknown, slots: Record<string, string>): string => renderModule({
      ...source.locals(),
      props,
      [MIXIN_SLOTS_LOCAL]: Object.keys(slots).length > 0 ? slots : undefined,
    })
    const { cases, report } = fixtures.selectTestCases(definition, { seed, slotNames: source.entry.slots, render })
    const messages = new Set(report.renderErrors.map(error => error.message))
    const rendered = cases.map((testCase): MixinFixtureCase => {
      const { id, name, stage, props, slots, files } = testCase
      try {
        return { id, name, stage, props: props as Record<string, unknown>, slots, files, html: render(props, slots) }
      }
      catch (error) {
        const message = messageOf(error)
        if (!messages.has(message)) {
          messages.add(message)
          report.renderErrors.push({ case: name, message })
        }
        return { id, name, stage, props: props as Record<string, unknown>, slots, files, error: message }
      }
    })
    return { inputHash, component, seed, report, errors: [], cases: rendered }
  }
  catch (error) {
    return { inputHash, component, seed, report: emptyReport(), errors: [messageOf(error)], cases: [] }
  }
}

/** The fixture file at `file`, if it is one of ours. */
async function readFixtureFile(file: string): Promise<MixinFixtureFile | undefined> {
  try {
    const content = await fs.readFile(file, 'utf-8')
    return content.startsWith(FILE_START) ? JSON.parse(content) as MixinFixtureFile : undefined
  }
  catch {
    return undefined
  }
}

async function isFixtureFile(file: string): Promise<boolean> {
  const handle = await fs.open(file, 'r').catch(() => undefined)
  if (!handle)
    return false
  try {
    const buffer = Buffer.alloc(FILE_START.length)
    await handle.read(buffer, 0, FILE_START.length, 0)
    return buffer.toString('utf-8') === FILE_START
  }
  finally {
    await handle.close()
  }
}

/** The component of an entry: the `defineComponent` name, which is its explorer path. */
function componentOf(entry: MixinManifestEntry): string {
  return entry.path.join('/')
}

export interface MixinFixtureExporter {
  /**
   * Bring the fixture files up to date. A file whose input hash is unchanged, in memory or on
   * disk, is neither recomputed nor rewritten. A file no component claims any more is removed.
   * Never throws for a component, its problems are in the summary.
   */
  write: (manifest: MixinManifest, sources: MixinFixtureSource[], versionKey: string) => Promise<MixinFixtureResult>
}

export function createMixinFixtureExporter(directory: string): MixinFixtureExporter {
  const root = path.resolve(directory)
  /** Absolute path -> the summary of the file written or found there. */
  let known = new Map<string, MixinFixtureSummary & { inputHash: string }>()
  let isScanned = false

  const write = async (manifest: MixinManifest, sources: MixinFixtureSource[], versionKey: string): Promise<MixinFixtureResult> => {
    const paths = getMixinExportPaths(manifest, 'test fixtures')
    const current = new Map<string, MixinFixtureSummary & { inputHash: string }>()
    const summaries: MixinFixtureSummary[] = []
    const computed: string[] = []

    for (const source of sources) {
      const relative = paths.get(source.entry)
      if (relative === undefined)
        continue
      const file = path.join(root, relative)
      const component = componentOf(source.entry)
      const inputHash = hashContent(JSON.stringify([FIXTURE_FORMAT, versionKey, source.definitionKey, hashContent(source.code), source.entry.slots ?? [], component]))

      let summary = known.get(file)
      if (summary?.inputHash !== inputHash) {
        const onDisk = await readFixtureFile(file)
        summary = onDisk?.inputHash === inputHash
          ? { component, file: relative, report: onDisk.report, errors: onDisk.errors ?? [], inputHash }
          : undefined
      }
      if (!summary) {
        const fixture = await makeFixtureFile(source, inputHash, component, () => loadMixinRender(source.code))
        await logicalWriteFile(file, serialize(fixture))
        summary = { component, file: relative, report: fixture.report, errors: fixture.errors, inputHash }
        computed.push(component)
        // the cases are made on the main thread; let pending I/O run between components
        await new Promise(resolve => setImmediate(resolve))
      }
      current.set(file, summary)
      summaries.push(summary)
    }

    // files of components that are gone; on the first call also those of an earlier process
    const stale = new Set([...known.keys()].filter(file => !current.has(file)))
    if (!isScanned) {
      isScanned = true
      for (const file of await glob('**/*.json', { cwd: root, absolute: true }).catch(() => [] as string[])) {
        const absolute = path.resolve(file)
        if (!current.has(absolute) && await isFixtureFile(absolute))
          stale.add(absolute)
      }
    }
    await Promise.all([...stale].map(file => fs.rm(file, { force: true })))

    known = current
    return { summaries, computed }
  }

  return { write }
}

function formatList(label: string, values: string[]): string[] {
  if (values.length === 0)
    return []
  return [`${label} (${values.length}):`, ...values.map(value => `  ${value}`)]
}

/** The `--explain` of one component: mode, product, cases per stage and every problem. */
export function formatFixtureReport({ component, report, errors }: Pick<MixinFixtureSummary, 'component' | 'report' | 'errors'>): string {
  const stages = Object.entries(report.cases).filter(([, count]) => count > 0).map(([stage, count]) => `${stage} ${count}`)
  const total = Object.values(report.cases).reduce((sum, count) => sum + count, 0)
  const mode = report.mode === 'full' ? 'full product' : `pairwise, strength ${report.strength}`
  return [
    `${component}: ${total} cases, ${mode}`,
    `product: ${report.product.toLocaleString('en')} combinations of ${report.dimensions.length} dimensions`,
    `cases per stage: ${stages.join(', ') || 'none'}`,
    ...formatList('dimensions', report.dimensions.map(dimension => `${dimension.key}: ${dimension.values.join(' ')}`)),
    ...formatList('impossible combinations', report.impossible.map(tuple => tuple.join(' & '))),
    ...formatList('unreachable values', report.unreachable),
    ...formatList('render errors', report.renderErrors.map(error => `${error.case}: ${error.message.split('\n')[0]}`)),
    ...formatList('fakes that break the schema', report.valueErrors),
    ...formatList('named cases without valid props', report.namedErrors),
    ...formatList('errors', errors),
  ].join('\n')
}

/** One line per component: mode, cases and the number of problems. */
export function formatFixtureOverview(summaries: Pick<MixinFixtureSummary, 'component' | 'report' | 'errors'>[]): string {
  const width = Math.max(9, ...summaries.map(summary => summary.component.length))
  const rows = summaries.map((summary) => {
    const total = Object.values(summary.report.cases).reduce((sum, count) => sum + count, 0)
    const problems = getFixtureProblems(summary).length
    const mode = summary.report.mode === 'full' ? 'full' : `pairwise/${summary.report.strength}`
    return `${summary.component.padEnd(width)}  ${mode.padEnd(10)}  ${String(total).padStart(6)}  ${String(summary.report.product.toLocaleString('en')).padStart(14)}  ${String(summary.report.impossible.length).padStart(10)}  ${problems > 0 ? `${problems} problem(s)` : 'ok'}`
  })
  const total = summaries.reduce((sum, summary) => sum + Object.values(summary.report.cases).reduce((cases, count) => cases + count, 0), 0)
  return [
    `${'component'.padEnd(width)}  ${'mode'.padEnd(10)}  ${'cases'.padStart(6)}  ${'product'.padStart(14)}  ${'impossible'.padStart(10)}  status`,
    ...rows,
    `${summaries.length} components, ${total} cases`,
  ].join('\n')
}

/**
 * The report of the fixture files in `directory`, as the build wrote them for `mixinFixtureDir`:
 * an overview of all components, or the full report of `component` (`molecules/Card`). Reads the
 * files only, so it shows the state of the last build.
 */
export async function formatMixinFixtureReport(directory: string, component?: string): Promise<string> {
  const root = path.resolve(directory)
  const files = (await glob('**/*.json', { cwd: root, absolute: true })).sort()
  const fixtures = (await Promise.all(files.map(async file => ({ file, fixture: await readFixtureFile(file) }))))
    .filter((item): item is { file: string, fixture: MixinFixtureFile } => item.fixture !== undefined)
  const summaries = fixtures.map(({ file, fixture }) => ({ component: fixture.component, file: path.relative(root, file), report: fixture.report, errors: fixture.errors ?? [] }))
  if (component === undefined)
    return summaries.length > 0 ? formatFixtureOverview(summaries) : `No test fixtures in ${directory}. Set \`mixinFixtureDir\` and run a build.`

  const wanted = component.replace(/\.json$/, '')
  const summary = summaries.find(candidate => candidate.component === wanted || candidate.file.split(path.sep).join('/') === `${wanted}.json`)
  if (!summary)
    throw new Error(`No test fixtures for "${component}" in ${directory}.`)
  return formatFixtureReport(summary)
}
