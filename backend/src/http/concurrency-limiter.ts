import type { RequestHandler } from 'express'
import { sendApiError } from './error-response.ts'

export function createConcurrencyLimiter(maxConcurrent: number, message: string): RequestHandler {
  let activeRequests = 0

  return (_request, response, next) => {
    if (activeRequests >= maxConcurrent) {
      response.setHeader('Retry-After', '1')
      sendApiError(response, 429, message, 'rate_limited')
      return
    }

    activeRequests += 1
    let released = false
    const release = () => {
      if (released) return
      released = true
      activeRequests -= 1
      response.removeListener('finish', release)
      response.removeListener('close', release)
    }
    // Both events can fire for one response, so release() must remain idempotent.
    response.once('finish', release)
    response.once('close', release)
    next()
  }
}
