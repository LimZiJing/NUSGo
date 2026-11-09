import type { ActiveCommunityWaypointCategory, CommunityWaypointId } from './community.ts'

export interface ProposedCommunityWaypointFields {
  readonly category?: ActiveCommunityWaypointCategory
  readonly longitude?: number
  readonly latitude?: number
  readonly building?: string
  readonly floor?: number
  readonly accessibilityNote?: string
  readonly details?: string
}

export type CommunityWaypointSubmission =
  | ({
      readonly kind: 'new-place'
      readonly category: ActiveCommunityWaypointCategory
      readonly longitude: number
      readonly latitude: number
      readonly explanation?: string
    } & Omit<ProposedCommunityWaypointFields, 'category' | 'longitude' | 'latitude'>)
  | ({
      readonly kind: 'correction'
      readonly waypointId: CommunityWaypointId
      readonly requestedChange: string
    } & ProposedCommunityWaypointFields)
  | {
      readonly kind: 'removal'
      readonly waypointId: CommunityWaypointId
      readonly reason: string
    }

export interface CommunityWaypointSubmissionReceipt {
  readonly status: 'received'
}
