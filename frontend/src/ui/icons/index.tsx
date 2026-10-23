import type { ComponentProps } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  ArrowLeft,
  Building2,
  BusFront,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  CircleDot,
  DoorOpen,
  EllipsisVertical,
  Footprints,
  Info,
  Map,
  MapPin,
  LocateFixed,
  Monitor,
  Navigation,
  Moon,
  Route,
  Search,
  Settings,
  Star,
  Sun,
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

export function RoomIcon(props: IconProps) {
  return renderDecorativeIcon(DoorOpen, props)
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

export function CheckIcon(props: IconProps) {
  return renderDecorativeIcon(Check, props)
}

export function CompassIcon(props: IconProps) {
  return renderDecorativeIcon(Compass, props)
}

export function CircleDotIcon(props: IconProps) {
  return renderDecorativeIcon(CircleDot, props)
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

export function MapPinIcon(props: IconProps) {
  return renderDecorativeIcon(MapPin, props)
}

export function MapIcon(props: IconProps) {
  return renderDecorativeIcon(Map, props)
}

export function NavigationIcon(props: IconProps) {
  return renderDecorativeIcon(Navigation, props)
}

export function RouteIcon(props: IconProps) {
  return renderDecorativeIcon(Route, props)
}

export function MoonIcon(props: IconProps) {
  return renderDecorativeIcon(Moon, props)
}

export function MonitorIcon(props: IconProps) {
  return renderDecorativeIcon(Monitor, props)
}

export function InfoIcon(props: IconProps) {
  return renderDecorativeIcon(Info, props)
}

export function SunIcon(props: IconProps) {
  return renderDecorativeIcon(Sun, props)
}

export function SearchIcon(props: IconProps) {
  return renderDecorativeIcon(Search, props)
}

export function SettingsIcon(props: IconProps) {
  return renderDecorativeIcon(Settings, props)
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
