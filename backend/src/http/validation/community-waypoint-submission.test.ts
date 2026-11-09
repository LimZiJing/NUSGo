import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  InvalidCommunityWaypointSubmissionError,
  parseCommunityWaypointSubmission,
} from './community-waypoint-submission.ts'

const validNewPlace = {
  kind: 'new-place',
  category: 'water_cooler',
  longitude: 103.78,
  latitude: 1.29,
  explanation: 'Near the west entrance.',
} as const

describe('parseCommunityWaypointSubmission', () => {
  it('accepts a new-place submission with only supported fields', () => {
    assert.deepEqual(parseCommunityWaypointSubmission(validNewPlace), validNewPlace)
  })

  it('does not accept a contributor supplied display name for a new waypoint', () => {
    assert.throws(() => parseCommunityWaypointSubmission({
      ...validNewPlace,
      name: 'Water station',
    }), InvalidCommunityWaypointSubmissionError)
  })

  it('does not accept a proposed name in a correction submission', () => {
    assert.throws(() => parseCommunityWaypointSubmission({
      kind: 'correction',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      requestedChange: 'Correct the location details.',
      name: 'Water station',
    }), InvalidCommunityWaypointSubmissionError)
  })

  it('accepts correction and removal submissions with stable public IDs', () => {
    assert.deepEqual(parseCommunityWaypointSubmission({
      kind: 'correction',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      requestedChange: 'Move the location to the north entrance.',
      longitude: 103.781,
      latitude: 1.291,
    }), {
      kind: 'correction',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      requestedChange: 'Move the location to the north entrance.',
      longitude: 103.781,
      latitude: 1.291,
    })
    assert.deepEqual(parseCommunityWaypointSubmission({
      kind: 'removal',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      reason: 'The amenity has been removed.',
    }), {
      kind: 'removal',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      reason: 'The amenity has been removed.',
    })
  })

  it('rejects unsupported categories, malformed coordinates, invalid IDs, and photo fields', () => {
    assert.throws(() => parseCommunityWaypointSubmission({
      ...validNewPlace,
      category: 'other',
    }), InvalidCommunityWaypointSubmissionError)
    assert.throws(() => parseCommunityWaypointSubmission({
      ...validNewPlace,
      longitude: 181,
    }), InvalidCommunityWaypointSubmissionError)
    for (const photoField of [
      { photos: [] },
      { photoUrl: 'https://example.test/photo.jpg' },
      { photoId: 'private-photo-id' },
      { photoIds: ['private-photo-id'] },
      { photoFile: { name: 'evidence.jpg', type: 'image/jpeg' } },
      { details: 'https://images.example.test/evidence.jpg' },
      { explanation: 'Private photo ID: opaque-evidence-reference' },
      { details: 'data:image/png;base64,YWJj' },
      { explanation: '//photos.example.test/private' },
      { details: 'images.example.test/private' },
    ]) {
      assert.throws(() => parseCommunityWaypointSubmission({
        ...validNewPlace,
        ...photoField,
      }), InvalidCommunityWaypointSubmissionError)
    }
    assert.throws(() => parseCommunityWaypointSubmission({
      kind: 'removal',
      waypointId: 'private-id',
      reason: 'No longer present.',
    }), InvalidCommunityWaypointSubmissionError)
  })
})
