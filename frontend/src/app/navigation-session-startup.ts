export interface NavigationSessionStartupTasks {
  readonly loadVenues: (signal: AbortSignal) => Promise<void>
  readonly loadTransit: (signal: AbortSignal) => Promise<void>
}

export interface NavigationSessionStartup {
  start(signal: AbortSignal, tasks: NavigationSessionStartupTasks): Promise<void>
  dispose(): void
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

export function waitForAbortablePromise<T>(
  dependency: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError())

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      signal.removeEventListener('abort', handleAbort)
    }

    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const handleAbort = (): void => {
      settle(() => reject(createAbortError()))
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) {
      handleAbort()
      return
    }

    Promise.resolve(dependency).then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    )
  })
}

export function createNavigationSessionStartup(): NavigationSessionStartup {
  let startPromise: Promise<void> | null = null
  let startupAbortController: AbortController | null = null
  let removeExternalAbortListener: (() => void) | null = null
  let disposed = false

  const clearExternalAbortListener = (): void => {
    removeExternalAbortListener?.()
    removeExternalAbortListener = null
  }

  return {
    start(signal, tasks) {
      if (startPromise) return startPromise
      if (disposed || signal.aborted) {
        startPromise = Promise.resolve()
        return startPromise
      }

      const controller = new AbortController()
      startupAbortController = controller
      const handleExternalAbort = () => controller.abort()
      signal.addEventListener('abort', handleExternalAbort, { once: true })
      removeExternalAbortListener = () => {
        signal.removeEventListener('abort', handleExternalAbort)
      }
      if (signal.aborted) controller.abort()

      startPromise = Promise.all([
        tasks.loadVenues(controller.signal),
        tasks.loadTransit(controller.signal),
      ])
        .then(() => undefined)
        .finally(clearExternalAbortListener)
      return startPromise
    },

    dispose() {
      if (disposed) return
      disposed = true
      startupAbortController?.abort()
      clearExternalAbortListener()
    },
  }
}
