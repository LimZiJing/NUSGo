// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissInstallPrompt,
  INSTALL_PROMPT_DISMISSED_KEY,
} from '../infrastructure/pwa/pwa-runtime'
import { PwaNotices } from './pwa-notices'

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
  beforeEach(() => {
    dismissInstallPrompt()
    window.localStorage.clear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
  })

  afterEach(() => {
    cleanup()
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

    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('keeps a dismissed install prompt hidden for later browser events', async () => {
    render(<PwaNotices />)
    dispatchInstallPrompt()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss install prompt' }))
    expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBe('true')

    dispatchInstallPrompt()
    expect(screen.queryByText('Install NUSGo')).toBeNull()
  })

  it('remembers when the browser install prompt itself is dismissed', async () => {
    render(<PwaNotices />)
    dispatchInstallPrompt('dismissed')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Install' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBe('true')
    })
  })
})
