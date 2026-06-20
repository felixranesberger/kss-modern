import type { Mode } from './compile-core.ts'
import type { PugWorkerOutput } from './worker.ts'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { computeDepSignatures, PugCompileCache } from './cache.ts'
import { compileMarkup, pugErrorFile } from './compile-core.ts'
import { PugDependencyGraph } from './dependency-graph.ts'
import { renderPugErrorOverlay } from './error-overlay.ts'

export interface PugCompileError {
  /** Section id whose markup failed to compile. */
  id: string
  /** Absolute path of the `.pug` file that failed, if pug reported one. */
  file?: string
  /** Raw pug error message — includes the code frame pointing at the offending line. */
  message: string
}

const MAX_POOL_SIZE = os.cpus().length
// Below this many cache misses, compile on the main thread instead of spawning a worker pool.
// Incremental dev rebuilds touch one or two sections, so this avoids pool spawn/teardown churn.
const INLINE_THRESHOLD = 2

// Module-level singletons that live for the dev-server lifetime, replacing the old prod-only
// `processCache`. The cache invalidates per-dependency; the graph maps changed files -> sections.
const cache = new PugCompileCache()
const graph = new PugDependencyGraph()

export function getPugDependencyGraph(): PugDependencyGraph {
  return graph
}

/** Resolve the absolute path of the `.pug` file a pug error points at, if it carries one. */
function extractPugErrorFile(error: unknown): string | undefined {
  const candidate = pugErrorFile(error)
  return candidate ? path.resolve(candidate) : undefined
}

/** Test helper: clear the module-level cache + dependency graph between cases. */
export function resetPugState(): void {
  cache.clear()
  graph.clear()
}

// resolve worker paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workerFilePath = __dirname.includes('dist/') ? './pug/worker.mjs' : './worker.ts'
const workerFilePathResolved = path.resolve(__dirname, workerFilePath)

let workerPool: Worker[] = []

async function terminateAllWorkers() {
  await Promise.all(workerPool.map(worker => worker.terminate()))
  workerPool = []
}

// terminate workers automatically on terminal exit
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const
signals.forEach(signal => process.on(signal, async () => await terminateAllWorkers()))

async function storeResult(id: string, markupSource: string, html: string, dependencies: string[]): Promise<void> {
  graph.setDependencies(id, dependencies)
  const depSignatures = await computeDepSignatures(dependencies)
  cache.set(id, { markupSource, compiledHtml: html, dependencies, depSignatures })
}

/**
 * Record a compile failure. In development the section's markup is replaced with an inline error
 * overlay so the broken section shows the error right in its own preview, and the build keeps going
 * so every other section still renders. In production nothing is patched in — the accumulated errors
 * are thrown by `compileIds`, which breaks the build. Either way the failure is logged to the
 * console; it is not surfaced through any return value or callback.
 */
function recordFailure(
  mode: Mode,
  repository: Map<string, { markup: string }>,
  errors: PugCompileError[],
  pugError: PugCompileError,
): void {
  console.error(`Pug markup failed to compile for section "${pugError.id}": ${pugError.message}`)
  errors.push(pugError)
  if (mode === 'development') {
    repository.set(pugError.id, { markup: renderPugErrorOverlay(pugError) })
  }
}

async function compileInline(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  id: string,
  errors: PugCompileError[],
): Promise<void> {
  const markupSource = repository.get(id)!.markup
  try {
    const { html, dependencies } = await compileMarkup(contentDir, mode, markupSource, id)
    repository.set(id, { markup: html })
    await storeResult(id, markupSource, html, dependencies)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    recordFailure(mode, repository, errors, { id, file: extractPugErrorFile(error), message })
  }
}

async function compileViaWorkerPool(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: string[],
  errors: PugCompileError[],
): Promise<void> {
  const poolSize = Math.min(ids.length, MAX_POOL_SIZE)

  // Promise-based queue: waiters resolve when a worker becomes free
  const waiters: ((worker: Worker) => void)[] = []
  const freeWorkers: Worker[] = []

  function releaseWorker(worker: Worker) {
    const waiter = waiters.shift()
    if (waiter) {
      waiter(worker)
    }
    else {
      freeWorkers.push(worker)
    }
  }

  function acquireWorker(): Promise<Worker> {
    const worker = freeWorkers.pop()
    if (worker) {
      return Promise.resolve(worker)
    }
    return new Promise<Worker>(resolve => waiters.push(resolve))
  }

  workerPool = Array.from({ length: poolSize }, (_, index) => {
    const worker = new Worker(workerFilePathResolved, {
      name: `pug-worker-${index}`,
    })
    freeWorkers.push(worker)
    return worker
  })

  const tasks = ids.map(async (id) => {
    const markupSource = repository.get(id)!.markup
    const worker = await acquireWorker()

    const result = await new Promise<PugWorkerOutput>((resolve) => {
      worker.once('message', resolve)
      worker.postMessage({ id, mode, html: markupSource, contentDir })
    })

    releaseWorker(worker)

    if ('error' in result) {
      recordFailure(mode, repository, errors, {
        id,
        file: result.file ? path.resolve(result.file) : undefined,
        message: result.error,
      })
      return
    }

    repository.set(id, { markup: result.html })
    await storeResult(id, markupSource, result.html, result.dependencies)
  })

  await Promise.all(tasks)
  await terminateAllWorkers()
}

/**
 * Compile the given section ids, reusing cached output for sections whose markup and dependency
 * files are unchanged. Misses compile inline (small dev rebuilds) or via a worker pool (cold/large
 * builds). Returns a clone of `repository` with the requested ids replaced by compiled HTML.
 */
async function compileIds(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: string[],
): Promise<Map<string, { markup: string }>> {
  // Shallow copy: compileIds only ever replaces whole `{ markup }` value objects via `.set`, never
  // mutates the existing ones, so the caller's map stays untouched without a deep clone.
  const clonedRepository = new Map(repository)
  if (ids.length === 0)
    return clonedRepository

  const misses: string[] = []
  await Promise.all(ids.map(async (id) => {
    const entry = clonedRepository.get(id)
    if (!entry)
      return

    if (await cache.isFresh(id, entry.markup)) {
      const cached = cache.get(id)!
      clonedRepository.set(id, { markup: cached.compiledHtml })
      graph.setDependencies(id, cached.dependencies)
      return
    }

    misses.push(id)
  }))

  if (misses.length === 0)
    return clonedRepository

  const errors: PugCompileError[] = []
  const useInline = mode === 'development' && misses.length <= INLINE_THRESHOLD
  if (useInline) {
    await Promise.all(misses.map(id => compileInline(mode, contentDir, clonedRepository, id, errors)))
  }
  else {
    await compileViaWorkerPool(mode, contentDir, clonedRepository, misses, errors)
  }

  // production has no graceful degradation: any compile failure breaks the build
  if (mode === 'production' && errors.length > 0) {
    throw new Error(
      `Pug compilation failed for ${errors.length} section(s):\n\n${
        errors.map(error => `  • ${error.id}${error.file ? ` (${error.file})` : ''}\n${error.message}`).join('\n\n')
      }`,
    )
  }

  return clonedRepository
}

/**
 * Full compile of every section in the repository (initial build / structural rebuild).
 * Seeds the cache + dependency graph; unchanged sections are served from cache.
 */
export async function compilePugMarkup(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
): Promise<Map<string, { markup: string }>> {
  return compileIds(mode, contentDir, repository, Array.from(repository.keys()))
}

/**
 * Incremental compile of only the given section ids (a `.pug` change). Cache-aware, so
 * insert-markup consumers whose own pug is unchanged are returned from cache.
 */
export async function compilePugMarkupIncremental(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: Iterable<string>,
): Promise<Map<string, { markup: string }>> {
  const wanted = Array.from(ids).filter(id => repository.has(id))
  return compileIds(mode, contentDir, repository, wanted)
}
