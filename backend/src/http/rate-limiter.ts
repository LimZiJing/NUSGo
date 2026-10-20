import { isIP } from 'node:net'
import type { Request, RequestHandler } from 'express'
import { sendApiError } from './error-response.ts'

const MAX_RATE_LIMIT_CLIENTS = 10_000

interface ClientRateWindow {
  readonly startedAtMs: number
  requestCount: number
}

export interface ClientRateLimitOptions {
  readonly windowMs: number
  readonly maxRequests: number
  readonly message: string
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true

  const ipv4Address = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized
  const octets = ipv4Address.split('.')
  return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet)) &&
    Number(octets[0]) === 127 && octets.every((octet) => Number(octet) <= 255)
}

export function getRateLimitClientAddress(request: Request): string {
  const peerAddress = request.socket.remoteAddress
  // Trust this header only when the direct peer is the local Cloudflare Tunnel process.
  if (isLoopbackAddress(peerAddress)) {
    const cloudflareAddress = request.get('cf-connecting-ip')?.trim()
    if (cloudflareAddress && isIP(cloudflareAddress) !== 0) return cloudflareAddress
  }

  return peerAddress || request.ip || 'unknown'
}

export function createClientRateLimiter(options: ClientRateLimitOptions): RequestHandler {
  const clients = new Map<string, ClientRateWindow>()

  return (request, response, next) => {
    const now = Date.now()
    const clientAddress = getRateLimitClientAddress(request)
    let clientWindow = clients.get(clientAddress)

    if (!clientWindow || now - clientWindow.startedAtMs >= options.windowMs) {
      if (!clientWindow && clients.size >= MAX_RATE_LIMIT_CLIENTS) {
        // Drop expired windows before rejecting a new address to keep this map bounded.
        for (const [address, window] of clients) {
          if (now - window.startedAtMs >= options.windowMs) clients.delete(address)
        }
      }

      if (!clientWindow && clients.size >= MAX_RATE_LIMIT_CLIENTS) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil(options.windowMs / 1000))))
        sendApiError(response, 429, options.message, 'rate_limited')
        return
      }

      clientWindow = { startedAtMs: now, requestCount: 0 }
      clients.set(clientAddress, clientWindow)
    }

    if (clientWindow.requestCount >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil(
        (clientWindow.startedAtMs + options.windowMs - now) / 1000,
      ))
      response.setHeader('Retry-After', String(retryAfterSeconds))
      sendApiError(response, 429, options.message, 'rate_limited')
      return
    }

    clientWindow.requestCount += 1
    next()
  }
}
