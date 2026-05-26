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
