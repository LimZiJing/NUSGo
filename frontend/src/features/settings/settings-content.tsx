import type { ThemePreference } from '../../ui/theme'
import { AppearanceSection } from './components/appearance-section'
import { LocationPrivacySection } from './components/location-privacy-section'
import { FavouritesSection, type FavoriteStopSummary } from './components/favourites-section'
import { AboutSection } from './components/about-section'
import type { LocationPermissionState } from '../../domain/location/types'
import type { BuildingCatalogueSource } from '@navus/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@navus/shared/transit/types'
import './styles/settings-content.css'

interface SettingsContentProps {
  readonly themePreference: ThemePreference
  readonly onThemePreferenceChange: (preference: ThemePreference) => void
  readonly locationPermission: LocationPermissionState | 'checking'
  readonly hasLocationActivity: boolean
  readonly onClearLocation: () => void
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
  locationPermission,
  hasLocationActivity,
  onClearLocation,
  favoriteStops,
  onRemoveFavorite,
  onClearFavorites,
  transitMetadata,
  buildingSource,
  dataVersion,
}: SettingsContentProps) {
  return (
    <div className="settings-content">
      <AppearanceSection
        preference={themePreference}
        onChange={onThemePreferenceChange}
      />
      <LocationPrivacySection
        permissionStatus={locationPermission}
        hasLocationActivity={hasLocationActivity}
        onClearLocation={onClearLocation}
      />
      <FavouritesSection
        stops={favoriteStops}
        onRemove={onRemoveFavorite}
        onClear={onClearFavorites}
      />
      <AboutSection
        dataVersion={dataVersion}
        transitMetadata={transitMetadata}
        buildingSource={buildingSource}
      />
    </div>
  )
}
