import { describe, expect, it } from 'vitest'
import {
  InvalidCommunityWaypointSubmissionError,
  parseCommunityWaypointSubmission,
} from './community-submission-validation.ts'

const printingDetails = {
  category: 'printing',
  services: ['print'],
  colour: true,
  grayscalePriceCentsPerPage: 10,
  colourPriceCentsPerPage: 20,
} as const

const newPlace = {
  kind: 'new-place',
  category: 'printing',
  longitude: 103.78,
  latitude: 1.29,
} as const

const correction = {
  kind: 'correction',
  waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
  requestedChange: 'Update the printing services.',
} as const

describe('parseCommunityWaypointSubmission suggested details', () => {
  it('accepts an omitted grayscale price and normalizes it to null', () => {
    const suggestedDetails = {
      category: 'printing', services: ['print'], colour: true, colourPriceCentsPerPage: 20,
    }
    expect(parseCommunityWaypointSubmission({ ...newPlace, suggestedDetails })).toEqual({
      ...newPlace,
      suggestedDetails: { ...printingDetails, grayscalePriceCentsPerPage: null },
    })
  })

  it('accepts omitted optional printing values and normalizes them to null', () => {
    expect(parseCommunityWaypointSubmission({
      ...newPlace,
      suggestedDetails: { category: 'printing', services: ['print'] },
    })).toEqual({
      ...newPlace,
      suggestedDetails: {
        category: 'printing', services: ['print'], colour: null,
        grayscalePriceCentsPerPage: null, colourPriceCentsPerPage: null,
      },
    })
  })

  it('continues to accept explicit null optional printing values', () => {
    const suggestedDetails = {
      ...printingDetails, colour: null, grayscalePriceCentsPerPage: null, colourPriceCentsPerPage: null,
    }
    expect(parseCommunityWaypointSubmission({ ...newPlace, suggestedDetails })).toEqual({
      ...newPlace, suggestedDetails,
    })
  })

  it('continues to reject present invalid booleans and prices', () => {
    for (const invalidValue of [
      { colour: 'yes' }, { colour: 1 }, { grayscalePriceCentsPerPage: '10' },
      { grayscalePriceCentsPerPage: -1 }, { grayscalePriceCentsPerPage: 0.5 },
      { colourPriceCentsPerPage: false }, { colourPriceCentsPerPage: Number.NaN },
    ]) {
      expect(() => parseCommunityWaypointSubmission({
        ...newPlace, suggestedDetails: { ...printingDetails, ...invalidValue },
      })).toThrow(InvalidCommunityWaypointSubmissionError)
    }
  })

  it('requires colour availability when a colour price is supplied', () => {
    const suggestedDetails = {
      category: 'printing', services: ['print'], grayscalePriceCentsPerPage: 10, colourPriceCentsPerPage: 20,
    }
    expect(() => parseCommunityWaypointSubmission({ ...newPlace, suggestedDetails }))
      .toThrow('colourPriceCentsPerPage requires colour to be true')
  })

  it('rejects correction details without a proposed category', () => {
    expect(() => parseCommunityWaypointSubmission({ ...correction, suggestedDetails: printingDetails }))
      .toThrow('suggestedDetails requires a proposed category')
  })

  it('rejects printing correction details with a proposed vending category', () => {
    expect(() => parseCommunityWaypointSubmission({
      ...correction, category: 'vending_machine', suggestedDetails: printingDetails,
    })).toThrow('suggestedDetails category must match the proposed category')
  })

  it('accepts correction details with a matching proposed category', () => {
    const input = { ...correction, category: 'printing', suggestedDetails: printingDetails }
    expect(parseCommunityWaypointSubmission(input)).toEqual(input)
  })

  it('continues to accept corrections without details or a proposed category', () => {
    expect(parseCommunityWaypointSubmission(correction)).toEqual(correction)
  })
})
