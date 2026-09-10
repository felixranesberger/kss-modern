import type { FSWatcher } from 'chokidar'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import chokidar from 'chokidar'
import { logger } from './logger.ts'
import { batchDebounce } from './scheduling.ts'
import { isTransientFsError } from './utils.ts'

export interface StyleguideWatchHandlers {
  /**
   * A `.css/.scss/.sass/.less` file whose KSS section comment changed, or any `.md`
   * change. These can alter section structure, so the whole styleguide is rebuilt.
   */
  onStructuralChange: () => void
  /**
   * One or more `.pug` (or source `.html`) markup files changed. Only the sections
   * depending on them are recompiled and rewritten. Receives absolute paths.
   */
  onMarkupChange: (changedFiles: string[]) => void
}

/**
 * How long to keep collecting events before dispatching them as one batch.
 * Chosen to sit above the event storms a branch switch or a bulk edit produces
 * while staying below the threshold where a save feels unacknowledged.
 */
const BATCH_SETTLE_MS = 300

const POLLING_INTERVAL_MS = 300

/**
 * Bind mounts on Docker Desktop (macOS/Windows) do not propagate inotify events
 * into the container, so native watching silently does nothing — no error, just
 * no rebuilds. Enable polling when running inside a container, detected via
 * `/.dockerenv` (Docker), `/run/.containerenv` (Podman) or the `container` env
 * var (systemd-nspawn, some Kubernetes setups). `FORCE_POLLING=1` overrides.
 */
const USE_POLLING
  = process.env.FORCE_POLLING === '1'
    || existsSync('/.dockerenv')
    || existsSync('/run/.containerenv')
    || process.env.container !== undefined

/** A change waiting to be dispatched, categorised by the rebuild it needs. */
type PendingChange
  = | { category: 'structural' }
    | { category: 'markup', path: string }

const VALID_CSS_FILE_TYPES = ['.css', '.scss', '.sass', '.less']
const MARKUP_FILE_TYPES = ['.pug', '.html']

function isCssFile(filePath: string): boolean {
  return VALID_CSS_FILE_TYPES.some(type => filePath.endsWith(type))
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md')
}

function isMarkupFile(filePath: string): boolean {
  return MARKUP_FILE_TYPES.some(type => filePath.endsWith(type))
}

function matchArraysEqual(a: RegExpMatchArray | null, b: RegExpMatchArray | null): boolean {
  if (a === null && b === null)
    return true
  if (a === null || b === null)
    return false
  if (a.length !== b.length)
    return false
  return a.every((value, index) => value === b[index])
}

// Matches the KSS section comment block
// (file must start with "/*", "/**" and end with "*/", "**/" and contain "Styleguide"
const kssSectionRegex = /\/\*{1,2}[\s\S]*?Styleguide[\s\S]*?\*\//g

/**
 * Read a watched file synchronously, returning `undefined` if it was removed or
 * is mid-replace (atomic save) when the watcher event fires. The crash this
 * guards against happens because chokidar emits `add`/`change` synchronously
 * and an unguarded `readFileSync` throw escapes the listener and exits Node.
 * Skipping is safe: a later stable event (or the matching `unlink`) settles it.
 */
function tryReadFileSync(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8')
  }
  catch (error) {
    if (isTransientFsError(error))
      return undefined

    throw error
  }
}

/**
 * Reduce a batch to the rebuilds it actually needs.
 *
 * A structural change reparses and rewrites everything, so it makes any markup
 * work in the same batch redundant. Markup paths are deduplicated because a
 * single save can surface as several events.
 */
export function planRebuilds(changes: PendingChange[]): { structural: boolean, markupFiles: string[] } {
  const structural = changes.some(change => change.category === 'structural')
  if (structural) {
    return { structural: true, markupFiles: [] }
  }

  const markupFiles = [...new Set(
    changes
      .filter((change): change is Extract<PendingChange, { category: 'markup' }> => change.category === 'markup')
      .map(change => change.path),
  )]

  return { structural: false, markupFiles }
}

/**
 * Watch the content directory and route file changes to the appropriate rebuild strategy:
 * structural changes (CSS sections / markdown) trigger a full rebuild, while markup changes
 * (`.pug`/`.html`) trigger an incremental rebuild of only the dependent sections.
 *
 * Events are collected for {@link BATCH_SETTLE_MS} and dispatched as one batch, so a branch
 * switch or a bulk edit costs one rebuild instead of one per touched file.
 */
export function watchStyleguideForChanges(
  watchPath: string | string[],
  handlers: StyleguideWatchHandlers,
): FSWatcher {
  if (typeof handlers.onStructuralChange !== 'function' || typeof handlers.onMarkupChange !== 'function') {
    throw new TypeError('styleguide watch requires onStructuralChange and onMarkupChange callbacks')
  }

  // Store the KSS section matches per CSS file so unrelated edits don't trigger a rebuild.
  const regexFileContents = new Map<string, RegExpMatchArray | null>()

  const dispatch = batchDebounce<PendingChange>((changes) => {
    const { structural, markupFiles } = planRebuilds(changes)

    if (structural) {
      handlers.onStructuralChange()
      return
    }

    if (markupFiles.length > 0) {
      handlers.onMarkupChange(markupFiles)
    }
  }, BATCH_SETTLE_MS)

  const requestStructural = () => dispatch({ category: 'structural' })
  const requestMarkup = (filePath: string) => dispatch({ category: 'markup', path: path.resolve(filePath) })

  const handleCssAdd = (filePath: string): void => {
    const contents = tryReadFileSync(filePath)
    if (contents === undefined)
      return

    const currentFileMatches = contents.match(kssSectionRegex)
    if (currentFileMatches === null) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    requestStructural()
  }

  const handleCssChange = (filePath: string): void => {
    const previousFileMatches = regexFileContents.get(filePath)
    const hasFileBeenReadBefore = previousFileMatches !== undefined

    const contents = tryReadFileSync(filePath)
    if (contents === undefined)
      return

    const currentFileMatches = contents.match(kssSectionRegex)

    if (!hasFileBeenReadBefore) {
      regexFileContents.set(filePath, currentFileMatches)
      if (currentFileMatches === null) {
        return
      }
      requestStructural()
      return
    }

    if (matchArraysEqual(previousFileMatches, currentFileMatches)) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    requestStructural()
  }

  const handleCssUnlink = (filePath: string): void => {
    regexFileContents.delete(filePath)
    requestStructural()
  }

  const routeEvent = (filePath: string, handleCss: (filePath: string) => void): void => {
    if (isCssFile(filePath))
      handleCss(filePath)
    else if (isMarkdownFile(filePath))
      requestStructural()
    else if (isMarkupFile(filePath))
      requestMarkup(filePath)
  }

  // Single watcher with file-extension routing in handlers
  const validFileTypes = [...VALID_CSS_FILE_TYPES, '.md', ...MARKUP_FILE_TYPES]
  return chokidar.watch(watchPath, {
    ignoreInitial: true,
    usePolling: USE_POLLING,
    interval: POLLING_INTERVAL_MS,
    // Wait until a file has stopped being written before emitting — collapses the
    // multi-event sequence an atomic-save editor (JetBrains, vim with
    // backupcopy=auto) produces for a single save, and guarantees the read in the
    // CSS handlers sees complete content rather than a half-written file.
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 20,
    },
    // @ts-expect-error - chokidar types seem to be incomplete, ignore
    ignored: (filePath, stats) => {
      return stats?.isFile() && !validFileTypes.some(type => filePath.endsWith(type))
    },
  })
    .on('add', (filePath: string) => routeEvent(filePath, handleCssAdd))
    .on('change', (filePath: string) => routeEvent(filePath, handleCssChange))
    .on('unlink', (filePath: string) => routeEvent(filePath, handleCssUnlink))
    // chokidar surfaces filesystem errors through an 'error' event, and FSWatcher is an
    // EventEmitter: an 'error' with no listener is re-thrown and takes the whole dev server down.
    // This fires when a watched directory is removed or rewritten out from under the watcher — e.g.
    // a parallel build emptying the output dir — producing a transient ENOENT (often as a failed
    // unlink of a path that already vanished). Such churn is expected while watching and must never
    // crash the process; a later stable event settles the final state. Anything non-transient is
    // logged but still swallowed, because a watcher is long-lived and losing it silently strands the
    // user with a dead dev server.
    .on('error', (error: unknown) => {
      if (isTransientFsError(error))
        return
      logger.error('Styleguide watcher error (ignored to keep the dev server running):', error)
    })
}
