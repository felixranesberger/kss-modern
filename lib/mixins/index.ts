import type { FileSignature } from '../file-signature.ts'
import type { ResolvedStyleguideConfiguration } from '../index.ts'
import type { DiscoveredMixin } from './discovery.ts'
import type { MixinSchemaForm, MixinSchemaResult } from './schema.ts'
import type { MixinManifest, MixinManifestEntry } from './types.ts'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { glob } from 'tinyglobby'
import { checkFileSignature, hashContent, readFileSignature } from '../file-signature.ts'
import { logger } from '../logger.ts'
import { compileMixinJobs, evaluateSchemaJobs, getPugDependencyGraph } from '../pug/index.ts'
import { slugify } from '../shared.ts'
import { logicalWriteFile } from '../utils.ts'
import { getZodVersion } from '../zod.ts'
import { getMixinWrapperSource, MIXIN_COMPILE_OPTIONS } from './compile.ts'
import { discoverMixins } from './discovery.ts'
import { writeJsonSchemaFiles } from './json-schema-export.ts'
import { getMixinPath, MIXIN_MANIFEST_PATH } from './types.ts'

export * from './types.ts'

/** Bump when the shape of the persisted cache changes; older files are then discarded. */
const CACHE_FORMAT = 4
const DEFAULT_CACHE_DIR = 'node_modules/.cache/kss-modern'
/** Prefix of mixin nodes in the shared pug dependency graph, next to the section ids. */
export const MIXIN_GRAPH_PREFIX = 'mixin:'

interface FileCacheEntry {
  signature: FileSignature
  mixins: DiscoveredMixin[]
}

interface ModuleCacheEntry {
  /** Hash of everything besides the dependency files that shapes the module. */
  key: string
  code: string
  /** Absolute dependency path -> signature at compile time. */
  dependencies: Record<string, FileSignature>
}

interface CacheData {
  format: number
  version: string
  files: Record<string, FileCacheEntry>
  schemas: Record<string, MixinSchemaResult>
  /** Keyed by `<absolute file>#<mixin name>`. */
  modules: Record<string, ModuleCacheEntry>
}

export interface MixinBuildStats {
  total: number
  cached: number
  compiled: number
  /** Schemas evaluated in this build; unchanged schema sources come from the cache. */
  schemasEvaluated: number
  durationMs: number
}

export interface MixinBuildResult {
  manifest: MixinManifest
  /** The set of mixins, their names or their schema flags changed, so the navigation must be rewritten. */
  isNavigationChanged: boolean
  stats: MixinBuildStats
}

export interface MixinPipeline {
  /**
   * Bring the mixin output up to date. Without `changedFiles` every `.pug` file in the content
   * directory is (re)discovered; with them only those files are, and only the mixins depending on
   * them are checked for recompilation. Returns the previous result unchanged for an empty list.
   */
  build: (changedFiles?: string[]) => Promise<MixinBuildResult>
  /** The last result, if a build ran. */
  current: () => MixinBuildResult | undefined
}

let kssModernVersion: string | undefined

/** This package's version, part of every cache key. Works from the sources and from `dist/`. */
function getKssModernVersion(): string {
  if (kssModernVersion)
    return kssModernVersion

  let directory = path.dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 5; depth++) {
    try {
      const packageJson = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf-8')) as { name?: string, version?: string }
      if (packageJson.name === 'kss-modern') {
        kssModernVersion = packageJson.version ?? 'unknown'
        return kssModernVersion
      }
    }
    catch {}
    directory = path.dirname(directory)
  }

  kssModernVersion = 'unknown'
  return kssModernVersion
}

function createEmptyCache(): CacheData {
  return { format: CACHE_FORMAT, version: getKssModernVersion(), files: {}, schemas: {}, modules: {} }
}

function getCacheFilePath(config: ResolvedStyleguideConfiguration): string | undefined {
  if (config.cacheDir === false)
    return undefined

  const directory = path.resolve(config.cacheDir ?? DEFAULT_CACHE_DIR)
  const scope = hashContent(`${path.resolve(config.contentDir)}\n${config.mode}`).slice(0, 12)
  return path.join(directory, `mixins-${scope}.json`)
}

/** Load the persisted cache. Anything unreadable, corrupt or from another version is dropped silently. */
async function readCache(filePath: string | undefined): Promise<CacheData> {
  if (!filePath)
    return createEmptyCache()

  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Partial<CacheData>
    const isCompatible = data.format === CACHE_FORMAT
      && data.version === getKssModernVersion()
      && typeof data.files === 'object' && data.files !== null
      && typeof data.schemas === 'object' && data.schemas !== null
      && typeof data.modules === 'object' && data.modules !== null
    return isCompatible ? data as CacheData : createEmptyCache()
  }
  catch {
    return createEmptyCache()
  }
}

async function writeCache(filePath: string | undefined, data: CacheData): Promise<void> {
  if (!filePath)
    return

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    // write-then-rename, so a crash mid-write never leaves a truncated cache behind
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(data))
    await fs.rename(temporaryPath, filePath)
  }
  catch (error) {
    logger.debug('Could not write the mixin cache:', error)
  }
}

function toPosixRelative(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join('/')
}

/** Ids follow the mixin name; a name defined in several files gets a numeric suffix after the first. */
function assignIds(mixins: { file: string, mixin: DiscoveredMixin }[]): string[] {
  const used = new Map<string, number>()
  return mixins.map(({ mixin, file }) => {
    const base = slugify(mixin.name) || 'mixin'
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    if (count > 1)
      logger.warn(`Mixin "${mixin.name}" is defined more than once; the one in ${toPosixRelative(file)}:${mixin.line} is listed as "${base}-${count}".`)
    return count === 1 ? base : `${base}-${count}`
  })
}

/** The parts of an entry every styleguide page renders (navigation, search, mixin usage trees). */
function getNavigationSignature(manifest: MixinManifest | undefined): string {
  return JSON.stringify(manifest?.mixins.map(entry => [entry.id, entry.name, entry.path, entry.hasSchema]) ?? [])
}

async function writeOutput(outDir: string, manifest: MixinManifest, modules: Map<string, string>): Promise<void> {
  const mixinsDirectory = path.join(outDir, 'mixins')
  if (manifest.mixins.length === 0) {
    await fs.rm(mixinsDirectory, { recursive: true, force: true })
    return
  }

  await Promise.all([
    ...[...modules].map(([modulePath, code]) => logicalWriteFile(path.join(outDir, modulePath), code)),
    logicalWriteFile(path.join(outDir, MIXIN_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`),
  ])

  // content-hashed names leave every older build behind; drop what the manifest no longer references
  const referenced = new Set([...modules.keys()].map(modulePath => path.basename(modulePath)))
  const present = await fs.readdir(mixinsDirectory).catch(() => [] as string[])
  await Promise.all(present
    .filter(file => file.endsWith('.js') && !referenced.has(file))
    .map(file => fs.rm(path.join(mixinsDirectory, file), { force: true })))
}

export function createMixinPipeline(config: ResolvedStyleguideConfiguration): MixinPipeline {
  const cacheFilePath = getCacheFilePath(config)
  const graph = getPugDependencyGraph()
  let cache: CacheData | undefined
  let lastResult: MixinBuildResult | undefined
  /** Absolute paths of every `.pug` file in the content directory, as of the last discovery. */
  let pugFiles: Set<string> | undefined
  /** Module key -> the module last written for it; serves the last good build after a failed compile. */
  const lastGoodModules = new Map<string, string>()
  /** JSON Schema files written for `mixinJsonSchemaDir`, removed again once their mixin is gone. */
  let jsonSchemaFiles = new Map<string, string>()

  const build = async (changedFiles?: string[]): Promise<MixinBuildResult> => {
    const startedAt = performance.now()
    const changedPugFiles = changedFiles
      ?.filter(file => file.endsWith('.pug'))
      .map(file => path.resolve(file))

    if (lastResult && changedPugFiles && changedPugFiles.length === 0)
      return lastResult

    // only the version is needed up front: zod itself loads when a schema must be evaluated
    const zodVersion = getZodVersion()
    if (!zodVersion) {
      lastResult = {
        manifest: { mixins: [] },
        isNavigationChanged: getNavigationSignature(lastResult?.manifest) !== getNavigationSignature(undefined),
        stats: { total: 0, cached: 0, compiled: 0, schemasEvaluated: 0, durationMs: 0 },
      }
      return lastResult
    }

    cache ??= await readCache(cacheFilePath)
    const data = cache
    let isCacheDirty = false

    // 1. discovery, per file
    let filesToDiscover: string[]
    if (!pugFiles || !changedPugFiles) {
      const found = await glob('**/*.pug', { cwd: config.contentDir, absolute: true, ignore: ['**/node_modules/**'] })
      pugFiles = new Set(found.map(file => path.resolve(file)))
      for (const file of Object.keys(data.files)) {
        if (!pugFiles.has(file)) {
          delete data.files[file]
          isCacheDirty = true
        }
      }
      filesToDiscover = [...pugFiles]
    }
    else {
      filesToDiscover = changedPugFiles
    }

    const rediscovered = new Set<string>()
    await Promise.all(filesToDiscover.map(async (file) => {
      const cached = data.files[file]
      if (cached) {
        const { isFresh, isTouched } = await checkFileSignature(file, cached.signature)
        isCacheDirty ||= isTouched
        if (isFresh)
          return
      }

      const signature = await readFileSignature(file)
      isCacheDirty = true
      rediscovered.add(file)
      if (!signature) {
        pugFiles!.delete(file)
        delete data.files[file]
        return
      }

      pugFiles!.add(file)
      let mixins: DiscoveredMixin[] = []
      try {
        mixins = discoverMixins(await fs.readFile(file, 'utf-8'), file)
      }
      catch (error) {
        // Keep listing what the file defined before, so a typo mid-edit shows as that mixin's
        // compile error instead of the mixin vanishing. The sections using it report it too.
        mixins = cached?.mixins ?? []
        logger.warn(`Could not look for mixins in ${toPosixRelative(file)}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
      }
      data.files[file] = { signature, mixins }
    }))

    const discovered = [...pugFiles]
      .sort()
      .flatMap(file => (data.files[file]?.mixins ?? []).map(mixin => ({ file, mixin })))
    const ids = assignIds(discovered)

    // 2. schema -> JSON Schema, keyed on the schema source and its form only; misses evaluate on
    // the worker pool
    const getSchemaForm = (mixin: DiscoveredMixin): MixinSchemaForm => mixin.isDefineComponent ? 'defineComponent' : 'mixinSchema'
    const schemaKeys = discovered.map(({ mixin }) => mixin.schemaSource === undefined
      ? undefined
      : hashContent(`${getSchemaForm(mixin)}\n${mixin.schemaSource}\n${zodVersion}`))
    const usedSchemaKeys = new Set(schemaKeys.filter((key): key is string => key !== undefined))
    const schemaMisses = new Map<string, { source: string, form: MixinSchemaForm }>()
    discovered.forEach(({ mixin }, index) => {
      const schemaKey = schemaKeys[index]
      if (schemaKey !== undefined && !data.schemas[schemaKey])
        schemaMisses.set(schemaKey, { source: mixin.schemaSource!, form: getSchemaForm(mixin) })
    })
    const evaluated = await evaluateSchemaJobs([...schemaMisses].map(([id, job]) => ({ id, ...job })))
    for (const [schemaKey, schema] of evaluated) {
      data.schemas[schemaKey] = schema
      isCacheDirty = true
    }
    const schemasEvaluated = evaluated.size

    const entries: MixinManifestEntry[] = discovered.map(({ file, mixin }, index) => {
      const entry: MixinManifestEntry = {
        id: ids[index],
        name: mixin.name,
        path: getMixinPath(mixin.name, mixin.mixinName),
        args: mixin.args,
        file: toPosixRelative(file),
        line: mixin.line,
        hasSchema: false,
      }
      const schemaKey = schemaKeys[index]
      if (schemaKey === undefined)
        return entry

      const schema = data.schemas[schemaKey]
      if ('error' in schema) {
        if (evaluated.has(schemaKey))
          logger.warn(`The schema of "${mixin.name}" (${entry.file}:${mixin.line}) cannot be used, the mixin gets no playground:\n${schema.error}`)
        entry.schemaError = schema.error
        return entry
      }

      // the evaluated `defineComponent` name wins over the literal read from the template
      if (schema.name !== undefined)
        entry.path = getMixinPath(mixin.name, schema.name)
      entry.hasSchema = true
      entry.jsonSchema = schema.jsonSchema
      if (typeof schema.jsonSchema.description === 'string')
        entry.description = schema.jsonSchema.description
      return entry
    })

    // 3. render modules, for mixins with a schema
    const affectedIds = new Set(
      (changedPugFiles ?? []).flatMap(file => graph.getAffectedSections(file)).filter(id => id.startsWith(MIXIN_GRAPH_PREFIX)),
    )
    const previousIds = new Set(lastResult?.manifest.mixins.map(entry => entry.id))
    const modules = new Map<string, string>()
    const jobs: { id: string, file: string, name: string, moduleKey: string, key: string, entry: MixinManifestEntry }[] = []
    let cachedCount = 0

    await Promise.all(discovered.map(async ({ file, mixin }, index) => {
      const entry = entries[index]
      if (!entry.hasSchema)
        return

      const moduleKey = `${file}#${mixin.name}`
      const key = hashContent(JSON.stringify([
        getMixinWrapperSource(file, mixin.name),
        getKssModernVersion(),
        zodVersion,
        MIXIN_COMPILE_OPTIONS,
      ]))
      const cached = data.modules[moduleKey]
      const graphId = `${MIXIN_GRAPH_PREFIX}${entry.id}`

      // In an incremental build, a mixin that neither lives in nor depends on a changed file is
      // known to be current without touching the disk.
      const mustCheckDisk = !changedPugFiles || !lastResult || !previousIds.has(entry.id)
        || affectedIds.has(graphId) || rediscovered.has(file)
      let isFresh = cached?.key === key
      if (isFresh && mustCheckDisk) {
        const checks = await Promise.all(Object.entries(cached!.dependencies).map(([dependency, signature]) => checkFileSignature(dependency, signature)))
        isFresh = checks.every(check => check.isFresh)
        isCacheDirty ||= checks.some(check => check.isTouched)
      }

      if (isFresh) {
        cachedCount++
        graph.setDependencies(graphId, Object.keys(cached!.dependencies))
        const modulePath = `mixins/${entry.id}.${hashContent(cached!.code).slice(0, 10)}.js`
        entry.module = modulePath
        modules.set(modulePath, cached!.code)
        lastGoodModules.set(moduleKey, cached!.code)
        return
      }

      jobs.push({ id: entry.id, file, name: mixin.name, moduleKey, key, entry })
    }))

    const results = await compileMixinJobs(
      jobs.map(({ id, file, name }) => ({ id, file, name })),
      // a small incremental rebuild is not worth the worker round-trip
      { inline: lastResult !== undefined && changedPugFiles !== undefined && jobs.length <= 2 },
    )

    const failures: string[] = []
    await Promise.all(jobs.map(async ({ id, file, moduleKey, key, entry }) => {
      const result = results.get(id)!
      const graphId = `${MIXIN_GRAPH_PREFIX}${id}`

      if ('error' in result) {
        failures.push(`  • ${entry.name} (${entry.file}:${entry.line})\n${result.error}`)
        logger.error(`Mixin "${entry.name}" failed to compile: ${result.error}`)
        entry.error = { message: result.error, file: result.file ? toPosixRelative(result.file) : undefined }
        // keep watching the files this mixin was built from, so fixing any of them retries it
        const previous = Object.keys(data.modules[moduleKey]?.dependencies ?? {})
        graph.setDependencies(graphId, [...new Set([file, ...previous, ...(result.file ? [result.file] : [])])])

        const lastGood = lastGoodModules.get(moduleKey)
        if (lastGood) {
          const modulePath = `mixins/${id}.${hashContent(lastGood).slice(0, 10)}.js`
          entry.module = modulePath
          modules.set(modulePath, lastGood)
        }
        return
      }

      const signatures = await Promise.all(result.dependencies.map(async dependency => [dependency, await readFileSignature(dependency)] as const))
      data.modules[moduleKey] = {
        key,
        code: result.code,
        dependencies: Object.fromEntries(signatures.filter((pair): pair is readonly [string, FileSignature] => pair[1] !== null)),
      }
      isCacheDirty = true
      graph.setDependencies(graphId, result.dependencies)
      lastGoodModules.set(moduleKey, result.code)

      const modulePath = `mixins/${id}.${hashContent(result.code).slice(0, 10)}.js`
      entry.module = modulePath
      modules.set(modulePath, result.code)
    }))

    if (config.mode === 'production') {
      // production enforces the convention: a schema outside the supported zod features fails too
      const schemaFailures = entries
        .filter(entry => entry.schemaError !== undefined)
        .map(entry => `  • ${entry.name} (${entry.file}:${entry.line})\n${entry.schemaError}`)
      const problems = [
        ...schemaFailures.length > 0 ? [`Invalid schema in ${schemaFailures.length} mixin(s):\n\n${schemaFailures.join('\n\n')}`] : [],
        ...failures.length > 0 ? [`Pug compilation failed for ${failures.length} mixin(s):\n\n${failures.join('\n\n')}`] : [],
      ]
      if (problems.length > 0)
        throw new Error(problems.join('\n\n'))
    }

    // drop graph edges and cached modules of mixins that no longer exist
    const currentIds = new Set(entries.map(entry => entry.id))
    for (const id of previousIds) {
      if (!currentIds.has(id))
        graph.removeSection(`${MIXIN_GRAPH_PREFIX}${id}`)
    }
    const currentModuleKeys = new Set(discovered.map(({ file, mixin }) => `${file}#${mixin.name}`))
    for (const moduleKey of Object.keys(data.modules)) {
      if (!currentModuleKeys.has(moduleKey)) {
        delete data.modules[moduleKey]
        isCacheDirty = true
      }
    }

    for (const schemaKey of Object.keys(data.schemas)) {
      if (!usedSchemaKeys.has(schemaKey)) {
        delete data.schemas[schemaKey]
        isCacheDirty = true
      }
    }

    // mixins without a schema are internal: they stay out of the manifest and the styleguide
    const manifest: MixinManifest = { mixins: entries.filter(entry => entry.hasSchema || entry.schemaError !== undefined) }
    await writeOutput(config.outDir, manifest, modules)
    if (config.mixinJsonSchemaDir)
      jsonSchemaFiles = await writeJsonSchemaFiles(config.mixinJsonSchemaDir, manifest, jsonSchemaFiles)
    if (isCacheDirty)
      await writeCache(cacheFilePath, data)

    const stats: MixinBuildStats = {
      total: manifest.mixins.length,
      cached: cachedCount,
      compiled: jobs.length,
      schemasEvaluated,
      durationMs: Math.round(performance.now() - startedAt),
    }
    logger.debug(`mixins: ${stats.total} total, ${stats.cached} cached, ${stats.compiled} compiled (${stats.durationMs} ms)`)

    const result: MixinBuildResult = {
      manifest,
      isNavigationChanged: getNavigationSignature(lastResult?.manifest) !== getNavigationSignature(manifest),
      stats,
    }
    lastResult = result
    return result
  }

  return {
    build,
    current: () => lastResult,
  }
}
