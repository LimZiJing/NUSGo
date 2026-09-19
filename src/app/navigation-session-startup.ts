export interface NavigationSessionStartupTasks {
  readonly loadVenues: (signal: AbortSignal) => Promise<void>
  readonly loadTransit: (signal: AbortSignal) => Promise<void>
}

export interface NavigationSessionStartup {
  start(signal: AbortSignal, tasks: NavigationSessionStartupTasks): Promise<void>
  dispose(): void
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
