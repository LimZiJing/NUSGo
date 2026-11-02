export type ShuttleVehicleFailureReason = 'http' | 'invalid-response' | 'network' | 'invalid-request'

/** Safe diagnostic metadata; never includes upstream bodies, URLs or credentials. */
export class ShuttleVehicleFetchError extends Error {
  readonly reason: ShuttleVehicleFailureReason
  readonly status: number | undefined

  constructor(
    message: string,
    reason: ShuttleVehicleFailureReason,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ShuttleVehicleFetchError'
    this.reason = reason
    this.status = status
  }
}
