import { describe, expect, it } from 'vitest'
import { candidateCodes, compactName, normaliseName, roomBuildingToken, slugify } from './normalise'

describe('normaliseName', () => {
  it('folds width and case, spells out ampersands, drops punctuation and collapses whitespace', () => {
    expect(normaliseName('  College of Alice & Peter  Tan ')).toBe('college of alice and peter tan')
    expect(normaliseName('ＣＯＭ１')).toBe('com1')
    expect(normaliseName('MD1 - Tahir Foundation Building')).toBe('md1 tahir foundation building')
    expect(normaliseName("Prince George's Park")).toBe('prince georges park')
  })

  it('has a compact form without spaces so LT 1 equals LT1', () => {
    expect(compactName('LT 1')).toBe(compactName('LT1'))
    expect(compactName('E5A / T-Lab')).toBe('e5atlab')
  })

  it('makes readable slugs', () => {
    expect(slugify('Cendana College')).toBe('cendana-college')
    expect(slugify('Medicine + Science Library')).toBe('medicine-science-library')
  })
})

describe('candidateCodes', () => {
  it('extracts the whole name, the code before " - " and codes in a trailing parenthesis', () => {
    expect(candidateCodes('COM1')).toEqual(['com1'])
    expect(candidateCodes('LT 1')).toEqual(['lt1'])
    expect(candidateCodes('BIZ 1 - Mochtar Riady Building')).toEqual(['biz1mochtarriadybuilding', 'biz1'])
    expect(candidateCodes('Lee Wee Kheng Building (S1A/LT 32)')).toEqual(['leeweekhengbuildings1alt32', 's1a', 'lt32'])
    expect(candidateCodes('Lim Seng Tjoe Lecture Theatre (LT 27)')).toEqual(['limsengtjoelecturetheatrelt27', 'lt27'])
  })
})

describe('roomBuildingToken', () => {
  it('is the part of the venue code before the first hyphen or underscore', () => {
    expect(roomBuildingToken('CLB-04-01H')).toBe('CLB')
    expect(roomBuildingToken('BIZ2-0111')).toBe('BIZ2')
    expect(roomBuildingToken('LAW_LT')).toBe('LAW')
    expect(roomBuildingToken('Pinnacle')).toBe('Pinnacle')
  })
})
