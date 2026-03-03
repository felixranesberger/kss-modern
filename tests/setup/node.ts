import type { StyleguideConfiguration } from '../../lib/index.ts'

declare global {
  var isWatchMode: boolean
  var styleguideConfiguration: StyleguideConfiguration
}

globalThis.isWatchMode = false
