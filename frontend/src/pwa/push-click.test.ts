// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePushClickTarget, subscribeToPushClicks } from './push-click'

afterEach(() => {
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker')
})

describe('parsePushClickTarget', () => {
  it('reads a stop deep link from the service worker', () => {
    expect(parsePushClickTarget('?stop=COM3')).toEqual({ stopId: 'COM3' })
  })

  it('decodes an encoded stop id', () => {
    expect(parsePushClickTarget('?stop=COM3%20Opp')).toEqual({ stopId: 'COM3 Opp' })
  })

  it('ignores links that are not app-relative stop links', () => {
    expect(parsePushClickTarget('https://evil.test/?stop=COM3')).toBeNull()
    expect(parsePushClickTarget('')).toBeNull()
    expect(parsePushClickTarget('?venue=COM3')).toBeNull()
  })

  it('ignores an oversized stop id', () => {
    expect(parsePushClickTarget(`?stop=${'a'.repeat(65)}`)).toBeNull()
  })
})

describe('subscribeToPushClicks', () => {
  function stubWorker() {
    const worker = new EventTarget() as unknown as ServiceWorkerContainer
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker })
    return worker
  }

  it('forwards only valid push click messages', () => {
    const worker = stubWorker()
    const onTarget = vi.fn()
    const unsubscribe = subscribeToPushClicks(onTarget)

    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'OTHER', url: '?stop=A' } }))
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'PUSH_NOTIFICATION_CLICK', url: 'nope' } }))
    worker.dispatchEvent(new MessageEvent('message', {
      data: { type: 'PUSH_NOTIFICATION_CLICK', url: '?stop=COM3' },
    }))

    expect(onTarget).toHaveBeenCalledOnce()
    expect(onTarget).toHaveBeenCalledWith({ stopId: 'COM3' })
    unsubscribe()
  })

  it('stops listening once unsubscribed', () => {
    const worker = stubWorker()
    const onTarget = vi.fn()
    subscribeToPushClicks(onTarget)()

    worker.dispatchEvent(new MessageEvent('message', {
      data: { type: 'PUSH_NOTIFICATION_CLICK', url: '?stop=COM3' },
    }))

    expect(onTarget).not.toHaveBeenCalled()
  })
})
