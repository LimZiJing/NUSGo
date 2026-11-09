// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

function getInstallNotice(): HTMLElement {
  return screen.getByText('Download NUSGo', { selector: '.pwa-pill-install span' }).closest('section') as HTMLElement
}

function getReloadNotice(): HTMLElement {
  return screen.getByText('Map unavailable').closest('section') as HTMLElement
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
    expect(screen.getByText('Offline').closest('[role="status"]')?.textContent).toBe('Offline. Bus arrivals have stopped updating.')
    expect(screen.getByText('Offline').className).not.toContain('visually-hidden')

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('Offline')).toBeNull()
  })

  it('offers a reload for the fallback basemap after reconnecting', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    act(() => { window.dispatchEvent(new Event('offline')) })
    const reload = vi.fn()
    render(<PwaNotices basemapUnavailable onReload={reload} />)
    expect(screen.queryByRole('button', { name: 'Reload map' })).toBeNull()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(getReloadNotice().getAttribute('role')).toBe('status')
    await userEvent.setup().click(within(getReloadNotice()).getByRole('button', { name: 'Reload map' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('offers a reload when an online map request has fallen back', () => {
    render(<PwaNotices basemapUnavailable />)
    expect(getReloadNotice().className).toContain('pwa-pill-reload')
    expect(within(getReloadNotice()).getByRole('button', { name: 'Reload map' })).toBeTruthy()
  })

  it('shows the install pill with an app icon, a download button and a separate dismiss bubble', async () => {
    render(<PwaNotices />)
    dispatchInstallPrompt()
    const notice = getInstallNotice()
    expect(notice.className).toContain('pwa-pill-install')
    expect(notice.querySelector('img')?.getAttribute('src')).toMatch(/icons\/pwa-icon-192\.png$/)
    expect(within(notice).getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
    await userEvent.setup().click(within(notice).getByRole('button', { name: 'Dismiss install prompt' }))
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
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
    expect(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
    await userEvent.setup().click(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
    await act(async () => { resolveApps([]) })
  })

  it('uses the browser install prompt after a user action', async () => {
    render(<PwaNotices />)
    const { event, prompt } = dispatchInstallPrompt()
    expect(event.defaultPrevented).toBe(true)

    await userEvent.setup().click(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
  })

  it('keeps installation available in More after dismissing the banner', async () => {
    render(<><PwaNotices /><MoreMenu waypointCount={0} onOpenWaypoints={() => {}} onSuggestCommunityWaypoint={() => {}}
      onOpenSettings={() => {}} onOpenReleaseNotes={() => {}}
      installSection={<PwaInstallSection />} /></>)
    const { event, prompt } = dispatchInstallPrompt()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    expect(getInstallPromptSnapshot()).toBe(event)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('shows Download NUSGo as the last quiet More row and hides it after installation', () => {
    render(<MoreMenu waypointCount={0} onOpenWaypoints={() => {}} onOpenSettings={() => {}}
      onSuggestCommunityWaypoint={() => {}}
      onOpenReleaseNotes={() => {}}
      installSection={<PwaInstallSection />} />)

    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'My waypoints',
      'Suggest a waypoint',
      'Settings',
      'Release notes',
      'Download NUSGo',
    ])
    const downloadRow = screen.getByRole('button', { name: 'Download NUSGo' })
    expect(downloadRow.className).toContain('more-menu-row')
    expect(downloadRow.className).not.toContain('button')
    expect(downloadRow.querySelector('img')?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}icons/pwa-icon-192.png`)

    act(() => { window.dispatchEvent(new Event('appinstalled')) })

    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
  })

  it('offers installation again after a previously detected app is uninstalled', async () => {
    const apps = vi.fn().mockResolvedValue([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    window.localStorage.setItem('nusgo.pwa.install-prompt-dismissed', 'true')
    render(<PwaNotices />)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    apps.mockResolvedValue([])
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
  })

  it('does not show an install banner in Chrome when the related PWA is installed', async () => {
    let resolveApps!: (apps: unknown[]) => void
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => new Promise<unknown[]>((resolve) => { resolveApps = resolve })),
    })
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    await act(async () => {
      resolveApps([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    })
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    expect(screen.getByRole('status', { name: 'Installation status' }).textContent).toBe('')
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
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
  })

  it('ignores unrelated installed apps and preserves a positive result if checking later fails', async () => {
    const apps = vi.fn().mockResolvedValue([{ platform: 'play', url: 'https://other.test/manifest.json' }])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    render(<PwaNotices />)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
    apps.mockResolvedValue([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    apps.mockRejectedValue(new Error('unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('detects uninstall after installation in the same Chrome tab', async () => {
    const apps = vi.fn().mockResolvedValue([])
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: apps })
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    dispatchInstallPrompt()
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.getByRole('status', { name: 'Installation status' }).textContent).toBe('')
    expect(screen.getAllByRole('button', { name: 'Download NUSGo' })).toHaveLength(2)
    expect(screen.getByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeTruthy()
  })

  it('does not claim installation is complete just because the dialog was accepted', async () => {
    render(<><PwaNotices /><PwaInstallSection /></>)
    const installationStatus = screen.getByRole('status', { name: 'Installation status' })
    expect(installationStatus.textContent).toBe('')
    dispatchInstallPrompt('accepted')
    await userEvent.setup().click(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' }))
    expect(installationStatus.textContent).toBe('')
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    expect(screen.getByRole('status', { name: 'Installation status' })).toBe(installationStatus)
    expect(installationStatus.textContent).toBe('NUSGo is installed on this device')
  })

  it('announces installation even when the More installation controls are unmounted', () => {
    render(<PwaNotices />)
    const installationStatus = screen.getByRole('status', { name: 'Installation status' })
    expect(installationStatus.textContent).toBe('')

    act(() => { window.dispatchEvent(new Event('appinstalled')) })

    expect(screen.getByRole('status', { name: 'Installation status' })).toBe(installationStatus)
    expect(installationStatus.textContent).toBe('NUSGo is installed on this device')
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
  })

  it('stays silent on an installed mount and announces reinstall after an observed uninstall', async () => {
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const installationStatus = screen.getByRole('status', { name: 'Installation status' })
    expect(installationStatus.textContent).toBe('')

    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn().mockResolvedValue([]),
    })
    await act(async () => { await refreshPwaInstallationStatus() })
    expect(screen.getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
    expect(installationStatus.textContent).toBe('')

    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(installationStatus.textContent).toBe('NUSGo is installed on this device')
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
  })

  it('keeps startup installed-app detection silent when it resolves after render', async () => {
    let resolveApps!: (apps: unknown[]) => void
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => new Promise<unknown[]>((resolve) => { resolveApps = resolve })),
    })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const installationStatus = screen.getByRole('status', { name: 'Installation status' })
    dispatchInstallPrompt()

    await act(async () => {
      resolveApps([{ platform: 'webapp', url: new URL('manifest.webmanifest', new URL(import.meta.env.BASE_URL, window.location.origin)).href }])
    })

    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    expect(installationStatus.textContent).toBe('')

    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(installationStatus.textContent).toBe('NUSGo is installed on this device')
  })

  it('does not let another eligibility event override a completed installation', () => {
    render(<PwaNotices />)
    dispatchInstallPrompt()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    dispatchInstallPrompt()
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
  })

  it('allows a fresh eligible prompt after declining the browser dialog', async () => {
    render(<PwaNotices />)
    dispatchInstallPrompt('dismissed')
    await userEvent.setup().click(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' }))
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    dispatchInstallPrompt()
    expect(within(getInstallNotice()).getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
  })

  it('reveals browser installation instructions only after the download action', async () => {
    render(<PwaInstallSection />)
    expect(screen.getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
  })

  it('does not reoffer a dismissed banner after another eligibility event in the same visit', async () => {
    render(<><PwaNotices /><PwaInstallSection /></>)
    dispatchInstallPrompt()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    dispatchInstallPrompt()
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Download NUSGo' })).toBeTruthy()
  })

  it('keeps Edge Android installation in More without an automatic banner', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36 EdgA/155.0.4283.61' })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download NUSGo' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('hides installation controls in the installed app', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    render(<><PwaNotices /><PwaInstallSection /></>)
    const { prompt } = dispatchInstallPrompt()
    expect(screen.queryByText('Download NUSGo', { selector: '.pwa-pill-install span' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download NUSGo' })).toBeNull()
    expect(screen.getByRole('status', { name: 'Installation status' }).textContent).toBe('')
    expect(prompt).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
  })
})
