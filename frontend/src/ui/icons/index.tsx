import type { ComponentProps } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Armchair,
  CakeSlice,
  Printer,
  Building2,
  BusFront,
  CircleAlert,
  Check,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Compass,
  Coffee,
  CircleDot,
  CupSoda,
  DoorOpen,
  Droplets,
  Download,
  EllipsisVertical,
  ExternalLink,
  FileText,
  Footprints,
  GripVertical,
  Info,
  ListFilter,
  Map,
  MapPin,
  MapPinPlus,
  LocateFixed,
  Monitor,
  MoreHorizontal,
  Navigation,
  Palette,
  Package,
  Plus,
  Popcorn,
  Moon,
  RotateCw,
  Route,
  Search,
  Settings,
  Star,
  Sun,
  Toilet,
  TreePine,
  Utensils,
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

export function ArrowUpRightIcon(props: IconProps) {
  return renderDecorativeIcon(ArrowUpRight, props)
}

export function ArrowLeftIcon(props: IconProps) {
  return renderDecorativeIcon(ArrowLeft, props)
}

export function ArmchairIcon(props: IconProps) {
  return renderDecorativeIcon(Armchair, props)
}

export function PrinterIcon(props: IconProps) {
  return renderDecorativeIcon(Printer, props)
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

export function AlertCircleIcon(props: IconProps) {
  return renderDecorativeIcon(CircleAlert, props)
}

export function CloudOffIcon(props: IconProps) {
  return renderDecorativeIcon(CloudOff, props)
}

export function CompassIcon(props: IconProps) {
  return renderDecorativeIcon(Compass, props)
}

export function CoffeeIcon(props: IconProps) {
  return renderDecorativeIcon(Coffee, props)
}

export function CupSodaIcon(props: IconProps) {
  return renderDecorativeIcon(CupSoda, props)
}

export function CakeSliceIcon(props: IconProps) {
  return renderDecorativeIcon(CakeSlice, props)
}

export function DropletsIcon(props: IconProps) {
  return renderDecorativeIcon(Droplets, props)
}

export function PackageIcon(props: IconProps) {
  return renderDecorativeIcon(Package, props)
}

export function PopcornIcon(props: IconProps) {
  return renderDecorativeIcon(Popcorn, props)
}

export function CircleDotIcon(props: IconProps) {
  return renderDecorativeIcon(CircleDot, props)
}

export function EllipsisVerticalIcon(props: IconProps) {
  return renderDecorativeIcon(EllipsisVertical, props)
}

export function ExternalLinkIcon(props: IconProps) {
  return renderDecorativeIcon(ExternalLink, props)
}

export function GripVerticalIcon(props: IconProps) {
  return renderDecorativeIcon(GripVertical, props)
}

export function FootprintsIcon(props: IconProps) {
  return renderDecorativeIcon(Footprints, props)
}

export function LocateIcon(props: IconProps) {
  return renderDecorativeIcon(LocateFixed, props)
}

export function ListFilterIcon(props: IconProps) {
  return renderDecorativeIcon(ListFilter, props)
}

export function RefreshIcon(props: IconProps) {
  return renderDecorativeIcon(RotateCw, props)
}

export function MapPinIcon(props: IconProps) {
  return renderDecorativeIcon(MapPin, props)
}

/** A pin with a plus beside it: contributing a new location rather than showing one. */
export function MapPinPlusIcon(props: IconProps) {
  return renderDecorativeIcon(MapPinPlus, props)
}

export function MoreHorizontalIcon(props: IconProps) {
  return renderDecorativeIcon(MoreHorizontal, props)
}

export function MapIcon(props: IconProps) {
  return renderDecorativeIcon(Map, props)
}

export function NavigationIcon(props: IconProps) {
  return renderDecorativeIcon(Navigation, props)
}

export function PaletteIcon(props: IconProps) {
  return renderDecorativeIcon(Palette, props)
}
export function PlusIcon(props: IconProps) {
  return renderDecorativeIcon(Plus, props)
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

export function ToiletIcon(props: IconProps) {
  return renderDecorativeIcon(Toilet, props)
}

export function UtensilsIcon(props: IconProps) {
  return renderDecorativeIcon(Utensils, props)
}

export function TreePineIcon(props: IconProps) {
  return renderDecorativeIcon(TreePine, props)
}

export function SearchIcon(props: IconProps) {
  return renderDecorativeIcon(Search, props)
}

export function SettingsIcon(props: IconProps) {
  return renderDecorativeIcon(Settings, props)
}

export function FileTextIcon(props: IconProps) {
  return renderDecorativeIcon(FileText, props)
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

export function DownloadIcon(props: IconProps) {
  return renderDecorativeIcon(Download, props)
}
