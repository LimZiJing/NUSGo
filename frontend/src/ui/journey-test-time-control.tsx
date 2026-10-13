import { useState, type FormEvent } from 'react'
import { formatSingaporeDateTime, parseSingaporeDateTime } from '../domain/trip/simulated-time'
import { Button } from './button'
import './styles/shared/controls/journey-test-time.css'

interface JourneyTestTimeControlProps {
  readonly simulatedAtMs: number | null
  readonly onApply: (instantMs: number) => void
  readonly onReset: () => void
}

export function JourneyTestTimeControl({ simulatedAtMs, onApply, onReset }: JourneyTestTimeControlProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(() => formatSingaporeDateTime(Date.now()))
  const [error, setError] = useState<string | null>(null)

  const apply = (): void => {
    const instantMs = parseSingaporeDateTime(value)
    if (instantMs === null) {
      setError('Enter a valid Singapore date and time.')
      return
    }
    setError(null)
    onApply(instantMs)
  }

  // Button is always type="button", so Apply calls apply() directly; the form handler keeps Enter-to-submit working.
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    apply()
  }

  const reset = (): void => {
    setError(null)
    setValue(formatSingaporeDateTime(Date.now()))
    onReset()
  }

  return (
    <div className="journey-test-time-control">
      <button
        type="button"
        className="journey-test-time-toggle"
        aria-expanded={open}
        aria-controls="journey-test-time-panel"
        onClick={() => setOpen(!open)}
      >
        Test time{simulatedAtMs === null ? '' : ' · simulated'}
      </button>
      {open && (
        <form id="journey-test-time-panel" className="journey-test-time-panel" onSubmit={submit} noValidate>
          <label htmlFor="journey-test-time-input">Singapore date and time (SGT)</label>
          <input
            id="journey-test-time-input"
            type="datetime-local"
            lang="en-GB"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? 'journey-test-time-error' : undefined}
          />
          {error && <p id="journey-test-time-error" role="alert">{error}</p>}
          <div className="journey-test-time-actions">
            <Button className="journey-test-time-action" variant="primary" label="Apply" onClick={apply} />
            <Button className="journey-test-time-action" label="Reset to live" onClick={reset} disabled={simulatedAtMs === null} />
          </div>
        </form>
      )}
    </div>
  )
}
