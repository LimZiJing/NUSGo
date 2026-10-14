import type { ComponentProps } from 'react'
import { usePlanTripForm, type PlanTripFormOptions } from '../hooks/use-plan-trip-form'
import { PlanContent } from './plan-content'

type PlanContentHarnessProps = Omit<ComponentProps<typeof PlanContent>, 'form'>
  & Omit<PlanTripFormOptions, 'tripRequest'>

// Keep interaction tests realistic by supplying the same form hook used by App.
export function PlanContentHarness(props: PlanContentHarnessProps) {
  const {
    onSwap,
    onSelectOriginEndpoint,
    onClearOriginEndpoint,
    onSelectDestinationEndpoint,
    onClearDestinationEndpoint,
    onClearTrip,
    onPlanJourney,
    onCancelOriginLocationRequest,
    ...contentProps
  } = props
  const form = usePlanTripForm({
    tripRequest: contentProps.tripRequest,
    onSwap,
    onSelectOriginEndpoint,
    onClearOriginEndpoint,
    onSelectDestinationEndpoint,
    onClearDestinationEndpoint,
    onClearTrip,
    onPlanJourney,
    onCancelOriginLocationRequest,
  })

  return (
    <PlanContent
      {...contentProps}
      form={form}
      onCancelOriginLocationRequest={onCancelOriginLocationRequest}
    />
  )
}
