import type { RequestHandler, Response } from 'express'
import { PUSH_SUBSCRIPTION_BODY_MAX_BYTES } from '@nusgo/shared'
import { sendApiError } from './error-response.ts'

export function methodNotAllowed(allowed: string): RequestHandler {
  return (_request, response) => {
    response.setHeader('Allow', allowed)
    sendApiError(response, 405, 'Only ' + (allowed.split(',')[0]?.trim() ?? 'GET') + ' is supported', 'invalid_request')
  }
}

export function sendNotConfigured(response: Response): void {
  sendApiError(response, 503, 'Web push is not configured', 'not_ready')
}

export function exceedsBodyLimit(body: unknown): boolean {
  const serialized = body === undefined ? '' : JSON.stringify(body)
  return Buffer.byteLength(serialized, 'utf8') > PUSH_SUBSCRIPTION_BODY_MAX_BYTES
}
