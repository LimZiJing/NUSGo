import type { ReactNode } from 'react'
import type { BuildingCatalogueSource } from '@navus/shared/venue/buildings'
import type { TransitNetworkMetadata } from '@navus/shared/transit/types'
import { LOCAL_DATA_VERSION } from '@navus/shared/http/data-version'
import { ArrowRightIcon, ExternalLinkIcon } from '../../../ui/icons'

interface AboutSectionProps {
  readonly dataVersion: string
  readonly transitMetadata: TransitNetworkMetadata | null
  readonly buildingSource: BuildingCatalogueSource | null
}

interface SourceLinkProps {
  readonly href: string
  readonly children: string
}

function isSecureExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)
}

function formatBuildingSourceName(value: string): string {
  return value
    .replace(/^Buildings:\s*/i, '')
    .replace(/\s*\(([^)]+)\)/, ' · $1')
}

function summarizeBuildingSourceNote(value: string): string[] {
  const note = value.toLowerCase()
  const sources = ['OpenStreetMap', 'Google Maps'].filter((source) => note.includes(source.toLowerCase()))
  const summary = sources.length > 0 ? [`Data from ${sources.join(' and ')}.`] : []

  if (/provisional|unverified/.test(note)) summary.push('Some locations are provisional.')
  return summary
}

function SourceLink({ href, children }: SourceLinkProps) {
  if (!isSecureExternalUrl(href)) return <span>{children}</span>

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLinkIcon size={12} />
    </a>
  )
}

function AboutCardRow({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={`settings-about-row ${className}`.trim()}>{children}</div>
}

export function AboutSection({ dataVersion, transitMetadata, buildingSource }: AboutSectionProps) {
  const buildVersion = dataVersion === LOCAL_DATA_VERSION
    ? 'Development'
    : `Production · ${dataVersion.slice(0, 7)}`

  return (
    <div className="settings-about">
      <section className="settings-about-group" aria-labelledby="settings-about-sources-heading">
        <h3 id="settings-about-sources-heading" className="settings-about-group-title">Data sources</h3>
        <div className="settings-about-card">
          <AboutCardRow>
            <h4>Bus timings</h4>
            <p className="settings-about-link-line">
              <SourceLink href="https://datamall.lta.gov.sg/content/datamall/en.html">
                Public buses · LTA DataMall
              </SourceLink>
            </p>
            {transitMetadata && (
              <p className="settings-about-detail">
                {transitMetadata.source} · Updated {formatDate(transitMetadata.verifiedAt)}
              </p>
            )}
          </AboutCardRow>

          <AboutCardRow>
            <h4>Venue data</h4>
            <p className="settings-about-link-line">
              <SourceLink href="https://nusmods.com">NUSMods</SourceLink>
            </p>
          </AboutCardRow>

          {buildingSource && (
            <AboutCardRow>
              <h4>Building locations</h4>
              <p className="settings-about-link-line">
                <SourceLink href={buildingSource.url}>{formatBuildingSourceName(buildingSource.name)}</SourceLink>
              </p>
              <p className="settings-about-meta">Updated {formatDate(buildingSource.fetchedOn)}</p>
              <div className="settings-about-note">
                {summarizeBuildingSourceNote(buildingSource.licenceNote).map((statement) => (
                  <p className="settings-about-detail" key={statement}>{statement}</p>
                ))}
              </div>
            </AboutCardRow>
          )}

          <AboutCardRow>
            <h4>Basemap</h4>
            <p className="settings-about-link-line settings-about-basemap-links">
              <SourceLink href="https://openfreemap.org/">OpenFreeMap</SourceLink>
              <span aria-hidden="true"> · </span>
              <SourceLink href="https://www.openstreetmap.org/copyright">OpenStreetMap</SourceLink>
            </p>
          </AboutCardRow>
        </div>
      </section>

      <section className="settings-about-group" aria-labelledby="settings-about-version-heading">
        <h3 id="settings-about-version-heading" className="settings-about-group-title">App version</h3>
        <div className="settings-about-card">
          <AboutCardRow>
            <h4>Build</h4>
            <p className="settings-about-meta">{buildVersion}</p>
          </AboutCardRow>
        </div>
      </section>

      <section className="settings-about-group" aria-labelledby="settings-about-help-heading">
        <h3 id="settings-about-help-heading" className="settings-about-group-title">Help &amp; feedback</h3>
        <div className="settings-about-card">
          <AboutCardRow className="settings-about-feedback">
            <h4>Feedback</h4>
            <p className="settings-about-meta">Report a bug or share an idea.</p>
            <a
              className="settings-about-action"
              href="https://github.com/LimZiJing/NUSGo/issues/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              Send feedback
              <ArrowRightIcon size={16} />
            </a>
          </AboutCardRow>
        </div>
      </section>

    </div>
  )
}
