import type { CSSProperties } from 'react'

/** Original single-deck bus model; the fixed materials remain readable across map themes. */
const materials = {
  '--bus-glass': '#263445',
  '--bus-roof': '#edf1f4',
} as CSSProperties

export function LiveBusVehicle() {
  return (
    <span className="live-bus-model" style={materials}>
      <span className="live-bus-model-face live-bus-model-roof" />
      <span className="live-bus-model-face live-bus-model-front" />
      <span className="live-bus-model-face live-bus-model-back" />
      <span className="live-bus-model-face live-bus-model-left" />
      <span className="live-bus-model-face live-bus-model-right" />
      <span className="live-bus-model-roof-unit" />
    </span>
  )
}
