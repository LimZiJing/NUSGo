// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePushClickTarget, scheduleLaunchPushClick, subscribeToPushClicks } from './push-click'

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

describe('scheduleLaunchPushClick', () => {
  function harness(search: string) {
    const scheduled: Array<() => void> = []
    const open = vi.fn()
    const clearQuery = vi.fn()
    const cancel = scheduleLaunchPushClick({
      search,
      open,
      clearQuery,
      // Models a timer: a cancelled callback never runs.
      schedule: (run) => {
        let cancelled = false
        scheduled.push(() => {
          if (!cancelled) run()
        })
        return () => {
          cancelled = true
        }
      },
    })
    return { scheduled, open, clearQuery, cancel }
  }

  it('navigates and only then drops the query from the launch URL', () => {
    const runtime = harness('?stop=COM3')
    expect(runtime.open).not.toHaveBeenCalled()

    runtime.scheduled[0]?.()

    expect(runtime.open).toHaveBeenCalledWith({ stopId: 'COM3' })
    expect(runtime.clearQuery).toHaveBeenCalledOnce()
    // The navigation must happen before the link is dropped.
    expect(runtime.open.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.clearQuery.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('keeps the launch link when cleanup cancels the scheduled navigation, as StrictMode does', () => {
    // StrictMode mounts, runs effects, cleans up, then runs them again. Clearing the query on
    // the first pass would leave the second pass with nothing to open.
    const first = harness('?stop=COM3')
    first.cancel()
    // The scheduled callback still fires in this harness, as a timer might; cancellation is
    // what stops it, so the effect must not have cleared the link before that point.
    first.scheduled[0]?.()

    expect(first.open).not.toHaveBeenCalled()
    expect(first.clearQuery).not.toHaveBeenCalled()

    const second = harness('?stop=COM3')
    second.scheduled[0]?.()

    expect(second.open).toHaveBeenCalledWith({ stopId: 'COM3' })
    expect(second.clearQuery).toHaveBeenCalledOnce()
  })

  it('does nothing when the launch URL carries no stop link', () => {
    const runtime = harness('')

    expect(runtime.scheduled).toHaveLength(0)
    expect(runtime.open).not.toHaveBeenCalled()
    expect(runtime.clearQuery).not.toHaveBeenCalled()
  })

  it('ignores a launch URL that is not an app-relative stop link', () => {
    const runtime = harness('?venue=COM3')

    expect(runtime.scheduled).toHaveLength(0)
    expect(runtime.open).not.toHaveBeenCalled()
  })

  it('uses a real zero-delay timeout by default, and its cancel prevents navigation', () => {
    vi.useFakeTimers()
    try {
      const open = vi.fn()
      const clearQuery = vi.fn()
      scheduleLaunchPushClick({ search: '?stop=CLB', open, clearQuery })
      vi.runAllTimers()
      expect(open).toHaveBeenCalledWith({ stopId: 'CLB' })

      const cancelledOpen = vi.fn()
      const cancel = scheduleLaunchPushClick({ search: '?stop=COM3', open: cancelledOpen, clearQuery })
      cancel()
      vi.runAllTimers()
      expect(cancelledOpen).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
