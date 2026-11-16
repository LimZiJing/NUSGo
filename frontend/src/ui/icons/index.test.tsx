import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ArrowDownUpIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArmchairIcon,
  PrinterIcon,
  BuildingIcon,
  BusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CloseIcon,
  CompassIcon,
  CoffeeIcon,
  CookingPotIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  CupSodaIcon,
  DropletsIcon,
  FavoriteIcon,
  FlameIcon,
  FootprintsIcon,
  LocateIcon,
  MapPinIcon,
  MicrowaveIcon,
  MoonIcon,
  NavigationIcon,
  RefrigeratorIcon,
  RoomIcon,
  RouteIcon,
  SearchIcon,
  ShoppingBagIcon,
  SunIcon,
  TreePineIcon,
  ToiletIcon,
} from './index'

const icons = [
  ArrowDownUpIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArmchairIcon,
  PrinterIcon,
  BuildingIcon,
  BusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CloseIcon,
  CompassIcon,
  CoffeeIcon,
  CookingPotIcon,
  CopyIcon,
  CupSodaIcon,
  DropletsIcon,
  EllipsisVerticalIcon,
  FlameIcon,
  FootprintsIcon,
  LocateIcon,
  MapPinIcon,
  MicrowaveIcon,
  MoonIcon,
  NavigationIcon,
  RefrigeratorIcon,
  RoomIcon,
  RouteIcon,
  SearchIcon,
  ShoppingBagIcon,
  SunIcon,
  TreePineIcon,
  ToiletIcon,
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
