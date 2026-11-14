// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { buildBuildingIndex } from '../../../../domain/venue/building-index'
import { CommunityWaypointSubmissionError } from '../../../../domain/waypoints/community-waypoint-submission'
import { CommunityWaypointSubmissionForm } from './form'

afterEach(() => cleanup())

const coordinate = { longitude: 103.78, latitude: 1.29 }

const waypoint: CommunityWaypoint = {
  id: 'cw-water-001',
  displayLabel: 'Water cooler at UTown',
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
    locationStatus: 'ready' as const,
    locationAccuracy: 12,
    buildingIndex: null,
    venues: null,
    onAdjustLocation: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    onBack: vi.fn(),
    ...overrides,
  }
  const view = render(<CommunityWaypointSubmissionForm {...props} />)
  return { props, ...view }
}

describe('CommunityWaypointSubmissionForm', () => {
  it('preselects the category supplied by the category quick-add action', () => {
    renderForm({ initialCategory: 'printing' })

    expect((screen.getByRole('radio', { name: 'Printing / photocopying' }) as HTMLInputElement).checked).toBe(true)
  })
  it('validates a Community Waypoint suggestion and shows a private-safe review receipt', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    expect(screen.getByRole('radio', { name: 'Printing / photocopying' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'ATM' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByText('Using current location')).toBeTruthy()
    expect(screen.queryByText(/Current location accuracy/)).toBeNull()
    expect(screen.queryByText(/Anonymous\. Your pin and optional note/)).toBeNull()
    expect(screen.queryByText('Only reviewers see this note.')).toBeNull()
    expect(screen.queryByLabelText(/name or email/i)).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.type(screen.getByLabelText('Note for reviewers'), 'Near the library entrance.')
    expect(screen.getByLabelText('Building or landmark')).toBeTruthy()
    expect(screen.getByLabelText('Floor')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Building or landmark' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Details' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Accessibility note' })).toBeNull()
    await user.type(screen.getByLabelText(/Building or landmark/), 'Central Library')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))
    expect(props.onAdjustLocation).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith({
      kind: 'new-place',
      category: 'printing',
      longitude: 103.78,
      latitude: 1.29,
      building: 'Central Library',
      explanation: 'Near the library entrance.',
    }, expect.any(AbortSignal))
    expect((await screen.findByRole('status')).textContent).toMatch(/review it before publication/)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Suggestion received' }))
    expect(screen.queryByText(/issue|github\.com/i)).toBeNull()
  })

  it('requires a category before sending a new suggestion', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/category/i)
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('requires a current or manually selected location before sending', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ locationStatus: 'required', locationAccuracy: null })

    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(screen.getByText('Set the waypoint location before sending.', { selector: 'span' })).toBeTruthy()
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('keeps its location status region mounted and silent on the initial state', () => {
    const { props, rerender } = renderForm({ locationStatus: 'locating', locationAccuracy: null })

    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByText('Getting your current location…')).toBeTruthy()

    rerender(<CommunityWaypointSubmissionForm {...props} locationStatus="ready" locationAccuracy={8} />)

    expect(screen.getByRole('status').textContent).toBe('Waypoint location set. Check the pin before sending.')
  })

  it('autofills buildings and keeps building and floor available in Additional details', async () => {
    const user = userEvent.setup()
    const buildingIndex = buildBuildingIndex([{
      id: 'central-library',
      name: 'Central Library',
      aliases: [],
      elementId: 'n123',
      location: { x: coordinate.longitude, y: coordinate.latitude },
      roomCodePrefixes: [],
      sourceRefs: [{ source: 'openstreetmap', elementId: 'n123' }],
    }])
    renderForm({ buildingIndex })

    const buildingInput = screen.getByLabelText('Building or landmark') as HTMLInputElement
    await waitFor(() => {
      expect(buildingInput.value).toBe('Central Library')
    })
    expect(buildingInput.type).toBe('text')
    expect(screen.getByLabelText('Floor')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Details' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Accessibility note' })).toBeNull()

    await user.clear(buildingInput)
    await user.type(buildingInput, 'central')
    const buildingOption = await screen.findByRole('option', { name: /Central Library/ })
    await user.click(buildingOption)
    expect(buildingInput.value).toBe('Central Library')
  })

  it('focuses the visible floor field when its value is invalid', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()

    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.click(screen.getByRole('radio', { name: 'Other…' }))
    const otherFloorInput = screen.getByLabelText('Other floor number')
    await user.type(otherFloorInput, '1.5')

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(otherFloorInput)
      expect(screen.getByText('Enter a whole-number floor.', { selector: 'span' })).toBeTruthy()
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('sends a correction reason and the proposed approved-place fields', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ waypoint })

    expect(screen.getByText('Correction for')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Building and floor (optional)' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Details' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Accessibility note' })).toBeNull()
    expect(screen.queryByLabelText('Waypoint name')).toBeNull()
    await user.type(screen.getByLabelText('What needs correcting?'), 'The cooler has moved upstairs.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith({
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: 'The cooler has moved upstairs.',
      longitude: waypoint.coordinate.longitude,
      latitude: waypoint.coordinate.latitude,
      building: waypoint.building,
      floor: waypoint.floor,
    }, expect.any(AbortSignal))
  })

  it('recovers from a retryable submission failure and keeps the draft available', async () => {
    const user = userEvent.setup()
    const onPendingChange = vi.fn()
    const { props } = renderForm({
      onSubmit: vi.fn(async () => { throw new CommunityWaypointSubmissionError('network') }),
      onPendingChange,
    })

    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.type(screen.getByLabelText('Note for reviewers'), 'Beside the west entrance.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toMatch(/check your connection and try again/i))
    expect((screen.getByLabelText('Note for reviewers') as HTMLTextAreaElement).value)
      .toBe('Beside the west entrance.')
    expect(onPendingChange.mock.calls).toEqual([[true], [false]])
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onBack).toHaveBeenCalledOnce()
  })

  it('counts Unicode code points in the reviewer note', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()
    const note = '🧊'.repeat(1_001)

    fireEvent.change(screen.getByLabelText('Note for reviewers'), { target: { value: note } })
    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(screen.getByRole('alert').textContent).toMatch(/note within 1,000 characters/i)
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('keeps focus on an announced busy submit button and ignores repeated submits', async () => {
    const user = userEvent.setup()
    let resolveSubmission = (): void => undefined
    const onSubmit = vi.fn(async () => new Promise<void>((resolve) => { resolveSubmission = resolve }))
    renderForm({ onSubmit })
    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
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
    await user.click(screen.getByRole('radio', { name: 'Printing / photocopying' }))
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))
    await waitFor(() => expect(submittedSignals).toHaveLength(1))

    view.unmount()

    expect(submittedSignals[0]?.aborted).toBe(true)
  })
})
