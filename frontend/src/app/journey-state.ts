import type { Journey } from '../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../domain/trip/planner'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyState {
  readonly status: JourneyStatus
  readonly journey: Journey | null
  readonly candidates: readonly ScoredJourneyCandidate[]
  readonly displayedCandidates: readonly ScoredJourneyCandidate[]
  readonly selectedCandidateKey: string | null
  readonly error: string | null
}

export function createInitialJourneyState(): JourneyState {
  return {
    status: 'idle',
    journey: null,
    candidates: [],
    displayedCandidates: [],
    selectedCandidateKey: null,
    error: null,
  }
}

export function createJourneyStateWithStatus(status: JourneyStatus): JourneyState {
  return { ...createInitialJourneyState(), status }
}
