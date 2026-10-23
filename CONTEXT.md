# NavUS Domain Glossary

This document defines the domain and product vocabulary used by NavUS. It contains terminology and relationships, not implementation instructions. Use bus terminology in product language; treat “shuttle” as deprecated except in source or API names retained for compatibility.

## Campus navigation

- **Venue**: A campus location that a person may want to find, such as a building, room, lecture hall, or facility.
- **Venue floor**: A signed integer relative to ground level. Negative values identify basement floors, zero identifies the ground floor, and positive values identify floors above ground.
- **Building**: A named NUS structure in the building catalogue, distinct from the rooms inside it and from bus stops, with its own stable identity. A Building is a kind of Venue. Its location is an API centroid, or an accepted but unverified entrance, until a pedestrian entrance has been verified; a Building is never merged with a nearby bus stop.
- **Transit network**: The set of bus routes, bus stops, and service associations available for campus travel.
- **Path**: A complete, continuous ordered sequence of walking and bus legs between the selected origin and destination. It is the canonical name for one computed option.
- **Path leg**: One walking or bus segment of a Path.
- **Recommended result**: The best valid Path under the available route, timing, and endpoint data. It must not be presented as fastest when required timing data is unavailable. Plan may retain existing user-facing wording such as “recommended journey.”
- **Trip endpoint**: A resolved Path origin or destination, identified by a stable venue or bus-stop reference, or by frozen coordinates for Current location.
- **Current location**: A trip endpoint that snapshots the coordinates of an active valid device-location fix. It keeps those coordinates after the device location moves and has no venue or stop identifier.
- **Walking connection**: A directed, validated walking link between two trip endpoints or bus stops, with travel distance and duration. A walking Path leg also has routed geometry.
- **Transfer**: A change from one bus boarding to another within a Path. Each boarding needs its own waiting estimate; a walking leg may connect the stops.

## Bus transit

- **Bus route**: A fixed campus bus service with a stable route ID, a display name, an official color, and an ordered sequence of stops. The engine uses `BusRoute` for this concept; it is distinct from a computed Path.
  _Avoid_: Shuttle route
- **Internal route**: A route operated within the NavUS campus transit model. The current network contains eight internal routes.
- **Bus stop**: A physical bus boarding or alighting location with a stable stop ID, a display name, coordinates, and service associations.
  _Avoid_: Shuttle stop
- **Ordered stop list**: The sequence of stops that defines a route’s travel direction, from its first stop to its last stop.
- **Service**: A transit service associated with a stop. A service may be an internal route or an external public service token.
- **Public service token**: An opaque identifier for a public or external service. It is not an internal NavUS route and must not be treated as one.
- **Opposite stop**: The paired stop representing the reverse side or direction of a stop location. Opposite-stop relationships are reciprocal.
- **Route geometry**: The geographic line that represents the physical path of a route between its ordered stops.
- **Ride estimate**: The estimated time spent travelling by bus between boarding and alighting, excluding waiting.
- **Waiting estimate**: The estimated time from reaching a boarding stop until the expected bus arrival. A bus leg includes both its waiting and ride estimates.

## Map presentation

- **Marker**: A visual map representation of a domain location, such as a venue marker or bus-stop marker. A marker is not the venue or stop itself.
- **Route line**: The visual map representation of route geometry.
- **Selected route**: The one internal route currently receiving focused map and information-panel treatment.
- **All-routes state**: The map state in which no route is selected and the complete validated network is available for inspection.

## Product navigation

- **Bottom sheet**: A movable mobile panel over the shared map that presents a workflow while leaving the map available.
- **Navigation tab**: A top-level control for one of the three product areas: Explore, Stops, or Plan.
- **Explore**: The product area for finding venues and browsing bus routes. Its feature content is shown inside the shared mobile sheet.
- **Stops**: The product area for browsing nearby or favourite bus stops and viewing a selected stop's details.
- **Plan**: The product area for choosing trip endpoints and viewing a recommended journey or its planning status.
- **Segmented control**: An in-feature selector. Find venue and Bus routes are Explore choices; Nearby and Favourites are Stops choices.
- **Find venue**: The Explore workflow for searching venues and opening venue details.
- **Bus routes**: The Explore workflow for browsing internal routes and their ordered stops.
- **Nearby**: The Stops list of bus stops near the visible map centre, ordered by distance from that centre.
- **Favourites**: The Stops list of bus stops saved by the person in their browser.
- **Venue details**: The selected venue's identity and confirmed location information, with actions such as navigation.
- **Stop details**: The selected bus stop's identity, services, and available arrival information.

## Interface controls

- **Button**: An interactive control that performs an action, with a variant (primary, secondary, or ghost) and a size.
- **Chip**: An interactive, selectable pill-shaped control, such as a route chip. A chip that toggles reports its selected state to assistive technology.
- **Pill**: A non-interactive, pill-shaped status label, such as a stop's Live badge.
- **Touch target**: The area a person can press. Every interactive control is at least 36px tall and wide, except where a documented exception applies.
