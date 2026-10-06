import type { ComponentProps } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  ArrowLeft,
  Building2,
  BusFront,
  ChevronDown,
  ChevronRight,
  Compass,
  EllipsisVertical,
  Footprints,
  LocateFixed,
  Navigation,
  Route,
  Search,
  Star,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type IconProps = ComponentProps<typeof Search>

function renderDecorativeIcon(Icon: LucideIcon, props: IconProps) {
  return <Icon aria-hidden="true" focusable="false" {...props} />
}

export function ArrowDownUpIcon(props: IconProps) {
  return renderDecorativeIcon(ArrowDownUp, props)
}

export function ArrowRightIcon(props: IconProps) {
  return renderDecorativeIcon(ArrowRight, props)
}

export function ArrowLeftIcon(props: IconProps) {
  return renderDecorativeIcon(ArrowLeft, props)
}

export function BuildingIcon(props: IconProps) {
  return renderDecorativeIcon(Building2, props)
}

export function BusIcon(props: IconProps) {
  return renderDecorativeIcon(BusFront, props)
}

export function ChevronDownIcon(props: IconProps) {
  return renderDecorativeIcon(ChevronDown, props)
}

export function ChevronRightIcon(props: IconProps) {
  return renderDecorativeIcon(ChevronRight, props)
}

export function CompassIcon(props: IconProps) {
  return renderDecorativeIcon(Compass, props)
}

export function EllipsisVerticalIcon(props: IconProps) {
  return renderDecorativeIcon(EllipsisVertical, props)
}

export function FootprintsIcon(props: IconProps) {
  return renderDecorativeIcon(Footprints, props)
}

export function LocateIcon(props: IconProps) {
  return renderDecorativeIcon(LocateFixed, props)
}

export function NavigationIcon(props: IconProps) {
  return renderDecorativeIcon(Navigation, props)
}

export function RouteIcon(props: IconProps) {
  return renderDecorativeIcon(Route, props)
}

export function SearchIcon(props: IconProps) {
  return renderDecorativeIcon(Search, props)
}

export interface FavoriteIconProps extends IconProps {
  readonly filled: boolean
}

export function FavoriteIcon({ filled, ...props }: FavoriteIconProps) {
  return renderDecorativeIcon(Star, {
    ...props,
    fill: filled ? 'currentColor' : 'none',
    strokeWidth: 1.7,
  })
}

export function CloseIcon(props: IconProps) {
  return renderDecorativeIcon(X, props)
}
