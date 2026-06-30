// Entry module loaded into every preview iframe (served as /content-assets/js/main.js).
// Each component initializer queries by selector, so it is a no-op in iframes
// that don't contain that component.
import { initAccordions } from './accordion.js'
import { initModals } from './modal.js'
import { initTabs } from './tabs.js'

function init() {
  initAccordions()
  initModals()
  initTabs()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
}
else {
  init()
}
