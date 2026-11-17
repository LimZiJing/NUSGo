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

  it.each([true, false, null])('accepts a Toilet bidet answer of %s', (bidet) => {
    const input = {
      ...newPlace,
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet },
    }
    expect(parseCommunityWaypointSubmission(input)).toEqual(input)
  })

  it('normalizes an omitted Toilet bidet answer to null', () => {
    expect(parseCommunityWaypointSubmission({
      ...newPlace,
      category: 'toilet',
      suggestedDetails: { category: 'toilet' },
    })).toEqual({
      ...newPlace,
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: null },
    })
  })

  it('rejects non-boolean Toilet bidet answers and other Toilet detail fields', () => {
    for (const suggestedDetails of [
      { category: 'toilet', bidet: 'yes' },
      { category: 'toilet', bidet: 1 },
      { category: 'toilet', bidet: false, items: ['drinks'] },
    ]) {
      expect(() => parseCommunityWaypointSubmission({
        ...newPlace,
        category: 'toilet',
        suggestedDetails,
      })).toThrow(InvalidCommunityWaypointSubmissionError)
    }
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

  it('accepts Toilet correction details only with the proposed Toilet category', () => {
    const input = {
      ...correction,
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: false },
    }
    expect(parseCommunityWaypointSubmission(input)).toEqual(input)
    expect(() => parseCommunityWaypointSubmission({
      ...correction,
      category: 'printing',
      suggestedDetails: { category: 'toilet', bidet: false },
    })).toThrow('suggestedDetails category must match the proposed category')
  })

  it('continues to accept corrections without details or a proposed category', () => {
    expect(parseCommunityWaypointSubmission(correction)).toEqual(correction)
  })
})
