import type { BuildingCatalogueSource } from '@navus/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@navus/shared/transit/types'
import { InfoIcon, MapIcon } from '../../../ui/icons'
import { SettingsDisclosureRow } from './settings-disclosure-row'

interface AboutSectionProps {
  readonly dataVersion: string
  readonly transitMetadata: TransitNetworkMetadata | null
  readonly buildingSource: BuildingCatalogueSource | null
}

function isSecureExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function AboutSection({ dataVersion, transitMetadata, buildingSource }: AboutSectionProps) {
  return (
    <section className="settings-section" aria-labelledby="settings-about-heading">
      <h3 id="settings-about-heading">About</h3>
      <SettingsDisclosureRow icon={<MapIcon size={18} />} title="Data sources">
        <dl className="settings-about-list">
          {transitMetadata && (
            <div>
              <dt>Bus network</dt>
              <dd>
                {transitMetadata.source}. Verified {transitMetadata.verifiedAt}.
                {' '}Route order: {transitMetadata.routeOrderSource}. Coordinates: {transitMetadata.coordinateSource}.
                {' '}Route geometry: {transitMetadata.routeGeometry}.
              </dd>
            </div>
          )}
          <div>
            <dt>Live arrivals</dt>
            <dd>
              NUS shuttle arrivals from NavUS. Public bus arrivals from{' '}
              <a href="https://datamall.lta.gov.sg/content/datamall/en.html" target="_blank" rel="noopener noreferrer">
                LTA DataMall
              </a>.
            </dd>
          </div>
          {buildingSource && (
            <div>
              <dt>Buildings</dt>
              <dd>
                {isSecureExternalUrl(buildingSource.url)
                  ? (
                    <a href={buildingSource.url} target="_blank" rel="noopener noreferrer">
                      {buildingSource.name}
                    </a>
                  )
                  : buildingSource.name}
                . Data snapshot: {buildingSource.fetchedOn}. {buildingSource.licenceNote}
              </dd>
            </div>
          )}
          <div>
            <dt>Basemap</dt>
            <dd>
              <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">
                OpenMapTiles
              </a>
              {' · '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                OpenStreetMap
              </a>
            </dd>
          </div>
        </dl>
      </SettingsDisclosureRow>
      <SettingsDisclosureRow icon={<InfoIcon size={18} />} title="Version">
        <dl className="settings-about-list">
          <div>
            <dt>Build &amp; data</dt>
            <dd>{dataVersion}</dd>
          </div>
        </dl>
      </SettingsDisclosureRow>
    </section>
  )
}
