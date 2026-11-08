// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { CommunityWaypointSubmissionError } from '../../../domain/waypoints/community-waypoint-submission'
import { CommunityWaypointSubmissionForm } from './community-waypoint-submission-form'

afterEach(() => cleanup())

const coordinate = { longitude: 103.78, latitude: 1.29 }

const waypoint: CommunityWaypoint = {
  id: 'cw-water-001',
  name: 'Water cooler at UTown',
  category: 'water_cooler',
  coordinate,
  source: 'NUS Campus Facilities',
  updatedAt: '2026-10-26',
  building: 'Stephen Riady Centre',
  floor: 1,
  details: 'Beside the east stairwell.',
}

function renderForm(overrides: Partial<Parameters<typeof CommunityWaypointSubmissionForm>[0]> = {}) {
  const props = {
    waypoint: null,
    coordinate,
    onAdjustLocation: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    onBack: vi.fn(),
    ...overrides,
  }
  const view = render(<CommunityWaypointSubmissionForm {...props} />)
  return { props, ...view }
}

describe('CommunityWaypointSubmissionForm', () => {
  it('validates a place suggestion and shows a private-safe review receipt', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByText('Reviewed before publishing. No photos, photo links or personal details.')).toBeTruthy()
    expect(screen.queryByLabelText(/name or email/i)).toBeNull()
    expect(screen.queryByLabelText(/photo/i)).toBeNull()

    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.type(screen.getByLabelText('Place name'), 'ATM beside the library')
    const additionalDetails = screen.getByText('Additional details').closest('details')
    expect(additionalDetails?.open).toBe(false)
    await user.click(screen.getByText('Additional details'))
    await user.type(screen.getByLabelText(/Building or landmark/), 'Central Library')
    await user.type(screen.getByLabelText('Details (optional)', { exact: true }), 'Near the east entrance.')
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))
    expect(props.onAdjustLocation).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith({
      kind: 'new-place',
      name: 'ATM beside the library',
      category: 'atm',
      longitude: 103.78,
      latitude: 1.29,
      building: 'Central Library',
      details: 'Near the east entrance.',
    }, expect.any(AbortSignal))
    expect((await screen.findByRole('status')).textContent).toMatch(/review it before publication/)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Suggestion received' }))
    expect(screen.queryByText(/issue|github\.com/i)).toBeNull()
  })

  it('requires a category and place name before sending a new suggestion', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/place name/i)
      expect(screen.getByRole('alert').textContent).toMatch(/category/i)
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('opens optional details and focuses the visible field when its value is invalid', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.type(screen.getByLabelText('Place name'), 'ATM beside the library')
    await user.click(screen.getByText('Additional details'))
    await user.type(screen.getByLabelText('Floor (optional)'), '1.5')
    await user.click(screen.getByText('Additional details'))
    expect(screen.getByText('Additional details').closest('details')?.open).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => {
      expect(screen.getByText('Additional details').closest('details')?.open).toBe(true)
      expect(document.activeElement).toBe(screen.getByLabelText('Floor (optional)'))
      expect(screen.getByText('Enter a whole-number floor.', { selector: 'span' })).toBeTruthy()
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('sends a correction reason and the proposed approved-place fields', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ waypoint })

    expect(screen.getByText('Correction for')).toBeTruthy()
    expect(screen.getByText('Additional details').closest('details')?.open).toBe(true)
    expect((screen.getByLabelText('Place name (optional)') as HTMLInputElement).value).toBe(waypoint.name)
    await user.type(screen.getByLabelText('What needs correcting?'), 'The cooler has moved upstairs.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith({
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: 'The cooler has moved upstairs.',
      name: waypoint.name,
      category: waypoint.category,
      longitude: waypoint.coordinate.longitude,
      latitude: waypoint.coordinate.latitude,
      building: waypoint.building,
      floor: waypoint.floor,
      details: waypoint.details,
    }, expect.any(AbortSignal))
  })

  it('shows a safe retry message when the submission cannot reach the server', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({
      onSubmit: vi.fn(async () => { throw new CommunityWaypointSubmissionError('network') }),
    })

    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.type(screen.getByLabelText('Place name'), 'ATM beside the library')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toMatch(/check your connection and try again/i))
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('counts Unicode code points the same way as the shared submission validator', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()
    const name = '🧊'.repeat(80)

    fireEvent.change(screen.getByLabelText('Place name'), { target: { value: name } })
    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name }), expect.any(AbortSignal))
  })

  it('keeps focus on an announced busy submit button and ignores repeated submits', async () => {
    const user = userEvent.setup()
    let resolveSubmission = (): void => undefined
    const onSubmit = vi.fn(async () => new Promise<void>((resolve) => { resolveSubmission = resolve }))
    renderForm({ onSubmit })
    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.type(screen.getByLabelText('Place name'), 'ATM beside the library')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    const sendingButton = screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement
    expect(sendingButton.disabled).toBe(false)
    expect(sendingButton.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Sending suggestion.')
    await user.click(sendingButton)
    expect(onSubmit).toHaveBeenCalledOnce()

    await act(async () => resolveSubmission())
    expect(await screen.findByRole('heading', { name: 'Suggestion received' })).toBeTruthy()
  })

  it('aborts a pending request when the form unmounts', async () => {
    const user = userEvent.setup()
    const submittedSignals: AbortSignal[] = []
    const onSubmit = vi.fn<Parameters<typeof CommunityWaypointSubmissionForm>[0]['onSubmit']>(
      async (_submission, signal) => {
        submittedSignals.push(signal)
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      },
    )
    const view = renderForm({ onSubmit })
    await user.selectOptions(screen.getByLabelText('Category'), 'atm')
    await user.type(screen.getByLabelText('Place name'), 'ATM beside the library')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))
    await waitFor(() => expect(submittedSignals).toHaveLength(1))

    view.unmount()

    expect(submittedSignals[0]?.aborted).toBe(true)
  })
})
