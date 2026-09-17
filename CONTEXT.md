# NavUS Domain Glossary

This document defines the domain language used by NavUS. It contains terminology and relationships, not implementation instructions.

## Campus navigation

- **Venue**: A campus location that a person may want to find, such as a building, room, lecture hall, or facility.
- **Transit network**: The set of shuttle routes, shuttle stops, and service associations available for campus travel.

## Shuttle transit

- **Route**: An internal campus shuttle service with a stable route ID, a display name, an official color, and an ordered sequence of stops.
- **Internal route**: A route operated within the NavUS campus transit model. The current network contains eight internal routes.
- **Stop**: A physical shuttle boarding or alighting location with a stable stop ID, a display name, coordinates, and service associations.
- **Ordered stop list**: The sequence of stops that defines a route’s travel direction, from its first stop to its last stop.
- **Service**: A transit service associated with a stop. A service may be an internal route or an external public service token.
- **Public service token**: An opaque identifier for a public or external service. It is not an internal NavUS route and must not be treated as one.
- **Opposite stop**: The paired stop representing the reverse side or direction of a stop location. Opposite-stop relationships are reciprocal.
- **Route geometry**: The geographic line that represents the physical path of a route between its ordered stops.

## Map presentation

- **Marker**: A visual map representation of a domain location, such as a venue marker or shuttle-stop marker. A marker is not the venue or stop itself.
- **Route line**: The visual map representation of route geometry.
- **Selected route**: The one internal route currently receiving focused map and information-panel treatment.
- **All-routes state**: The map state in which no route is selected and the complete validated network is available for inspection.
