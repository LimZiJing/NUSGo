export type ShuttleVehicleFailureReason = 'http' | 'invalid-response' | 'network' | 'invalid-request'

/** Safe diagnostic metadata; never includes upstream bodies, URLs or credentials. */
export class ShuttleVehicleFetchError extends Error {
  constructor(
    message: string,
    readonly reason: ShuttleVehicleFailureReason,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ShuttleVehicleFetchError'
  }
}
