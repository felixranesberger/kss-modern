import { readFileSync } from 'node:fs'
import chokidar from 'chokidar'

/**
 * Type definition for the file watcher callback function
 */
type WatchCallback = () => void

const VALID_CSS_FILE_TYPES = ['.css', '.scss', '.sass', '.less']

function isCssFile(filePath: string): boolean {
  return VALID_CSS_FILE_TYPES.some(type => filePath.endsWith(type))
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md')
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

/**
 * Watches for changes in file contents that match a specific regex pattern
 * @param path - File path or glob pattern to watch
 * @param regex - Regular expression to match file contents
 * @param callback - Function to call when matching content changes
 */
function watchForFileContentChanges(path: string | string[], regex: RegExp, callback: WatchCallback): void {
  if (typeof callback !== 'function') {
    throw new TypeError('styleguide watch requires a callback function')
  }

  // Store file contents matches in a Map
  const regexFileContents = new Map<string, RegExpMatchArray | null>()

  const handleCSSAdd = (filePath: string): void => {
    const currentFileContent = readFileSync(filePath, 'utf8')
    const currentFileMatches = currentFileContent.match(regex)

    if (currentFileMatches === null) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    callback()
  }

  const handleCSSChange = (filePath: string): void => {
    const previousFileMatches = regexFileContents.get(filePath)
    const hasFileBeenReadBefore = previousFileMatches !== undefined

    const currentFileContent = readFileSync(filePath, 'utf8')
    const currentFileMatches = currentFileContent.match(regex)

    if (!hasFileBeenReadBefore) {
      regexFileContents.set(filePath, currentFileMatches)
      if (currentFileMatches === null) {
        return
      }
      callback()
      return
    }

    if (matchArraysEqual(previousFileMatches, currentFileMatches)) {
      return
    }

    regexFileContents.set(filePath, currentFileMatches)
    callback()
  }

  const handleCSSUnlink = (filePath: string): void => {
    regexFileContents.delete(filePath)
    callback()
  }

  // Single watcher with file-extension routing in handlers
  const validFileTypes = [...VALID_CSS_FILE_TYPES, '.md']
  chokidar.watch(path, {
    ignoreInitial: true,
    // @ts-expect-error - chokidar types seem to be incomplete, ignore
    ignored: (path, stats) => {
      return stats?.isFile() && !validFileTypes.some(type => path.endsWith(type))
    },
  })
    .on('add', (filePath: string) => {
      if (isCssFile(filePath))
        handleCSSAdd(filePath)
      else if (isMarkdownFile(filePath))
        callback()
    })
    .on('change', (filePath: string) => {
      if (isCssFile(filePath))
        handleCSSChange(filePath)
      else if (isMarkdownFile(filePath))
        callback()
    })
    .on('unlink', (filePath: string) => {
      if (isCssFile(filePath))
        handleCSSUnlink(filePath)
      else if (isMarkdownFile(filePath))
        callback()
    })
}

/**
 * Watch for changes in KSS section comment blocks
 * @param path - File path or glob pattern to watch
 * @param callback - Function to call when KSS sections change
 */
export function watchStyleguideForChanges(path: string | string[], callback: WatchCallback): void {
  // Matches the KSS section comment block
  // (file must start with "/*", "/**" and end with "*/", "**/" and contain "Styleguide"
  const kssSectionRegex = /\/\*{1,2}[\s\S]*?Styleguide[\s\S]*?\*\//g

  watchForFileContentChanges(
    path,
    kssSectionRegex,
    callback,
  )
}
