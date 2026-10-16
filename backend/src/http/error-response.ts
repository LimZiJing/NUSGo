import type { ErrorRequestHandler, Response } from 'express'
import type { ApiErrorCode, ApiErrorResponse } from '@navus/shared'

export function sendApiError(
  response: Response,
  status: number,
  error: string,
  code?: ApiErrorCode,
): void {
  const body: ApiErrorResponse = { error, ...(code ? { code } : {}) }
  response.status(status).json(body)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createApiErrorHandler(): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }

    const type = isRecord(error) ? error.type : undefined
    const status = isRecord(error) ? error.status : undefined
    if (type === 'entity.too.large' || status === 413) {
      sendApiError(response, 413, 'Request body is too large')
      return
    }
    if (type === 'entity.parse.failed' || status === 400) {
      sendApiError(response, 400, 'Request body is not valid JSON')
      return
    }

    console.error('Unhandled API request failure', {
      method: request.method,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    sendApiError(response, 500, 'Internal server error')
  }
}
