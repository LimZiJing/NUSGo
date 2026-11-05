import { useEffect, useState } from 'react'
import './release-notes.css'

interface ReleaseEntry {
  readonly id: string
  readonly tag: string
  readonly title: string
  readonly date: string
  readonly commitSha: string
  readonly githubUrl: string
  readonly sections: Readonly<Record<'Added' | 'Improved' | 'Fixed', readonly string[]>>
}

interface ReleaseIndex {
  readonly releases: readonly ReleaseEntry[]
}

function isReleaseIndex(value: unknown): value is ReleaseIndex {
  if (typeof value !== 'object' || value === null || !('releases' in value) || !Array.isArray(value.releases)) return false
  return value.releases.every((release: unknown) => {
    if (typeof release !== 'object' || release === null) return false
    const item = release as Record<string, unknown>
    const sections = item.sections
    if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return false
    const sectionRecord = sections as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : ''
    const match = /^(\d{4}-\d{2}-\d{2})\.[1-9]\d*$/.exec(id)
    const date = match ? new Date(`${match[1]}T00:00:00Z`) : null
    return match !== null && date !== null && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === match[1] &&
      item.tag === `release-${id}` && typeof item.title === 'string' && Boolean(item.title.trim()) && item.date === match[1] &&
      typeof item.commitSha === 'string' && /^[0-9a-f]{40}$/i.test(item.commitSha) &&
      item.githubUrl === `https://github.com/LimZiJing/NUSGo/releases/tag/release-${id}` &&
      ['Added', 'Improved', 'Fixed'].every((name) => name in sectionRecord && Array.isArray(sectionRecord[name]) &&
        (sectionRecord[name] as unknown[]).every((entry) => typeof entry === 'string' && Boolean(entry.trim())))
  })
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date)
}

export function ReleaseNotes({ currentSha = __NUSGO_RELEASE_SHA__ }: { readonly currentSha?: string }) {
  const [releases, setReleases] = useState<readonly ReleaseEntry[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${import.meta.env.BASE_URL}releases/index.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Release history is unavailable')
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!isReleaseIndex(value)) throw new Error('Release history is invalid')
        setReleases(value.releases)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUnavailable(true)
      })
    return () => controller.abort()
  }, [])

  if (unavailable) return <p className="release-notes-empty" role="status">Release history is unavailable right now. Try again when you are online.</p>
  if (releases === null) return <p className="release-notes-empty" role="status">Loading release history…</p>
  if (releases.length === 0) return <p className="release-notes-empty" role="status">No release history is available yet.</p>

  return <div className="release-notes-list" aria-label="Release history">
    {releases.map((release, index) => {
      const isCurrentVersion = release.commitSha === currentSha
      return <details className="release-notes-entry" key={release.id} open={index === 0}>
        <summary className="release-notes-summary">
          <span className="release-notes-title">{release.title}</span>
          <span className="release-notes-date">{formatDate(release.date)} · {release.id}</span>
          {isCurrentVersion && <span className="release-notes-current">Your version</span>}
        </summary>
        <div className="release-notes-content">
          {(['Added', 'Improved', 'Fixed'] as const).map((name) => release.sections[name].length > 0 && (
            <section className="release-notes-section" key={name}>
              <h3>{name}</h3>
              <ul>{release.sections[name].map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </section>
          ))}
          <a className="release-notes-github" href={release.githubUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
      </details>
    })}
  </div>
}
