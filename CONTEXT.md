# NavUS Domain Context

## Product

NavUS is a campus transit and indoor-navigation application for the National University of Singapore (NUS).

Its core user goal is to help someone find a venue, understand nearby shuttle services, and eventually receive a route recommendation that may combine walking, indoor movement, and bus transfers.

## Canonical terms

- **Venue**: A destination on campus, identified by a venue code, room name, or other user-facing place information.
- **Shuttle stop**: A place where a campus shuttle can pick up or drop off passengers.
- **Shuttle route**: An ordered service connecting shuttle stops in a particular direction or service pattern.
- **Transit model**: The structured representation of shuttle routes, stops, service associations, and their relationships.
- **Route shape**: The geographic path followed by a shuttle route between its stops.
- **Walking connection**: A route segment traversed on foot between venues, stops, entrances, or other places.
- **Indoor connection**: A route segment inside a building or other sheltered space, potentially involving floors, lifts, or stairs.
- **Route recommendation**: A proposed journey made from one or more walking, indoor, and transit segments.

## Domain boundaries

- Venue lookup answers where a place is and helps the user select a destination.
- Transit data answers which shuttle services and stops are related.
- Routing answers how a person can travel between an origin and destination while considering walking, indoor movement, accessibility, shelter, and transfers.

Use these terms consistently in issue titles, plans, code names, tests, and user-facing copy.
