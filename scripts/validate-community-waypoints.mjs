import { readFileSync } from 'node:fs'
import { parseCommunityWaypointsGeoJson } from '../shared/src/waypoints/community-geojson.ts'

const fileUrl = new URL('../frontend/public/data/community-waypoints.geojson', import.meta.url)
const input = JSON.parse(readFileSync(fileUrl, 'utf8'))

parseCommunityWaypointsGeoJson(input)
