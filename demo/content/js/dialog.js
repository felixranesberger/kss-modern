// Opens a native <dialog> from a trigger and closes it from its buttons or the backdrop.
export function initDialogs() {
  document.querySelectorAll('[data-dialog-open]').forEach((trigger) => {
    const dialog = document.getElementById(trigger.dataset.dialogOpen)
    if (!dialog)
      return

    trigger.addEventListener('click', () => dialog.showModal())
    dialog.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()))
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog)
        dialog.close()
    })
  })
}
