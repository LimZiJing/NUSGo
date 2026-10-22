import { describe, expect, it } from 'vitest'
import { createLocalPersonalWaypointStore } from './local-personal-waypoint-store'

const PERSONAL_WAYPOINTS_KEY = 'navus:personal-waypoints'

const waypoint = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Water fountain',
  category: 'Water',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
}

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

describe('local personal waypoint store', () => {
  it('loads an empty collection when storage is missing', () => {
    const storage = createMemoryStorage()
    const store = createLocalPersonalWaypointStore(() => storage)

    expect(store.read()).toEqual({ kind: 'ready', waypoints: [], revision: null })
  })

  it('writes and reads the versioned personal waypoint envelope', () => {
    const storage = createMemoryStorage({ 'other-navus-data': 'keep' })
    const store = createLocalPersonalWaypointStore(() => storage)
    const result = store.replaceAll([waypoint], null)

    expect(result.kind).toBe('saved')
    expect(JSON.parse(storage.values.get(PERSONAL_WAYPOINTS_KEY) ?? '')).toEqual({
      version: 1,
      waypoints: [waypoint],
    })
    expect(store.read()).toMatchObject({ kind: 'ready', waypoints: [waypoint] })
    expect(storage.values.get('other-navus-data')).toBe('keep')
  })

  it('preserves malformed data and blocks replacement until explicit clear', () => {
    const storage = createMemoryStorage({ [PERSONAL_WAYPOINTS_KEY]: '{bad json' })
    const store = createLocalPersonalWaypointStore(() => storage)
    const result = store.read()

    expect(result.kind).toBe('recovery-required')
    if (result.kind === 'recovery-required') {
      expect(store.replaceAll([waypoint], result.revision)).toEqual({ kind: 'recovery-required' })
      expect(storage.values.get(PERSONAL_WAYPOINTS_KEY)).toBe('{bad json')
      expect(store.clear(result.revision)).toEqual({ kind: 'cleared' })
    }
    expect(storage.values.has(PERSONAL_WAYPOINTS_KEY)).toBe(false)
  })

  it('preserves envelopes with unknown fields until explicit recovery', () => {
    const stored = JSON.stringify({ version: 1, waypoints: [waypoint], futureField: true })
    const storage = createMemoryStorage({ [PERSONAL_WAYPOINTS_KEY]: stored })
    const store = createLocalPersonalWaypointStore(() => storage)
    const result = store.read()

    expect(result).toMatchObject({ kind: 'recovery-required', reason: 'malformed-data' })
    if (result.kind === 'recovery-required') {
      expect(store.replaceAll([], result.revision)).toEqual({ kind: 'recovery-required' })
    }
    expect(storage.values.get(PERSONAL_WAYPOINTS_KEY)).toBe(stored)
  })

  it('preserves data from unsupported schema versions', () => {
    const stored = JSON.stringify({ version: 2, waypoints: [waypoint] })
    const storage = createMemoryStorage({ [PERSONAL_WAYPOINTS_KEY]: stored })
    const store = createLocalPersonalWaypointStore(() => storage)

    expect(store.read()).toMatchObject({ kind: 'recovery-required', reason: 'unsupported-version' })
    expect(storage.values.get(PERSONAL_WAYPOINTS_KEY)).toBe(stored)
  })

  it('returns a conflict when another tab changes the stored snapshot', () => {
    const storage = createMemoryStorage()
    const store = createLocalPersonalWaypointStore(() => storage)
    store.replaceAll([waypoint], null)
    const snapshot = store.read()
    storage.values.set(PERSONAL_WAYPOINTS_KEY, JSON.stringify({
      version: 1,
      waypoints: [{ ...waypoint, name: 'Updated in another tab' }],
    }))

    if (snapshot.kind !== 'ready') throw new Error('Expected a readable snapshot.')
    expect(store.replaceAll([], snapshot.revision)).toEqual({ kind: 'conflict' })
    expect(JSON.parse(storage.values.get(PERSONAL_WAYPOINTS_KEY) ?? '').waypoints[0].name)
      .toBe('Updated in another tab')
  })

  it('clear removes only the personal waypoint key', () => {
    const storage = createMemoryStorage({
      [PERSONAL_WAYPOINTS_KEY]: JSON.stringify({ version: 1, waypoints: [waypoint] }),
      'navus:favorite-stops:v1': '["STOP-A"]',
    })
    const store = createLocalPersonalWaypointStore(() => storage)
    const snapshot = store.read()

    if (snapshot.kind !== 'ready') throw new Error('Expected a readable snapshot.')
    expect(store.clear(snapshot.revision)).toEqual({ kind: 'cleared' })
    expect(storage.values.has(PERSONAL_WAYPOINTS_KEY)).toBe(false)
    expect(storage.values.get('navus:favorite-stops:v1')).toBe('["STOP-A"]')
  })

  it('returns user-safe results for storage read, write, and remove failures', () => {
    const readFailure = createLocalPersonalWaypointStore(() => {
      throw new Error('Private storage details')
    })
    expect(readFailure.read()).toEqual({ kind: 'unavailable', operation: 'read' })

    const writeFailure = createLocalPersonalWaypointStore(() => ({
      getItem: () => null,
      setItem: () => { throw new Error('Private storage details') },
      removeItem: () => {},
    }))
    expect(writeFailure.replaceAll([waypoint], null)).toEqual({
      kind: 'unavailable',
      operation: 'write',
    })

    const removeFailure = createLocalPersonalWaypointStore(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('Private storage details') },
    }))
    expect(removeFailure.clear(null)).toEqual({
      kind: 'unavailable',
      operation: 'remove',
    })
  })
})
