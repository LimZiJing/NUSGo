import { describe, expect, it } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { createSubmission, initialSubmissionDraft } from './draft'

const coordinate = { longitude: 103.78, latitude: 1.29 }

const toiletWaypoint: CommunityWaypoint = {
  id: 'cw-toilet-001',
  displayLabel: 'Toilet at UTown',
  category: 'toilet',
  coordinate,
  updatedAt: '2026-11-17',
  bidet: true,
}

describe('Community Waypoint Toilet bidet draft', () => {
  it('starts unanswered and pre-fills an existing answer', () => {
    expect(initialSubmissionDraft(null).bidet).toBe('')
    expect(initialSubmissionDraft(toiletWaypoint).bidet).toBe('yes')
    expect(initialSubmissionDraft({ ...toiletWaypoint, bidet: false }).bidet).toBe('no')
  })

  it('submits a selected Yes or No and leaves an unanswered new suggestion empty', () => {
    const draft = initialSubmissionDraft(null)
    const unanswered = createSubmission({ ...draft, category: 'toilet' }, null, coordinate)
    expect(unanswered).not.toHaveProperty('suggestedDetails')

    const noBidet = createSubmission({
      ...draft,
      category: 'toilet',
      bidet: 'no',
      detailsTouched: true,
    }, null, coordinate)
    expect(noBidet).toMatchObject({
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: false },
    })
  })

  it('sends Not sure as a clear when correcting a published answer', () => {
    const correction = createSubmission({
      ...initialSubmissionDraft(toiletWaypoint),
      bidet: 'unsure',
      requestedChange: 'The bidet information is unverified.',
      detailsTouched: true,
    }, toiletWaypoint, coordinate)

    expect(correction).toMatchObject({
      kind: 'correction',
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: null },
    })
  })
})
