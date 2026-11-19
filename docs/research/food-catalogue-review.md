# Food catalogue review

Updated 16 November 2026. The [Food data](../../frontend/public/data/food.json) contains 39 entries. Locations use exact OpenStreetMap points, coordinates supplied by the user, or shared building points as noted below.

## Still needs confirmation

- **Anna's x The Soup Spoon Union** — NUS lists Forum; no exact OSM point matched.
- **Bistro Box** — NUS lists CDE; no exact OSM point matched.
- **Bueno Bueno** — NUS groups it with Waa Cow; OSM has a separate point for Waa Cow only.
- **Wonderful Cafe (CDE)** — NUS lists the location, but no exact OSM point matched.
- **Tomoro Coffee (NUS College)** — NUS lists the location, but no exact OSM point matched.
- **Fine Food, Hwang's Korean Restaurant, Jollibee (UTown), Makan Malah!, and The Royals Bistro** — share the UTown building point at (103.77398, 1.3039); exact venue locations need confirmation.
- **Flavours @ UTown, Bismillah Biryani, and Sapore** — share the UTown building point at (103.77252, 1.30462); exact venue locations need confirmation.
- **South & East and Poonsti Café** — share the Shaw Foundation Alumni House (SFAH) building point at (103.7736, 1.29325); exact venue locations need confirmation.

## Map matches not added

These have map points but are outside the current scope or still need a kiosk/category decision:

- **Nine Fresh** and **Smooy** — OSM maps [Nine Fresh](https://www.openstreetmap.org/node/9956523136) and [Smooy](https://www.openstreetmap.org/node/11252774987), but dessert shops are outside the current category set.
- **Triplets** — [OSM maps a bakery at UTown](https://www.openstreetmap.org/node/11243889361); confirm whether it is a standalone destination or a small counter.
- **Mr Bean / Do Qoo** — an [OSM Mr Bean point](https://www.openstreetmap.org/node/6405687986) was found, but it does not match the UTown location in the current NUS directory.
- **Other Subway point** — OSM has [another Subway point](https://www.openstreetmap.org/way/439895308) near Kent Ridge, but it does not match the UTown branch listed by NUS.

## Location and source notes

- Each `location.x` is longitude and `location.y` is latitude. Exact OSM POI coordinates, user-supplied coordinates, and existing building points from `buildings.json` are documented separately above. Shared points are approximations, so overlapping markers are expected until exact locations are confirmed. The JSON stores only the name, `foodType`, and location; validation adds `kind: 'food'` at runtime.
- Display names use **HSSML**, **ERC**, and **CDE** for the corresponding campus locations.
- The added records now include BTC Cafeteria, A Hot Hideout (PGP), Arise and Shine, CHAGEE, Nami, The Spread, Subway (UTown), Udon Don Bar, Waa Cow, Cool Spot, Starbucks (CDE), Supersnacks (PGPR), Supersnacks (UTown), and Wild Skew.
- The user supplied the coordinates for A Hot Hideout and both Supersnacks entries. NUS lists A Hot Hideout at PGP and Supersnacks at PGPR and Stephen Riady Centre. OSM points are linked below for Starbucks (CDE) and Wild Skew.
- All beverage and snack outlets use `foodType: 'drinks & snacks'` per the user's decision; OSM tags Cool Spot as a convenience shop.
- **Waa Cow / Bueno Bueno** is one UCI directory listing. Only Waa Cow has an exact OSM point, so the JSON uses the mapped name “Waa Cow” and leaves Bueno Bueno unconfirmed.
- Initial research found that NUS site content needs permission to reproduce. The project owner has since confirmed reuse permission and that attribution is handled. OSM attribution remains required: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- The UCI dining pages cover Kent Ridge, University Town, and Bukit Timah. Confirm whether Outram should be included. The UCI index total also differs from the sum of campus totals, so it should not be used as a completeness check.

## Sources

- NUS UCI dining: [Kent Ridge](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/), [University Town](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/), [Bukit Timah](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/)
- OpenStreetMap: [BTC Cafeteria / The Summit](https://www.openstreetmap.org/node/5744038799), [Arise and Shine](https://www.openstreetmap.org/node/5894567819), [CHAGEE](https://www.openstreetmap.org/node/8002821814), [Nami Café](https://www.openstreetmap.org/node/9781243796), [The Spread](https://www.openstreetmap.org/node/11137500570), [Subway (UTown)](https://www.openstreetmap.org/node/9876332639), [Udon Don Bar](https://www.openstreetmap.org/node/1396677548), [Waa Cow](https://www.openstreetmap.org/way/438349846), [Cool Spot](https://www.openstreetmap.org/node/11210351494), [Starbucks (CDE)](https://www.openstreetmap.org/node/8666521241), [Wild Skew](https://www.openstreetmap.org/node/6938838861)
- [NUS Campus Map](https://map.nus.edu.sg/)
