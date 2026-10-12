// Entry module loaded into every preview. Each initializer only acts on the
// components present in the current preview.
import { initAccordions } from './accordion.js'
import { initDialogs } from './dialog.js'
import { initTabs } from './tabs.js'

function init() {
  initAccordions()
  initDialogs()
  initTabs()
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', init)
else
  init()
