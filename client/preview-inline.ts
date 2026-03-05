import { initResizeHandles } from './lib/iframe-resize.ts'
import initPreviewIframes, { removeDocumentLoadingClass } from './lib/iframe.ts'
import { handleThemeSelect } from './lib/theme-select'

document.addEventListener('DOMContentLoaded', () => {
  const themeSelectForm = document.querySelector<HTMLFormElement>('.theme-select')
  if (themeSelectForm) {
    handleThemeSelect(themeSelectForm)
  }

  const previewIframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('.preview-iframe'))
  if (previewIframes.length > 0) {
    initPreviewIframes(previewIframes).catch(console.error)
  }
  else {
    removeDocumentLoadingClass()
  }

  initResizeHandles()
})
