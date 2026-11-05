export const variant = process.env.PERF_VARIANT === 'base' ? 'base' : 'changed'
export const baseRevision = process.env.PERF_BASE_REV ?? 'f21964595968dde261973f7e2cb965ce0ba600b7'
