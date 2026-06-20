import type { StyleguideConfiguration } from '../index'
import { parentPort } from 'node:worker_threads'
import { compileMarkup } from './compile-core.ts'

export interface PugWorkerInput {
  id: string
  mode: StyleguideConfiguration['mode']
  contentDir: `${string}/`
  html: string
}

interface PugWorkerSuccess {
  id: string
  html: string
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

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

parentPort.on('message', async (data: PugWorkerInput) => {
  const { id, mode, html, contentDir } = data

  try {
    const { html: compiled, dependencies } = await compileMarkup(contentDir, mode, html, id)
    parentPort!.postMessage({ id, html: compiled, dependencies } satisfies PugWorkerOutput)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const file = (error as { path?: string, filename?: string } | null)?.path
      ?? (error as { path?: string, filename?: string } | null)?.filename
    parentPort!.postMessage({ id, error: message, file } satisfies PugWorkerOutput)
  }
})
