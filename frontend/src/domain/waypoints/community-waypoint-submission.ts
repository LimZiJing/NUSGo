export type CommunityWaypointSubmissionFailureKind = 'invalid' | 'rate-limited' | 'unavailable' | 'network'

/** A safe, transport-neutral failure category for the Community Waypoint suggestion form. */
export class CommunityWaypointSubmissionError extends Error {
  readonly kind: CommunityWaypointSubmissionFailureKind

  constructor(kind: CommunityWaypointSubmissionFailureKind) {
    super('Community Waypoint submission failed')
    this.name = 'CommunityWaypointSubmissionError'
    this.kind = kind
  }
}
