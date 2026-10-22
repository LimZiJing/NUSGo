import type {
  PersonalWaypoint,
  PersonalWaypointValidationIssue,
} from '../../domain/waypoints/personal/personal-waypoint'

declare const personalWaypointStoreRevisionBrand: unique symbol

export type PersonalWaypointStoreRevision = string & {
  readonly [personalWaypointStoreRevisionBrand]: true
}

export type PersonalWaypointStoreReadResult =
  | {
      readonly kind: 'ready'
      readonly waypoints: readonly PersonalWaypoint[]
      readonly revision: PersonalWaypointStoreRevision | null
    }
  | {
      readonly kind: 'recovery-required'
      readonly reason: 'malformed-data' | 'unsupported-version' | 'invalid-records'
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

export interface PersonalWaypointStore {
  read(): PersonalWaypointStoreReadResult
  replaceAll(
    waypoints: readonly PersonalWaypoint[],
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult
  clear(
    expectedRevision: PersonalWaypointStoreRevision | null,
  ): PersonalWaypointStoreMutationResult
}
