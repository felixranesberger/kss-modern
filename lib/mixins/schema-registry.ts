/**
 * The registry of `<file>.schema.ts` modules: component schemas that live next to their `.pug`
 * file instead of in its `defineComponent` block, so they can import shared fragments and carry
 * TypeScript types.
 *
 * kss-modern strips the types itself (Node's `module.stripTypeScriptTypes`) and writes every module
 * and its relative imports twice, under a directory named after the hash of all their sources:
 * once in the cache for the Node build, where `zod` resolves from the project, and once in the
 * output for the playground, where `zod` points at the copy the playground already loads. A new
 * hash means a new directory, so no stale import survives an edit. Node only.
 */
import type { ComponentRegistry } from './define-component.ts'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import nodeModule from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { glob } from 'tinyglobby'
import { collectComponentDefinitions } from './define-component.ts'
import { SCHEMA_OUTPUT_DIR, ZOD_GLOBAL } from './types.ts'

export const SCHEMA_FILE_SUFFIX = '.schema.ts'

const REGISTRY_FILE = 'registry.js'
const ZOD_SHIM_FILE = '__zod.js'
const COMPONENT_SCHEMA_SPECIFIER = 'kss-modern/schema'
const COMPONENT_SCHEMA_SHIM_FILE = '__kss-modern-schema.js'
/**
 * Inside `node_modules`, so a bare `zod` import resolves from the project. Node refuses to strip
 * types under `node_modules`, which is why the copies are plain JavaScript.
 */
const NODE_CACHE_DIR = 'node_modules/.cache/kss-modern/schemas'

/**
 * Static imports and re-exports: `import … from '…'`, `import '…'`, `export … from '…'`. Type-only
 * ones are erased by the type stripping and never resolved.
 */
const IMPORT_RE = /^[\t ]*(import|export)\b([^'";]*)(['"])([^'"\n]+)\3/gm
const FROM_RE = /(?:^|\s)from\s*$/
const TYPE_ONLY_RE = /^\s+type\s/
const ALLOWED_BARE_IMPORTS = new Set(['zod', COMPONENT_SCHEMA_SPECIFIER])

export interface SchemaRegistryBuild {
  hash: string
  /** Absolute path of the registry module the Node build imports. */
  nodeRegistry: string
  /** The playground's registry module, relative to the output directory. */
  browserRegistry: string
  /** Output path relative to the output directory -> JavaScript source. */
  browserFiles: Map<string, string>
  /** Absolute paths of every source file, the `.schema.ts` files and what they import. */
  sources: string[]
}

export interface SchemaRegistryError {
  error: string
  sources: string[]
}

export type SchemaRegistryResult = SchemaRegistryBuild | SchemaRegistryError | undefined

interface SourceFile {
  /** Absolute path. */
  file: string
  /** Path relative to the content directory, `/`-separated, with a `.js` extension. */
  output: string
  /** The type-stripped source with rewritten relative imports and `kss-modern/schema` pointing at its shim, `zod` still bare. */
  code: string
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function toOutputPath(contentDir: string, file: string): string {
  return toPosix(path.relative(contentDir, file)).replace(/\.ts$/, '.js')
}

/** `stripTypeScriptTypes` warns that it is experimental on every first use; that is no news here. */
function stripTypes(source: string, file: string): string {
  const { stripTypeScriptTypes } = nodeModule as typeof nodeModule & { stripTypeScriptTypes?: (code: string, options: { mode: 'strip' }) => string }
  if (typeof stripTypeScriptTypes !== 'function')
    throw new Error(`${file}: .schema.ts files need Node 22.13 or newer, which can strip TypeScript types`)

  const emitWarning = process.emitWarning
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message
    if (!message.includes('stripTypeScriptTypes'))
      (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest)
  }) as typeof process.emitWarning
  try {
    return stripTypeScriptTypes(source, { mode: 'strip' })
  }
  catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    process.emitWarning = emitWarning
  }
}

async function resolveImport(from: string, specifier: string): Promise<string> {
  const base = path.resolve(path.dirname(from), specifier)
  const candidates = /\.[cm]?[jt]s$/.test(specifier) ? [base] : [`${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js')]
  for (const candidate of candidates) {
    if (await fs.stat(candidate).then(stats => stats.isFile(), () => false))
      return candidate
  }
  throw new Error(`${from}: cannot resolve the import "${specifier}"`)
}

/**
 * Read a module and the relative imports it pulls in, depth first. Bare imports other than `zod`
 * fail: the playground has nothing to resolve them with.
 */
async function collectSources(contentDir: string, entries: string[]): Promise<SourceFile[]> {
  const sources = new Map<string, SourceFile>()

  const visit = async (file: string): Promise<void> => {
    if (sources.has(file))
      return
    if (path.relative(contentDir, file).startsWith('..'))
      throw new Error(`${file}: a .schema.ts file may only import files inside the content directory`)

    const original = await fs.readFile(file, 'utf-8')
    const stripped = file.endsWith('.ts') ? stripTypes(original, file) : original
    const placeholder: SourceFile = { file, output: toOutputPath(contentDir, file), code: '' }
    sources.set(file, placeholder)

    const replacements: [specifier: string, replacement: string][] = []
    for (const match of original.matchAll(IMPORT_RE)) {
      const [, keyword, clause, , specifier] = match
      const isModuleSpecifier = FROM_RE.test(clause) || (keyword === 'import' && clause.trim() === '')
      if (!isModuleSpecifier || TYPE_ONLY_RE.test(clause))
        continue
      if (!specifier.startsWith('.')) {
        if (!ALLOWED_BARE_IMPORTS.has(specifier))
          throw new Error(`${file}: only zod, ${COMPONENT_SCHEMA_SPECIFIER} and relative files can be imported in a .schema.ts file, not "${specifier}"`)
        continue
      }
      const target = await resolveImport(file, specifier)
      await visit(target)
      let relative = toPosix(path.relative(path.dirname(file), target)).replace(/\.ts$/, '.js')
      if (!relative.startsWith('.'))
        relative = `./${relative}`
      replacements.push([specifier, relative])
    }

    replacements.push([COMPONENT_SCHEMA_SPECIFIER, relativeShim(placeholder.output, COMPONENT_SCHEMA_SHIM_FILE)])
    placeholder.code = replacements.reduce(
      (code, [specifier, replacement]) => code.replaceAll(`'${specifier}'`, `'${replacement}'`).replaceAll(`"${specifier}"`, `"${replacement}"`),
      stripped,
    )
  }

  for (const entry of entries)
    await visit(entry)
  return [...sources.values()]
}

/** The module that imports every `.schema.ts` file and lists the sources. */
function getRegistrySource(contentDir: string, entries: string[], sources: string[]): string {
  const imports = entries.map((entry, index) => `import * as m${index} from './${toOutputPath(contentDir, entry)}'`)
  const modules = entries.map((entry, index) => `  [${JSON.stringify(toPosix(path.relative(contentDir, entry)))}, m${index}],`)
  return `${imports.join('\n')}\n\nexport const modules = [\n${modules.join('\n')}\n]\n\nexport const sources = ${JSON.stringify(sources)}\n`
}

/** The import specifier of a shim in the root of the hash directory, relative to the module at `output`. */
function relativeShim(output: string, shimFile: string): string {
  const shim = path.posix.relative(path.posix.dirname(output), shimFile)
  return shim.startsWith('.') ? shim : `./${shim}`
}

/** Point the bare `zod` imports at the playground's shim, relative to each file. */
function toBrowserCode(output: string, code: string): string {
  return code.replace(/(from\s+|import\s+)(['"])zod\2/g, `$1$2${relativeShim(output, ZOD_SHIM_FILE)}$2`)
}

const ZOD_SHIM_SOURCE = `const z = globalThis.${ZOD_GLOBAL}
if (!z)
  throw new Error('kss-modern: the playground did not provide zod to the .schema.ts modules')
export { z }
export default z
`

/**
 * `defineComponent` of `kss-modern/schema` (lib/component-schema.ts). Its own file next to the
 * modules, so neither the build nor the playground has to resolve the package.
 */
const COMPONENT_SCHEMA_SHIM_SOURCE = `export function defineComponent(definition) {
  return definition
}
`

async function writeIfMissing(file: string, code: string): Promise<void> {
  const isPresent = await fs.readFile(file, 'utf-8').then(existing => existing === code, () => false)
  if (isPresent)
    return
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, code)
}

/** Remove every hash directory in `directory` but `keep`. */
async function pruneHashDirectories(directory: string, keep: string): Promise<void> {
  const present = await fs.readdir(directory).catch(() => [] as string[])
  await Promise.all(present
    .filter(name => name !== keep && /^[\da-f]{16}$/.test(name))
    .map(name => fs.rm(path.join(directory, name), { recursive: true, force: true })))
}

async function buildRegistry(contentDir: string, entries: string[]): Promise<SchemaRegistryBuild | SchemaRegistryError> {
  let sources: SourceFile[]
  try {
    sources = await collectSources(contentDir, entries)
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error), sources: entries }
  }

  const sourcePaths = sources.map(source => source.file)
  const registrySource = getRegistrySource(contentDir, entries, sourcePaths)
  const hash = createHash('sha256')
    .update(JSON.stringify(sources.map(source => [source.output, source.code])))
    .update(registrySource)
    .digest('hex')
    .slice(0, 16)

  const nodeRoot = path.resolve(NODE_CACHE_DIR)
  const nodeDirectory = path.join(nodeRoot, hash)
  await Promise.all([
    ...sources.map(source => writeIfMissing(path.join(nodeDirectory, source.output), source.code)),
    writeIfMissing(path.join(nodeDirectory, REGISTRY_FILE), registrySource),
    writeIfMissing(path.join(nodeDirectory, COMPONENT_SCHEMA_SHIM_FILE), COMPONENT_SCHEMA_SHIM_SOURCE),
  ])
  await pruneHashDirectories(nodeRoot, hash)

  const browserFiles = new Map<string, string>()
  for (const source of sources)
    browserFiles.set(`${SCHEMA_OUTPUT_DIR}/${hash}/${source.output}`, toBrowserCode(source.output, source.code))
  browserFiles.set(`${SCHEMA_OUTPUT_DIR}/${hash}/${ZOD_SHIM_FILE}`, ZOD_SHIM_SOURCE)
  browserFiles.set(`${SCHEMA_OUTPUT_DIR}/${hash}/${COMPONENT_SCHEMA_SHIM_FILE}`, COMPONENT_SCHEMA_SHIM_SOURCE)
  // the playground does not need the absolute source paths
  browserFiles.set(`${SCHEMA_OUTPUT_DIR}/${hash}/${REGISTRY_FILE}`, getRegistrySource(contentDir, entries, []))

  return {
    hash,
    nodeRegistry: path.join(nodeDirectory, REGISTRY_FILE),
    browserRegistry: `${SCHEMA_OUTPUT_DIR}/${hash}/${REGISTRY_FILE}`,
    browserFiles,
    sources: sourcePaths,
  }
}

interface RegistryState {
  signature: string
  result: SchemaRegistryResult
}

let state: RegistryState | undefined
let pending: Promise<SchemaRegistryResult> | undefined
const knownSources = new Set<string>()

async function getSignature(files: string[]): Promise<string> {
  const stats = await Promise.all(files.map(file => fs.stat(file).then(stat => `${file}:${stat.size}:${stat.mtimeMs}`, () => `${file}:missing`)))
  return stats.join('\n')
}

/**
 * The current registry of the content directory's `.schema.ts` files: `undefined` without any,
 * an error when one of them cannot be read or stripped. Cheap when nothing changed (a glob and a
 * stat per source), and concurrent callers share one build.
 */
export function prepareSchemaRegistry(contentDir: string): Promise<SchemaRegistryResult> {
  pending ??= (async () => {
    try {
      const root = path.resolve(contentDir)
      const entries = (await glob(`**/*${SCHEMA_FILE_SUFFIX}`, { cwd: root, absolute: true, ignore: ['**/node_modules/**'] }))
        .map(file => path.resolve(file))
        .sort()
      if (entries.length === 0) {
        state = { signature: '', result: undefined }
        return undefined
      }

      const previousSources = state?.result ? state.result.sources : []
      const signature = await getSignature([...new Set([...entries, ...previousSources])])
      if (state && state.signature === signature)
        return state.result

      const result = await buildRegistry(root, entries)
      for (const source of result.sources)
        knownSources.add(source)
      state = { signature: await getSignature([...new Set([...entries, ...result.sources])]), result }
      return result
    }
    finally {
      pending = undefined
    }
  })()
  return pending
}

/** A changed file belongs to a `.schema.ts` module, so the mixins and sections using them rebuild. */
export function isSchemaSource(file: string): boolean {
  const absolute = path.resolve(file)
  return absolute.endsWith(SCHEMA_FILE_SUFFIX) || knownSources.has(absolute)
}

export interface LoadedSchemaRegistry {
  components: ComponentRegistry
  sources: string[]
}

const loadedRegistries = new Map<string, Promise<LoadedSchemaRegistry>>()

/** Import a registry module written by {@link prepareSchemaRegistry}, once per path. */
export function loadSchemaRegistry(nodeRegistry: string): Promise<LoadedSchemaRegistry> {
  let loading = loadedRegistries.get(nodeRegistry)
  if (!loading) {
    loading = import(pathToFileURL(nodeRegistry).href).then((registry: { modules: [string, Record<string, unknown>][], sources: string[] }) => ({
      components: collectComponentDefinitions(registry.modules),
      sources: registry.sources,
    }))
    loading.catch(() => loadedRegistries.delete(nodeRegistry))
    loadedRegistries.set(nodeRegistry, loading)
  }
  return loading
}
