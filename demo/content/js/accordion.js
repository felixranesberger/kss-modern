// Opening one <details> panel closes its siblings.
export function initAccordions() {
  document.querySelectorAll('[data-accordion]').forEach((accordion) => {
    const items = Array.from(accordion.querySelectorAll('details'))
    items.forEach((item) => {
      item.addEventListener('toggle', () => {
        if (!item.open)
          return
        items.filter(other => other !== item).forEach(other => (other.open = false))
      })
    })
  })
}
