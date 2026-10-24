import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILDINGS_API_URL,
  fetchBuildingsSnapshot,
  parseBuildingsResponse,
} from './snapshot'

function apiBuilding(overrides: Record<string, unknown> = {}) {
  return {
    elementId: 'way/1',
    name: 'COM1',
    address: '13 Computing Drive',
    postal: '117417',
    latitude: 1.2949,
    longitude: 103.7737,
    ...overrides,
  }
}

describe('parseBuildingsResponse', () => {
  it('accepts the documented array of buildings', () => {
    const buildings = parseBuildingsResponse([
      apiBuilding(),
      apiBuilding({ elementId: 'way/2', name: 'E1' }),
    ])

    expect(buildings.map((building) => building.elementId)).toEqual(['way/1', 'way/2'])
  })

  it('rejects an empty response, a non-array, malformed records and duplicate elementIds', () => {
    expect(() => parseBuildingsResponse([])).toThrow('empty')
    expect(() => parseBuildingsResponse({ buildings: [] })).toThrow('must be an array')
    expect(() => parseBuildingsResponse([apiBuilding({ latitude: 91 }), apiBuilding({ name: '' })]))
      .toThrow(/record 1 latitude.*record 2 name/)
    expect(() => parseBuildingsResponse([apiBuilding(), apiBuilding({ name: 'Other' })]))
      .toThrow('Duplicate elementId way/1')
  })
})

describe('fetchBuildingsSnapshot', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nusgo-buildings-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  function okFetch(body: unknown) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  }

  it('makes one unauthenticated request and writes a dated raw snapshot', async () => {
    const fetchStub = okFetch([apiBuilding()])

    const result = await fetchBuildingsSnapshot({
      fetch: fetchStub,
      directory,
      now: new Date('2026-10-13T03:00:00Z'),
    })

    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(BUILDINGS_API_URL)
    const headers = new Headers(init.headers)
    expect(headers.get('user-agent')).toMatch(/NUSGo/)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('x-api-key')).toBe(false)
    expect(init.signal).toBeInstanceOf(AbortSignal)

    expect(result.path).toBe(join(directory, 'buildings-raw-2026-10-13.json'))
    expect(result.count).toBe(1)
    expect(JSON.parse(await readFile(result.path, 'utf8'))).toEqual([apiBuilding()])
    expect((await readFile(result.path, 'utf8')).endsWith('\n')).toBe(true)
  })

  it('dates the snapshot by the Singapore calendar day', async () => {
    const result = await fetchBuildingsSnapshot({
      fetch: okFetch([apiBuilding()]),
      directory,
      now: new Date('2026-10-12T16:30:00Z'),
    })

    expect(result.path).toBe(join(directory, 'buildings-raw-2026-10-13.json'))
  })

  it('refuses to overwrite an existing snapshot without force', async () => {
    const existing = join(directory, 'buildings-raw-2026-10-13.json')
    await writeFile(existing, '[]\n')
    const fetchStub = okFetch([apiBuilding()])
    const options = { fetch: fetchStub, directory, now: new Date('2026-10-13T03:00:00Z') }

    await expect(fetchBuildingsSnapshot(options)).rejects.toThrow(/already exists.*--force/)
    expect(fetchStub).not.toHaveBeenCalled()
    expect(await readFile(existing, 'utf8')).toBe('[]\n')

    await fetchBuildingsSnapshot({ ...options, force: true })
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await readFile(existing, 'utf8'))).toHaveLength(1)
  })

  it('writes nothing when the response is not ok or invalid', async () => {
    const options = { directory, now: new Date('2026-10-13T03:00:00Z') }

    await expect(fetchBuildingsSnapshot({
      ...options,
      fetch: vi.fn(async () => new Response('nope', { status: 503 })),
    })).rejects.toThrow('HTTP 503')
    await expect(fetchBuildingsSnapshot({ ...options, fetch: okFetch([]) })).rejects.toThrow('empty')

    expect(await readdir(directory)).toEqual([])
  })
})
