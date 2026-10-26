import type {
  PersonalWaypoint,
  PersonalWaypointValidationIssue,
} from './personal-waypoint'

declare const personalWaypointStoreRevisionBrand: unique symbol

export type PersonalWaypointStoreRevision = string & {
  readonly [personalWaypointStoreRevisionBrand]: true
}

export type PersonalWaypointStoreReadResult =
  | {
      readonly kind: 'ready'
      readonly waypoints: readonly PersonalWaypoint[]
      readonly revision: PersonalWaypointStoreRevision | null
      readonly rejectedRecords: {
        readonly count: number
        readonly issues: readonly PersonalWaypointValidationIssue[]
      }
    }
  | {
      readonly kind: 'recovery-required'
      readonly reason: 'malformed-data' | 'unsupported-version'
      readonly revision: PersonalWaypointStoreRevision
    }
  | { readonly kind: 'unavailable'; readonly operation: 'read' }

export type PersonalWaypointStoreMutationResult =
  | { readonly kind: 'saved'; readonly revision: PersonalWaypointStoreRevision }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'recovery-required' }
  | {
      readonly kind: 'invalid'
      readonly issues: readonly PersonalWaypointValidationIssue[]
    }
  | { readonly kind: 'unavailable'; readonly operation: 'read' | 'write' | 'remove' }

/** Revisions cannot make cross-tab localStorage compare-and-mutate operations atomic. */
export interface PersonalWaypointStore {
  /** Skipped records remain in storage and are described by `rejectedRecords` until a mutation. */
  read(): PersonalWaypointStoreReadResult
  /**
   * Replaces the whole collection, so callers should surface any rejected records
   * from the preceding read before saving.
   */
  replaceAll(
    waypoints: readonly PersonalWaypoint[],
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult
  clear(
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult
}
