// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoreMenu } from '../features/more/more-menu'
const originalUserAgent = navigator.userAgent
let PwaNotices: typeof import('./pwa-notices').PwaNotices
let PwaInstallSection: typeof import('./pwa-install-section').PwaInstallSection
let getInstallPromptSnapshot: typeof import('../infrastructure/pwa/pwa-runtime').getInstallPromptSnapshot
let refreshPwaInstallationStatus: () => Promise<void>

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
    refreshPwaInstallationStatus = runtime.refreshPwaInstallationStatus
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: undefined })
    window.localStorage.clear()
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent })
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
    vi.unstubAllEnvs()
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

  it('keeps native installation available while a background check is pending', async () => {
    const apps = vi.fn().mockResolvedValue([])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    let resolveApps!: (apps: unknown[]) => void
    apps.mockImplementation(() => new Promise((resolve) => { resolveApps = resolve }))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByRole('button', { name: 'Install NUSGo' })).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
    await act(async () => { resolveApps([]) })
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
    render(<><PwaNotices /><MoreMenu waypointCount={0} onOpenWaypoints={() => {}} onOpenSettings={() => {}}
      installSection={<PwaInstallSection />} /></>)
    const { event, prompt } = dispatchInstallPrompt()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    expect(screen.queryByText('NUSGo, one tap away')).toBeNull()
    expect(getInstallPromptSnapshot()).toBe(event)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('offers installation again after a previously detected app is uninstalled', async () => {
    const apps = vi.fn().mockResolvedValue([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    window.localStorage.setItem('nusgo.pwa.install-prompt-dismissed', 'true')
    render(<PwaNotices />)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    apps.mockResolvedValue([])
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.getByRole('button', { name: 'Install NUSGo' })).toBeTruthy()
  })

  it('does not show an install banner in Chrome when the related PWA is installed', async () => {
    let resolveApps!: (apps: unknown[]) => void
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => new Promise<unknown[]>((resolve) => { resolveApps = resolve })),
    })
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    await act(async () => {
      resolveApps([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    })
    expect(screen.queryByText('NUSGo, one tap away')).toBeNull()
    expect(screen.getByRole('status', { name: 'NUSGo is installed on this device' })).toBeTruthy()
  })

  it('recognizes an installed web app reported by id without a manifest URL', async () => {
    vi.stubEnv('BASE_URL', '/pwa-check/')
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: 'webapp', id: new URL('./', window.location.origin).href }]),
    })
    render(<PwaNotices />)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
  })

  it('ignores unrelated installed apps and preserves a positive result if checking later fails', async () => {
    const apps = vi.fn().mockResolvedValue([{ platform: 'play', url: 'https://other.test/manifest.json' }])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    render(<PwaNotices />)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.getByRole('button', { name: 'Install NUSGo' })).toBeTruthy()
    apps.mockResolvedValue([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    apps.mockRejectedValue(new Error('unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('detects uninstall after installation in the same Chrome tab', async () => {
    const apps = vi.fn().mockResolvedValue([])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.getByRole('status', { name: 'NUSGo is installed on this device' })).toBeTruthy()
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByRole('status', { name: 'NUSGo is installed on this device' })).toBeNull()
    expect(screen.getByText('NUSGo, one tap away')).toBeTruthy()
  })

  it('does not claim installation is complete just because the dialog was accepted', async () => {
    render(<PwaInstallSection />)
    dispatchInstallPrompt('accepted')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(screen.queryByRole('status', { name: 'NUSGo is installed on this device' })).toBeNull()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.getByRole('status', { name: 'NUSGo is installed on this device' })).toBeTruthy()
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

  it('reveals browser installation instructions only after the download action', async () => {
    render(<PwaInstallSection />)
    expect(screen.getByRole('heading', { name: 'Download NUSGo' })).toBeTruthy()
    expect(screen.queryByText(/Open your browser menu/)).toBeNull()
    const button = screen.getByRole('button', { name: 'Download NUSGo' })
    await userEvent.setup().click(button)
    expect(screen.getByText(/Open your browser menu/)).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await userEvent.setup().click(button)
    expect(screen.queryByText(/Open your browser menu/)).toBeNull()
  })

  it('preserves completed installation on Edge Android after an empty focus refresh', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) EdgA/155.0.4283.61' })
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: vi.fn().mockResolvedValue([]) })
    render(<PwaInstallSection />)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByRole('status', { name: 'NUSGo is installed on this device' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
  })

  it('does not reoffer a dismissed banner after another eligibility event in the same visit', async () => {
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    dispatchInstallPrompt()
    expect(screen.queryByText('NUSGo, one tap away')).toBeNull()
    expect(screen.getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
  })

  it('keeps Edge Android installation in More without an automatic banner', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36 EdgA/155.0.4283.61' })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    expect(screen.queryByText('NUSGo, one tap away')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('hides installation controls in the installed app', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    expect(screen.queryByRole('button', { name: 'Install NUSGo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    expect(screen.getByRole('status', { name: 'NUSGo is installed on this device' })).toBeTruthy()
    expect(prompt).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
  })
})
