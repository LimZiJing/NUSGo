# Community Waypoint publication and maintenance

The checked-in `frontend/public/data/community-waypoints.geojson` file is the public source of truth. A suggestion, correction, or removal report changes that file only after review in the private submissions repository. The public dataset contains approved place facts; the private issue remains the moderation and audit record.

Private review maps are generated from GitHub issue labels; see the [review export workflow](review-export.md). They remain read-only views of the private issue queue. Approval moves a report into the approved export; closure happens after the public data change is merged and deployed.

The initial review owner is LimZiJing, who triages the private queue weekly with a seven-calendar-day target for initial review. Revisit needs-check issues monthly. Photo intake is disabled: do not accept, attach, store, or publish photos or photo references. See the private queue policy in #214 for the current labels and review states.

## Publish an approved issue

1. **Review privately.** Confirm that the issue is actionable, not a duplicate, and supported by first-hand or otherwise reliable evidence. Check the place in person where practical. For corrections and removals, compare the report with the existing public record. Record the decision, evidence summary, reviewer, and decision date in the private issue. Reject unsupported or out-of-scope reports without changing public data.
2. **Check for duplicates and identity.** Search the public dataset by category, name, building, and nearby coordinates. A second report for the same place updates the existing feature; it does not create a second ID. A correction to a misplaced or renamed record keeps its stable ID. If a place moves, retain the ID when it is the same facility at a new position; use a new ID only for a distinct facility. Never reuse an ID after removal.
3. **Edit a working copy.** Start from the current checked-in GeoJSON and edit a temporary GIS working layer or a focused GeoJSON copy. Do not commit GIS project files, exports with generated fields, or a second public dataset. The [data contract](data-contract.md#gis-import-and-export-settings) has QGIS and ArcGIS Pro import/export settings. Keep geometry as a Point in WGS 84, coordinates in longitude/latitude order, and retain the approved property allowlist and value types.
4. **Apply only reviewed public facts.** Add or update `id`, `name`, `category`, `source`, `updatedAt`, and supported optional details. `source` describes the public verification method; `updatedAt` is the date that the location and details were last reviewed. On a correction, update the existing feature and date. On an approved removal, delete the feature and preserve the retired ID and reason in the private issue. A duplicate report that changes nothing does not require a public edit.
5. **Keep provenance separated.** In the private issue, record the resulting public commit or pull request reference after it is available. Public GeoJSON and its public change description may include only a clean source description and review date. Never copy the private issue URL, submitter text, names or contact details, reviewer notes, photo IDs, photo URLs, or photo evidence into GeoJSON, GIS exports, app content, public commits, or public pull requests.
6. **Validate the complete change.** Replace the checked-in file with the reviewed export, then run:

   ```powershell
   npm run community-waypoints:validate
   npm test
   npm run build
   git diff --check
   ```

   The validator rejects malformed features, unsupported properties or categories, out-of-area coordinates, invalid dates, and duplicate IDs. Review the full GeoJSON diff for accidental field changes, coordinate shifts, duplicate places, private content, and missing or stale provenance. Inspect the app test/build output before publication; do not publish a partial dataset if any feature fails validation.
7. **Publish and close the audit loop.** Send the cleaned data change through the normal public code review. The public review must not link to or identify the private issue. After the change is accepted and deployed, record its public commit or pull request reference in the private issue and close it with the approved outcome. Keep the private issue as the audit trail.

## Corrections, duplicates, and removals

- **Duplicate submission:** link it to the existing private review record, mark it duplicate, and leave the public dataset unchanged unless the review also verifies a correction.
- **Incorrect details or position:** verify the correction, update the existing feature in place, preserve its ID, and set `updatedAt` to the review date.
- **Moved facility:** verify that the facility is the same continuing place before moving its point. Preserve its ID for a relocation; assign a new ID only when the original facility is gone and a distinct facility has taken its place. Document the decision privately.
- **Stale or unverified place:** keep the last verified public facts while they remain useful. During review, confirm that the feature still exists and that its source and date remain accurate. If it cannot be confirmed, record the attempt privately and remove it only when the place is confirmed closed, gone, or materially misleading. Revisit unresolved needs-check issues monthly; close an unverified, no-longer-actionable report as outdated after 30 days under the #214 policy.
- **Removal report:** verify the place is gone or should no longer be listed. Remove its feature, retain the retired ID permanently, and record the reason and evidence in the private queue. Never leave a tombstone or private explanation in public GeoJSON.
- **Periodic maintenance:** each quarter, review the complete public list against available reports and prior verification dates. Start private follow-up issues for records that need checking, keep `updatedAt` unchanged until a record is actually reverified, and publish only changes supported by completed review.

## Rollback

If a published edit is malformed, exposes private information, or materially misrepresents a place, stop further edits and notify the review owner. Revert the specific public data commit through a new reviewed change, rerun the validator, tests, build, and diff checks, then publish the rollback. For an exposure, remove the affected content from the public branch promptly and follow repository incident procedures; a normal revert does not erase it from Git history. Record the rollback commit and corrective action in the private issue, and do not reuse any ID removed by the rollback.
