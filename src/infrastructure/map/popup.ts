import type { Popup } from 'maplibre-gl'
import type { TransitStop } from '../../domain/transit/types'
import type { TripEndpoint, TripEndpointRole } from '../../domain/trip/types'

interface PopupAction {
  readonly label: string
  readonly onClick: () => void
}

export interface PopupContent {
  readonly element: HTMLDivElement
  dispose(): void
}

export function createPopupContent(
  titleText: string,
  details: readonly string[],
  actions: readonly PopupAction[] = [],
): PopupContent {
  const content = document.createElement('div')
  const listeners: Array<{
    element: HTMLButtonElement
    listener: () => void
  }> = []
  const title = document.createElement('strong')
  title.textContent = titleText
  content.append(title)

  for (const detail of details) {
    const line = document.createElement('div')
    line.textContent = detail
    content.append(line)
  }

  for (const action of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = action.label
    button.className = 'bus-stop-popup-action'
    button.addEventListener('click', action.onClick)
    listeners.push({ element: button, listener: action.onClick })
    content.append(button)
  }

  let disposed = false
  return {
    element: content,
    dispose() {
      if (disposed) return
      disposed = true
      for (const { element, listener } of listeners) {
        element.removeEventListener('click', listener)
      }
    },
  }
}

export function createBusStopPopupContent(
  stop: TransitStop,
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
): PopupContent {
  const details = [
    `Stop: ${stop.id}`,
    `Services: ${stop.services.join(', ')}`,
  ]
  if (stop.opposite) details.push(`Opposite stop: ${stop.opposite}`)

  const actions = onSetEndpoint
    ? (['origin', 'destination'] as const).map((role) => ({
        label: role === 'origin' ? 'Set as origin' : 'Set as destination',
        onClick: () => onSetEndpoint(role, { kind: 'stop', id: stop.id }),
      }))
    : []

  return createPopupContent(stop.longName, details, actions)
}

export interface PopupCoordinator {
  register(popup: Popup): () => void
  dispose(): void
}

export function createPopupCoordinator(): PopupCoordinator {
  let activePopup: Popup | null = null
  const registrations = new Set<{
    popup: Popup
    handleOpen: () => void
    handleClose: () => void
  }>()

  return {
    register(popup) {
      const handleOpen = () => {
        const previousPopup = activePopup
        activePopup = popup
        if (previousPopup && previousPopup !== popup) previousPopup.remove()
      }
      const handleClose = () => {
        if (activePopup === popup) activePopup = null
      }
      const registration = { popup, handleOpen, handleClose }
      registrations.add(registration)
      popup.on('open', handleOpen)
      popup.on('close', handleClose)

      return () => {
        if (!registrations.delete(registration)) return
        popup.off('open', handleOpen)
        popup.off('close', handleClose)
        if (activePopup === popup) activePopup = null
      }
    },

    dispose() {
      for (const { popup, handleOpen, handleClose } of registrations) {
        popup.off('open', handleOpen)
        popup.off('close', handleClose)
      }
      registrations.clear()
      activePopup?.remove()
      activePopup = null
    },
  }
}
