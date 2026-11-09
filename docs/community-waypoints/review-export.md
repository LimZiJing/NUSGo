# Private review exports

The private submissions repository remains the review record. This exporter builds two private GeoJSON map views from open issue labels. It does not edit labels, close issues, or publish data.

## Files

- `data/generated/to-review.geojson` includes `review:new`, `review:reviewing`, and `review:needs-check` issues.
- `data/generated/approved.geojson` includes `review:approved` issues that are ready for a public data change.
- `review:rejected`, `review:duplicate`, and `review:outdated` issues stay in GitHub history and are excluded from both map files.

Each feature contains its private issue number and link, kind, review state, category, and map role. It excludes reporter explanation, requested-change text, and reviewer notes. A correction with a proposed new location shows both current and proposed points. A removal shows its current public point.

The script rebuilds both files from the issue list after each run. It writes only after all active issues and the current public GeoJSON validate. It sorts issues by number and leaves the prior files in place if the GitHub request, an issue, or the public data is invalid. A closed issue disappears on the next run.

## Review choices

Reviewers can work in GitHub and a browser: open the map link in the issue, compare it with the public map and nearby reports, then change the review label. The label records the decision. GIS is optional.

For batch review in QGIS or ArcGIS, load `to-review.geojson` (or `approved.geojson`) and the current public `community-waypoints.geojson` as separate read-only layers. Use `reviewRole` to tell current and proposed locations apart. A moved correction has both points; a removal has only its current point. Open the private issue link from the feature properties to read its evidence and record the decision by changing the label in GitHub. Do not edit the generated review layers.

The label change is the decision. The next sync moves an approved issue from `to-review.geojson` to `approved.geojson`. The issue stays open while the public change is prepared. After the public data change is merged and deployed, record its public PR or commit in the private issue, then close it. The sync job uses `issues: read`, so it cannot close or relabel issues.

The approved file is a private review view, not a public PR file. A maintainer prepares the clean public GeoJSON change separately, preserving stable IDs and adding reviewed public provenance. See the [data contract](data-contract.md) and [publication runbook](publication.md).

## Reusable workflow

`.github/workflows/sync-waypoint-review.yml` in NUSGo is a reusable workflow. It checks out the caller repository as the private queue, checks out NUSGo for the script and public dataset, rebuilds the two files, and commits changes back to the private queue. The private submissions repository needs a small caller workflow on its default branch before issue events can run.

Use this caller in `NUSGo-waypoint-submissions/.github/workflows/sync-issues.yml`:

~~~yaml
name: Sync waypoint issues

on:
  issues:
    types: [opened, edited, closed, reopened, labeled, unlabeled]
  workflow_dispatch:
  schedule:
    - cron: '17,47 * * * *'

permissions:
  contents: write
  issues: read

concurrency:
  group: waypoint-issue-sync
  cancel-in-progress: false

jobs:
  sync:
    uses: LimZiJing/NUSGo/.github/workflows/sync-waypoint-review.yml@community-waypoints
    with:
      tools_ref: community-waypoints
    permissions:
      contents: write
      issues: read
~~~

The caller must be on the private repository's default branch for issue and schedule events to run. Change both `community-waypoints` references to `main` after this NUSGo branch is integrated. The scheduled run is a backup refresh; issue and label events are the normal trigger.

## Related NUSGo issues

- [#217: Publish approved Community Waypoints and maintain data quality](https://github.com/LimZiJing/NUSGo/issues/217) is the existing publication task.
- [#214: Define the GitHub-backed contribution and moderation workflow](https://github.com/LimZiJing/NUSGo/issues/214) defines the private labels and review process.
- [#211: Define the Community Waypoint model and GeoJSON schema](https://github.com/LimZiJing/NUSGo/issues/211) defines public data validation.
- [#215: Add the secure Community Waypoint submission endpoint](https://github.com/LimZiJing/NUSGo/issues/215) creates the private issues.