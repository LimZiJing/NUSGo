// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createMapPin, MAP_PIN_ANCHOR } from './map-pin'

afterEach(() => {
  document.body.replaceChildren()
})

function teardropPath(element: HTMLElement): string | null {
  return element.querySelector('svg.map-pin-teardrop path')?.getAttribute('d') ?? null
}

describe('shared map pin family', () => {
  it('draws the same teardrop and anchors the tip on the coordinate for every variant', () => {
    const location = createMapPin({ variant: 'location', glyph: 'map-pin' })
    const waypoint = createMapPin({ variant: 'waypoint', interactive: true })
    const placement = createMapPin({ variant: 'placement', glyph: 'crosshair' })
    const destination = createMapPin({ variant: 'destination', label: 'Destination: Two' })

    const paths = [location, waypoint, placement, destination]
      .map(({ element }) => teardropPath(element))

    expect(paths[0]).not.toBeNull()
    expect(new Set(paths).size).toBe(1)
    expect(MAP_PIN_ANCHOR).toBe('bottom')
    for (const { element } of [location, waypoint, placement, destination]) {
      expect(element.dataset.variant).toBeDefined()
      expect(element.querySelector('.map-pin-teardrop')?.getAttribute('viewBox')).toBe('0 0 24 32')
    }
  })

  it('keeps the destination pin presentational while still naming its endpoint', () => {
    // The destination is a member of the family, so it keeps the same teardrop and bottom anchor,
    // but it opens a popup rather than being an interactive button.
    const destination = createMapPin({ variant: 'destination', label: 'Destination: Central Library' })

    expect(destination.element.tagName).toBe('DIV')
    expect(destination.element.dataset.variant).toBe('destination')
    expect(destination.element.getAttribute('role')).toBe('img')
    expect(destination.element.getAttribute('aria-label')).toBe('Destination: Central Library')
    expect(destination.glyph.querySelector('span')).toBeNull()
  })

  it('gives waypoint pins a labelled button and placement pins no accessible name', () => {
    const waypoint = createMapPin({
      variant: 'waypoint',
      interactive: true,
      label: 'Open Quiet bench, Rest spot details. General icon, Blue marker.',
    })
    const placement = createMapPin({ variant: 'placement', glyph: 'crosshair' })
    const location = createMapPin({ variant: 'location', glyph: 'map-pin', label: 'Venue One' })

    expect(waypoint.element.tagName).toBe('BUTTON')
    expect((waypoint.element as HTMLButtonElement).type).toBe('button')
    expect(waypoint.element.getAttribute('aria-label'))
      .toBe('Open Quiet bench, Rest spot details. General icon, Blue marker.')

    // The draggable pin is decorative: the map and the overlay own the accessible description.
    expect(placement.element.getAttribute('aria-hidden')).toBe('true')
    expect(placement.element.getAttribute('aria-label')).toBeNull()

    expect(location.element.getAttribute('role')).toBe('img')
    expect(location.element.getAttribute('aria-label')).toBe('Venue One')
  })

  it('marks only explicitly selected pins with the selection cue', () => {
    const unselected = createMapPin({ variant: 'waypoint', interactive: true, label: 'Open A' })
    const selected = createMapPin({ variant: 'waypoint', interactive: true, label: 'Open A', selected: true })

    expect(unselected.element.dataset.selected).toBeUndefined()
    expect(selected.element.dataset.selected).toBe('true')
  })

  it('puts a crosshair inside the placement pin and the shared icon inside a location pin', () => {
    const placement = createMapPin({ variant: 'placement', glyph: 'crosshair' })
    const crosshair = placement.glyph.querySelector('svg.map-pin-glyph-icon')!

    expect(crosshair.classList.contains('lucide-crosshair')).toBe(true)
    expect(crosshair.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(crosshair.querySelector('circle')?.getAttribute('r')).toBe('10')
    expect(crosshair.querySelectorAll('line')).toHaveLength(4)

    const location = createMapPin({ variant: 'location', glyph: 'map-pin' })
    expect(location.glyph.querySelector('svg.lucide-map-pin')).not.toBeNull()

    const waypoint = createMapPin({ variant: 'waypoint', interactive: true, label: 'Open A' })
    expect(waypoint.glyph.childElementCount).toBe(0)
  })
})
