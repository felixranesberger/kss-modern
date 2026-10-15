import type { MixinSchemaForm, MixinSchemaResult } from '../mixins/schema.ts'
import type { Mode } from './compile-core.ts'
import type { MixinUsageNode } from './mixin-trace.ts'
import { parentPort } from 'node:worker_threads'
import { compileMixinModule } from '../mixins/compile.ts'
import { evaluateMixinSchema } from '../mixins/schema.ts'
import { requireZod } from '../zod.ts'
import { compileMarkup, pugErrorFile } from './compile-core.ts'

export interface PugSectionJob {
  kind?: 'section'
  id: string
  mode: Mode
  contentDir: `${string}/`
  html: string
  /** The Node registry module of the `.schema.ts` files, when the content directory has any. */
  schemaRegistry?: string
}

/** Precompile one mixin into its playground render module (see `lib/mixins`). */
export interface PugMixinJob {
  kind: 'mixin'
  id: string
  file: string
  name: string
}

/** Evaluate one schema block and convert it to JSON Schema (see `lib/mixins/schema.ts`). */
export interface PugSchemaJob {
  kind: 'schema'
  id: string
  source: string
  form: MixinSchemaForm
}

export type PugWorkerInput = PugSectionJob | PugMixinJob | PugSchemaJob

interface PugWorkerSuccess {
  id: string
  html: string
  dependencies: string[]
  mixinUsage: MixinUsageNode[]
}
interface PugMixinSuccess {
  id: string
  code: string
  dependencies: string[]
}
interface PugWorkerError {
  id: string
  /** Raw pug error message (includes the code frame). */
  error: string
  /** Path of the failing `.pug` file, if pug reported one. */
  file?: string
}
export type PugWorkerOutput = PugWorkerSuccess | PugWorkerError
export type PugMixinWorkerOutput = PugMixinSuccess | PugWorkerError
export interface PugSchemaWorkerOutput {
  id: string
  schema: MixinSchemaResult
}

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

parentPort.on('message', async (data: PugWorkerInput) => {
  const { id } = data

  try {
    if (data.kind === 'schema') {
      const z = requireZod()
      const schema = z ? evaluateMixinSchema(z, data.source, data.form) : { error: 'zod 4 is not installed' }
      parentPort!.postMessage({ id, schema } satisfies PugSchemaWorkerOutput)
      return
    }

    if (data.kind === 'mixin') {
      const { code, dependencies } = compileMixinModule(data.file, data.name)
      parentPort!.postMessage({ id, code, dependencies } satisfies PugMixinWorkerOutput)
      return
    }

    const { html: compiled, dependencies, mixinUsage } = await compileMarkup(data.contentDir, data.mode, data.html, id, data.schemaRegistry)
    parentPort!.postMessage({ id, html: compiled, dependencies, mixinUsage } satisfies PugWorkerOutput)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parentPort!.postMessage({ id, error: message, file: pugErrorFile(error) } satisfies PugWorkerOutput)
  }
})
