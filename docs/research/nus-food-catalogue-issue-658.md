# Research: Food catalogue history for Issue #658

Checked 12 November 2026. This note preserves the initial source and coverage research. The current runtime model and product behavior are defined by [Issue #701](https://github.com/LimZiJing/NUSGo/issues/701), which supersedes older recommendations below where they differ.

## Current data decisions

- `frontend/public/data/food.json` holds 39 Food records with stable IDs, `name`, `foodType`, and WGS84 location. Food types are `canteen`, `restaurant`, and `drinks & snacks`; cafes use `drinks & snacks`.
- Validation adds `kind: 'food'` to produce a `FoodVenue`. Rooms become `RoomVenue` records through the same shared adapter. Downstream code uses the validated `kind` field as the Room/Food discriminator.
- Keep source metadata such as evidence and review notes in this document and the [Food catalogue review](food-catalogue-review.md). Do not add a redundant `kind` field to `food.json`.
- Reuse a venue only when its stable identity is confirmed. Do not merge by name alone: the floor-4 Frontier Room differs from the Frontier canteen, so they keep separate source identities.
- The project owner confirmed source reuse permission and that required attribution is handled. The remaining location checks will be supplied separately.

## Findings

- **Canteens are narrower than NUS's inventory.** NUS UCI's [Retail and Dining index](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/) distinguishes food and beverage outlets from canteens and food courts. It reports 9 canteens/food courts (6 at Kent Ridge, 2 at UTown, 1 at Bukit Timah) and also lists cafes, restaurants, kiosks, and other F&B outlets on its [Kent Ridge](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/), [UTown](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/), and [Bukit Timah](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/) pages. These pages can include outlet names, building/location, hours, and some tags. For example, the UTown page lists Fine Food and Flavours alongside named restaurants and cafes.
- **NUS Campus Map uses broader wording and exposes coordinates.** Its category is “Cafes, Restaurants and Food Kiosks.” The [Campus Map](https://map.nus.edu.sg/) and its [autocomplete endpoint](https://map.nus.edu.sg/index.php/search/ajax_auto) expose map records with location/address fields and longitude/latitude. The endpoint appears to be an undocumented interactive search endpoint; I found no published API contract or bulk-data license for it. Treat its coordinates as candidate evidence, not a stable integration contract.
- **The inventory needs reconciliation, not a raw import.** UCI's index says 46 F&B outlets, while its campus breakdown lists 41 + 9 + 1 = 51. The reason for this difference is not explained on the page, so the headline total should not be used as the completeness check. UCI listings also mix destination-scale dining places (food courts) and individual restaurant/cafe brands, sometimes at the same building.
- **NUSGo has overlapping records.** `venues.json` has a Room named “Frontier”; `buildings.json` has two building-part records grouped under the searchable building ID `frontier`, plus PGP Canteen, Techno Edge, The Deck, and a PGP Residence 2 alias mentioning its foyer and canteen. The Frontier Room is not the canteen location, so do not match it by name alone. The general NUS [legal notice](https://nus.edu.sg/legal-information-notices) says NUS owns copyright in site materials and prior written permission is required for reproduction/distribution. The project owner later confirmed reuse permission and attribution handling.

## Coverage notes

Include canteens and food courts as one destination each. Include fixed cafes and restaurants that have a useful location. Exclude individual stall tenants inside shared dining places, mobile food trucks, vending machines, and convenience stores. Do not add stall names as aliases; the project owner asked to avoid kiosk-level entries.

The first pass covers the nine shared dining destinations UCI counts: six Kent Ridge canteens, two UTown food courts, and one Bukit Timah canteen. The UCI and map sources disagree on some names, so use one stable record per physical destination and keep alternate official names in review notes.

| Destination | Local data action | Notes |
| --- | --- | --- |
| Central Square @ YIH | Keep one Food record for the dining place. | Use the canteen name; exclude its six tenants. |
| Frontier | Keep the Frontier canteen as Food and the room/building identity separately. | Do not repurpose `venues.json["Frontier"]`: that Room has floor 4 and coordinates about 666 m from the map's Frontier point. |
| PGP Aircon Canteen | Keep one Food record for the canteen. | UCI's current dining page uses the Aircon name; its catalogue also uses PGP Canteen. |
| Techno Edge | Keep one Food record for the food centre. | Exclude its tenants. |
| The Deck | Keep one Food record for the food centre. | Exclude its tenants. |
| The Terrace | Keep one Food record. | UCI locates it at Computing 3 (COM3). |
| Fine Food | Keep one Food record for the food court. | Exclude its 14 tenants. |
| Flavours @ UTown | Keep one Food record for the dining place. | Exclude its 11 tenants. |
| BTC Cafeteria / The Summit | Keep one Food record for Block B. | UCI currently says “BTC Cafeteria”; UCI's sustainability page and Campus Map use “The Summit.” Confirm which public name to prefer. |

Treat Pines Food Court at PGP as unresolved, not as an automatic addition: it appears in NUS Campus Map search/PDF data but not the current UCI dining list. Ask UCI whether it remains a distinct operating destination or is old/duplicated PGP data before including it.

For broader restaurant/cafe coverage, add fixed locations item by item (for example, Cafe Delight at Ventus, Sloppy B at the University Sports Centre, The Spread at Mochtar Riady Building, South & East and Poonsti Café at SFAH, and separate Starbucks locations). A tenant inside a food court stays excluded even if UCI lists it by brand.

Do not add Foods as room-code records in `venues.json`. Keep the separate `food.json` source and let the shared validator produce Food venues with `kind: 'food'`. The route endpoint uses the existing stable Food ID. Room building relationships resolve from `roomCodePrefixes`; Food IDs do not resolve as Rooms through their text or prefixes. Whole-building identities remain Building results and NUSMods aliases.

Use UCI's itemized pages as the primary candidate inventory and descriptive source; use the Campus Map to help resolve coordinates and campus/building location. Before copying additional compiled records or coordinates into the public NUSGo bundle, ask UCI/map owners for a reusable export, stable endpoint, and written permission. If permission is unavailable, use a source with a clear compatible reuse license and record its attribution. Do not build a production sync against the undocumented autocomplete endpoint.

Make initial campus coverage explicit as Kent Ridge, UTown, and Bukit Timah; verify Outram separately before claiming the first release covers every NUS campus.

## Sources

- [Issue #658](https://github.com/LimZiJing/NUSGo/issues/658)
- [Issue #701](https://github.com/LimZiJing/NUSGo/issues/701)
- [NUS UCI Retail and Dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/)
- [NUS UCI Kent Ridge F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/)
- [NUS UCI UTown F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/)
- [NUS UCI Bukit Timah F&B](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/)
- [NUS UCI Reuse Campaign locations](https://uci.nus.edu.sg/campus-sustainability/reuse-campaign/)
- [NUS Campus Map](https://map.nus.edu.sg/)
- [NUS Campus Map search endpoint](https://map.nus.edu.sg/index.php/search/ajax_auto)
- [NUS Legal Information & Notices](https://nus.edu.sg/legal-information-notices)
