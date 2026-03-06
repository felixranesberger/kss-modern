import { animate } from 'motion'

const getIsMobileScreen = () => window.matchMedia('(max-width: 768px)').matches

/**
 * Generic hook to show and close a dialog with animations
 */
export function useDialog(dialog: HTMLDialogElement, dialogBackdrop: HTMLElement) {
  let closeDialogEventController: AbortController | undefined

  const close = async (beforeAnimation?: (isMobileScreen: boolean) => void, afterAnimation?: (isMobileScreen: boolean) => void) => {
    if (!dialog!.open)
      return

    const isMobileScreen = getIsMobileScreen()
    beforeAnimation?.(isMobileScreen)

    if (isMobileScreen) {
      animate(dialog!, { opacity: 0, y: [0, 250] }, { duration: 0.3, ease: 'easeOut' })
      await animate(dialogBackdrop!, { opacity: 0 }, { duration: 0.3, ease: 'easeOut' })
    }
    else {
      animate(dialog!, { opacity: 0, scale: [1, 0.98] }, { duration: 0.3, ease: 'easeOut' })
      await animate(dialogBackdrop!, { opacity: 0 }, { duration: 0.3, ease: 'linear' })
        .then(() => dialogBackdrop!.style.display = 'none')
    }

    afterAnimation?.(isMobileScreen)
    dialog!.close()

    if (closeDialogEventController)
      closeDialogEventController.abort()
  }

  async function closeDialogOnOutsideClick(event: MouseEvent) {
    // Use closest() to check if the click target is inside the dialog
    const clickedElement = event.target
    if (!(clickedElement instanceof HTMLElement))
      throw new Error('Clicked element is not an HTMLElement')

    const isClickInsideDialog = clickedElement.closest('dialog') !== null

    if (!isClickInsideDialog) {
      await close()
    }
  }

  const show = async (beforeAnimation?: (isMobileScreen: boolean) => void, afterAnimation?: (isMobileScreen: boolean) => void) => {
    closeDialogEventController = new AbortController()

    const yScrollPos = window.scrollY
    dialog!.showModal()

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        window.scrollTo(0, yScrollPos)
        resolve()
      })
    })

    // reset scroll position to avoid jumping
    setTimeout(() => window.scrollTo(0, yScrollPos), 0)

    dialogBackdrop!.style.display = 'block'

    const isMobileScreen = getIsMobileScreen()
    beforeAnimation?.(isMobileScreen)

    if (isMobileScreen) {
      dialog!.style.overflowY = 'hidden' // avoid showing ugly scrollbar directly

      animate(dialog!, { opacity: [0, 1], y: [250, 0] }, { duration: 0.3, ease: 'easeOut' })
      await animate(dialogBackdrop!, { opacity: [0, 1] }, { duration: 0.3, ease: 'easeOut' })

      dialog!.style.overflowY = 'auto'
    }
    else {
      animate(dialog!, { opacity: [0, 1], scale: [0.98, 1] }, { duration: 0.3, ease: 'easeOut' })
      animate(dialogBackdrop!, { opacity: [0, 1] }, { duration: 0.3, ease: 'easeOut' })
    }

    afterAnimation?.(isMobileScreen)

    // wrap in timeout to prevent immediate closing of dialog
    setTimeout(() => document.addEventListener('click', closeDialogOnOutsideClick, {
      signal: closeDialogEventController?.signal,
    }), 0)

    // detect closes using escape and execute custom animation sequence instead
    dialog!.addEventListener('keydown', async (event) => {
      if (event.key !== 'Escape')
        return

      event.preventDefault()
      await close()
    }, { signal: closeDialogEventController?.signal })
  }

  return { show, close }
}
