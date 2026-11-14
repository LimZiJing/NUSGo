import type {
  ActiveCommunityWaypointCategory,
  CommunityWaypointDetailsSuggestion,
  CommunityWaypointId,
} from './community.ts'

export interface ProposedCommunityWaypointFields {
  readonly category?: ActiveCommunityWaypointCategory
  readonly longitude?: number
  readonly latitude?: number
  readonly building?: string
  readonly floor?: number
}

export type CommunityWaypointSubmission =
  | ({
      readonly kind: 'new-place'
      readonly category: ActiveCommunityWaypointCategory
      readonly longitude: number
      readonly latitude: number
      readonly explanation?: string
      readonly suggestedDetails?: CommunityWaypointDetailsSuggestion
    } & Omit<ProposedCommunityWaypointFields, 'category' | 'longitude' | 'latitude'>)
  | ({
      readonly kind: 'correction'
      readonly waypointId: CommunityWaypointId
      readonly requestedChange: string
      readonly suggestedDetails?: CommunityWaypointDetailsSuggestion
    } & ProposedCommunityWaypointFields)
  | {
      readonly kind: 'removal'
      readonly waypointId: CommunityWaypointId
      readonly reason: string
    }

export interface CommunityWaypointSubmissionReceipt {
  readonly status: 'received'
}
