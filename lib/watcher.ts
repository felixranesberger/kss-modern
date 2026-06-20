import type { FSWatcher } from 'chokidar'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import chokidar from 'chokidar'

export interface StyleguideWatchHandlers {
  /**
   * A `.css/.scss/.sass/.less` file whose KSS section comment changed, or any `.md` change.
   * These can alter section structure, so the whole styleguide is rebuilt.
   */
  onStructuralChange: () => void
  /**
   * A `.pug` (or source `.html`) markup file changed. Only the sections depending on it are
   * recompiled and rewritten. Receives the absolute path of the changed file.
   */
  onMarkupChange: (changedFile: string) => void
}

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
 * Watch the content directory and route file changes to the appropriate rebuild strategy:
 * structural changes (CSS sections / markdown) trigger a full rebuild, while markup changes
 * (`.pug`/`.html`) trigger an incremental rebuild of only the dependent sections.
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

  const handleCssAdd = (filePath: string): void => {
    const currentFileMatches = readFileSync(filePath, 'utf8').match(kssSectionRegex)
    if (currentFileMatches === null) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    handlers.onStructuralChange()
  }

  const handleCssChange = (filePath: string): void => {
    const previousFileMatches = regexFileContents.get(filePath)
    const hasFileBeenReadBefore = previousFileMatches !== undefined

    const currentFileMatches = readFileSync(filePath, 'utf8').match(kssSectionRegex)

    if (!hasFileBeenReadBefore) {
      regexFileContents.set(filePath, currentFileMatches)
      if (currentFileMatches === null) {
        return
      }
      handlers.onStructuralChange()
      return
    }

    if (matchArraysEqual(previousFileMatches, currentFileMatches)) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    handlers.onStructuralChange()
  }

  const handleCssUnlink = (filePath: string): void => {
    regexFileContents.delete(filePath)
    handlers.onStructuralChange()
  }

  // Single watcher with file-extension routing in handlers
  const validFileTypes = [...VALID_CSS_FILE_TYPES, '.md', ...MARKUP_FILE_TYPES]
  return chokidar.watch(watchPath, {
    ignoreInitial: true,
    // @ts-expect-error - chokidar types seem to be incomplete, ignore
    ignored: (filePath, stats) => {
      return stats?.isFile() && !validFileTypes.some(type => filePath.endsWith(type))
    },
  })
    .on('add', (filePath: string) => {
      if (isCssFile(filePath))
        handleCssAdd(filePath)
      else if (isMarkdownFile(filePath))
        handlers.onStructuralChange()
      else if (isMarkupFile(filePath))
        handlers.onMarkupChange(path.resolve(filePath))
    })
    .on('change', (filePath: string) => {
      if (isCssFile(filePath))
        handleCssChange(filePath)
      else if (isMarkdownFile(filePath))
        handlers.onStructuralChange()
      else if (isMarkupFile(filePath))
        handlers.onMarkupChange(path.resolve(filePath))
    })
    .on('unlink', (filePath: string) => {
      if (isCssFile(filePath))
        handleCssUnlink(filePath)
      else if (isMarkdownFile(filePath))
        handlers.onStructuralChange()
      else if (isMarkupFile(filePath))
        handlers.onMarkupChange(path.resolve(filePath))
    })
}
