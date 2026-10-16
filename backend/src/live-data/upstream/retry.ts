import { fetchWithTimeout } from './timeout.ts'

export interface UpstreamRetryOptions {
  readonly timeoutMs: number
  readonly retryAttempts: number
  readonly retryBaseDelayMs: number
  readonly signal?: AbortSignal
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  if (signal?.aborted) return Promise.reject(signal.reason)

  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolveDelay()
    }, milliseconds)
    timer.unref?.()
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      rejectDelay(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export async function fetchWithRetry(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  options: UpstreamRetryOptions,
): Promise<Response> {
  let retries = 0
  while (true) {
    let response: Response
    try {
      response = await fetchWithTimeout(fetcher, url, init, options.timeoutMs, options.signal)
    } catch (error: unknown) {
      if (options.signal?.aborted || retries >= options.retryAttempts) throw error
      await delay(options.retryBaseDelayMs * (2 ** retries), options.signal)
      retries += 1
      continue
    }

    if (!shouldRetryStatus(response.status) || retries >= options.retryAttempts) return response
    await response.body?.cancel()
    await delay(options.retryBaseDelayMs * (2 ** retries), options.signal)
    retries += 1
  }
}
