# Research: Reframing Issue #658 as NUS Eateries

Checked 12 November 2026. This note preserves the initial source and coverage research. The accepted scope is in [Issue #658](https://github.com/LimZiJing/NUSGo/issues/658) and supersedes recommendations below where they differ.

## Accepted decisions

- Issue #658 now covers the current 39-record eatery set and the categories Canteen, Restaurant, and Drinks & snacks.
- Keep the JSON minimal: stable ID, name, category, and longitude/latitude. Building references are optional. Keep review notes and source details in `eateries-review.md`.
- Reuse a venue only when its stable identity is confirmed. Do not merge by name alone: the existing floor-4 Frontier room differs from the Frontier canteen, so the room and canteen keep separate IDs.
- The project owner confirmed source reuse permission and that required attribution is handled. The remaining location checks will be supplied separately.

## Findings

- **“Canteens” is narrower than NUS’s own inventory.** NUS UCI’s [Retail and Dining index](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/) distinguishes food and beverage outlets from canteens and food courts. It reports 9 canteens/food courts (6 at Kent Ridge, 2 at UTown, 1 at Bukit Timah) and also lists cafes, restaurants, kiosks, and other F&B outlets on its [Kent Ridge](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/), [UTown](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/), and [Bukit Timah](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/) pages. These pages can include outlet names, building/location, hours, and some tags. For example, the UTown page lists the food courts Fine Food and Flavours alongside named restaurants and cafes.
- **NUS Campus Map uses broader wording and exposes coordinates.** Its category is “Cafes, Restaurants and Food Kiosks.” The [Campus Map](https://map.nus.edu.sg/) and its [autocomplete endpoint](https://map.nus.edu.sg/index.php/search/ajax_auto) expose map records with location/address fields and longitude/latitude. The endpoint appears to be an undocumented interactive search endpoint; I found no published API contract or bulk-data license for it. Treat its coordinates as candidate evidence, not a stable integration contract.
- **The inventory needs reconciliation, not a raw import.** UCI’s index says 46 F&B outlets, while its campus breakdown lists 41 + 9 + 1 = 51. The reason for this difference is not explained on the page, so the headline total should not be used as the completeness check. UCI listings also mix destination-scale dining places (food courts) and individual restaurant/cafe brands, sometimes at the same building.
- **NUSGo already has overlapping records.** In the checked local data, `venues.json` has a room record named “Frontier”; `buildings.json` has two building-part records grouped under the single searchable building ID `frontier`, plus PGP Canteen, Techno Edge, The Deck, and a PGP Residence 2 alias mentioning its foyer and canteen. The Frontier room record is not the canteen location, so do not match it by name alone. The general NUS [legal notice](https://nus.edu.sg/legal-information-notices) says NUS owns copyright in site materials and prior written permission is required for reproduction/distribution. I did not find an open reuse license on the dining or map pages.

## Recommendation

Rename the user-facing category to **Eateries** and define an eatery as a place a person can navigate to for food or drink. Include canteens and food courts as one destination each. Include a standalone cafe or restaurant when it has its own fixed, useful location. Exclude individual stall tenants inside canteens/food courts, mobile food trucks, vending machines, and convenience stores. Do not add stall names as aliases; the user asked to avoid kiosk-level entries. This keeps the broader scope useful without importing the Campus Map’s entire “Cafes, Restaurants and Food Kiosks” category.

The specific first pass should be the nine shared dining destinations UCI counts: six Kent Ridge canteens, two UTown food courts, and one Bukit Timah canteen. The UCI and map sources disagree on some names, so use one stable record per physical destination and keep alternate official names as aliases.

| Destination to show | Local data action | Notes |
|---|---|---|
| Central Square @ YIH | Add an eatery record linked to `yusof-ishak-house`. | Use the canteen name; exclude its six tenants. |
| Frontier | Reuse the grouped building entry `frontier`. | Do not repurpose `venues.json["Frontier"]`: that room record has floor 4 and coordinates about 666 m from the campus-map Frontier record. Review that room record separately. |
| PGP Aircon Canteen | Reuse `pgp-canteen`; use “PGP Aircon Canteen” as display name and “PGP Canteen” as an alias. | UCI’s current dining page uses the Aircon name. |
| Techno Edge | Reuse `techno-edge`. | One food-centre destination; exclude its tenants. |
| The Deck | Reuse `the-deck`. | One food-centre destination; exclude its tenants. |
| The Terrace | Add an eatery record linked to `com3`. | UCI locates it at Computing 3 (COM3). |
| Fine Food | Add an eatery record linked to `town-plaza`. | One UTown food-court destination; exclude its 14 tenants. |
| Flavours @ UTown | Add an eatery record linked to `stephen-riady-centre`. | One UTown food-court destination; exclude its 11 tenants. |
| BTC Cafeteria (also called The Summit) | Add one record for Block B; retain “The Summit” as an alias. | The current UCI dining page says “BTC Cafeteria”; UCI’s sustainability page and NUS campus-map data use “The Summit.” Confirm with UCI which display name to prefer. |

Treat “Pines Food Court” at PGP as **unresolved**, not as a tenth automatic addition: it appears in NUS Campus Map search/PDF data but not in the current UCI dining list. Ask UCI whether it remains a distinct operating dining destination or is old/duplicated PGP data before including it.

For broader restaurant/cafe coverage, add only fixed standalone venues from UCI’s list, as separate locations (for example, Cafe Delight at Ventus, Sloppy B at the University Sports Centre, The Spread at Mochtar Riady Building, South & East and Poonsti Café at SFAH, and separate Starbucks locations). The inventory should be checked item by item; a tenant located inside a canteen/food court stays excluded, even if UCI lists it by brand.

Do not add these as room-code records in `venues.json`: the current search code describes that catalogue as rooms-only. Add a validated eatery collection in the canonical location data, with stable ID, display name, kind, campus, host building ID (when available), search aliases for official place-name variants, source reference, and checked date. Resolve the eatery to the host building’s existing journey endpoint where the dining place is inside that building; do not create another building/room marker at the same coordinate. This is an implementation recommendation based on the current catalogue boundary in `frontend/src/domain/location/search.ts`.

Use UCI’s itemized pages as the primary candidate inventory and descriptive source; use the Campus Map to help resolve coordinates and campus/building location. Before copying its compiled records or coordinates into the public NUSGo bundle, ask UCI/map owners for a reusable export, stable endpoint, and written permission. If permission is unavailable, use a source with a clear compatible reuse license and record its attribution. Do not build a production sync against the undocumented autocomplete endpoint.

Make initial campus coverage explicit as Kent Ridge, UTown, and Bukit Timah; verify Outram separately before claiming the first release covers every NUS campus.

## Suggested Issue #658 decisions

1. Change the title/category to “NUS Eateries.”
2. Include nine facility-level canteen/food-court records, plus fixed standalone cafes/restaurants; exclude individual stalls, kiosks, mobile trucks, vending machines, and convenience stores.
3. Reuse the existing building IDs listed above and add only missing eatery identities. Use one BTC cafeteria record with the alternate Summit name; resolve the existing Frontier room/building mismatch and Pines Food Court before shipping.
4. Store type, campus, host building ID, official place-name aliases, source and last-checked date in a validated eatery catalogue linked to canonical building endpoints.
5. Require a reviewed source-to-canonical crosswalk, no duplicate destinations, valid coordinates, and a documented reuse basis before data is shipped. Defer menus, live availability, operating-hours guarantees, and automatic refresh.

## Sources

- [Issue #658](https://github.com/LimZiJing/NUSGo/issues/658)
- [NUS UCI Retail and Dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/)
- [NUS UCI Kent Ridge F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/)
- [NUS UCI UTown F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/)
- [NUS UCI Bukit Timah F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/)
- [NUS UCI Reuse Campaign locations](https://uci.nus.edu.sg/campus-sustainability/reuse-campaign/)
- [NUS Campus Map](https://map.nus.edu.sg/)
- [NUS Campus Map search endpoint](https://map.nus.edu.sg/index.php/search/ajax_auto)
- [NUS Legal Information & Notices](https://nus.edu.sg/legal-information-notices)
