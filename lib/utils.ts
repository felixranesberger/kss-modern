import path from 'node:path'
import fs from 'fs-extra'

type LogStyle = 'important' | 'unimportant'

/**
 * Console.log wrapper with toolchain specific styling
 */
export function log(message: string, style: LogStyle = 'important'): void {
  const computedMessage = style === 'important'
    ? `\x1B[38;2;63;94;90m${new Date().toLocaleTimeString()} \x1B[38;2;32;252;143m[Styleguide]\x1B[0m ${message}`
    : `\x1B[38;2;63;94;90m${new Date().toLocaleTimeString()} \x1B[38;2;32;252;143m[Styleguide]\x1B[0m \x1B[38;2;63;94;90m${message}`

  // eslint-disable-next-line no-console
  console.log(computedMessage)
}

/**
 * Write a file only if the content has changed
 */
export async function logicalWriteFile(filepath: string, content: string) {
  // ensure directory exists
  const dir = path.dirname(filepath)
  await fs.ensureDir(dir)

  const isFileExisting = await fs.exists(filepath)
  if (isFileExisting) {
    const oldContent = await fs.readFile(filepath, 'utf-8')
    if (oldContent === content) {
      return
    }
  }

  await fs.writeFile(filepath, content)
}

/**
 * Pug outputs some semantic issues that throw accessibility errors.
 * This function fixes them.
 */
export function fixAccessibilityIssues(html: string): string {
  let parsedMarkup = html

  const omitValue = ['required', 'disabled', 'checked', 'selected', 'multiple', 'readonly', 'open']
  omitValue.forEach((value) => {
    parsedMarkup = parsedMarkup
      .replaceAll(`${value}="${value}"`, value)
      .replaceAll(`${value}=""`, value)
  })

  return parsedMarkup
}

/**
 * Convert special characters to HTML entities
 */
export function sanitizeSpecialCharacters(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

export function ensureStartingSlash(input: string): string {
  return input.startsWith('/') ? input : `/${input}`
}

/**
 * Generate unique IDs
 */
function* idGenerator(): Generator<number, never, unknown> {
  let id = 0

  while (true) {
    yield id++
  }
}

const idGen = idGenerator()

export function generateId(): number {
  const { value } = idGen.next()
  return value
}
