import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest'
import { buildStyleguide } from '../../lib/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const distAssetsExist = fs.existsSync(path.resolve('dist/styleguide-assets'))
const tmpDir = path.resolve('tests/.tmp-build-test')

describe('build pipeline', () => {
  test.skipIf(!distAssetsExist)('skips when dist/styleguide-assets does not exist', () => {})

  describe.skipIf(!distAssetsExist)('with real build', () => {
    let buildResult: Awaited<ReturnType<typeof buildStyleguide>> | undefined
    let buildError: Error | undefined

    beforeAll(async () => {
      await fs.remove(tmpDir)
      await fs.ensureDir(tmpDir)
      const config = createMinimalConfig({
        outDir: tmpDir,
        contentDir: 'tests/fixtures/build-content/',
      })
      try {
        buildResult = await buildStyleguide(config)
      }
      catch (error) {
        buildError = error as Error
      }
    }, 60_000)

    afterAll(async () => {
      await fs.remove(tmpDir)
    })

    it('build completes without throwing', () => {
      expect(buildError).toBeUndefined()
      expect(buildResult).toBeDefined()
    })

    it('index.html is generated in output dir', async () => {
      const indexPath = path.join(tmpDir, 'index.html')
      expect(await fs.exists(indexPath)).toBe(true)
      const content = await fs.readFile(indexPath, 'utf-8')
      expect(content).toContain('<!DOCTYPE html>')
    })

    it('preview-*.html files are generated', async () => {
      const files = await fs.readdir(tmpDir)
      const previewFiles = files.filter(f => f.startsWith('preview-') && f.endsWith('.html'))
      expect(previewFiles.length).toBeGreaterThan(0)
    })

    it('fullpage-*.html files are generated', async () => {
      const files = await fs.readdir(tmpDir)
      const fullpageFiles = files.filter(f => f.startsWith('fullpage-') && f.endsWith('.html'))
      expect(fullpageFiles.length).toBeGreaterThan(0)
    })

    it('styleguide-assets/ directory is created', async () => {
      const assetsDir = path.join(tmpDir, 'styleguide-assets')
      expect(await fs.exists(assetsDir)).toBe(true)
      const contents = await fs.readdir(assetsDir)
      expect(contents.length).toBeGreaterThan(0)
    })
  })
})
