# Community Waypoint publication and maintenance

The checked-in `frontend/public/data/community-waypoints.geojson` file is the public source of truth. Publish only reviewed place facts. Keep moderation records and evidence private.

## Prepare a public change

1. Start from the current GeoJSON and edit a focused copy or temporary GIS layer. Do not commit GIS project files, generated fields, or a second public dataset. See the [data contract](data-contract.md#gis-import-and-export-settings) for QGIS and ArcGIS Pro export settings.
2. Check for duplicates. A correction updates the existing feature and keeps its stable ID. Never reuse an ID after removal.
3. Add or update `id`, `category`, `source`, `updatedAt`, and supported optional details. The app derives its display label from the category, building, floor, and details. `source` describes the public verification method. `updatedAt` is the date the location and details were last reviewed.
4. Keep public provenance clean. Do not include private issue links, submitted text, reviewer notes, reporter details, or evidence references in GeoJSON or the public pull request.
5. Validate the complete file and review its diff:

   ```powershell
   npm run community-waypoints:validate
   npm test
   npm run build
   git diff --check
   ```

   The validator rejects malformed features, unsupported properties or categories, out-of-area coordinates, invalid dates, and duplicate IDs. Do not publish a partial dataset if any feature fails validation.
6. Open the usual public pull request with the reviewed data change. Merge and deploy it through the normal NUSGo release process.

## Corrections, removals, and maintenance

- **Incorrect details or position:** update the existing feature, preserve its ID, and set `updatedAt` to the review date.
- **Moved facility:** preserve its ID when it is the same continuing place. Use a new ID only for a distinct facility.
- **Removal:** delete the feature. Never leave a tombstone or private explanation in public GeoJSON; never reuse the retired ID.
- **Unverified place:** keep the last verified facts while they remain useful. Remove a feature only when it is confirmed closed, gone, or materially misleading.
- **Periodic maintenance:** review the public list against available evidence and prior verification dates. Keep `updatedAt` unchanged until a feature is reverified.

## Rollback

If a published edit is malformed, exposes private information, or materially misrepresents a place, stop further edits and notify the release owner. Revert the specific public data commit through a new reviewed change, rerun the validator, tests, build, and diff checks, then publish the rollback. For an exposure, remove the content from the public branch promptly and follow repository incident procedures; a normal revert does not erase it from Git history.
