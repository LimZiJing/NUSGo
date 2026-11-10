# Community Waypoint publication and maintenance

The checked-in `frontend/public/data/community-waypoints.geojson` file is the public source of truth. Publish only reviewed place facts. Keep moderation records and evidence private.

## Review a Community Waypoint batch PR

1. A maintainer runs the publish workflow in the private submissions repository. It builds the complete candidate from the approved issues and opens a draft PR against `main`.
2. Review the full diff in `frontend/public/data/community-waypoints.geojson`. Check for duplicates, confirm each location and category, and verify that corrections preserve their existing IDs and removals delete the intended feature.
3. Confirm every changed feature has a maintainer-verified `source` and review date in `updatedAt`. The workflow uses one source value for the entire batch. The app derives labels from category, building, floor, and `details`; `accessibilityNote` stays in the detail view.
4. Keep public provenance clean. The PR must not include private issue links, submitted explanations, reviewer notes, reporter details, or evidence references.
5. Validate the complete file and review its diff:

   ```powershell
   npm run community-waypoints:validate
   npm test
   npm run build
   git diff --check
   ```

   The validator rejects malformed features, unsupported properties or categories, out-of-area coordinates, invalid dates, and duplicate IDs. Do not publish a partial dataset if any feature fails validation.
6. Mark the PR ready when the review is complete, then merge it through the normal NUSGo review process. Production deployment remains a separate release step.

## Corrections, removals, and maintenance

- **Incorrect details or position:** update the existing feature, preserve its ID, and set `updatedAt` to the review date.
- **Moved facility:** preserve its ID when it is the same continuing place. Use a new ID only for a distinct facility.
- **Removal:** delete the feature. Never leave a tombstone or private explanation in public GeoJSON; never reuse the retired ID.
- **Unverified place:** keep the last verified facts while they remain useful. Remove a feature only when it is confirmed closed, gone, or materially misleading.
- **Periodic maintenance:** review the public list against available evidence and prior verification dates. Keep `updatedAt` unchanged until a feature is reverified.

## Rollback

If a published edit is malformed, exposes private information, or materially misrepresents a place, stop further edits and notify the release owner. Revert the specific public data commit through a new reviewed change, rerun the validator, tests, build, and diff checks, then publish the rollback. For an exposure, remove the content from the public branch promptly and follow repository incident procedures; a normal revert does not erase it from Git history.
