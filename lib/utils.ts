import path from 'node:path'
import fs from 'fs-extra'

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
