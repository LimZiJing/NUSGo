import type { Journey } from '../domain/trip/journey'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyState {
  readonly status: JourneyStatus
  readonly journey: Journey | null
  readonly error: string | null
}

export function createInitialJourneyState(): JourneyState {
  return {
    status: 'idle',
    journey: null,
    error: null,
  }
}
