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

  /**
   * The asset copy is skipped when the output directory already holds the assets
   * of this build, so a structural rebuild does not rewrite the axe and browser
   * bundles for nothing. What it must not skip is a build whose assets differ —
   * the HTML references content-hashed filenames, so leftovers from an older
   * kss-modern version make every asset request 404.
   */
  describe.skipIf(!distAssetsExist)('styleguide asset copy', () => {
    const assetsTmpDir = path.resolve('tests/.tmp-assets-test')
    const assetsDir = path.join(assetsTmpDir, 'styleguide-assets')
    const markerPath = path.join(assetsDir, '.kss-modern-assets')
    const canaryPath = path.join(assetsDir, 'canary.txt')

    const build = (theme: string) => buildStyleguide(createMinimalConfig({
      outDir: assetsTmpDir,
      contentDir: 'tests/fixtures/build-content/',
      theme,
    }))

    beforeAll(async () => {
      await fs.remove(assetsTmpDir)
      await fs.ensureDir(assetsTmpDir)
      await build('#3F5E5A')
    }, 60_000)

    afterAll(async () => {
      await fs.remove(assetsTmpDir)
    })

    /**
     * The stylesheet part of the build id is a token replaced when the library is
     * bundled, so running against source it stays literal. Only the theme is
     * asserted here; that the id changes with the assets is covered by the
     * leftover-version case below, which does not depend on the replacement.
     */
    it('records which assets the output directory holds', async () => {
      const marker = await fs.readFile(markerPath, 'utf-8')

      expect(marker).toContain('#3F5E5A')
    })

    it('skips the copy when the output already holds these assets', async () => {
      await fs.writeFile(canaryPath, 'left behind')

      await build('#3F5E5A')

      expect(await fs.exists(canaryPath)).toBe(true)
    }, 60_000)

    it('copies again when the theme changed, so favicons are regenerated', async () => {
      await fs.writeFile(canaryPath, 'should be replaced')

      await build('#112233')

      expect(await fs.exists(canaryPath)).toBe(false)
      expect(await fs.readFile(markerPath, 'utf-8')).toContain('#112233')
    }, 60_000)

    it('replaces assets left over from a different kss-modern version', async () => {
      await fs.writeFile(markerPath, 'kss-modern-oldhash.css\n"#112233"\n')
      await fs.writeFile(canaryPath, 'stale asset from an older version')

      await build('#112233')

      expect(await fs.exists(canaryPath)).toBe(false)
      expect(await fs.readFile(markerPath, 'utf-8')).not.toContain('oldhash')
    }, 60_000)
  })
})
