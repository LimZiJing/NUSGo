import { DownloadIcon } from '../../../ui/icons'

interface WaypointsSectionProps {
  readonly communityWaypointDownloadUrl: string
}

export function WaypointsSection({ communityWaypointDownloadUrl }: WaypointsSectionProps) {
  return (
    <div className="settings-about">
      <section className="settings-about-group" aria-labelledby="settings-waypoints-community-heading">
        <h3 id="settings-waypoints-community-heading" className="settings-about-group-title">
          Community waypoints
        </h3>
        <div className="settings-about-card">
          <div className="settings-about-row settings-waypoints-download-row">
            <a
              className="button icon-button settings-waypoints-download-link"
              data-variant="secondary"
              data-size="sm"
              data-hover-filter="none"
              href={communityWaypointDownloadUrl}
              download="community-waypoints.geojson"
              aria-label="Download approved community waypoints"
            >
              <DownloadIcon />
            </a>
            <span aria-hidden="true">Download approved community waypoints</span>
          </div>
        </div>
      </section>
    </div>
  )
}
