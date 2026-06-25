import path from 'node:path'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import { isTransientFsError, logicalWriteFile } from '../../../lib/utils'

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

describe('isTransientFsError', () => {
  it.each(['ENOENT', 'EBUSY', 'EPERM', 'EACCES'])('treats %s as transient', (code) => {
    expect(isTransientFsError(fsError(code))).toBe(true)
  })

  it('does not treat unrelated error codes as transient', () => {
    expect(isTransientFsError(fsError('EISDIR'))).toBe(false)
  })

  it('returns false for errors without a code and for non-error values', () => {
    expect(isTransientFsError(new Error('boom'))).toBe(false)
    expect(isTransientFsError('ENOENT')).toBe(false)
    expect(isTransientFsError(null)).toBe(false)
    expect(isTransientFsError(undefined)).toBe(false)
  })
})

describe('logicalWriteFile', () => {
  it('writes a new file when it does not exist', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'new-file.txt')

    await logicalWriteFile(filePath, 'hello world')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('hello world')

    await fs.remove(tmpDir)
  })

  it('skips write if content is unchanged', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'existing.txt')

    await fs.writeFile(filePath, 'same content')
    const statBefore = await fs.stat(filePath)

    // Small delay to ensure mtime would differ if written
    await new Promise(resolve => setTimeout(resolve, 50))
    await logicalWriteFile(filePath, 'same content')

    const statAfter = await fs.stat(filePath)
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs)

    await fs.remove(tmpDir)
  })

  it('overwrites file if content has changed', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'changing.txt')

    await fs.writeFile(filePath, 'old content')
    await logicalWriteFile(filePath, 'new content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')

    await fs.remove(tmpDir)
  })

  it('creates intermediate directories if needed', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'nested', 'dir', 'file.txt')

    await logicalWriteFile(filePath, 'deep content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('deep content')

    await fs.remove(tmpDir)
  })
})
