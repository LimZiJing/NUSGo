import type { ThemePreference } from '../../ui/theme'
import { AppearanceSection } from './components/appearance-section'
import { FavouritesSection, type FavoriteStopSummary } from './components/favourites-section'
import { AboutSection } from './components/about-section'
import { SettingsDisclosure } from './components/settings-disclosure'
import type { BuildingCatalogueSource } from '@nusgo/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@nusgo/shared/transit/types'
import './styles/settings-content.css'

interface SettingsContentProps {
  readonly themePreference: ThemePreference
  readonly onThemePreferenceChange: (preference: ThemePreference) => void
  readonly favoriteStops: readonly FavoriteStopSummary[]
  readonly onRemoveFavorite: (stopId: string) => void
  readonly onClearFavorites: () => void
  readonly transitMetadata: TransitNetworkMetadata | null
  readonly buildingSource: BuildingCatalogueSource | null
  readonly dataVersion: string
}

export function SettingsContent({
  themePreference,
  onThemePreferenceChange,
  favoriteStops,
  onRemoveFavorite,
  onClearFavorites,
  transitMetadata,
  buildingSource,
  dataVersion,
}: SettingsContentProps) {
  return (
    <div className="settings-content">
      <SettingsDisclosure title="Appearance" defaultOpen>
        <AppearanceSection
          preference={themePreference}
          onChange={onThemePreferenceChange}
        />
      </SettingsDisclosure>
      <SettingsDisclosure title="Favourites" trailing={`${favoriteStops.length} saved`}>
        <FavouritesSection
          stops={favoriteStops}
          onRemove={onRemoveFavorite}
          onClear={onClearFavorites}
        />
      </SettingsDisclosure>
      <SettingsDisclosure title="About">
        <AboutSection
          dataVersion={dataVersion}
          transitMetadata={transitMetadata}
          buildingSource={buildingSource}
        />
      </SettingsDisclosure>
    </div>
  )
}
