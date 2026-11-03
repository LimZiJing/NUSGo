import { describe, expect, it, vi } from 'vitest'
import { reloadOnServiceWorkerControllerChange } from './pwa-runtime'

function createServiceWorkerContainer(controller: ServiceWorker | null): ServiceWorkerContainer {
  const container = new EventTarget() as unknown as ServiceWorkerContainer
  Object.defineProperty(container, 'controller', { value: controller })
  return container
}

describe('service worker update reloads', () => {
  it('waits for an update after the first worker takes control', () => {
    const serviceWorkerContainer = createServiceWorkerContainer(null)
    const reload = vi.fn()
    reloadOnServiceWorkerControllerChange(serviceWorkerContainer, reload)

    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()

    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))
    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads when an already-controlled page receives an updated worker', () => {
    const serviceWorkerContainer = createServiceWorkerContainer({} as ServiceWorker)
    const reload = vi.fn()
    reloadOnServiceWorkerControllerChange(serviceWorkerContainer, reload)

    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledOnce()
  })
})
