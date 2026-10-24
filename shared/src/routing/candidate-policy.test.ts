import { describe, expect, it } from 'vitest'
import { pruneUnworthwhileCandidates } from './candidate-policy.ts'

type Item = { readonly name: string, readonly adjustedDurationSeconds: number, readonly boardings: number }

function prune(items: readonly Item[]): string[] {
  return pruneUnworthwhileCandidates(items, (item) => item).map((item) => item.name)
}

describe('pruneUnworthwhileCandidates', () => {
  it('drops a bus option more than twice as slow as walking', () => {
    expect(prune([
      { name: 'walk', adjustedDurationSeconds: 525, boardings: 0 },
      { name: 'loop', adjustedDurationSeconds: 1500, boardings: 2 },
      { name: 'fair', adjustedDurationSeconds: 900, boardings: 1 },
    ])).toEqual(['walk', 'fair'])
  })

  it('keeps every bus option when there is no walking candidate', () => {
    expect(prune([
      { name: 'a', adjustedDurationSeconds: 3000, boardings: 1 },
      { name: 'b', adjustedDurationSeconds: 9000, boardings: 1 },
    ])).toEqual(['a', 'b'])
  })

  it('drops a two-boarding option that saves under 3 minutes over the best simpler option', () => {
    expect(prune([
      { name: 'one', adjustedDurationSeconds: 600, boardings: 1 },
      { name: 'marginal', adjustedDurationSeconds: 500, boardings: 2 },
      { name: 'worth', adjustedDurationSeconds: 420, boardings: 2 },
    ])).toEqual(['one', 'worth'])
  })

  it('compares a two-boarding option with walking too', () => {
    expect(prune([
      { name: 'walk', adjustedDurationSeconds: 400, boardings: 0 },
      { name: 'transfer', adjustedDurationSeconds: 350, boardings: 2 },
    ])).toEqual(['walk'])
  })

  it('keeps a two-boarding option when nothing simpler exists', () => {
    expect(prune([{ name: 'only', adjustedDurationSeconds: 800, boardings: 2 }])).toEqual(['only'])
  })
})
