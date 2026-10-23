import type { BuildingCatalogueSource } from '@navus/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@navus/shared/transit/types'

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
      <dl className="settings-about-list">
        <div>
          <dt>App build / data version</dt>
          <dd>{dataVersion}</dd>
        </div>
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
    </section>
  )
}
