import type { ThemePreference } from '../../ui/theme'
import { THEME_CATALOG } from '../../ui/themes/catalog'
import type { MinuteFormat } from '../../domain/trip/minute-format'
import { AppearanceSection } from './components/appearance-section'
import { FavouritesSection, type FavoriteStopSummary } from './components/favourites-section'
import { AboutSection } from './components/about-section'
import { SettingsDisclosure } from './components/settings-disclosure'
import { FavoriteIcon, InfoIcon, PaletteIcon } from '../../ui/icons'
import type { BuildingCatalogueSource } from '@nusgo/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@nusgo/shared/transit/types'
import './styles/settings-content.css'

interface SettingsContentProps {
  readonly themePreference: ThemePreference
  readonly onThemePreferenceChange: (preference: ThemePreference) => void
  readonly minuteFormat: MinuteFormat
  readonly onMinuteFormatChange: (format: MinuteFormat) => void
  readonly favoriteStops: readonly FavoriteStopSummary[]
  readonly onMoveFavorite: (stopId: string, neighborId: string) => void
  readonly onRemoveFavorite: (stopId: string) => void
  readonly onClearFavorites: () => void
  readonly transitMetadata: TransitNetworkMetadata | null
  readonly buildingSource: BuildingCatalogueSource | null
  readonly dataVersion: string
}

export function SettingsContent({
  themePreference,
  onThemePreferenceChange,
  minuteFormat,
  onMinuteFormatChange,
  favoriteStops,
  onMoveFavorite,
  onRemoveFavorite,
  onClearFavorites,
  transitMetadata,
  buildingSource,
  dataVersion,
}: SettingsContentProps) {
  const appearanceSummary = themePreference === 'system'
    ? 'System'
    : THEME_CATALOG.find(({ id }) => id === themePreference)?.summary ?? themePreference

  return (
    <div className="settings-content">
      <SettingsDisclosure
        title="Appearance"
        icon={<PaletteIcon />}
        subtitle={appearanceSummary}
      >
        <AppearanceSection
          preference={themePreference}
          onChange={onThemePreferenceChange}
          minuteFormat={minuteFormat}
          onMinuteFormatChange={onMinuteFormatChange}
        />
      </SettingsDisclosure>
      <SettingsDisclosure
        title="Favourites"
        icon={<FavoriteIcon filled />}
        subtitle={`${favoriteStops.length} saved ${favoriteStops.length === 1 ? 'bus stop' : 'bus stops'}`}
      >
        <FavouritesSection
          stops={favoriteStops}
          onMoveFavorite={onMoveFavorite}
          onRemoveFavorite={onRemoveFavorite}
          onClearFavorites={onClearFavorites}
        />
      </SettingsDisclosure>
      <SettingsDisclosure
        title="About"
        icon={<InfoIcon />}
        subtitle="Sources, version, feedback"
      >
        <AboutSection
          dataVersion={dataVersion}
          transitMetadata={transitMetadata}
          buildingSource={buildingSource}
        />
      </SettingsDisclosure>
    </div>
  )
}
