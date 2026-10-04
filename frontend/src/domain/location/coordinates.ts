export function isValidLocationCoordinates(longitude: number, latitude: number): boolean {
  return Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90
}

const EARTH_RADIUS_METERS = 6_371_008.8

export function getDistanceMeters(
  first: { readonly longitude: number; readonly latitude: number },
  second: { readonly longitude: number; readonly latitude: number },
): number {
  const firstLatitude = first.latitude * Math.PI / 180
  const secondLatitude = second.latitude * Math.PI / 180
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)))
}
