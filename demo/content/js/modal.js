// Wires modal triggers to their dialogs: open on trigger, close on
// [data-modal-close], the backdrop, or Escape.
export function initModals() {
  const triggers = document.querySelectorAll('[data-modal-target]')

  triggers.forEach((trigger) => {
    const id = trigger.getAttribute('data-modal-target')
    const modal = id ? document.getElementById(id) : null
    if (!modal) {
      return
    }

    const open = () => {
      modal.classList.add('is-open')
      modal.setAttribute('aria-hidden', 'false')
    }

    const close = () => {
      modal.classList.remove('is-open')
      modal.setAttribute('aria-hidden', 'true')
    }

    trigger.addEventListener('click', open)
    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', close)
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        close()
      }
    })
  })
}
