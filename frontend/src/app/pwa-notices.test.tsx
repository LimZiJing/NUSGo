// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoreMenu } from '../features/more/more-menu'
let PwaNotices: typeof import('./pwa-notices').PwaNotices
let PwaInstallSection: typeof import('./pwa-install-section').PwaInstallSection
let getInstallPromptSnapshot: typeof import('../infrastructure/pwa/pwa-runtime').getInstallPromptSnapshot

function dispatchInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome, platform: 'web' }) },
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return { event, prompt }
}

describe('PWA notices', () => {
  beforeEach(async () => {
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.resetModules()
    ;({ PwaNotices } = await import('./pwa-notices'))
    ;({ PwaInstallSection } = await import('./pwa-install-section'))
    const runtime = await import('../infrastructure/pwa/pwa-runtime')
    getInstallPromptSnapshot = runtime.getInstallPromptSnapshot
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: undefined })
    window.localStorage.clear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
  })

  afterEach(() => {
    cleanup()
    for (const [name, listener, options] of vi.mocked(window.addEventListener).mock.calls) {
      if (['online', 'offline', 'beforeinstallprompt', 'appinstalled', 'focus'].includes(name)) {
        window.removeEventListener(name, listener, options)
      }
    }
    for (const [name, listener, options] of vi.mocked(document.addEventListener).mock.calls) {
      if (name === 'visibilitychange') document.removeEventListener(name, listener, options)
    }
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('shows an offline status and removes it after the connection returns', () => {
    render(<PwaNotices />)

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status').textContent).toContain("You're offline.")

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses the browser install prompt after a user action', async () => {
    render(<PwaNotices />)
    const { event, prompt } = dispatchInstallPrompt()
    expect(event.defaultPrevented).toBe(true)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Install NUSGo' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
  })

  it('keeps installation available in More after dismissing the banner', async () => {
    render(<><PwaNotices /><MoreMenu onOpenWaypoints={() => {}} onOpenSettings={() => {}}
      installSection={<PwaInstallSection />} /></>)
    const { event, prompt } = dispatchInstallPrompt()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    expect(screen.queryByText('NUSGo, one tap away')).toBeNull()
    expect(getInstallPromptSnapshot()).toBe(event)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('does not claim installation is complete just because the dialog was accepted', async () => {
    render(<PwaInstallSection />)
    dispatchInstallPrompt('accepted')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install NUSGo' }))
    expect(screen.queryByText('NUSGo is installed on this device.')).toBeNull()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.getByText('NUSGo is installed on this device.')).toBeTruthy()
  })

  it('does not let another eligibility event override a completed installation', () => {
    render(<PwaNotices />)
    dispatchInstallPrompt()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    dispatchInstallPrompt()
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
  })

  it('allows a fresh eligible prompt after declining the browser dialog', async () => {
    render(<PwaNotices />)
    dispatchInstallPrompt('dismissed')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install NUSGo' }))
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    dispatchInstallPrompt()
    expect(screen.getByRole('button', { name: 'Install NUSGo' })).toBeTruthy()
  })

  it('provides browser installation instructions when no prompt is available', async () => {
    render(<PwaInstallSection />)
    dispatchInstallPrompt('dismissed')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Install NUSGo' }))
    expect(screen.getByText(/In Chrome, open the browser menu/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
  })

  it('hides installation controls in the installed app', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    expect(screen.getByText("NUSGo is installed on this device.")).toBeTruthy()
    expect(prompt).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
  })
})
