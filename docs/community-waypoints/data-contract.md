# Community Waypoint data contract

This document defines the public, reviewed Community Waypoint dataset for NUSGo. It is separate from Personal Waypoints and from canonical venues and bus stops. The public GeoJSON file lives at `frontend/public/data/community-waypoints.geojson`; it remains empty until a maintainer reviews and approves locations. The browser loader validates this file through the shared parser. Map display belongs to #213. See the [publication runbook](publication.md) for private review-to-public steps and maintenance.

## GeoJSON shape

The public source is one RFC 7946 GeoJSON `FeatureCollection`. Every feature is a `Point` with exactly two finite coordinates in `[longitude, latitude]` order, in WGS 84 decimal degrees. The parser accepts an empty collection.

The accepted coordinate area is the inclusive Singapore bounding box:

| Bound | Value |
| --- | ---: |
| West longitude | 103.59 |
| East longitude | 104.09 |
| South latitude | 1.13 |
| North latitude | 1.48 |

This loose box catches coordinates outside NUSGo's supported Singapore area; it is not a campus boundary. Reviewers must confirm that each point belongs at an NUS location before publication.

## Properties

Keep fields flat in `properties` so they remain ordinary columns in GIS tools. `properties.id` is the canonical stable ID. A standard GeoJSON feature-level `id` and `bbox` members are tolerated but ignored by the NUSGo parser. The parser also tolerates standard `bbox` members on the collection and geometry. It rejects other collection, feature, geometry, or property members.

| Field | Required | Rule |
| --- | --- | --- |
| `id` | Yes | Stable opaque ID in lower-case `cw-<UUID>` form. The parser normalizes UUID hex to lower case. Never reuse an ID, including after removal. IDs must be unique in the collection. |
| `name` | Yes | Reviewed display name, 1–80 characters after trimming. |
| `category` | Yes | One active controlled value: `water_cooler`, `atm`, `toilet`, or `vending_machine`. |
| `geometry` | Yes | GeoJSON `Point`; coordinates must be within the supported Singapore box. |
| `source` | Yes | Short public description of how the place was verified, 1–160 characters after trimming. Do not put a private issue link or raw evidence reference here. |
| `updatedAt` | Yes | Valid calendar date in `YYYY-MM-DD` form. It means the last reviewed update, not the creation date. |
| `building` | No | Reviewed building name as plain text, 1–80 characters. It is not a venue ID or link. |
| `floor` | No | Signed integer using the glossary meaning: below ground is negative, ground is zero, and above ground is positive. |
| `accessibilityNote` | No | Factual public text, 1–280 characters. Describe a specific feature; do not use a vague accessibility boolean or claim. |
| `details` | No | Short useful public text, 1–500 characters. |

Text is trimmed at the parser boundary and length limits count Unicode code points. Optional fields may be omitted or set to `null`; the parsed model omits empty optional values. The round-trip fixture uses `null` for empty optional columns so GIS tools can retain a fixed set of fields.

The initial category labels are **Water cooler**, **ATM**, **Toilet**, and **Vending machine**. `COMMUNITY_WAYPOINT_CATEGORIES` contains categories available to new submissions. If a category is retired, keep it in the readable retired-category list while published records still use it. Remove it from that list only after those records have been reviewed and migrated.

Never publish reporter identity, private submission URLs, review notes, photo IDs, or photo URLs. Photo intake is disabled for the text-only launch; photos are not collected and do not belong in Community Waypoint properties. Public source wording must be clean and must not disclose private submission contents.

## Provenance and review metadata

`source` and `updatedAt` are the public provenance record: they say how and when the published waypoint was last verified. A public waypoint exists only after a maintainer accepts and publishes a reviewed change. Pending, rejected, duplicate, or outdated submissions are not Community Waypoints and never appear in this dataset.

Keep moderation metadata in the private submission issue only. That private record can hold the submission kind and correction/removal target, review-state label, reviewer notes and decision, decision date, and opaque private evidence IDs. Keep the private issue link and those review fields out of public GeoJSON, public pull requests, and public provenance text. The private queue workflow and its operating policy are defined separately under #214.

## Validation behavior

`parseCommunityWaypointsGeoJson(input)` accepts `unknown` and returns a complete readonly Community Waypoint list. It throws `CommunityWaypointGeoJsonValidationError` with the failing path and reason if the collection, any feature, coordinate, property, category, date, ID, or value is invalid. A bad feature rejects the whole dataset; the parser never silently drops it or returns a partial list.

The allowlist for `properties` is `id`, `name`, `category`, `source`, `updatedAt`, `building`, `floor`, `accessibilityNote`, and `details`. This prevents private moderation fields from being carried into the public dataset.

## GIS import and export settings

RFC 7946 requires WGS 84 coordinates in longitude/latitude order. Keep the coordinate values at seven or more decimal places through a round trip. Preserve field names and JSON value types: text fields stay text, `floor` stays an integer number, and empty optional fields stay `null` or are omitted.

### QGIS

1. Open the fixture as a vector layer.
2. Use **Layer → Export → Save Features As…** and select **GeoJSON**.
3. Set the output CRS to **EPSG:4326 — WGS 84**.
4. In the GeoJSON layer options, set `RFC7946=YES`, `COORDINATE_PRECISION=7`, `WRITE_NAME=NO`, and `WRITE_BBOX=NO`.
5. Keep the contract fields visible, preserve their field names, exclude any generated `fid` field if it would be written as a property, and export the full layer without a selection.

### ArcGIS Pro

1. Import the fixture with **JSON To Features**, selecting geometry type **POINT**.
2. Make every contract field visible, keep field names rather than aliases, and exclude generated fields such as `OBJECTID` if they would be written as properties.
3. Run **Features To JSON** with **Formatted JSON** on, **Output to GeoJSON** on, **Project to WGS84** on, **Include Z Values** off, **Include M Values** off, and **Use field aliases** off.

### Round-trip evidence

After each GIS export, parse the output with `parseCommunityWaypointsGeoJson` and compare the four fixture IDs, categories, names, source text, dates, optional values, floor numbers, and coordinates. Any new public property or changed ID is a failure.

| Tool | Result |
| --- | --- |
| QGIS | Not verified. No QGIS command or installation was found in the current environment. |
| ArcGIS Pro | Not verified. ArcPy could not start because the product license is not initialized in this non-interactive environment. |

The authoritative references are [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946), the [QGIS vector export guide](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/create_layers.html), [QGIS GeoJSON format options](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/supported_data.html), the [GDAL GeoJSON driver](https://gdal.org/en/stable/drivers/vector/geojson.html), and [ArcGIS Pro Features To JSON](https://pro.arcgis.com/en/pro-app/latest/tool-reference/conversion/features-to-json.htm).
