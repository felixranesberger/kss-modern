import type { Mode } from './compile-core.ts'
import type { PugWorkerInput, PugWorkerOutput } from './worker.ts'
import { existsSync } from 'node:fs'
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
import { clearPugParseCache } from './parse-cache.ts'

export interface PugCompileError {
  /** Section id whose markup failed to compile. */
  id: string
  /** Absolute path of the `.pug` file that failed, if pug reported one. */
  file?: string
  /** Raw pug error message — includes the code frame pointing at the offending line. */
  message: string
}

// Use all but one core for compile workers, but keep at least 2: a cpu-limited container (where
// os.cpus() can report just 1-2) must still compile sections in parallel rather than serially.
// The main thread mostly awaits worker messages during a compile, so a slight oversubscription is fine.
const MAX_POOL_SIZE = Math.max(2, os.cpus().length - 1)
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

/**
 * Test helper: clear the module-level cache + dependency graph between cases. Also clears this
 * thread's pug parse cache; worker-thread parse caches self-invalidate by file signature.
 */
export function resetPugState(): void {
  cache.clear()
  graph.clear()
  clearPugParseCache()
}

// Resolve the compile-worker entry robustly. It sits at a fixed spot per build: source dev runs
// `./worker.ts` next to this file, while the bundle at dist/node/lib/index.mjs emits it to
// dist/node/lib/pug/worker.mjs. Guessing that layout from a path substring (the old
// `__dirname.includes('dist/')`) is fragile — it breaks on Windows, where separators are `\`, so a
// real dist install falls into the source branch and resolves to a file that isn't there, which
// crashes every worker spawn. Instead probe the known candidates and take the first that exists.
// `undefined` means no worker file is available, and compilation falls back to the (correct, just
// serial) main-thread path rather than crashing.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function resolveWorkerFile(): string | undefined {
  const candidates = ['./worker.ts', './worker.mjs', './pug/worker.mjs']
  for (const candidate of candidates) {
    const resolved = path.resolve(__dirname, candidate)
    if (existsSync(resolved))
      return resolved
  }
  return undefined
}

const workerFilePathResolved = resolveWorkerFile()
let warnedMissingWorker = false

// Persistent, affinity-routed worker pool. Each section is pinned to a fixed slot by a hash of its
// id, so it always recompiles on the same worker and reuses that worker's warm parse cache (see
// ./parse-cache.ts). This matters because every worker is a separate V8 isolate with its OWN parse
// cache: with round-robin dispatch a section could land on a different worker each rebuild and pay a
// cold re-parse of the whole shared include tree. With affinity the initial full build doubles as
// the warm-up — by the first incremental edit every slot has already parsed the trees of the
// sections pinned to it, so only the file that actually changed is re-parsed.
//
// Workers spawn lazily per slot and are kept warm for the process lifetime. Tasks pinned to the same
// slot run sequentially (a worker handles one message at a time, and runOnWorker is not safe for
// concurrent calls on one worker). A slot's worker is unref'd whenever it goes idle so it never keeps
// the process alive — tests and one-shot builds still exit cleanly — and ref'd again while busy.
interface WorkerSlot {
  worker?: Worker
  /** Serializes the tasks pinned to this slot. */
  tail: Promise<unknown>
  /** In-flight + queued tasks on this slot; the worker is unref'd when this returns to 0. */
  active: number
}
const slots: WorkerSlot[] = Array.from({ length: MAX_POOL_SIZE }, () => ({ tail: Promise.resolve(), active: 0 }))
const allWorkers = new Set<Worker>()

/** FNV-1a: a small, stable string hash so a section id always maps to the same slot. */
function slotIndexFor(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % MAX_POOL_SIZE
}

function spawnWorker(index: number): Worker {
  // Guarded for safety: compileIds forces the inline path when no worker file was found, so this
  // is never reached with an undefined path. If it somehow is, throwing here is caught by
  // compileViaWorkerPool and recorded as a per-section failure rather than crashing the build.
  if (!workerFilePathResolved)
    throw new Error('pug compile worker file could not be located')
  const worker = new Worker(workerFilePathResolved, { name: `pug-worker-${index}` })
  allWorkers.add(worker)
  return worker
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

/**
 * Compile `input` on the worker that section `id` is pinned to, queueing behind any task already
 * running on that slot. Rejects if the worker thread dies (the slot drops it so the next task spawns
 * a fresh one); the caller records the failure.
 */
function runPinned(id: string, input: PugWorkerInput): Promise<PugWorkerOutput> {
  const slot = slots[slotIndexFor(id)]
  slot.active++
  const run = slot.tail.then(async () => {
    if (!slot.worker)
      slot.worker = spawnWorker(slots.indexOf(slot))
    const worker = slot.worker
    worker.ref()
    try {
      return await runOnWorker(worker, input)
    }
    catch (error) {
      // thread-level crash: drop the dead worker so the slot respawns (cold) on its next task
      allWorkers.delete(worker)
      void worker.terminate().catch(() => {})
      if (slot.worker === worker)
        slot.worker = undefined
      throw error
    }
    finally {
      slot.active--
      if (slot.active === 0)
        slot.worker?.unref()
    }
  })
  // keep the per-slot chain alive whether this task resolved or rejected
  slot.tail = run.then(() => {}, () => {})
  return run
}

/** Terminate every pooled worker. Used by the signal handlers and available for explicit teardown. */
export async function terminatePugWorkers(): Promise<void> {
  const workers = [...allWorkers]
  allWorkers.clear()
  for (const slot of slots) {
    slot.worker = undefined
    slot.tail = Promise.resolve()
    slot.active = 0
  }
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
 * Record a compile failure. In development the error overlay is layered over the section's last
 * successfully compiled HTML (from the cache, which a failed compile leaves untouched), so the
 * preview keeps its content and height instead of collapsing and jumping to the top; if the section
 * never compiled, the overlay renders over empty content. The build keeps going so every other
 * section still renders. In production nothing is patched in — the accumulated errors are thrown by
 * `compileIds`, which breaks the build. Either way the failure is logged; it is not surfaced through
 * any return value or callback.
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
    const lastHtml = cache.get(pugError.id)?.compiledHtml ?? ''
    repository.set(pugError.id, { markup: renderPugErrorOverlay(pugError, lastHtml) })
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

    let result: PugWorkerOutput
    try {
      result = await runPinned(id, { id, mode, html: markupSource, contentDir })
    }
    catch (error) {
      // a thread-level crash (not a pug error — those come back as a message). runPinned has already
      // dropped the dead worker from its slot; just record the failure for this section.
      const message = error instanceof Error ? error.message : String(error)
      recordFailure(mode, repository, errors, { id, message })
      return
    }

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
  // Without a worker file, everything must compile on the main thread — degraded (serial) but
  // correct, and warned once so the slowdown is diagnosable rather than mysterious.
  if (!workerFilePathResolved && misses.length > INLINE_THRESHOLD && !warnedMissingWorker) {
    warnedMissingWorker = true
    logger.warn('Pug compile worker not found; compiling markup on the main thread. Rebuilds stay correct but are slower.')
  }
  const useInline = !workerFilePathResolved || (mode === 'development' && misses.length <= INLINE_THRESHOLD)
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
