import { describe, expect, it } from 'vitest'
import type { Path, ScoredPathCandidate } from '@nusgo/shared/routing/path'
import { createInitialNavigationSessionState } from './navigation-session'
import { freezeNavigationSessionSnapshot } from './navigation-session-snapshot'
import type { JourneyState } from './journey-state'

function makePath(index: number, coordinateCount = 1_000): Path {
  const origin = { kind: 'venue' as const, id: `origin-${index}` }
  const destination = { kind: 'venue' as const, id: `destination-${index}` }
  return {
    origin,
    destination,
    totalDurationSeconds: 500 + index,
    totalDistanceMeters: 1_000 + index,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
    legs: [{
      mode: 'walking',
      from: origin,
      to: destination,
      durationSeconds: 500 + index,
      distanceMeters: 1_000 + index,
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: coordinateCount }, (_, pointIndex) => [
          103.7 + index * 0.001 + pointIndex * 0.000001,
          1.3 + index * 0.0001,
        ] as const),
      },
    }],
  }
}

function makeJourneyState(paths: readonly Path[]): JourneyState {
  const candidates: ScoredPathCandidate[] = paths.map((path, index) => ({
    candidateKey: `candidate-${index}`,
    path,
    adjustedDurationSeconds: path.totalDurationSeconds,
    score: 1 / path.totalDurationSeconds,
  }))
  return {
    status: 'ready',
    path: paths[0] ?? null,
    candidates,
    displayedCandidates: [candidates[0], candidates[2]].filter(
      (candidate): candidate is ScoredPathCandidate => candidate !== undefined,
    ),
    selectedCandidateKey: candidates[0]?.candidateKey ?? null,
    error: null,
  }
}

function snapshotCoordinateArrays(
  path: JourneyState['path'],
): readonly (readonly (readonly [number, number])[])[] {
  return path === null ? [] : path.legs.flatMap((leg) => [leg.geometry.coordinates])
}

describe('freezeNavigationSessionSnapshot', () => {
  it('reuses Path geometry across unrelated venue and location updates with a loaded candidate pool', () => {
    const journeyState = makeJourneyState(Array.from({ length: 4 }, (_, index) => makePath(index)))
    const initial = createInitialNavigationSessionState()
    const seenCoordinates = new Set<readonly [number, number]>()
    const published: ReturnType<typeof freezeNavigationSessionSnapshot>[] = []

    for (let update = 0; update < 20; update += 1) {
      const currentJourneyState = published.at(-1)?.path ?? journeyState
      const snapshot = freezeNavigationSessionSnapshot({
        ...initial,
        exploreState: { ...initial.exploreState, query: `venue ${update}` },
        path: currentJourneyState,
        location: {
          status: 'tracking' as const,
          latestFix: {
            longitude: 103.7 + update * 0.0001,
            latitude: 1.3,
            accuracy: 5,
            timestamp: update,
          },
        },
      })
      published.push(snapshot)
      const outputPaths = [
        snapshot.path.path,
        ...snapshot.path.candidates.map((candidate) => candidate.path),
        ...snapshot.path.displayedCandidates.map((candidate) => candidate.path),
      ]
      for (const coordinates of outputPaths.flatMap(snapshotCoordinateArrays)) {
        for (const coordinate of coordinates) seenCoordinates.add(coordinate)
      }
    }

    console.info(`navigation snapshot benchmark: ${seenCoordinates.size} copied coordinate tuples across 20 unrelated updates`)
    expect(published[1]?.path).toBe(published[0]?.path)
    expect(published[1]?.path.candidates[0]).toBe(published[1]?.path.displayedCandidates[0])
    expect(published[1]?.path.path).toBe(published[1]?.path.candidates[0]?.path)
    expect(published[19]?.location.latestFix?.longitude).toBeCloseTo(103.7019, 10)
    expect(seenCoordinates.size).toBe(4_000)
  })

  it('protects accepted geometry and endpoint coordinates from later input mutations', () => {
    const basePath = makePath(0, 3)
    const origin = {
      kind: 'waypoint-coordinate' as const,
      coordinate: { longitude: 103.71, latitude: 1.31 },
    }
    const destination = {
      kind: 'current-location' as const,
      coordinate: { longitude: 103.81, latitude: 1.41 },
    }
    const path: Path = {
      ...basePath,
      origin,
      destination,
      legs: [{ ...basePath.legs[0]!, from: origin, to: destination }],
    }
    const mutablePath = path as unknown as {
      origin: { kind: 'waypoint-coordinate'; coordinate: { longitude: number; latitude: number } }
      legs: { from: { coordinate: { longitude: number } }; geometry: { coordinates: [number, number][] } }[]
    }
    const source = createInitialNavigationSessionState()
    const tripRequest = {
      origin: { kind: 'current-location' as const, coordinate: { longitude: 103.7, latitude: 1.3 } },
      destination: {
        kind: 'personal-waypoint' as const,
        id: 'home',
        label: 'Home',
        coordinate: { longitude: 103.8, latitude: 1.4 },
      },
    }
    const location = {
      status: 'tracking' as const,
      latestFix: { longitude: 103.75, latitude: 1.35, accuracy: 5, timestamp: 1 },
    }
    const accepted = freezeNavigationSessionSnapshot({
      ...source,
      path: makeJourneyState([path]),
      tripRequest,
      location,
    })

    mutablePath.legs[0]!.geometry.coordinates[0]![0] = 104
    mutablePath.origin.coordinate.longitude = 104
    mutablePath.legs[0]!.from.coordinate.longitude = 105
    tripRequest.origin.coordinate.longitude = 104
    tripRequest.destination.coordinate.longitude = 105
    location.latestFix.longitude = 104

    expect(accepted.path.path?.legs[0]?.geometry.coordinates[0]?.[0]).toBe(103.7)
    const acceptedOrigin = accepted.path.path?.origin
    const acceptedLegOrigin = accepted.path.path?.legs[0]?.from
    const acceptedTripOrigin = accepted.tripRequest.origin
    const acceptedTripDestination = accepted.tripRequest.destination
    expect(acceptedOrigin?.kind).toBe('waypoint-coordinate')
    expect(acceptedOrigin?.kind === 'waypoint-coordinate' ? acceptedOrigin.coordinate.longitude : null).toBe(103.71)
    expect(acceptedLegOrigin?.kind).toBe('waypoint-coordinate')
    expect(acceptedLegOrigin?.kind === 'waypoint-coordinate' ? acceptedLegOrigin.coordinate.longitude : null).toBe(103.71)
    expect(acceptedTripOrigin?.kind).toBe('current-location')
    expect(acceptedTripOrigin?.kind === 'current-location'
      ? acceptedTripOrigin.coordinate.longitude
      : null).toBe(103.7)
    expect(acceptedTripDestination?.kind).toBe('personal-waypoint')
    expect(acceptedTripDestination?.kind === 'personal-waypoint'
      ? acceptedTripDestination.coordinate.longitude
      : null).toBe(103.8)
    expect(accepted.location.latestFix?.longitude).toBe(103.75)
    expect(Object.isFrozen(accepted.path.path?.legs[0]?.geometry.coordinates[0])).toBe(true)
    expect(Object.isFrozen(acceptedOrigin?.kind === 'waypoint-coordinate' ? acceptedOrigin.coordinate : null)).toBe(true)
    expect(Object.isFrozen(acceptedTripDestination?.kind === 'personal-waypoint'
      ? acceptedTripDestination.coordinate
      : null)).toBe(true)
    expect(Object.isFrozen(accepted.location.latestFix)).toBe(true)
    expect(() => {
      const coordinates = accepted.path.path?.legs[0]?.geometry.coordinates as [number, number][]
      coordinates[0]![0] = 105
    }).toThrow()
  })

  it('recopies a shallow-frozen input when nested Path data has changed', () => {
    const path = makePath(0, 3)
    Object.freeze(path)
    const source = createInitialNavigationSessionState()
    const journeyState = makeJourneyState([path])
    const first = freezeNavigationSessionSnapshot({ ...source, path: journeyState })
    const mutablePath = path as unknown as { legs: { geometry: { coordinates: [number, number][] } }[] }

    mutablePath.legs[0]!.geometry.coordinates[1]![0] = 104
    const changed = freezeNavigationSessionSnapshot({
      ...source,
      path: { ...journeyState, selectedCandidateKey: 'candidate-0' },
    })

    expect(first.path.path?.legs[0]?.geometry.coordinates[1]?.[0]).toBe(103.700001)
    expect(changed.path.path).not.toBe(first.path.path)
    expect(changed.path.path?.legs[0]?.geometry.coordinates[1]?.[0]).toBe(104)
    expect(Object.isFrozen(changed.path.path?.legs[0]?.geometry.coordinates[1])).toBe(true)
  })

  it('replaces candidate sets and selected paths without changing an earlier publication', () => {
    const initial = createInitialNavigationSessionState()
    const firstPath = makePath(0, 3)
    const alternativePath = makePath(1, 3)
    const firstJourney = makeJourneyState([firstPath, alternativePath])
    const first = freezeNavigationSessionSnapshot({ ...initial, path: firstJourney })
    const selectedAlternative = {
      ...first.path,
      path: first.path.candidates[1]!.path,
      candidates: first.path.candidates.slice(1),
      displayedCandidates: first.path.candidates.slice(1),
      selectedCandidateKey: 'candidate-1',
    }
    const next = freezeNavigationSessionSnapshot({ ...initial, path: selectedAlternative })

    expect(first.path.path).toBe(first.path.candidates[0]?.path)
    expect(next.path.path).toBe(next.path.candidates[0]?.path)
    expect(next.path.path).toBe(first.path.candidates[1]?.path)
    expect(next.path.displayedCandidates[0]).toBe(next.path.candidates[0])
    expect(next.path.selectedCandidateKey).toBe('candidate-1')
    expect(first.path.selectedCandidateKey).toBe('candidate-0')
  })
})
