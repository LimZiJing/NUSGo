import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapWithConcurrency } from './concurrency.ts'

describe('bounded provider concurrency', () => {
  it('limits active loaders and preserves result order', async () => {
    let active = 0
    let maximumActive = 0
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2))
      active -= 1
      return value * 10
    })

    assert.equal(maximumActive, 2)
    assert.deepEqual(results, [10, 20, 30, 40])
  })

  it('propagates even an undefined provider failure', async () => {
    await assert.rejects(
      mapWithConcurrency([1], 1, async () => {
        throw undefined
      }),
      (error: unknown) => error === undefined,
    )
  })
})
