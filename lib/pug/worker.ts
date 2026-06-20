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
  error: string
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
    parentPort!.postMessage({ id, error: `Pug markup failed to compile for section "${id}": ${message}` } satisfies PugWorkerOutput)
  }
})
