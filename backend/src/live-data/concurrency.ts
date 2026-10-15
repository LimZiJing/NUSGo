export async function mapWithConcurrency<T, Result>(
  items: readonly T[],
  maxConcurrency: number,
  load: (item: T, index: number) => Promise<Result>,
): Promise<readonly Result[]> {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error('maxConcurrency must be a positive integer')
  }

  const values: Result[] = new Array(items.length)
  const errors: unknown[] = []
  const failed: boolean[] = []
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item === undefined) continue
      try {
        values[index] = await load(item, index)
      } catch (error: unknown) {
        errors[index] = error
        failed[index] = true
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrency, items.length) }, worker),
  )
  const firstFailure = failed.findIndex(Boolean)
  if (firstFailure >= 0) throw errors[firstFailure]
  return values
}
