import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { ThemePreference } from '../../ui/theme'
import type { MinuteFormat } from '../../domain/trip/minute-format'
import { AppearanceSection } from './components/appearance-section'
import { FavouritesSection, type FavoriteStopSummary } from './components/favourites-section'
import { AboutSection } from './components/about-section'
import { PushNotificationsSection } from './components/push-notifications-section'
import { WaypointsSection } from './components/waypoints-section'
import { usePushNotifications } from './use-push-notifications'
import { BellIcon, ChevronRightIcon, FavoriteIcon, InfoIcon, MapPinIcon, PaletteIcon } from '../../ui/icons'
import { SETTINGS_SECTION_TITLES, type SettingsSectionId } from './settings-section'
import type { PushNotificationService } from '../../domain/push/push-notifications'
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
  readonly communityWaypointDownloadUrl: string
  readonly dataVersion: string
  /** Supplied by app composition so this feature never imports an infrastructure adapter. */
  readonly pushNotifications: PushNotificationService
  readonly activeSection: SettingsSectionId | null
  readonly onActiveSectionChange: (section: SettingsSectionId | null) => void
}

interface SettingsSectionConfig {
  readonly id: SettingsSectionId
  readonly label: string
  readonly searchTerms: string
  readonly icon: ReactNode
}

const SETTINGS_SECTIONS: readonly SettingsSectionConfig[] = [
  {
    id: 'appearance',
    label: SETTINGS_SECTION_TITLES.appearance,
    searchTerms: 'theme themes palette palettes system light dark nus matcha sakura rainroom minute minutes format',
    icon: <PaletteIcon />,
  },
  {
    id: 'notifications',
    label: SETTINGS_SECTION_TITLES.notifications,
    searchTerms: 'notification notifications push alert alerts delay delays service announcement announcements bell',
    icon: <BellIcon />,
  },
  {
    id: 'favourites',
    label: SETTINGS_SECTION_TITLES.favourites,
    searchTerms: 'favourite favourites favorite favorites saved bus stops reorder reordering remove clear all',
    icon: <FavoriteIcon filled />,
  },
  {
    id: 'about',
    label: SETTINGS_SECTION_TITLES.about,
    searchTerms: 'data source sources version feedback attribution credits',
    icon: <InfoIcon />,
  },
  {
    id: 'waypoints',
    label: SETTINGS_SECTION_TITLES.waypoints,
    searchTerms: 'waypoint waypoints community download geojson approved',
    icon: <MapPinIcon />,
  },
]

const SEARCH_RESULTS_ID = 'settings-search-results'

function matchesSettingsSection(section: SettingsSectionConfig, query: string): boolean {
  const searchableText = [section.label, section.searchTerms]
    .join(' ')
    .toLocaleLowerCase()

  return query.split(/\s+/).every((term) => searchableText.includes(term))
}

function SettingsSearchResults({
  sections,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  readonly sections: readonly SettingsSectionConfig[]
  readonly activeIndex: number
  readonly onActiveIndexChange: (index: number) => void
  readonly onSelect: (section: SettingsSectionId) => void
}) {
  if (sections.length === 0) {
    return <p className="settings-search-empty" role="status">No matching settings.</p>
  }

  return (
    <div className="settings-search-results" id={SEARCH_RESULTS_ID} role="listbox" aria-label="Settings section results">
      {sections.map((section, index) => (
        <AstryxButton
          className="settings-search-result"
          key={section.id}
          id={'settings-search-result-' + index}
          role="option"
          tabIndex={-1}
          aria-selected={index === activeIndex}
          label={section.label}
          variant="secondary"
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(section.id)}
        >
          <span className="settings-search-result-row">
            <span className="settings-search-result-icon" aria-hidden="true">{section.icon}</span>
            <span className="settings-search-result-label">{section.label}</span>
            <ChevronRightIcon className="settings-search-result-chevron" size={16} aria-hidden="true" />
          </span>
        </AstryxButton>
      ))}
    </div>
  )
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
  communityWaypointDownloadUrl,
  dataVersion,
  pushNotifications,
  activeSection,
  onActiveSectionChange,
}: SettingsContentProps) {
  const push = usePushNotifications(pushNotifications)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeResult, setActiveResult] = useState({ query: '', index: 0 })
  const sectionListRef = useRef<HTMLUListElement>(null)
  const sectionContentRef = useRef<HTMLElement>(null)
  const previousSectionRef = useRef(activeSection)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const activeResultIndex = activeResult.query === normalizedQuery ? activeResult.index : 0
  const isSearching = normalizedQuery.length > 0
  const searchResults = useMemo(
    () => isSearching
      ? SETTINGS_SECTIONS.filter((section) => matchesSettingsSection(section, normalizedQuery))
      : [],
    [isSearching, normalizedQuery],
  )

  useLayoutEffect(() => {
    if (previousSectionRef.current === activeSection) return
    const focusTarget = activeSection === null ? sectionListRef.current : sectionContentRef.current
    focusTarget?.focus()
    previousSectionRef.current = activeSection
  }, [activeSection])

  const setActiveResultIndex = (index: number): void => {
    setActiveResult({ query: normalizedQuery, index })
  }

  const selectSection = (section: SettingsSectionId): void => {
    onActiveSectionChange(section)
    setSearchQuery('')
    setActiveResultIndex(0)
  }

  const handleSearchEscape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && searchQuery) {
      event.preventDefault()
      event.stopPropagation()
      setSearchQuery('')
      setActiveResultIndex(0)
      return
    }
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!isSearching || searchResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveResultIndex((activeResultIndex + 1) % searchResults.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveResultIndex((activeResultIndex - 1 + searchResults.length) % searchResults.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveResultIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveResultIndex(searchResults.length - 1)
    } else if (event.key === 'Enter') {
      const result = searchResults[activeResultIndex]
      if (!result) return
      event.preventDefault()
      selectSection(result.id)
    }
  }

  const activeResultId = isSearching && searchResults.length > 0
    ? 'settings-search-result-' + activeResultIndex
    : undefined

  const selectedSection = activeSection === null
    ? null
    : SETTINGS_SECTIONS.find(({ id }) => id === activeSection) ?? null

  const renderSectionContent = (section: SettingsSectionConfig): ReactNode => (
    <div className="settings-panel-content">
      {section.id === 'appearance' && (
        <AppearanceSection
          preference={themePreference}
          onChange={onThemePreferenceChange}
          minuteFormat={minuteFormat}
          onMinuteFormatChange={onMinuteFormatChange}
        />
      )}
      {section.id === 'notifications' && (
        <PushNotificationsSection
          availability={push.availability}
          permission={push.permission}
          enabled={push.enabled}
          busy={push.busy}
          errorMessage={push.errorMessage}
          onEnable={push.enable}
          onDisable={push.disable}
        />
      )}
      {section.id === 'favourites' && (
        <FavouritesSection
          stops={favoriteStops}
          onMoveFavorite={onMoveFavorite}
          onRemoveFavorite={onRemoveFavorite}
          onClearFavorites={onClearFavorites}
        />
      )}
      {section.id === 'about' && (
        <AboutSection
          dataVersion={dataVersion}
          transitMetadata={transitMetadata}
          buildingSource={buildingSource}
        />
      )}
      {section.id === 'waypoints' && (
        <WaypointsSection communityWaypointDownloadUrl={communityWaypointDownloadUrl} />
      )}
    </div>
  )

  return (
    <div className={`settings-content${selectedSection ? ' settings-content--detail' : ' settings-content--home'}`}>
      {selectedSection === null ? (
        <>
          <div className="settings-navigation">
            <div
              className="settings-search-input"
              data-owns-escape={searchQuery ? 'true' : undefined}
              onKeyDown={handleSearchEscape}
            >
              <TextInput
                label="Search settings"
                isLabelHidden
                id="settings-search"
                type="search"
                placeholder="Search settings"
                size="md"
                width="100%"
                controlClassName="settings-search-control"
                hasClear
                startIcon="search"
                role="combobox"
                aria-autocomplete="list"
                aria-controls={isSearching && searchResults.length > 0 ? SEARCH_RESULTS_ID : undefined}
                aria-expanded={isSearching && searchResults.length > 0}
                aria-activedescendant={activeResultId}
                value={searchQuery}
                onChange={setSearchQuery}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {isSearching && (
              <SettingsSearchResults
                sections={searchResults}
                activeIndex={activeResultIndex}
                onActiveIndexChange={setActiveResultIndex}
                onSelect={selectSection}
              />
            )}
          </div>
          {!isSearching && (
            <ul
              className="settings-section-list"
              id="settings-section-list"
              role="list"
              aria-label="Settings categories"
              tabIndex={-1}
              ref={sectionListRef}
            >
              {SETTINGS_SECTIONS.map((section) => (
                <li className="settings-section-item" key={section.id}>
                  <AstryxButton
                    className="settings-section-button"
                    label={section.label}
                    variant="secondary"
                    onClick={() => selectSection(section.id)}
                  >
                    <span className="settings-section-row">
                      <span className="settings-section-icon" aria-hidden="true">{section.icon}</span>
                      <span className="settings-section-label">{section.label}</span>
                      <ChevronRightIcon className="settings-section-chevron" size={18} aria-hidden="true" />
                    </span>
                  </AstryxButton>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <section
          className="settings-panel settings-panel--detail"
          role="region"
          aria-label={selectedSection.label}
          tabIndex={-1}
          ref={sectionContentRef}
        >
          {renderSectionContent(selectedSection)}
        </section>
      )}
    </div>
  )
}
