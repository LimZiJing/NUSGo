import { useEffect, useState, type ReactNode } from 'react'
import { getRouteContrastTextColor } from '../../domain/transit/route-color'
import { Button, IconButton, type ButtonVariant, type ControlSize, type IconButtonVariant } from '../button'
import { Chip } from '../chip'
import { CloseIcon, NavigationIcon, SearchIcon } from '../icons'
import { MenuItem } from '../menu-item'
import { Pill } from '../pill'
import { Select } from '../select'
import './gallery.css'

const STATES = ['default', 'hover', 'active', 'focus-visible', 'disabled', 'selected'] as const
type SampleState = (typeof STATES)[number]

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost']
const ICON_VARIANTS: readonly IconButtonVariant[] = [...VARIANTS, 'plain']
const SIZES: readonly ControlSize[] = ['sm', 'lg']
/* The app theme type covers Light and Dark only; the gallery sets data-theme directly to review
   every palette in the shared theme stylesheets. */
const THEMES = ['light', 'dark', 'matcha', 'sakura', 'nus'] as const
type GalleryTheme = (typeof THEMES)[number]
const THEME_NAMES: Readonly<Record<GalleryTheme, string>> = {
  light: 'Light',
  dark: 'Dark',
  matcha: 'Matcha',
  sakura: 'Sakura',
  nus: 'NUS',
}
const SAMPLE_ROUTE_COLOUR = '#fb0101'

const noop = () => {}

const SELECT_SAMPLE_OPTIONS = [
  { value: '', label: 'All buildings' },
  { value: 'helix-a', label: 'Blocks 15-17' },
  { value: 'helix-b', label: 'Blocks 18-19, with a longer label that wraps inside the open list' },
]

/* Select is controlled, so the sample keeps its own value to stay usable in the gallery. */
function SelectSample() {
  const [value, setValue] = useState('')
  return <Select label="Building" value={value} options={SELECT_SAMPLE_OPTIONS} onChange={setValue} />
}

/* Hover, active and focus-visible cannot be real states for every sample at once, so the
   gallery CSS forces them from this data-state attribute. Disabled and selected are real. */
function Sample({ state, children }: { readonly state: SampleState, readonly children: ReactNode }) {
  return <div className="gallery-sample" data-state={state}>{children}</div>
}

function StateGrid({ title, rows }: {
  readonly title: string
  readonly rows: readonly { readonly label: string, readonly render: (state: SampleState) => ReactNode }[]
}) {
  return (
    <section className="gallery-section" aria-label={title}>
      <h2>{title}</h2>
      <div className="gallery-grid">
        <div className="gallery-row">
          <span />
          {STATES.map((state) => <span key={state} className="gallery-heading">{state}</span>)}
        </div>
        {rows.map((row) => (
          <div key={row.label} className="gallery-row">
            <span className="gallery-heading">{row.label}</span>
            {STATES.map((state) => (
              <Sample key={state} state={state}>{row.render(state)}</Sample>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

const variantSizeRows = <Variant extends IconButtonVariant = ButtonVariant>(
  render: (variant: Variant, size: ControlSize, state: SampleState) => ReactNode,
  variants: readonly Variant[] = VARIANTS as readonly Variant[],
) =>
  variants.flatMap((variant) => SIZES.map((size) => ({
    label: `${variant} / ${size}`,
    render: (state: SampleState) => render(variant, size, state),
  })))

export function GalleryPanel({ theme }: { readonly theme: GalleryTheme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <main className="gallery" aria-label={`${theme} theme controls`}>
      <h1>{THEME_NAMES[theme]}</h1>
      <StateGrid
        title="Button"
        rows={variantSizeRows((variant, size, state) => (
          <Button
            label="Navigate"
            icon={<NavigationIcon />}
            variant={variant}
            size={size}
            disabled={state === 'disabled'}
            pressed={state === 'selected' ? true : undefined}
            onClick={noop}
          />
        ))}
      />
      <StateGrid
        title="IconButton"
        rows={variantSizeRows((variant, size, state) => (
          <IconButton
            label="Search"
            icon={<SearchIcon />}
            variant={variant}
            size={size}
            disabled={state === 'disabled'}
            pressed={state === 'selected' ? true : undefined}
            onClick={noop}
          />
        ), ICON_VARIANTS)}
      />
      <StateGrid
        title="MenuItem"
        rows={[{
          label: 'menu item',
          render: (state) => (
            <MenuItem label="Clear all" icon={<CloseIcon />} disabled={state === 'disabled'} onClick={noop} />
          ),
        }]}
      />
      <StateGrid
        title="Chip"
        rows={[
          ...SIZES.map((size) => ({
            label: `accent / ${size}`,
            render: (state: SampleState) => (
              <Chip
                label="Pending"
                size={size}
                disabled={state === 'disabled'}
                pressed={state === 'selected' ? true : state === 'default' ? false : undefined}
                onClick={noop}
              />
            ),
          })),
          ...SIZES.map((size) => ({
            label: `route colour / ${size}`,
            render: (state: SampleState) => (
              <Chip
                label="A1"
                size={size}
                tone={{ fill: SAMPLE_ROUTE_COLOUR, text: getRouteContrastTextColor(SAMPLE_ROUTE_COLOUR) }}
                disabled={state === 'disabled'}
                pressed={state === 'selected' ? true : state === 'default' ? false : undefined}
                onClick={noop}
              />
            ),
          })),
        ]}
      />
      <section className="gallery-section" aria-label="Pill">
        <h2>Pill</h2>
        <div className="gallery-pills">
          <Pill label="Neutral" tone="neutral" />
          <Pill label="Success" tone="success" />
          <Pill label="Live" tone="success" leadingDot />
        </div>
      </section>
      <section className="gallery-section" aria-label="Select">
        <h2>Select</h2>
        <div className="gallery-select">
          <SelectSample />
        </div>
      </section>
    </main>
  )
}

function GalleryPage() {
  return (
    <main className="gallery-page">
      <h1>Controls gallery</h1>
      <p>Development only. Each panel is a separate page so it uses the real theme mechanism.</p>
      <div className="gallery-frames">
        {THEMES.map((theme) => (
          <iframe
            key={theme}
            className="gallery-frame"
            title={`${theme} theme`}
            src={`${import.meta.env.BASE_URL}?gallery&frame=${theme}`}
          />
        ))}
      </div>
    </main>
  )
}

export function Gallery() {
  const frame = new URLSearchParams(window.location.search).get('frame')
  const theme = THEMES.find((candidate) => candidate === frame)
  return theme ? <GalleryPanel theme={theme} /> : <GalleryPage />
}
