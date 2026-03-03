import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { generateFaviconFiles } from '../../../lib/favicon'

function createTmpDir() {
  const dir = path.join(os.tmpdir(), `favicon-test-${crypto.randomUUID()}`)
  fs.ensureDirSync(dir)
  return dir
}

let tmpDir: string

afterEach(async () => {
  if (tmpDir) {
    await fs.remove(tmpDir)
  }
})

describe('generateFaviconFiles', () => {
  it('creates preview.svg and fullpage.svg in favicon/ subdirectory for a single color theme', async () => {
    tmpDir = createTmpDir()
    await generateFaviconFiles(tmpDir, '#3F5E5A')

    const previewPath = path.join(tmpDir, 'favicon', 'preview.svg')
    const fullpagePath = path.join(tmpDir, 'favicon', 'fullpage.svg')

    expect(await fs.pathExists(previewPath)).toBe(true)
    expect(await fs.pathExists(fullpagePath)).toBe(true)

    const previewContent = await fs.readFile(previewPath, 'utf8')
    const fullpageContent = await fs.readFile(fullpagePath, 'utf8')

    expect(previewContent).toContain('<svg')
    expect(previewContent).toContain('#3F5E5A')
    expect(fullpageContent).toContain('<svg')
    expect(fullpageContent).toContain('#3F5E5A')
  })

  it('creates SVGs with dark mode media query for {light, dark} theme', async () => {
    tmpDir = createTmpDir()
    await generateFaviconFiles(tmpDir, { light: '#3F5E5A', dark: '#A0C4B8' })

    const previewContent = await fs.readFile(path.join(tmpDir, 'favicon', 'preview.svg'), 'utf8')
    const fullpageContent = await fs.readFile(path.join(tmpDir, 'favicon', 'fullpage.svg'), 'utf8')

    expect(previewContent).toContain('#3F5E5A')
    expect(previewContent).toContain('#A0C4B8')
    expect(previewContent).toContain('prefers-color-scheme: dark')

    expect(fullpageContent).toContain('#3F5E5A')
    expect(fullpageContent).toContain('#A0C4B8')
    expect(fullpageContent).toContain('prefers-color-scheme: dark')
  })

  it('does not include dark mode media query for single color theme', async () => {
    tmpDir = createTmpDir()
    await generateFaviconFiles(tmpDir, '#FF0000')

    const previewContent = await fs.readFile(path.join(tmpDir, 'favicon', 'preview.svg'), 'utf8')
    expect(previewContent).not.toContain('prefers-color-scheme: dark')
  })

  it('throws error for invalid hex color (single theme)', async () => {
    tmpDir = createTmpDir()
    await expect(generateFaviconFiles(tmpDir, 'not-a-color')).rejects.toThrow('Invalid theme color')
  })

  it('throws error for invalid hex color in light/dark theme', async () => {
    tmpDir = createTmpDir()
    await expect(
      generateFaviconFiles(tmpDir, { light: 'invalid', dark: '#A0C4B8' }),
    ).rejects.toThrow('Invalid light theme color')

    await expect(
      generateFaviconFiles(tmpDir, { light: '#3F5E5A', dark: 'invalid' }),
    ).rejects.toThrow('Invalid dark theme color')
  })

  it('does not overwrite existing favicon files', async () => {
    tmpDir = createTmpDir()

    // Create files first
    await generateFaviconFiles(tmpDir, '#3F5E5A')

    const previewPath = path.join(tmpDir, 'favicon', 'preview.svg')
    const originalContent = await fs.readFile(previewPath, 'utf8')

    // Run again with a different color - files should not be overwritten
    await generateFaviconFiles(tmpDir, '#FF0000')

    const unchangedContent = await fs.readFile(previewPath, 'utf8')
    expect(unchangedContent).toBe(originalContent)
    expect(unchangedContent).toContain('#3F5E5A')
    expect(unchangedContent).not.toContain('#FF0000')
  })
})
