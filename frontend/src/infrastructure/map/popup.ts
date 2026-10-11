import type { Popup } from 'maplibre-gl'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getRouteChipTextColor } from '../../domain/transit/route-color'
import type { TransitStop } from '@navus/shared/transit/types'
import type { TripEndpoint, TripEndpointRole } from '../../domain/trip/types'
import { NavigationIcon } from '../../ui/icons'

const MAX_SERVICES_PER_ROW = 4

interface PopupListener {
  readonly element: HTMLButtonElement
  readonly listener: () => void
}

interface PopupElements {
  readonly content: HTMLDivElement
  readonly title: HTMLElement
  readonly listeners: PopupListener[]
}

export interface PopupContent {
  readonly element: HTMLDivElement
  dispose(): void
}

function createPopupElements(
  titleText: string,
  className = 'map-popup-content',
  appendTitle = true,
): PopupElements {
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.className = 'map-popup-title'
  title.textContent = titleText
  content.className = className
  if (appendTitle) content.append(title)
  return { content, title, listeners: [] }
}

function createNavigationIcon(): SVGSVGElement {
  const wrapper = document.createElement('span')
  wrapper.innerHTML = renderToStaticMarkup(createElement(NavigationIcon))
  return wrapper.firstElementChild as SVGSVGElement
}

function appendNavigationAction(
  content: HTMLDivElement,
  listeners: PopupListener[],
  label: string,
  onClick: () => void,
): void {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bus-stop-popup-navigation-action'
  button.setAttribute('aria-label', label)
  button.setAttribute('title', label)
  button.append(createNavigationIcon())
  button.addEventListener('click', onClick)
  listeners.push({ element: button, listener: onClick })
  content.append(button)
}

function toPopupContent(content: HTMLDivElement, listeners: readonly PopupListener[]): PopupContent {
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

export function createPopupContent(
  titleText: string,
  details: readonly string[],
): PopupContent {
  const { content, listeners } = createPopupElements(titleText)

  for (const detail of details) {
    const line = document.createElement('div')
    line.className = 'map-popup-detail'
    line.textContent = detail
    content.append(line)
  }

  return toPopupContent(content, listeners)
}

function createServiceChip(
  service: string,
  routeColors: ReadonlyMap<string, string>,
): HTMLSpanElement {
  const isPublicService = service.startsWith('PUB:')
  const serviceNumber = isPublicService ? service.slice('PUB:'.length) : service
  const chip = document.createElement('span')
  chip.className = isPublicService
    ? 'route-chip route-chip-public'
    : 'route-chip'
  chip.dataset.size = 'compact'
  chip.setAttribute('role', 'listitem')
  chip.textContent = serviceNumber

  if (isPublicService) {
    chip.setAttribute('aria-label', `Public service ${serviceNumber}`)
    chip.setAttribute('title', `Public service ${serviceNumber}`)
  } else {
    chip.dataset.active = 'true'
    chip.dataset.routeId = service
    const routeColor = routeColors.get(service)
    if (routeColor) {
      chip.style.setProperty('--route-color', routeColor)
      chip.style.setProperty('--route-text-color', getRouteChipTextColor(routeColor))
    }
  }

  return chip
}

export function createBusStopPopupContent(
  stop: TransitStop,
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
  routeColors: ReadonlyMap<string, string> = new Map(),
): PopupContent {
  const { content, title, listeners } = createPopupElements(
    stop.shortName,
    'map-popup-content bus-stop-popup-content',
    false,
  )
  const header = document.createElement('div')
  header.className = 'bus-stop-popup-header'
  header.append(title)
  const services = document.createElement('div')
  services.className = 'bus-stop-popup-services'
  services.setAttribute('role', 'list')
  services.setAttribute('aria-label', 'Services')
  const rowCount = Math.ceil(stop.services.length / MAX_SERVICES_PER_ROW)
  const baseRowSize = rowCount > 0 ? Math.floor(stop.services.length / rowCount) : 0
  const extraServices = rowCount > 0 ? stop.services.length % rowCount : 0
  let index = 0
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowSize = baseRowSize + (rowIndex < extraServices ? 1 : 0)
    const row = document.createElement('div')
    row.className = 'bus-stop-popup-service-row'
    row.setAttribute('role', 'presentation')
    for (const service of stop.services.slice(index, index + rowSize)) {
      row.append(createServiceChip(service, routeColors))
    }
    services.append(row)
    index += rowSize
  }
  content.append(header, services)

  if (onSetEndpoint) {
    appendNavigationAction(
      header,
      listeners,
      'Set destination',
      () => onSetEndpoint('destination', { kind: 'stop', id: stop.id }),
    )
  }
  return toPopupContent(content, listeners)
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
