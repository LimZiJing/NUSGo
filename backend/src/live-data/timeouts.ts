export class UpstreamTimeoutError extends Error {
  constructor() {
    super('Upstream request timed out')
    this.name = 'UpstreamTimeoutError'
  }
}

export async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  let cleaned = false
  let timeout: ReturnType<typeof setTimeout> | null = null
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (timeout) clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
  const abortFromParent = () => {
    controller.abort()
    cleanup()
  }

  if (parentSignal?.aborted) {
    controller.abort()
    throw new DOMException('The operation was aborted', 'AbortError')
  }
  parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
    cleanup()
  }, timeoutMs)

  try {
    const response = await fetcher(url, { ...init, signal: controller.signal })
    if (timedOut) {
      await response.body?.cancel()
      throw new UpstreamTimeoutError()
    }
    if (!response.body) {
      cleanup()
      return response
    }

    const reader = response.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const result = await reader.read()
          if (result.done) {
            cleanup()
            streamController.close()
          } else {
            streamController.enqueue(result.value)
          }
        } catch (error: unknown) {
          cleanup()
          streamController.error(timedOut ? new UpstreamTimeoutError() : error)
        }
      },
      async cancel(reason) {
        cleanup()
        await reader.cancel(reason)
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error: unknown) {
    cleanup()
    if (timedOut) throw new UpstreamTimeoutError()
    throw error
  }
}
