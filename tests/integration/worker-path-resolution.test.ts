import path from 'node:path'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'

// Guards the dist worker-file resolution done in lib/pug/index.ts (resolveWorkerFile). The bundle
// ships at dist/node/lib/index.mjs, so at runtime its __dirname is dist/node/lib and the compile
// worker must exist at `./pug/worker.mjs` relative to it. A build-layout change that stranded the
// worker — the historical "worker.mjs not found" crash on incremental rebuilds — would fail here
// without needing to boot the bundle in a worker thread.
const distIndex = path.resolve('dist/node/lib/index.mjs')

describe.skipIf(!fs.existsSync(distIndex))('dist pug worker file resolution', () => {
  it('keeps the compile worker where resolution from the built bundle expects it', () => {
    const distDir = path.dirname(distIndex) // dist/node/lib
    const expected = path.resolve(distDir, './pug/worker.mjs')
    expect(fs.existsSync(expected)).toBe(true)
  })
})
