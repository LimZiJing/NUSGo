import type { RequestHandler } from 'express'
import { sendApiError } from './error-response.ts'

const ALLOWED_METHODS = 'GET, HEAD, POST, OPTIONS'
const ALLOWED_HEADERS = new Set(['accept', 'content-type'])

export function createCorsMiddleware(origins: readonly string[]): RequestHandler {
  const originSet = new Set(origins)

  return (request, response, next) => {
    const origin = request.get('origin')
    if (origin) {
      response.vary('Origin')
      if (!originSet.has(origin)) {
        sendApiError(response, 403, 'Origin is not allowed')
        return
      }
      response.setHeader('Access-Control-Allow-Origin', origin)
    }

    if (request.method === 'OPTIONS') {
      const requestedMethod = request.get('access-control-request-method')?.toUpperCase()
      if (requestedMethod && !['GET', 'HEAD', 'POST'].includes(requestedMethod)) {
        sendApiError(response, 403, 'Requested method is not allowed')
        return
      }

      const requestedHeaders = request.get('access-control-request-headers')
        ?.split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean) ?? []
      if (requestedHeaders.some((header) => !ALLOWED_HEADERS.has(header))) {
        sendApiError(response, 403, 'Requested headers are not allowed')
        return
      }

      response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
      if (requestedHeaders.length > 0) {
        response.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '))
      }
      response.setHeader('Access-Control-Max-Age', '600')
      response.status(204).end()
      return
    }

    next()
  }
}
