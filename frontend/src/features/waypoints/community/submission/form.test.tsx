// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import type { CommunityWaypointSubmission } from '@nusgo/shared/waypoints/community-submission'
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

const printingWaypoint: CommunityWaypoint = {
  ...waypoint,
  id: 'cw-printing-001',
  displayLabel: 'Printing / photocopying at UTown',
  category: 'printing',
  grayscalePriceCentsPerPage: 10,
}

const toiletWaypoint: CommunityWaypoint = {
  ...waypoint,
  id: 'cw-toilet-001',
  displayLabel: 'Toilet at UTown',
  category: 'toilet',
  bidet: true,
}

function renderForm(overrides: Partial<Parameters<typeof CommunityWaypointSubmissionForm>[0]> = {}) {
  /* onSubmit is returned separately as a typed mock: reading it back off `props`
     widens it to the plain callback type, which hides `.mock` from the compiler. */
  const onSubmit = vi.fn<
    (submission: CommunityWaypointSubmission, signal: AbortSignal) => Promise<void>
  >(async () => undefined)
  const props = {
    waypoint: null,
    coordinate,
    locationStatus: 'ready' as const,
    locationAccuracy: 12,
    buildingIndex: null,
    venues: null,
    onAdjustLocation: vi.fn(),
    onSubmit,
    onBack: vi.fn(),
    ...overrides,
  }
  const view = render(<CommunityWaypointSubmissionForm {...props} />)
  return { props, onSubmit, ...view }
}

describe('CommunityWaypointSubmissionForm', () => {
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

  it('keeps edited details when selecting the Community Waypoint own category', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ waypoint: printingWaypoint })
    const price = screen.getByLabelText('Black and white price per page in Singapore dollars') as HTMLInputElement

    fireEvent.change(price, { target: { value: '0.99' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'printing')
    expect(price.value).toBe('0.99')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), '')
    expect(price.value).toBe('0.99')

    await user.type(screen.getByLabelText('What needs correcting?'), 'The price has changed.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'printing',
      suggestedDetails: expect.objectContaining({ grayscalePriceCentsPerPage: 99 }),
    }), expect.any(AbortSignal))
  })

  it('clears the previous category details when switching from printing to vending', async () => {
    const user = userEvent.setup()
    const { props, onSubmit } = renderForm({ waypoint: printingWaypoint })

    fireEvent.change(screen.getByLabelText('Black and white price per page in Singapore dollars'), {
      target: { value: '0.99' },
    })
    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'vending_machine')

    expect(screen.queryByLabelText('Black and white price per page in Singapore dollars')).toBeNull()
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    await user.type(screen.getByLabelText('What needs correcting?'), 'This is a vending machine.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'vending_machine',
    }), expect.any(AbortSignal))
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('suggestedDetails')
  })

  it('includes the effective category when a correction submits details without a category selection', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ waypoint: printingWaypoint })

    fireEvent.change(screen.getByLabelText('Black and white price per page in Singapore dollars'), {
      target: { value: '0.25' },
    })
    await user.type(screen.getByLabelText('What needs correcting?'), 'The price has changed.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'correction',
      category: 'printing',
      suggestedDetails: expect.objectContaining({
        category: 'printing',
        grayscalePriceCentsPerPage: 25,
      }),
    }), expect.any(AbortSignal))
  })

  it('omits empty touched details and an unproposed category from a correction', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({
      waypoint: { ...printingWaypoint, grayscalePriceCentsPerPage: undefined },
    })

    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.type(screen.getByLabelText('What needs correcting?'), 'The printer has moved.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('suggestedDetails')
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('category')
  })

  it('keeps a deliberate complete clear so the reviewer sees every field as cleared', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({
      waypoint: {
        ...printingWaypoint,
        services: ['print'],
        colour: true,
        grayscalePriceCentsPerPage: 10,
        colourPriceCentsPerPage: 50,
      },
    })

    // Remove every published fact: untick Print, answer Not sure, blank the price.
    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(screen.getByRole('button', { name: 'Not sure' }))
    fireEvent.change(screen.getByLabelText('Black and white price per page in Singapore dollars'), {
      target: { value: '' },
    })
    await user.type(screen.getByLabelText('What needs correcting?'), 'This printer was removed.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    // It must not vanish as noise: an all-empty correction is the removal case.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      suggestedDetails: expect.objectContaining({
        category: 'printing',
        services: [],
        colour: null,
      }),
    }), expect.any(AbortSignal))
  })

  it('keeps a closed More details section closed when an unrelated error clears', async () => {
    const user = userEvent.setup()
    renderForm({ waypoint: printingWaypoint })

    // A details error plus an empty required field: one submit produces both errors.
    fireEvent.change(screen.getByLabelText('Black and white price per page in Singapore dollars'), {
      target: { value: '0.999' },
    })
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    const disclosure = screen.getByText('More details').closest('details')
    expect(disclosure?.open).toBe(true)

    // The user reads the error, then closes the section.
    await user.click(screen.getByText('More details'))
    expect(disclosure?.open).toBe(false)

    // Typing in the unrelated correction field clears only that error. The section
    // must not spring back open.
    await user.type(screen.getByLabelText('What needs correcting?'), 'x')
    expect(disclosure?.open).toBe(false)
  })

  it('clears stale details errors from the live region when changing category', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ waypoint: printingWaypoint })

    fireEvent.change(screen.getByLabelText('Black and white price per page in Singapore dollars'), {
      target: { value: '0.999' },
    })
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(screen.getByRole('alert').textContent).toContain('Enter a price with up to 2 decimal places.')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'water_cooler')

    expect(screen.getByRole('alert').textContent).not.toContain('Enter a price')
    expect(screen.getByRole('alert').textContent).toContain('Explain what needs correcting.')
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it.each([true, false])('opens collapsed details and focuses an invalid price (verified details: %s)', async (verified) => {
    const user = userEvent.setup()
    const { props } = renderForm({
      waypoint: verified ? printingWaypoint : { ...printingWaypoint, grayscalePriceCentsPerPage: undefined },
    })
    const disclosure = screen.getByText('More details').closest('details') as HTMLDetailsElement
    if (!disclosure.open) await user.click(screen.getByText('More details'))
    const price = screen.getByLabelText('Black and white price per page in Singapore dollars')
    fireEvent.change(price, { target: { value: '0.999' } })
    await user.type(screen.getByLabelText('What needs correcting?'), 'The price has changed.')
    await user.click(screen.getByText('More details'))
    expect(disclosure.open).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    await waitFor(() => {
      expect(disclosure.open).toBe(true)
      expect(document.activeElement).toBe(price)
    })
    expect(price.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Enter a price with up to 2 decimal places.', { selector: 'span' })).toBeTruthy()
    expect(props.onSubmit).not.toHaveBeenCalled()

    // Another failed submit must also reopen the disclosure if the user closes it again.
    await user.click(screen.getByText('More details'))
    expect(disclosure.open).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(disclosure.open).toBe(true)
    expect(document.activeElement).toBe(price)

    fireEvent.change(price, { target: { value: '0.25' } })
    await user.click(screen.getByText('More details'))
    expect(disclosure.open).toBe(false)
    await user.type(screen.getByLabelText('What needs correcting?'), ' Updated.')
    expect(disclosure.open).toBe(false)
    await user.click(screen.getByText('More details'))
    expect(disclosure.open).toBe(true)
  })

  it('leaves the colour question unanswered until the user answers it', async () => {
    const user = userEvent.setup()
    renderForm({ waypoint: printingWaypoint })

    /* A suggestion nobody has answered must not look answered. Pressing "Not sure" by
       default would put a fact on screen that the submitter never chose. */
    for (const name of ['Yes', 'No', 'Not sure']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed'), name).toBe('false')
    }

    await user.click(screen.getByRole('button', { name: 'Not sure' }))
    expect(screen.getByRole('button', { name: 'Not sure' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('renders the colour price only once colour printing is answered Yes', async () => {
    const user = userEvent.setup()
    renderForm({ waypoint: printingWaypoint })

    // Started from a record with no colour answer, so the price does not exist yet.
    expect(screen.queryByLabelText('Colour price per page in Singapore dollars')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByLabelText('Colour price per page in Singapore dollars')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByLabelText('Colour price per page in Singapore dollars')).toBeNull()
  })

  it('treats Not sure as no colour answer, even when a published answer exists', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ waypoint: { ...printingWaypoint, colour: true } })

    // The correction pre-fills the published answer, so Yes starts pressed.
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Not sure' }))
    await user.type(screen.getByLabelText('What needs correcting?'), 'I could not tell.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    /* null means "no answer proposed", which is different from false ("no colour printing").
       A keyboard user must be able to reach this state: a chosen radio cannot be deselected. */
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      suggestedDetails: expect.objectContaining({ category: 'printing', colour: null }),
    }), expect.any(AbortSignal))
  })

  it('leaves bidet unanswered until chosen and sends a Toilet Yes or No answer', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByRole('radio', { name: 'Toilet' }))
    await user.click(screen.getByText('More details'))
    for (const name of ['Yes', 'No', 'Not sure']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed'), name).toBe('false')
    }

    await user.click(screen.getByRole('button', { name: 'No' }))
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: false },
    }), expect.any(AbortSignal))
  })

  it('prefills the published bidet answer and lets a correction clear it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ waypoint: toiletWaypoint })

    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Not sure' }))
    await user.type(screen.getByLabelText('What needs correcting?'), 'I could not confirm it.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'correction',
      category: 'toilet',
      suggestedDetails: { category: 'toilet', bidet: null },
    }), expect.any(AbortSignal))
  })

  it('restores the published Toilet answer after switching categories', async () => {
    const user = userEvent.setup()
    renderForm({ waypoint: toiletWaypoint })

    await user.click(screen.getByRole('button', { name: 'No' }))
    const category = screen.getByRole('combobox', { name: 'Category' })
    await user.selectOptions(category, 'printing')
    expect(screen.queryByText('Bidet available')).toBeNull()
    await user.selectOptions(category, 'toilet')

    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('counts filled answers in the collapsed disclosure summary', async () => {
    const user = userEvent.setup()
    renderForm({ waypoint: printingWaypoint })

    const summary = screen.getByText('More details').closest('summary')
    // One published price already counts, so the section says it holds something.
    expect(summary?.textContent).toContain('1 added')

    await user.click(screen.getByRole('button', { name: 'Photocopy' }))
    expect(summary?.textContent).toContain('2 added')

    await user.click(screen.getByRole('button', { name: 'Photocopy' }))
    expect(summary?.textContent).toContain('1 added')
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

  it('aborts a pending request when the form unmounts', async () => {    const user = userEvent.setup()
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
