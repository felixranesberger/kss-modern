import type { CompileTimings, Mode } from './compile-core.ts'
import { parentPort } from 'node:worker_threads'
import { compileMarkup, pugErrorFile } from './compile-core.ts'

export interface PugWorkerInput {
  id: string
  mode: Mode
  contentDir: `${string}/`
  html: string
}

interface PugWorkerSuccess {
  id: string
  html: string
  dependencies: string[]
  timings: CompileTimings
}
interface PugWorkerError {
  id: string
  /** Raw pug error message (includes the code frame). */
  error: string
  /** Path of the failing `.pug` file, if pug reported one. */
  file?: string
}
export type PugWorkerOutput = PugWorkerSuccess | PugWorkerError

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

parentPort.on('message', async (data: PugWorkerInput) => {
  const { id, mode, html, contentDir } = data

  try {
    const { html: compiled, dependencies, timings } = await compileMarkup(contentDir, mode, html, id)
    parentPort!.postMessage({ id, html: compiled, dependencies, timings } satisfies PugWorkerOutput)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parentPort!.postMessage({ id, error: message, file: pugErrorFile(error) } satisfies PugWorkerOutput)
  }
})
