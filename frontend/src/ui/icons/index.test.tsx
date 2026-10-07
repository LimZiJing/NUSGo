import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ArrowDownUpIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  BuildingIcon,
  BusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CloseIcon,
  CompassIcon,
  EllipsisVerticalIcon,
  FavoriteIcon,
  FootprintsIcon,
  LocateIcon,
  MapPinIcon,
  NavigationIcon,
  RouteIcon,
  SearchIcon,
} from './index'

const icons = [
  ArrowDownUpIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  BuildingIcon,
  BusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CloseIcon,
  CompassIcon,
  EllipsisVerticalIcon,
  FootprintsIcon,
  LocateIcon,
  MapPinIcon,
  NavigationIcon,
  RouteIcon,
  SearchIcon,
]

describe('centralized UI icons', () => {
  it('renders decorative icons with consistent accessibility defaults', () => {
    for (const Icon of icons) {
      const markup = renderToStaticMarkup(<Icon className="test-icon" />)

      expect(markup).toContain('aria-hidden="true"')
      expect(markup).toContain('focusable="false"')
      expect(markup).toMatch(/class="[^"]*test-icon/)
    }
  })

  it('preserves the filled and unfilled favourite states', () => {
    const filled = renderToStaticMarkup(<FavoriteIcon filled />)
    const unfilled = renderToStaticMarkup(<FavoriteIcon filled={false} />)

    expect(filled).toContain('fill="currentColor"')
    expect(unfilled).toContain('fill="none"')
  })
})
