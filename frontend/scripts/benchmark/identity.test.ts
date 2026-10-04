import { describe, expect, it } from 'vitest'
import { assertUniqueAdapterIds } from './identity'

describe('assertUniqueAdapterIds', () => {
  it('allows adapters with different IDs', () => {
    expect(() => assertUniqueAdapterIds([
      { id: 'baseline', path: '/worktree/a/adapter.ts' },
      { id: 'candidate', path: '/worktree/b/adapter.ts' },
    ])).not.toThrow()
  })

  it('rejects duplicate IDs from distinct adapter paths before benchmarking', () => {
    expect(() => assertUniqueAdapterIds([
      { id: 'same-planner', path: '/worktree/a/adapter.ts' },
      { id: 'same-planner', path: '/worktree/b/adapter.ts' },
    ])).toThrow('Adapter IDs must be unique across paths: same-planner')
  })
})
