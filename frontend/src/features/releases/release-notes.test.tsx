// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReleaseNotes } from './release-notes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const currentSha = 'a'.repeat(40)
const history = {
  releases: [
    {
      id: '2026-11-04.1', tag: 'release-2026-11-04.1', title: 'Release notes arrive', date: '2026-11-04',
      commitSha: currentSha, githubUrl: 'https://github.com/LimZiJing/NUSGo/releases/tag/release-2026-11-04.1',
      sections: { Added: ['Browse release notes.'], Improved: [], Fixed: [] },
    },
    {
      id: '2026-11-03.1', tag: 'release-2026-11-03.1', title: 'Earlier improvements', date: '2026-11-03',
      commitSha: 'b'.repeat(40), githubUrl: 'https://github.com/LimZiJing/NUSGo/releases/tag/release-2026-11-03.1',
      sections: { Added: [], Improved: ['Example improvement.'], Fixed: [] },
    },
  ],
}

describe('ReleaseNotes', () => {
  it('shows the newest release expanded, identifies this version, and keeps older releases expandable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => history }))
    const user = userEvent.setup()
    render(<ReleaseNotes currentSha={currentSha} />)

    await screen.findByText('Browse release notes.')
    const disclosures = document.querySelectorAll('details')
    expect(disclosures[0].hasAttribute('open')).toBe(true)
    expect(disclosures[1].hasAttribute('open')).toBe(false)
    expect(screen.getByText('Your version')).toBeTruthy()
    expect(disclosures[0].querySelectorAll('h3')).toHaveLength(1)
    expect(disclosures[0].querySelector('h3')?.textContent).toBe('Added')
    expect(disclosures[0].querySelector('a')?.getAttribute('href')).toBe(history.releases[0].githubUrl)

    await user.click(within(disclosures[1]).getByText('Earlier improvements'))
    expect(disclosures[1].hasAttribute('open')).toBe(true)
    expect(screen.getByText('Example improvement.')).toBeTruthy()
  })

  it('states when no history is available without showing prepared notes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) }))
    render(<ReleaseNotes currentSha={currentSha} />)
    expect((await screen.findByRole('status')).textContent).toContain('No release history is available yet.')
  })

  it('handles unavailable history safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<ReleaseNotes currentSha={currentSha} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Release history is unavailable right now.'))
  })
})
