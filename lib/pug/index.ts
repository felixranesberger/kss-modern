import type { Mode } from './compile-core.ts'
import type { PugWorkerInput, PugWorkerOutput } from './worker.ts'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { logger } from '../logger.ts'
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

// Leave a core for the main thread / event loop.
const MAX_POOL_SIZE = Math.max(1, os.cpus().length - 1)
// Below this many cache misses, compile on the main thread instead of dispatching to the pool — a
// one- or two-section incremental rebuild isn't worth the worker round-trip.
const INLINE_THRESHOLD = 2

// Module-level singletons that live for the dev-server lifetime, replacing the old prod-only
// `processCache`. The cache invalidates per-dependency; the graph maps changed files -> sections.
const cache = new PugCompileCache()
const graph = new PugDependencyGraph()

export function getPugDependencyGraph(): PugDependencyGraph {
  return graph
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

// Persistent worker pool: workers are spawned lazily (up to MAX_POOL_SIZE) and kept warm for the
// process lifetime, so incremental rebuilds reuse them instead of paying thread spawn + module load
// on every change. Idle workers are unref'd so they never keep the process alive — tests and
// one-shot builds still exit cleanly — and a worker is ref'd again only while it handles a task.
const allWorkers = new Set<Worker>()
const idleWorkers: Worker[] = []
const waiters: ((worker: Worker) => void)[] = []

function spawnWorker(): Worker {
  const worker = new Worker(workerFilePathResolved, { name: `pug-worker-${allWorkers.size}` })
  allWorkers.add(worker)
  return worker
}

function acquireWorker(): Promise<Worker> {
  const idle = idleWorkers.pop()
  if (idle) {
    idle.ref()
    return Promise.resolve(idle)
  }
  if (allWorkers.size < MAX_POOL_SIZE) {
    // a freshly spawned worker is ref'd by default, which is what we want while it is busy
    return Promise.resolve(spawnWorker())
  }
  return new Promise<Worker>((resolve) => {
    waiters.push(resolve)
  })
}

function releaseWorker(worker: Worker): void {
  const waiter = waiters.shift()
  if (waiter) {
    waiter(worker)
    return
  }
  worker.unref()
  idleWorkers.push(worker)
}

/** Drop a worker that crashed at the thread level, replacing it if tasks are still queued. */
async function discardWorker(worker: Worker): Promise<void> {
  allWorkers.delete(worker)
  await worker.terminate().catch(() => {})
  const waiter = waiters.shift()
  if (waiter && allWorkers.size < MAX_POOL_SIZE) {
    waiter(spawnWorker())
  }
}

/** Run a single compile job on a worker, settling when it replies or rejecting if the thread dies. */
function runOnWorker(worker: Worker, input: PugWorkerInput): Promise<PugWorkerOutput> {
  return new Promise<PugWorkerOutput>((resolve, reject) => {
    function cleanup(): void {
      worker.off('message', onMessage)
      worker.off('error', onError)
    }
    function onMessage(result: PugWorkerOutput): void {
      cleanup()
      resolve(result)
    }
    function onError(error: Error): void {
      cleanup()
      reject(error)
    }
    worker.once('message', onMessage)
    worker.once('error', onError)
    worker.postMessage(input)
  })
}

/** Terminate every pooled worker. Used by the signal handlers and available for explicit teardown. */
export async function terminatePugWorkers(): Promise<void> {
  const workers = [...allWorkers]
  allWorkers.clear()
  idleWorkers.length = 0
  waiters.length = 0
  await Promise.all(workers.map(worker => worker.terminate()))
}

// terminate workers automatically on terminal exit
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const
signals.forEach(signal => process.on(signal, () => {
  void terminatePugWorkers()
}))

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
  logger.error(`Pug markup failed to compile for section "${pugError.id}": ${pugError.message}`)
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
    const file = pugErrorFile(error)
    recordFailure(mode, repository, errors, { id, file: file ? path.resolve(file) : undefined, message })
  }
}

async function compileViaWorkerPool(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: string[],
  errors: PugCompileError[],
): Promise<void> {
  const tasks = ids.map(async (id) => {
    const markupSource = repository.get(id)!.markup
    const worker = await acquireWorker()

    let result: PugWorkerOutput
    try {
      result = await runOnWorker(worker, { id, mode, html: markupSource, contentDir })
    }
    catch (error) {
      // a thread-level crash (not a pug error — those come back as a message): drop the dead worker
      // so a fresh one takes its place, and record the failure for this section.
      await discardWorker(worker)
      const message = error instanceof Error ? error.message : String(error)
      recordFailure(mode, repository, errors, { id, message })
      return
    }

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
