# NavUS Domain Glossary

This document defines the domain and product vocabulary used by NavUS. It contains terminology and relationships, not implementation instructions.

## Campus navigation

- **Venue**: A campus location that a person may want to find, such as a building, room, lecture hall, or facility.
- **Building**: A named NUS structure in the building catalogue, distinct from the rooms inside it and from shuttle stops, with its own stable identity. A Building is a kind of Venue. Its location is an API centroid, or an accepted but unverified entrance, until a pedestrian entrance has been verified; a Building is never merged with a nearby shuttle stop.
- **Transit network**: The set of shuttle routes, shuttle stops, and service associations available for campus travel.
- **Path**: A complete, continuous ordered sequence of walking and bus legs between the selected origin and destination. It is the canonical name for one computed option.
- **Path leg**: One walking or bus segment of a Path.
- **Recommended result**: The best valid Path under the available route, timing, and endpoint data. It must not be presented as fastest when required timing data is unavailable. Plan may retain existing user-facing wording such as “recommended journey.”
- **Trip endpoint**: A resolved Path origin or destination, identified by a stable venue or shuttle-stop reference, or by frozen coordinates for Current location.
- **Current location**: A trip endpoint that snapshots the coordinates of an active valid device-location fix. It keeps those coordinates after the device location moves and has no venue or stop identifier.
- **Walking connection**: A directed, validated walking link between two trip endpoints or shuttle stops, with travel distance and duration. A walking Path leg also has routed geometry.
- **Transfer**: A change from one bus boarding to another within a Path. Each boarding needs its own waiting estimate; a walking leg may connect the stops.

## Shuttle transit

- **Bus route**: A fixed campus shuttle service with a stable route ID, a display name, an official color, and an ordered sequence of stops. The engine uses `BusRoute` for this concept; it is distinct from a computed Path.
- **Internal route**: A route operated within the NavUS campus transit model. The current network contains eight internal routes.
- **Stop**: A physical shuttle boarding or alighting location with a stable stop ID, a display name, coordinates, and service associations.
- **Ordered stop list**: The sequence of stops that defines a route’s travel direction, from its first stop to its last stop.
- **Service**: A transit service associated with a stop. A service may be an internal route or an external public service token.
- **Public service token**: An opaque identifier for a public or external service. It is not an internal NavUS route and must not be treated as one.
- **Opposite stop**: The paired stop representing the reverse side or direction of a stop location. Opposite-stop relationships are reciprocal.
- **Route geometry**: The geographic line that represents the physical path of a route between its ordered stops.
- **Ride estimate**: The estimated time spent travelling on a shuttle between boarding and alighting, excluding waiting.
- **Waiting estimate**: The estimated time from reaching a boarding stop until the expected shuttle arrival. A shuttle leg includes both its waiting and ride estimates.

## Map presentation

- **Marker**: A visual map representation of a domain location, such as a venue marker or shuttle-stop marker. A marker is not the venue or stop itself.
- **Route line**: The visual map representation of route geometry.
- **Selected route**: The one internal route currently receiving focused map and information-panel treatment.
- **All-routes state**: The map state in which no route is selected and the complete validated network is available for inspection.

## Product navigation

- **Bottom sheet**: A movable mobile panel over the shared map that presents a workflow while leaving the map available.
- **Explore**: The product area for finding venues and browsing shuttle routes.
- **Stops**: The product area for browsing nearby or favourite shuttle stops and viewing a selected stop's details.
- **Plan**: The product area for choosing trip endpoints and viewing a recommended journey or its planning status.
- **Find venue**: The Explore workflow for searching venues and opening venue details.
- **Shuttle routes**: The Explore workflow for browsing internal routes and their ordered stops.
- **Nearby**: The Stops list of shuttle stops near the visible map centre, ordered by distance from that centre.
- **Favourites**: The Stops list of shuttle stops saved by the person in their browser.
- **Venue details**: The view of a selected venue's identity and confirmed location information, with actions such as navigation.
- **Stop details**: The view of a selected shuttle stop's identity, services, and available arrival information.
