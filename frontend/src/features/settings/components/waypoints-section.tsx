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
          <div className="settings-about-row">
            <p className="settings-about-meta">Download the reviewed public waypoint dataset.</p>
            <a
              className="settings-about-action"
              href={communityWaypointDownloadUrl}
              download="community-waypoints.geojson"
            >
              Download approved data (GeoJSON)
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
