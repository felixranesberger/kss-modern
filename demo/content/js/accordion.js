// Toggles accordion panels and keeps aria-expanded / [hidden] in sync.
export function initAccordions() {
  const triggers = document.querySelectorAll('.c-accordion__trigger')
  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true'
      const panelId = trigger.getAttribute('aria-controls')
      const panel = panelId ? document.getElementById(panelId) : null

      trigger.setAttribute('aria-expanded', String(!isExpanded))
      if (panel) {
        panel.hidden = isExpanded
      }
    })
  })
}
