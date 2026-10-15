# NUS building inventory: candidate review

Review date: 13/10/2026. Status: **candidate inventory approved for selection, with provisional entrances still unverified.** All entries are selectable. 231 use API centroids; 29 use provisional OSM entrance candidates. No pedestrian entrance has been verified on the ground or from imagery.

**Update 13/10/2026:** the maintainer approved the 260 entries as selectable and accepted the 29 single OSM entrance candidates (11 main-tagged, 18 single) as provisional entrances. They are recorded in `scripts/data/building-overrides.json` and marked `provisional-entrance` in `buildings.json`; the other 231 stay on centroids. Gap dispositions, the ambiguous prefixes and the proposed categories were not decided and remain open.

## Sources and method

- **Building list:** NUS Digital Twin `GET /buildings`, one request on 13/10/2026 (260 records), committed as `docs/research/nus-digital-twin/buildings-raw-2026-10-13.json`. Room links and the rest of the import are in `dedupe-report.md`.
- **Entrance evidence:** OpenStreetMap, read through the public Overpass API on 12/10/2026 (UTC; data timestamps 16:39 to 16:48). For each building the OSM object was found from its `elementId`, then every node on its outline tagged `entrance=*` was collected. Nodes tagged service, exit, staircase, shop, parking, hotel, no, or with private access were ignored. This is ODbL data: credit "© OpenStreetMap contributors" if any coordinate is used. Licensing is not a blocker (maintainer decision of 12/10/2026), but this is a second source with its own attribution.
- **Campuses:** NUS's own pages describe three campuses: Kent Ridge, Bukit Timah and Outram (Duke-NUS). UTown is part of the Kent Ridge area.
- **Campus and category columns** are my proposals from coordinates and names. They are unreviewed and are not stored in `buildings.json`.

## Coverage

- **Only Kent Ridge and UTown are covered.** All 260 API records lie between latitude 1.2903 and 1.3084 and longitude 103.7697 and 103.7829 (216 Kent Ridge, 44 UTown). **Bukit Timah and Outram have no records in the API.** This is a gap, not an exclusion. NUS describes Bukit Timah as hosting the Faculty of Law and the Lee Kuan Yew School of Public Policy, and Outram as hosting Duke-NUS Medical School. No building list for either was gathered, and the official NUS campus map (map.nus.edu.sg) was not used because its reuse terms are unchecked.
- **Categories present** (proposed): academic/administrative 96, residential 92, lecture/event 30, residential (unconfirmed) 9, library 6, arts/culture 5, sports 5, food/dining 4, ancillary 4, student facilities 4, food/dining (unconfirmed) 2, health 2, research 1. Named residential blocks, ancillary buildings and lecture theatres are present as individual records.
- **Other possible gaps, not checked:** standalone ancillary structures that OSM or the API omit (substations, pump houses, bus shelters) and buildings opened since the API's last update.

## Entrance results

| Result | Buildings |
|---|---|
| One main-tagged entrance on the outline (candidate) | 11 |
| Exactly one usable entrance, not tagged main (candidate) | 18 |
| Several entrances, none preferred | 11 |
| No usable entrance node in OSM | 214 |
| No OSM id (cannot be looked up) | 6 |

Only 29 of 260 buildings (11%) have a single entrance candidate. OSM cannot supply verified entrances at scale; the rest need an on-site or imagery check.

### COM 3 and BIZ 2 (named in the acceptance criteria)

- **COM 3** (`relation/15780831`): no entrance node on its outline. Its centroid is 73 m from the COM3 shuttle stop (1.294431, 103.775217). The stop is a separate identity and must not be used as the entrance. **Entrance unverified; needs an on-site check.**
- **BIZ 2** (`way/54619697`): no entrance node on its outline. The only entrance node within 60 m is 59 m from the centroid and does not belong to this outline. The BIZ2 shuttle stop (1.293223, 103.775068) is 36 m from the centroid and is separate. **Entrance unverified; needs an on-site check.**
- Both stay selectable on their centroids, distinct from their stops, until verified.

## Findings from source review

1. **`elementId` is not always an OpenStreetMap ID.** 6 records use text IDs: `UNIVERSITY_HALL`, `NUS_MUSEUM`, `UNIVERSITY_CULTURAL_CENTRE`, `HELIX_HOUSE`, `PGP_RESIDENCE_2_CANTEEN_FOYER`, `PGP_RESIDENCE_2`. They cannot be looked up in OSM.
2. **A numeric `elementId` does not say whether it is an OSM way or a relation.** 6 buildings have both a way and a relation with that number: UTown Residence North Tower (`7765113`), UTown Residence South Tower (`7765114`), Town Plaza (`15314907`), COM3 (`15780831`), King Edward VII Hall Block G (`15521864`), Institute of Systems Science (`4548824`). I chose by name match (for Institute of Systems Science, the way with the same number is a different building, "Tyskö"). Treat `elementId` as an opaque reference and never fetch an OSM object from it without a type.
3. **Two postal codes are invalid** (Kent Ridge Hall Blocks D and E have 7 digits); the importer omits them.

## Open review questions

1. Disposition of the gaps: (a) Bukit Timah and Outram buildings: defer to a follow-up with a named source, or have a list drafted once the NUS campus map's reuse terms are checked? (b) COM 3, BIZ 2 and the 214 buildings with no entrance: on-site verification by the team, or centroid-only for now?
2. Resolve the ambiguous room-prefix links in `dedupe-report.md` (Frontier, RC1 to RC3, SH, Y), which need overrides.
3. Confirm the proposed categories and campus split, or say which to correct.

## Inventory (260 buildings)

Entrance evidence is unverified OSM data and every location is the API centroid. Review date 13/10/2026 for all rows. Sources for all rows: NUS Digital Twin (City Syntax Lab) for identity and centroid; OpenStreetMap contributors for entrance evidence.

| ID | Name | OSM object | Campus | Category (proposed) | Aliases | Centroid lat,lon | Entrance evidence (OSM) | Nearest shuttle stop |
|---|---|---|---|---|---|---|---|---|
| `as1` | AS1 | [way/142077688](https://www.openstreetmap.org/way/142077688) | Kent Ridge | academic/administrative | AS 1 | 1.29526,103.77214 | none in OSM | CLB 151 m |
| `as2` | AS2 | [way/142077129](https://www.openstreetmap.org/way/142077129) | Kent Ridge | academic/administrative | AS 2 | 1.29522,103.77134 | none in OSM | LT13-OPP 81 m |
| `as3` | AS3 | [way/142077984](https://www.openstreetmap.org/way/142077984) | Kent Ridge | academic/administrative | AS 3 | 1.29475,103.77129 | none in OSM | LT13 76 m |
| `as4` | AS4 | [way/142078389](https://www.openstreetmap.org/way/142078389) | Kent Ridge | academic/administrative | AS 4 | 1.29455,103.77178 | 2 candidates, none preferred: [yes 10581123935](https://www.openstreetmap.org/node/10581123935), [yes 11146664412](https://www.openstreetmap.org/node/11146664412) | AS5 109 m |
| `as5` | AS5 | [way/142080062](https://www.openstreetmap.org/way/142080062) | Kent Ridge | academic/administrative | AS 5 | 1.29416,103.77182 | none in OSM | AS5 71 m |
| `as6` | AS6 | [relation/15347235](https://www.openstreetmap.org/relation/15347235) | Kent Ridge | academic/administrative | AS 6 | 1.29557,103.77322 | **candidate** [yes 10574167549](https://www.openstreetmap.org/node/10574167549) 1.295364,103.773560 (44 m from centroid) | CLB 171 m |
| `as7-shaw-foundation-building` | AS7 - Shaw Foundation Building | [way/142079835](https://www.openstreetmap.org/way/142079835) | Kent Ridge | academic/administrative | AS 7, AS7, Shaw Foundation Building | 1.29432,103.77111 | **candidate** [main 10701211314](https://www.openstreetmap.org/node/10701211314) 1.294172,103.770923 (27 m from centroid) | LT13 53 m |
| `as8` | AS8 | [way/54583485](https://www.openstreetmap.org/way/54583485) | Kent Ridge | academic/administrative | AS 8 | 1.29603,103.77229 | none in OSM | CLB 65 m |
| `biz-1-mochtar-riady-building` | BIZ 1 - Mochtar Riady Building | [way/140087160](https://www.openstreetmap.org/way/140087160) | Kent Ridge | academic/administrative | BIZ 1, BIZ1, Mochtar Riady Building | 1.2925,103.77415 | 2 candidates, none preferred: [yes 11137500571](https://www.openstreetmap.org/node/11137500571), [yes 11137500572](https://www.openstreetmap.org/node/11137500572) | HSSML-OPP 98 m |
| `biz-2` | BIZ 2 | [way/54619697](https://www.openstreetmap.org/way/54619697) | Kent Ridge | academic/administrative | BIZ2 | 1.29355,103.77507 | none in OSM | BIZ2 36 m |
| `c-j-koh-law-library-elm-wing` | C J Koh Law Library (Elm Wing) | [way/732229047](https://www.openstreetmap.org/way/732229047) | UTown | library | - | 1.30616,103.77237 | none in OSM | UTOWN 357 m |
| `cendana-college-1` | Cendana College | [way/732229037](https://www.openstreetmap.org/way/732229037) | UTown | residential | - | 1.30812,103.77221 | none in OSM | UTOWN 543 m |
| `cendana-college-2` | Cendana College | [way/732229051](https://www.openstreetmap.org/way/732229051) | UTown | residential | - | 1.30791,103.77249 | none in OSM | UTOWN 507 m |
| `cendana-college-3` | Cendana College | [way/732229052](https://www.openstreetmap.org/way/732229052) | UTown | residential | - | 1.30775,103.77239 | none in OSM | UTOWN 497 m |
| `cendana-college-4` | Cendana College | [way/732229053](https://www.openstreetmap.org/way/732229053) | UTown | residential | - | 1.30814,103.77248 | none in OSM | UTOWN 531 m |
| `cendana-college-5` | Cendana College | [way/732229054](https://www.openstreetmap.org/way/732229054) | UTown | residential | - | 1.30783,103.77207 | none in OSM | UTOWN 523 m |
| `central-library` | Central Library | [way/54583490](https://www.openstreetmap.org/way/54583490) | Kent Ridge | library | CLB | 1.29662,103.77308 | 3 candidates, none preferred: [yes 11224826735](https://www.openstreetmap.org/node/11224826735), [yes 11145601670](https://www.openstreetmap.org/node/11145601670), [yes 11018992687](https://www.openstreetmap.org/node/11018992687) | CLB 57 m |
| `central-library-annexe` | Central Library Annexe | [way/140087398](https://www.openstreetmap.org/way/140087398) | Kent Ridge | library | - | 1.29692,103.77378 | none in OSM | IT 125 m |
| `central-water-tank` | Central Water Tank | [way/163560748](https://www.openstreetmap.org/way/163560748) | Kent Ridge | ancillary | - | 1.295509,103.776727 | none in OSM | TCOMS-OPP 191 m |
| `centre-for-english-language-communication` | Centre for English Language Communication | [way/140084916](https://www.openstreetmap.org/way/140084916) | Kent Ridge | academic/administrative | CELC | 1.29698,103.77139 | **candidate** [yes 11243901177](https://www.openstreetmap.org/node/11243901177) 1.297134,103.771613 (30 m from centroid) | IT 120 m |
| `centre-for-life-sciences` | Centre for Life Sciences | [way/141913023](https://www.openstreetmap.org/way/141913023) | Kent Ridge | academic/administrative | CELS | 1.29444,103.78077 | none in OSM | PGP 300 m |
| `centre-for-protective-technology` | Centre for Protective Technology | [way/298991082](https://www.openstreetmap.org/way/298991082) | Kent Ridge | academic/administrative | - | 1.29719,103.77515 | none in OSM | UHC-OPP 185 m |
| `chinese-library` | Chinese Library | [way/140087374](https://www.openstreetmap.org/way/140087374) | Kent Ridge | library | - | 1.29695,103.77339 | **candidate** [yes 11224826735](https://www.openstreetmap.org/node/11224826735) 1.296943,103.773192 (22 m from centroid) | IT 63 m |
| `chua-thian-poh-hall` | Chua Thian Poh Hall | [way/124543532](https://www.openstreetmap.org/way/124543532) | UTown | residential | - | 1.30702,103.77329 | none in OSM | UTOWN 380 m |
| `cinnamon-college` | Cinnamon College | [way/124542228](https://www.openstreetmap.org/way/124542228) | UTown | residential | - | 1.30669,103.77347 | none in OSM | UTOWN 338 m |
| `cinnamon-south-learn-lobe` | Cinnamon South Learn Lobe | [way/124549211](https://www.openstreetmap.org/way/124549211) | UTown | residential | - | 1.30657,103.77315 | none in OSM | UTOWN 341 m |
| `college-of-alice-and-peter-tan` | College of Alice & Peter Tan | [way/124543527](https://www.openstreetmap.org/way/124543527) | UTown | residential | CAPT | 1.3076,103.77315 | none in OSM | UTOWN 445 m |
| `college-of-alice-and-peter-tan-multi-purpose-hall` | College of Alice & Peter Tan Multi-Purpose Hall | [way/124543528](https://www.openstreetmap.org/way/124543528) | UTown | residential | - | 1.30731,103.77314 | none in OSM | UTOWN 416 m |
| `com1` | COM1 | [way/54619721](https://www.openstreetmap.org/way/54619721) | Kent Ridge | academic/administrative | COM 1 | 1.29502,103.77391 | **candidate** [main 5936493260](https://www.openstreetmap.org/node/5936493260) 1.294807,103.773695 (34 m from centroid) | COM3 174 m |
| `com2` | COM2 | [way/54619699](https://www.openstreetmap.org/way/54619699) | Kent Ridge | academic/administrative | COM 2 | 1.29397,103.77413 | 2 candidates, none preferred: [yes 1345143358](https://www.openstreetmap.org/node/1345143358), [yes 5936531500](https://www.openstreetmap.org/node/5936531500) | COM3 131 m |
| `com3` | COM3 | [relation/15780831](https://www.openstreetmap.org/relation/15780831) | Kent Ridge | academic/administrative | COM 3 | 1.29458,103.77458 | none in OSM | COM3 73 m |
| `com4` | COM4 | [way/1084196072](https://www.openstreetmap.org/way/1084196072) | Kent Ridge | academic/administrative | COM 4 | 1.29513,103.77538 | **candidate** [yes 11252774947](https://www.openstreetmap.org/node/11252774947) 1.295049,103.775609 (27 m from centroid) | COM3 81 m |
| `create` | Create | [way/420847275](https://www.openstreetmap.org/way/420847275) | UTown | academic/administrative | - | 1.30418,103.77437 | none in OSM | UTOWN 44 m |
| `create-tower` | Create Tower | [way/125842215](https://www.openstreetmap.org/way/125842215) | UTown | academic/administrative | - | 1.30385,103.77358 | 2 candidates, none preferred: [yes 11026965718](https://www.openstreetmap.org/node/11026965718), [yes 11026965719](https://www.openstreetmap.org/node/11026965719) | UTOWN 116 m |
| `dining-hall-1` | Dining Hall | [way/124236990](https://www.openstreetmap.org/way/124236990) | UTown | food/dining | - | 1.30646,103.77361 | none in OSM | UTOWN 309 m |
| `dining-hall-2` | Dining Hall | [way/124543529](https://www.openstreetmap.org/way/124543529) | UTown | food/dining | - | 1.3079,103.77328 | none in OSM | UTOWN 472 m |
| `director-administration-conference-room` | Director Administration Conference Room | [way/173058823](https://www.openstreetmap.org/way/173058823) | Kent Ridge | academic/administrative | - | 1.29253,103.77919 | none in OSM | PGP 161 m |
| `e1` | E1 | [way/139976357](https://www.openstreetmap.org/way/139976357) | Kent Ridge | academic/administrative | - | 1.29939,103.77079 | none in OSM | JP-SCH-16151 182 m |
| `e1a` | E1A | [way/139976284](https://www.openstreetmap.org/way/139976284) | Kent Ridge | academic/administrative | - | 1.29871,103.7711 | none in OSM | SDE3-OPP 195 m |
| `e2` | E2 | [way/139974570](https://www.openstreetmap.org/way/139974570) | Kent Ridge | academic/administrative | - | 1.29931,103.77118 | none in OSM | JP-SCH-16151 216 m |
| `e2a` | E2A | [way/628777635](https://www.openstreetmap.org/way/628777635) | Kent Ridge | academic/administrative | - | 1.29877,103.77138 | none in OSM | SDE3-OPP 225 m |
| `e3` | E3 | [way/139971771](https://www.openstreetmap.org/way/139971771) | Kent Ridge | academic/administrative | - | 1.29945,103.77172 | none in OSM | RAFFLES 199 m |
| `e3a` | E3A | [way/139974054](https://www.openstreetmap.org/way/139974054) | Kent Ridge | academic/administrative | - | 1.30026,103.77144 | none in OSM | RAFFLES 160 m |
| `e4` | E4 | [way/139970613](https://www.openstreetmap.org/way/139970613) | Kent Ridge | academic/administrative | - | 1.29871,103.77219 | none in OSM | IT 176 m |
| `e4a` | E4A | [way/139960333](https://www.openstreetmap.org/way/139960333) | Kent Ridge | academic/administrative | - | 1.29864,103.77258 | none in OSM | IT 160 m |
| `e5` | E5 | [way/54583929](https://www.openstreetmap.org/way/54583929) | Kent Ridge | academic/administrative | - | 1.29801,103.77244 | none in OSM | IT 94 m |
| `e5a-t-lab` | E5A / T-Lab | [way/139957953](https://www.openstreetmap.org/way/139957953) | Kent Ridge | academic/administrative | - | 1.29973,103.7721 | none in OSM | RAFFLES 151 m |
| `e6` | E6 | [way/139959760](https://www.openstreetmap.org/way/139959760) | Kent Ridge | academic/administrative | - | 1.29916,103.77304 | none in OSM | YIH-OPP 123 m |
| `e7` | E7 | [way/1060426986](https://www.openstreetmap.org/way/1060426986) | Kent Ridge | academic/administrative | - | 1.2986,103.77335 | none in OSM | YIH-OPP 92 m |
| `e8` | E8 | [way/139959807](https://www.openstreetmap.org/way/139959807) | Kent Ridge | academic/administrative | - | 1.29914,103.77252 | none in OSM | YIH-OPP 180 m |
| `ea` | EA | [way/139978993](https://www.openstreetmap.org/way/139978993) | Kent Ridge | academic/administrative | - | 1.30055,103.77077 | none in OSM | JP-SCH-16151 99 m |
| `education-resource-centre` | Education Resource Centre | [way/124549217](https://www.openstreetmap.org/way/124549217) | UTown | academic/administrative | ERC | 1.30598,103.77291 | none in OSM | UTOWN 302 m |
| `elm-college-1` | Elm College | [way/732229043](https://www.openstreetmap.org/way/732229043) | UTown | residential | - | 1.30654,103.77214 | none in OSM | UTOWN 405 m |
| `elm-college-2` | Elm College | [way/732229045](https://www.openstreetmap.org/way/732229045) | UTown | residential | - | 1.30624,103.77195 | none in OSM | UTOWN 397 m |
| `elm-college-3` | Elm College | [way/732229048](https://www.openstreetmap.org/way/732229048) | UTown | residential | - | 1.30646,103.77236 | none in OSM | UTOWN 382 m |
| `eusoff-hall-block-a` | Eusoff Hall Block A | [way/142219217](https://www.openstreetmap.org/way/142219217) | Kent Ridge | residential | - | 1.29349,103.76968 | none in OSM | KRB 122 m |
| `eusoff-hall-block-b-and-c` | Eusoff Hall Block B and C | [way/142219214](https://www.openstreetmap.org/way/142219214) | Kent Ridge | residential | - | 1.29304,103.77002 | none in OSM | KRB 166 m |
| `eusoff-hall-block-d` | Eusoff Hall Block D | [way/142219212](https://www.openstreetmap.org/way/142219212) | Kent Ridge | residential | - | 1.29326,103.77039 | none in OSM | AS5 127 m |
| `eusoff-hall-block-e` | Eusoff Hall Block E | [way/142219213](https://www.openstreetmap.org/way/142219213) | Kent Ridge | residential | - | 1.29352,103.77027 | none in OSM | KRB 117 m |
| `ew1` | EW1 | [way/54619717](https://www.openstreetmap.org/way/54619717) | Kent Ridge | academic/administrative | EW 1 | 1.29854,103.77072 | none in OSM | SDE3-OPP 149 m |
| `ew1a` | EW1A | [way/624224897](https://www.openstreetmap.org/way/624224897) | Kent Ridge | academic/administrative | EW 1A | 1.29943,103.77038 | none in OSM | JP-SCH-16151 158 m |
| `frontier-1` | Frontier | [way/141910213](https://www.openstreetmap.org/way/141910213) | Kent Ridge | academic/administrative | - | 1.29647,103.78067 | none in OSM | LT27 110 m |
| `frontier-2` | Frontier | [way/874067395](https://www.openstreetmap.org/way/874067395) | Kent Ridge | academic/administrative | - | 1.29645,103.78033 | **candidate** [yes 11025586094](https://www.openstreetmap.org/node/11025586094) 1.296367,103.780081 (29 m from centroid) | S17 147 m |
| `greenhouse-1` | Greenhouse | [way/1158481785](https://www.openstreetmap.org/way/1158481785) | Kent Ridge | ancillary | - | 1.29461,103.77716 | none in OSM | TCOMS-OPP 104 m |
| `greenhouse-2` | Greenhouse | [way/142089841](https://www.openstreetmap.org/way/142089841) | Kent Ridge | ancillary | - | 1.29391,103.7767 | none in OSM | TCOMS-OPP 14 m |
| `greenhouse-3` | Greenhouse | [way/84517830](https://www.openstreetmap.org/way/84517830) | Kent Ridge | ancillary | - | 1.29384,103.77723 | none in OSM | TCOMS 42 m |
| `helix-house` | Helix House | `HELIX_HOUSE` (not an OSM id) | Kent Ridge | residential (unconfirmed) | - | 1.2913216161148813,103.7795422532624 | none (no OSM id) | PGP 109 m |
| `helix-house-block-15-17` | Helix House Block 15 - 17 | [way/238932766](https://www.openstreetmap.org/way/238932766) | Kent Ridge | residential (unconfirmed) | 17 | 1.29134,103.7796 | none in OSM | PGP 103 m |
| `helix-house-block-18-and-19` | Helix House Block 18 and 19 | [way/238932773](https://www.openstreetmap.org/way/238932773) | Kent Ridge | residential (unconfirmed) | - | 1.29109,103.77989 | none in OSM | PGP 95 m |
| `hon-sui-sen-memorial-library` | Hon Sui Sen Memorial Library | [way/54619685](https://www.openstreetmap.org/way/54619685) | Kent Ridge | library | HSS | 1.29302,103.77444 | **candidate** [yes 10773610197](https://www.openstreetmap.org/node/10773610197) 1.293131,103.774747 (36 m from centroid) | BIZ2 37 m |
| `i3` | i3 | [way/54619687](https://www.openstreetmap.org/way/54619687) | Kent Ridge | academic/administrative | - | 1.2925,103.77571 | **candidate** [main 11137523179](https://www.openstreetmap.org/node/11137523179) 1.292207,103.775506 (40 m from centroid) | HSSML-OPP 88 m |
| `ims-auditorium` | IMS Auditorium | [way/351136507](https://www.openstreetmap.org/way/351136507) | Kent Ridge | lecture/event | - | 1.29257,103.77974 | none in OSM | PGP 117 m |
| `information-technology` | Information Technology | [way/54583488](https://www.openstreetmap.org/way/54583488) | Kent Ridge | academic/administrative | - | 1.29755,103.77251 | none in OSM | IT 43 m |
| `innovation-4-0` | Innovation 4.0 | [way/54619703](https://www.openstreetmap.org/way/54619703) | Kent Ridge | academic/administrative | - | 1.29458,103.77569 | **candidate** [main 11252774960](https://www.openstreetmap.org/node/11252774960) 1.294164,103.775855 (50 m from centroid) | COM3 77 m |
| `institute-for-math-and-science-1` | Institute for Math and Science | [way/351136508](https://www.openstreetmap.org/way/351136508) | Kent Ridge | academic/administrative | - | 1.29266,103.77951 | none in OSM | PGP 142 m |
| `institute-for-math-and-science-2` | Institute for Math and Science | [way/351136509](https://www.openstreetmap.org/way/351136509) | Kent Ridge | academic/administrative | - | 1.2929,103.77928 | none in OSM | PGP 179 m |
| `institute-of-systems-science` | Institute of Systems Science | [relation/4548824](https://www.openstreetmap.org/relation/4548824) | Kent Ridge | academic/administrative | - | 1.292046,103.77658 | none in OSM | TCOMS 182 m |
| `investigation-division-multi-purpose-room` | Investigation Division Multi-Purpose Room | [way/173059405](https://www.openstreetmap.org/way/173059405) | Kent Ridge | sports | - | 1.29229,103.77958 | none in OSM | PGP 110 m |
| `kent-ridge-guild-house` | Kent Ridge Guild House | [way/858981035](https://www.openstreetmap.org/way/858981035) | Kent Ridge | academic/administrative | - | 1.2938,103.77262 | none in OSM | NUSS-OPP 66 m |
| `kent-ridge-guild-house-extension` | Kent Ridge Guild House Extension | [way/54619694](https://www.openstreetmap.org/way/54619694) | Kent Ridge | academic/administrative | - | 1.29387,103.77308 | none in OSM | NUSS-OPP 90 m |
| `kent-ridge-hall` | Kent Ridge Hall | [way/627395978](https://www.openstreetmap.org/way/627395978) | Kent Ridge | residential | KRH | 1.29178,103.77451 | none in OSM | HSSML-OPP 125 m |
| `kent-ridge-hall-block-a` | Kent Ridge Hall Block A | [way/455250293](https://www.openstreetmap.org/way/455250293) | Kent Ridge | residential | - | 1.29163,103.775 | none in OSM | HSSML-OPP 130 m |
| `kent-ridge-hall-block-b` | Kent Ridge Hall Block B | [way/455250298](https://www.openstreetmap.org/way/455250298) | Kent Ridge | residential | - | 1.29132,103.7749 | none in OSM | HSSML-OPP 165 m |
| `kent-ridge-hall-block-c` | Kent Ridge Hall Block C | [way/455250297](https://www.openstreetmap.org/way/455250297) | Kent Ridge | residential | - | 1.29148,103.77471 | none in OSM | HSSML-OPP 150 m |
| `kent-ridge-hall-block-d` | Kent Ridge Hall Block D | [way/455250296](https://www.openstreetmap.org/way/455250296) | Kent Ridge | residential | - | 1.29154,103.77437 | none in OSM | HSSML-OPP 155 m |
| `kent-ridge-hall-block-e` | Kent Ridge Hall Block E | [way/455250295](https://www.openstreetmap.org/way/455250295) | Kent Ridge | residential | - | 1.29172,103.77412 | none in OSM | HSSML-OPP 153 m |
| `king-edward-vii-hall-block-a` | King Edward VII Hall Block A | [way/238933469](https://www.openstreetmap.org/way/238933469) | Kent Ridge | residential | - | 1.29169,103.78138 | none in OSM | PGPR 81 m |
| `king-edward-vii-hall-block-b` | King Edward VII Hall Block B | [relation/15521866](https://www.openstreetmap.org/relation/15521866) | Kent Ridge | residential | - | 1.29162,103.78127 | none in OSM | PGPR 71 m |
| `king-edward-vii-hall-block-c` | King Edward VII Hall Block C | [relation/15521865](https://www.openstreetmap.org/relation/15521865) | Kent Ridge | residential | - | 1.29149,103.78116 | none in OSM | PGPR 55 m |
| `king-edward-vii-hall-block-d` | King Edward VII Hall Block D | [way/238933484](https://www.openstreetmap.org/way/238933484) | Kent Ridge | residential | - | 1.29141,103.78079 | none in OSM | PGP 57 m |
| `king-edward-vii-hall-block-e-1` | King Edward VII Hall Block E | [way/238933477](https://www.openstreetmap.org/way/238933477) | Kent Ridge | residential | - | 1.29336,103.78052 | none in OSM | PGP 178 m |
| `king-edward-vii-hall-block-e-2` | King Edward VII Hall Block E | [way/238933479](https://www.openstreetmap.org/way/238933479) | Kent Ridge | residential | - | 1.29303,103.78084 | none in OSM | PGP 148 m |
| `king-edward-vii-hall-block-f-1` | King Edward VII Hall Block F | [way/238933473](https://www.openstreetmap.org/way/238933473) | Kent Ridge | residential | - | 1.29327,103.78035 | none in OSM | PGP 168 m |
| `king-edward-vii-hall-block-f-2` | King Edward VII Hall Block F | [way/238933482](https://www.openstreetmap.org/way/238933482) | Kent Ridge | residential | - | 1.29284,103.78074 | none in OSM | PGP 125 m |
| `king-edward-vii-hall-block-g` | King Edward VII Hall Block G | [relation/15521864](https://www.openstreetmap.org/relation/15521864) | Kent Ridge | residential | - | 1.2929,103.78039 | none in OSM | PGP 126 m |
| `king-edward-vii-hall-block-h` | King Edward VII Hall Block H | [way/238933488](https://www.openstreetmap.org/way/238933488) | Kent Ridge | residential | - | 1.29299,103.78022 | none in OSM | PGP 138 m |
| `king-edward-vii-hall-communal-hall` | King Edward VII Hall Communal Hall | [way/238933471](https://www.openstreetmap.org/way/238933471) | Kent Ridge | residential | - | 1.29234,103.78097 | none in OSM | PGP 89 m |
| `kuok-foundation-house-block-7-and-8` | Kuok Foundation House (Block 7 & 8) | [way/241265457](https://www.openstreetmap.org/way/241265457) | Kent Ridge | residential (unconfirmed) | - | 1.30034,103.77361 | none in OSM | MUSEUM 83 m |
| `lee-kong-chian-natural-history-museum` | Lee Kong Chian Natural History Museum | [way/54619794](https://www.openstreetmap.org/way/54619794) | UTown | arts/culture | - | 1.30152,103.77361 | none in OSM | MUSEUM 50 m |
| `lee-wee-kheng-building-s1a-lt-32` | Lee Wee Kheng Building (S1A/LT 32) | [way/141905556](https://www.openstreetmap.org/way/141905556) | Kent Ridge | lecture/event | LT 32, LT32, Lee Wee Kheng Building, S1A | 1.29606,103.77833 | none in OSM | UHALL 131 m |
| `lighthouse-block-26` | LightHouse Block 26 | [way/238932790](https://www.openstreetmap.org/way/238932790) | Kent Ridge | residential (unconfirmed) | - | 1.29062,103.78158 | none in OSM | PGPR 63 m |
| `lighthouse-block-27-and-28` | LightHouse Block 27 and 28 | [way/238932793](https://www.openstreetmap.org/way/238932793) | Kent Ridge | residential (unconfirmed) | - | 1.29029,103.78169 | none in OSM | PGPR 98 m |
| `lighthouse-block-29-and-30` | LightHouse Block 29 and 30 | [way/238932794](https://www.openstreetmap.org/way/238932794) | Kent Ridge | residential (unconfirmed) | - | 1.29049,103.7819 | none in OSM | PGPR 100 m |
| `lim-seng-tjoe-lecture-theatre-lt-27` | Lim Seng Tjoe Lecture Theatre (LT 27) | [way/141907258](https://www.openstreetmap.org/way/141907258) | Kent Ridge | lecture/event | LT 27, LT27, Lim Seng Tjoe Lecture Theatre | 1.297,103.78086 | 2 candidates, none preferred: [yes 10686208839](https://www.openstreetmap.org/node/10686208839), [yes 10686208838](https://www.openstreetmap.org/node/10686208838) | LT27 48 m |
| `lt-1` | LT 1 | [way/139974326](https://www.openstreetmap.org/way/139974326) | Kent Ridge | lecture/event | LT1 | 1.2995,103.77131 | none in OSM | JP-SCH-16151 211 m |
| `lt-10` | LT 10 | [way/142078783](https://www.openstreetmap.org/way/142078783) | Kent Ridge | lecture/event | LT10 | 1.29487,103.772 | none in OSM | AS5 151 m |
| `lt-11` | LT 11 | [way/142076923](https://www.openstreetmap.org/way/142076923) | Kent Ridge | lecture/event | LT11 | 1.29545,103.7714 | none in OSM | LT13-OPP 88 m |
| `lt-12` | LT 12 | [way/142077784](https://www.openstreetmap.org/way/142077784) | Kent Ridge | lecture/event | LT12 | 1.29497,103.77114 | none in OSM | LT13-OPP 71 m |
| `lt-13` | LT 13 | [way/142077734](https://www.openstreetmap.org/way/142077734) | Kent Ridge | lecture/event | LT13 | 1.29506,103.77089 | 2 candidates, none preferred: [yes 11145614452](https://www.openstreetmap.org/node/11145614452), [yes 11145614453](https://www.openstreetmap.org/node/11145614453) | LT13-OPP 43 m |
| `lt-14` | LT 14 | [way/142079319](https://www.openstreetmap.org/way/142079319) | Kent Ridge | lecture/event | LT14 | 1.29571,103.77337 | 2 candidates, none preferred: [yes 10719085821](https://www.openstreetmap.org/node/10719085821), [yes 10719085822](https://www.openstreetmap.org/node/10719085822) | CLB 129 m |
| `lt-15` | LT 15 | [way/142079318](https://www.openstreetmap.org/way/142079318) | Kent Ridge | lecture/event | LT15 | 1.29552,103.77343 | 2 candidates, none preferred: [yes 14158954270](https://www.openstreetmap.org/node/14158954270), [yes 14158954269](https://www.openstreetmap.org/node/14158954269) | CLB 149 m |
| `lt-16` | LT 16 | [way/142082467](https://www.openstreetmap.org/way/142082467) | Kent Ridge | lecture/event | LT16 | 1.29392,103.77386 | **candidate** [yes 13760043544](https://www.openstreetmap.org/node/13760043544) 1.294047,103.773801 (16 m from centroid) | NUSS-OPP 161 m |
| `lt-17` | LT 17 | [way/142082470](https://www.openstreetmap.org/way/142082470) | Kent Ridge | lecture/event | LT17 | 1.29361,103.774 | none in OSM | BIZ2 126 m |
| `lt-18` | LT 18 | [way/142083506](https://www.openstreetmap.org/way/142083506) | Kent Ridge | lecture/event | LT18 | 1.29332,103.7746 | none in OSM | BIZ2 53 m |
| `lt-19` | LT 19 | [way/142083509](https://www.openstreetmap.org/way/142083509) | Kent Ridge | lecture/event | LT19 | 1.29364,103.77445 | **candidate** [yes 11243901183](https://www.openstreetmap.org/node/11243901183) 1.293794,103.774344 (21 m from centroid) | BIZ2 102 m |
| `lt-2` | LT 2 | [way/139974364](https://www.openstreetmap.org/way/139974364) | Kent Ridge | lecture/event | LT2 | 1.29932,103.77142 | none in OSM | RAFFLES 230 m |
| `lt-20` | LT 20 | [way/141905825](https://www.openstreetmap.org/way/141905825) | Kent Ridge | lecture/event | LT20 | 1.29582,103.7788 | none in OSM | UHALL 145 m |
| `lt-21` | LT 21 | [way/141906024](https://www.openstreetmap.org/way/141906024) | Kent Ridge | lecture/event | LT21 | 1.29536,103.77946 | none in OSM | UHALL 209 m |
| `lt-26` | LT 26 | [way/141910214](https://www.openstreetmap.org/way/141910214) | Kent Ridge | lecture/event | LT26 | 1.29642,103.78113 | none in OSM | LT27 113 m |
| `lt-28` | LT 28 | [way/141907104](https://www.openstreetmap.org/way/141907104) | Kent Ridge | lecture/event | LT28 | 1.29723,103.78116 | none in OSM | LT27 32 m |
| `lt-29` | LT 29 | [way/141907010](https://www.openstreetmap.org/way/141907010) | Kent Ridge | lecture/event | LT29 | 1.29712,103.78128 | **candidate** [yes 11153264937](https://www.openstreetmap.org/node/11153264937) 1.297013,103.781216 (14 m from centroid) | LT27 55 m |
| `lt-3` | LT 3 | [way/140087835](https://www.openstreetmap.org/way/140087835) | Kent Ridge | lecture/event | LT3 | 1.29767,103.77333 | none in OSM | IT 88 m |
| `lt-31` | LT 31 | [way/142075681](https://www.openstreetmap.org/way/142075681) | Kent Ridge | lecture/event | LT31 | 1.29687,103.78039 | none in OSM | S17 81 m |
| `lt-33` | LT 33 | [way/142074913](https://www.openstreetmap.org/way/142074913) | Kent Ridge | lecture/event | LT33 | 1.29776,103.78096 | none in OSM | S17 37 m |
| `lt-34` | LT 34 | [way/142074910](https://www.openstreetmap.org/way/142074910) | Kent Ridge | lecture/event | LT34 | 1.29772,103.78081 | none in OSM | S17 24 m |
| `lt-4` | LT 4 | [way/140087837](https://www.openstreetmap.org/way/140087837) | Kent Ridge | lecture/event | LT4 | 1.29757,103.77352 | none in OSM | IT 101 m |
| `lt-6` | LT 6 | [way/139960627](https://www.openstreetmap.org/way/139960627) | Kent Ridge | lecture/event | LT6 | 1.29878,103.77197 | none in OSM | IT 193 m |
| `lt-7` | LT 7 | [way/139972031](https://www.openstreetmap.org/way/139972031) | Kent Ridge | lecture/event | LT7 | 1.30008,103.77106 | none in OSM | JP-SCH-16151 150 m |
| `lt-8` | LT 8 | [way/142080063](https://www.openstreetmap.org/way/142080063) | Kent Ridge | lecture/event | LT8 | 1.29414,103.77197 | none in OSM | AS5 80 m |
| `lt-9` | LT 9 | [way/142078782](https://www.openstreetmap.org/way/142078782) | Kent Ridge | lecture/event | LT9 | 1.29494,103.77223 | none in OSM | AS5 169 m |
| `md1-tahir-foundation-building` | MD1 - Tahir Foundation Building | [way/141912739](https://www.openstreetmap.org/way/141912739) | Kent Ridge | academic/administrative | MD 1, MD1, Tahir Foundation Building | 1.29536,103.78051 | none in OSM | LT27 234 m |
| `md10` | MD10 | [way/141908489](https://www.openstreetmap.org/way/141908489) | Kent Ridge | academic/administrative | MD 10 | 1.29649,103.78178 | none in OSM | LT27 139 m |
| `md11` | MD11 | [way/141910336](https://www.openstreetmap.org/way/141910336) | Kent Ridge | academic/administrative | MD 11 | 1.29602,103.78178 | **candidate** [main 11020038671](https://www.openstreetmap.org/node/11020038671) 1.295891,103.781940 (23 m from centroid) | LT27 203 m |
| `md2` | MD2 | [way/141912951](https://www.openstreetmap.org/way/141912951) | Kent Ridge | academic/administrative | MD 2 | 1.29491,103.78118 | none in OSM | LT27 280 m |
| `md3` | MD3 | [way/141912946](https://www.openstreetmap.org/way/141912946) | Kent Ridge | academic/administrative | MD 3 | 1.29533,103.78115 | none in OSM | LT27 234 m |
| `md4` | MD4 | [way/141910523](https://www.openstreetmap.org/way/141910523) | Kent Ridge | academic/administrative | MD 4 | 1.29575,103.78093 | none in OSM | LT27 186 m |
| `md4a` | MD4A | [way/141910559](https://www.openstreetmap.org/way/141910559) | Kent Ridge | academic/administrative | MD 4A | 1.29562,103.78084 | none in OSM | LT27 201 m |
| `md5` | MD5 | [way/141910561](https://www.openstreetmap.org/way/141910561) | Kent Ridge | academic/administrative | MD 5 | 1.29563,103.78139 | none in OSM | LT27 205 m |
| `md6` | MD6 | [way/141912974](https://www.openstreetmap.org/way/141912974) | Kent Ridge | academic/administrative | MD 6 | 1.29532,103.78171 | **candidate** [yes 1553396926](https://www.openstreetmap.org/node/1553396926) 1.295322,103.782004 (33 m from centroid) | LT27 262 m |
| `md7` | MD7 | [way/141910273](https://www.openstreetmap.org/way/141910273) | Kent Ridge | academic/administrative | MD 7 | 1.296,103.78114 | none in OSM | LT27 160 m |
| `md9` | MD9 | [way/141908093](https://www.openstreetmap.org/way/141908093) | Kent Ridge | academic/administrative | MD 9 | 1.2967,103.78127 | none in OSM | LT27 88 m |
| `medicine-science-library` | Medicine + Science Library | [way/141913116](https://www.openstreetmap.org/way/141913116) | Kent Ridge | library | - | 1.29696,103.78173 | **candidate** [main 11153264936](https://www.openstreetmap.org/node/11153264936) 1.296970,103.781613 (13 m from centroid) | LT27 90 m |
| `mpsh-1-4` | MPSH 1 - 4 | [way/142090371](https://www.openstreetmap.org/way/142090371) | Kent Ridge | sports | 4, MPSH 1, MPSH1 | 1.30076,103.77603 | none in OSM | UHC 206 m |
| `mpsh-5` | MPSH 5 | [way/54619808](https://www.openstreetmap.org/way/54619808) | Kent Ridge | sports | MPSH5 | 1.30036,103.77633 | none in OSM | UHC 163 m |
| `mpsh-6` | MPSH 6 | [way/142090370](https://www.openstreetmap.org/way/142090370) | Kent Ridge | sports | MPSH6 | 1.30031,103.77576 | none in OSM | UHC 160 m |
| `ngee-ann-kongsi-auditorium` | Ngee Ann Kongsi Auditorium | [way/124550688](https://www.openstreetmap.org/way/124550688) | UTown | lecture/event | NAK | 1.30553,103.77316 | none in OSM | UTOWN 245 m |
| `nus-college-office` | NUS College Office | [way/124543531](https://www.openstreetmap.org/way/124543531) | UTown | academic/administrative | - | 1.30684,103.77303 | none in OSM | UTOWN 374 m |
| `nus-enterprise-incubator` | NUS Enterprise Incubator | [way/12017240](https://www.openstreetmap.org/way/12017240) | Kent Ridge | academic/administrative | - | 1.29331,103.77816 | none in OSM | TCOMS 145 m |
| `nus-museum` | NUS Museum | `NUS_MUSEUM` (not an OSM id) | UTown | arts/culture | - | 1.30176,103.77229 | none (no OSM id) | RAFFLES 101 m |
| `nus-staff-club` | NUS Staff Club | [way/54619777](https://www.openstreetmap.org/way/54619777) | Kent Ridge | academic/administrative | - | 1.29922,103.77578 | none in OSM | UHC 50 m |
| `ocs-command-centre` | OCS Command Centre | [way/1136599404](https://www.openstreetmap.org/way/1136599404) | Kent Ridge | academic/administrative | - | 1.29226,103.77923 | none in OSM | PGP 143 m |
| `office-of-safety-health-and-environment` | Office of Safety, Health and Environment | [way/351136506](https://www.openstreetmap.org/way/351136506) | Kent Ridge | health | - | 1.29241,103.77999 | none in OSM | PGP 86 m |
| `pgp-amphitheatre` | PGP Amphitheatre | [way/241503843](https://www.openstreetmap.org/way/241503843) | Kent Ridge | student facilities | - | 1.29159,103.7799 | none in OSM | PGP 61 m |
| `pgp-canteen` | PGP Canteen | [way/732229815](https://www.openstreetmap.org/way/732229815) | Kent Ridge | food/dining | - | 1.29078,103.78215 | none in OSM | PGPR 113 m |
| `pgp-foyer` | PGP Foyer | [way/251677507](https://www.openstreetmap.org/way/251677507) | Kent Ridge | student facilities | - | 1.29097,103.78114 | none in OSM | PGPR 3 m |
| `pgp-gym` | PGP Gym | [way/238932795](https://www.openstreetmap.org/way/238932795) | Kent Ridge | student facilities | - | 1.29038,103.78084 | 2 candidates, none preferred: [yes 12123569750](https://www.openstreetmap.org/node/12123569750), [yes 12123569752](https://www.openstreetmap.org/node/12123569752) | PGPR 77 m |
| `pgp-mpsh-minimart` | PGP MPSH / Minimart | [way/241523920](https://www.openstreetmap.org/way/241523920) | Kent Ridge | student facilities | - | 1.29048,103.78133 | **candidate** [yes 5250150676](https://www.openstreetmap.org/node/5250150676) 1.290337,103.781262 (18 m from centroid) | PGPR 74 m |
| `pgp-residence-1-block-1` | PGP Residence 1 Block 1 | [way/238932786](https://www.openstreetmap.org/way/238932786) | Kent Ridge | residential | - | 1.29155,103.7829 | none in OSM | PGPR 204 m |
| `pgp-residence-1-block-2` | PGP Residence 1 Block 2 | [way/238932783](https://www.openstreetmap.org/way/238932783) | Kent Ridge | residential | - | 1.29143,103.78266 | none in OSM | PGPR 174 m |
| `pgp-residence-1-block-3` | PGP Residence 1 Block 3 | [way/238932785](https://www.openstreetmap.org/way/238932785) | Kent Ridge | residential | - | 1.29132,103.78242 | none in OSM | PGPR 145 m |
| `pgp-residence-1-block-4` | PGP Residence 1 Block 4 | [way/238932792](https://www.openstreetmap.org/way/238932792) | Kent Ridge | residential | - | 1.2912,103.78218 | none in OSM | PGPR 116 m |
| `pgp-residence-2` | PGP Residence 2 | `PGP_RESIDENCE_2` (not an OSM id) | Kent Ridge | residential | - | 1.29097,103.78114 | none (no OSM id) | PGPR 3 m |
| `pgp-residence-2-block-5` | PGP Residence 2 Block 5 | [way/238932778](https://www.openstreetmap.org/way/238932778) | Kent Ridge | residential | - | 1.29101,103.78176 | none in OSM | PGPR 68 m |
| `pgp-residence-2-block-6` | PGP Residence 2 Block 6 | [way/238932780](https://www.openstreetmap.org/way/238932780) | Kent Ridge | residential | - | 1.29088,103.78148 | none in OSM | PGPR 38 m |
| `pgp-residence-2-block-7` | PGP Residence 2 Block 7 | [way/238932775](https://www.openstreetmap.org/way/238932775) | Kent Ridge | residential | - | 1.29083,103.78121 | none in OSM | PGPR 19 m |
| `pgp-residence-2-block-8` | PGP Residence 2 Block 8 | [way/1084099106](https://www.openstreetmap.org/way/1084099106) | Kent Ridge | residential | - | 1.29085,103.78086 | none in OSM | PGPR 36 m |
| `pgp-residence-2-foyer-and-canteen` | PGP Residence 2, Foyer and Canteen | `PGP_RESIDENCE_2_CANTEEN_FOYER` (not an OSM id) | Kent Ridge | food/dining | - | 1.29097,103.78114 | none (no OSM id) | PGPR 3 m |
| `pgp-residence-3-block-10` | PGP Residence 3 Block 10 | [way/238932777](https://www.openstreetmap.org/way/238932777) | Kent Ridge | residential | - | 1.29119,103.78032 | none in OSM | PGP 65 m |
| `pgp-residence-3-block-11` | PGP Residence 3 Block 11 | [way/238932781](https://www.openstreetmap.org/way/238932781) | Kent Ridge | residential | - | 1.29148,103.78017 | none in OSM | PGP 42 m |
| `pgp-residence-3-block-12` | PGP Residence 3 Block 12 | [way/238932776](https://www.openstreetmap.org/way/238932776) | Kent Ridge | residential | - | 1.29181,103.78011 | none in OSM | PGP 35 m |
| `pgp-residence-3-block-9` | PGP Residence 3 Block 9 | [way/238932782](https://www.openstreetmap.org/way/238932782) | Kent Ridge | residential | - | 1.29098,103.78056 | none in OSM | PGPR 66 m |
| `pgr-graduate-student-block-13` | PGR Graduate Student Block 13 | [way/238932768](https://www.openstreetmap.org/way/238932768) | Kent Ridge | residential | - | 1.29185,103.77986 | none in OSM | PGP 63 m |
| `pgr-graduate-student-block-14` | PGR Graduate Student Block 14 | [way/238932769](https://www.openstreetmap.org/way/238932769) | Kent Ridge | residential | - | 1.29164,103.77964 | none in OSM | PGP 88 m |
| `pioneer-house-block-20-and-21` | Pioneer House Block 20 and 21 | [way/238932772](https://www.openstreetmap.org/way/238932772) | Kent Ridge | residential (unconfirmed) | - | 1.29072,103.78013 | none in OSM | PGPR 118 m |
| `pioneer-house-block-22-25` | Pioneer House Block 22 - 25 | [way/238932774](https://www.openstreetmap.org/way/238932774) | Kent Ridge | residential (unconfirmed) | 25 | 1.29037,103.78042 | none in OSM | PGPR 107 m |
| `raffles-hall-block-1-communal-hall` | Raffles Hall (Block 1 / Communal Hall) | [way/241265458](https://www.openstreetmap.org/way/241265458) | Kent Ridge | residential | Block 1, Block1, Raffles Hall | 1.29989,103.77389 | none in OSM | YIH-OPP 113 m |
| `raffles-hall-block-2` | Raffles Hall Block 2 | [way/241265455](https://www.openstreetmap.org/way/241265455) | Kent Ridge | residential | - | 1.29952,103.77333 | none in OSM | YIH-OPP 111 m |
| `raffles-hall-block-3` | Raffles Hall Block 3 | [way/241265453](https://www.openstreetmap.org/way/241265453) | Kent Ridge | residential | - | 1.30032,103.77317 | none in OSM | RAFFLES 87 m |
| `raffles-hall-block-4` | Raffles Hall Block 4 | [way/241265454](https://www.openstreetmap.org/way/241265454) | Kent Ridge | residential | - | 1.2999,103.77299 | none in OSM | RAFFLES 121 m |
| `raffles-hall-block-5` | Raffles Hall Block 5 | [way/1309257814](https://www.openstreetmap.org/way/1309257814) | Kent Ridge | residential | - | 1.300509,103.773017 | none in OSM | RAFFLES 60 m |
| `raffles-hall-block-6` | Raffles Hall Block 6 | [way/241265456](https://www.openstreetmap.org/way/241265456) | Kent Ridge | residential | - | 1.30029,103.77265 | none in OSM | RAFFLES 73 m |
| `rc4-multi-purpose-hall` | RC4 Multi-Purpose Hall | [way/124543998](https://www.openstreetmap.org/way/124543998) | UTown | residential | - | 1.30836,103.77297 | none in OSM | UTOWN 531 m |
| `rc4-tower` | RC4 Tower | [way/124543999](https://www.openstreetmap.org/way/124543999) | UTown | residential | - | 1.30824,103.77329 | none in OSM | UTOWN 507 m |
| `ridge-view-residential-college-block-a` | Ridge View Residential College Block A | [way/427077073](https://www.openstreetmap.org/way/427077073) | Kent Ridge | residential | - | 1.29773,103.77624 | none in OSM | UHC 132 m |
| `ridge-view-residential-college-block-b` | Ridge View Residential College Block B | [way/427077081](https://www.openstreetmap.org/way/427077081) | Kent Ridge | residential | - | 1.29807,103.77595 | none in OSM | UHC-OPP 88 m |
| `ridge-view-residential-college-block-c` | Ridge View Residential College Block C | [way/427077076](https://www.openstreetmap.org/way/427077076) | Kent Ridge | residential | - | 1.29813,103.77641 | none in OSM | UHC 93 m |
| `ridge-view-residential-college-block-d` | Ridge View Residential College Block D | [way/427077083](https://www.openstreetmap.org/way/427077083) | Kent Ridge | residential | - | 1.29841,103.7758 | none in OSM | UHC-OPP 47 m |
| `ridge-view-residential-college-block-e` | Ridge View Residential College Block E | [way/427077084](https://www.openstreetmap.org/way/427077084) | Kent Ridge | residential | - | 1.29856,103.77617 | none in OSM | UHC 40 m |
| `ridge-view-residential-college-block-g` | Ridge View Residential College Block G | [way/546382548](https://www.openstreetmap.org/way/546382548) | Kent Ridge | residential | - | 1.29739,103.77681 | none in OSM | UHALL-OPP 144 m |
| `ridge-view-tower` | Ridge View Tower | [way/427077072](https://www.openstreetmap.org/way/427077072) | Kent Ridge | residential | - | 1.29791,103.77678 | **candidate** [yes 11503213901](https://www.openstreetmap.org/node/11503213901) 1.297753,103.776893 (22 m from centroid) | UHALL-OPP 134 m |
| `runme-shaw-cfa-studios` | Runme Shaw CFA Studios | [way/54619731](https://www.openstreetmap.org/way/54619731) | Kent Ridge | academic/administrative | - | 1.29919,103.77375 | **candidate** [main 10821049775](https://www.openstreetmap.org/node/10821049775) 1.298946,103.773720 (27 m from centroid) | YIH-OPP 44 m |
| `s1` | S1 | [way/141905781](https://www.openstreetmap.org/way/141905781) | Kent Ridge | academic/administrative | - | 1.29577,103.77793 | none in OSM | UHALL 181 m |
| `s10` | S10 | [way/141906238](https://www.openstreetmap.org/way/141906238) | Kent Ridge | academic/administrative | - | 1.29627,103.77971 | none in OSM | UHALL 137 m |
| `s11` | S11 | [way/141905252](https://www.openstreetmap.org/way/141905252) | Kent Ridge | academic/administrative | - | 1.29665,103.77877 | none in OSM | UHALL 53 m |
| `s12` | S12 | [way/141905202](https://www.openstreetmap.org/way/141905202) | Kent Ridge | academic/administrative | - | 1.29694,103.77869 | none in OSM | UHALL 25 m |
| `s13` | S13 | [way/141905403](https://www.openstreetmap.org/way/141905403) | Kent Ridge | academic/administrative | - | 1.29674,103.77925 | none in OSM | UHALL 64 m |
| `s14` | S14 | [way/140087728](https://www.openstreetmap.org/way/140087728) | Kent Ridge | academic/administrative | - | 1.29686,103.77973 | none in OSM | UHALL 105 m |
| `s15` | S15 | [way/141906507](https://www.openstreetmap.org/way/141906507) | Kent Ridge | academic/administrative | - | 1.29714,103.78025 | **candidate** [yes 1554926664](https://www.openstreetmap.org/node/1554926664) 1.297348,103.780483 (35 m from centroid) | S17 33 m |
| `s16` | S16 | [way/141906506](https://www.openstreetmap.org/way/141906506) | Kent Ridge | academic/administrative | - | 1.29687,103.78039 | **candidate** [yes 10686208841](https://www.openstreetmap.org/node/10686208841) 1.296594,103.780218 (36 m from centroid) | S17 118 m |
| `s17` | S17 | [way/142074912](https://www.openstreetmap.org/way/142074912) | Kent Ridge | academic/administrative | - | 1.29772,103.78055 | **candidate** [yes 1554926665](https://www.openstreetmap.org/node/1554926665) 1.297550,103.780391 (26 m from centroid) | S17 38 m |
| `s2` | S2 | [way/141905796](https://www.openstreetmap.org/way/141905796) | Kent Ridge | academic/administrative | - | 1.29546,103.77801 | none in OSM | UHALL 206 m |
| `s3` | S3 | [way/141905799](https://www.openstreetmap.org/way/141905799) | Kent Ridge | academic/administrative | - | 1.29556,103.77865 | none in OSM | UHALL 175 m |
| `s4` | S4 | [way/141905829](https://www.openstreetmap.org/way/141905829) | Kent Ridge | academic/administrative | - | 1.29562,103.77919 | none in OSM | UHALL 172 m |
| `s4a` | S4A | [way/141905922](https://www.openstreetmap.org/way/141905922) | Kent Ridge | academic/administrative | - | 1.29581,103.77922 | none in OSM | UHALL 153 m |
| `s5` | S5 | [way/141905956](https://www.openstreetmap.org/way/141905956) | Kent Ridge | academic/administrative | - | 1.29546,103.77971 | none in OSM | UHALL 210 m |
| `s6` | S6 | [way/141913009](https://www.openstreetmap.org/way/141913009) | Kent Ridge | academic/administrative | - | 1.29509,103.78023 | none in OSM | LT27 271 m |
| `s7` | S7 | [way/141905434](https://www.openstreetmap.org/way/141905434) | Kent Ridge | academic/administrative | - | 1.29633,103.77888 | none in OSM | UHALL 89 m |
| `s8` | S8 | [way/141905474](https://www.openstreetmap.org/way/141905474) | Kent Ridge | academic/administrative | - | 1.29613,103.77934 | none in OSM | UHALL 125 m |
| `s9-wet-science-building` | S9 - Wet Science Building | [way/141906130](https://www.openstreetmap.org/way/141906130) | Kent Ridge | academic/administrative | S9, Wet Science Building | 1.29594,103.77999 | none in OSM | UHALL 185 m |
| `saga-college-1` | Saga College | [way/732229038](https://www.openstreetmap.org/way/732229038) | UTown | residential | - | 1.30581,103.77231 | none in OSM | UTOWN 335 m |
| `saga-college-2` | Saga College | [way/732229039](https://www.openstreetmap.org/way/732229039) | UTown | residential | - | 1.30554,103.77205 | none in OSM | UTOWN 340 m |
| `saga-college-3` | Saga College | [way/732229040](https://www.openstreetmap.org/way/732229040) | UTown | residential | - | 1.30562,103.77227 | none in OSM | UTOWN 325 m |
| `saga-college-4` | Saga College | [way/732229041](https://www.openstreetmap.org/way/732229041) | UTown | residential | - | 1.30561,103.77182 | none in OSM | UTOWN 366 m |
| `saga-college-5` | Saga College | [way/732229042](https://www.openstreetmap.org/way/732229042) | UTown | residential | - | 1.30585,103.77179 | none in OSM | UTOWN 384 m |
| `saga-college-6` | Saga College | [way/732229046](https://www.openstreetmap.org/way/732229046) | UTown | residential | - | 1.3059,103.77206 | none in OSM | UTOWN 363 m |
| `sde1` | SDE1 | [way/140078777](https://www.openstreetmap.org/way/140078777) | Kent Ridge | academic/administrative | SDE 1 | 1.29732,103.77068 | none in OSM | SDE3-OPP 131 m |
| `sde2` | SDE2 | [way/140078560](https://www.openstreetmap.org/way/140078560) | Kent Ridge | academic/administrative | SDE 2 | 1.29728,103.77113 | none in OSM | IT 173 m |
| `sde3` | SDE3 | [way/140079084](https://www.openstreetmap.org/way/140079084) | Kent Ridge | academic/administrative | SDE 3 | 1.29793,103.77037 | none in OSM | SDE3-OPP 86 m |
| `sde4` | SDE4 | [way/628774809](https://www.openstreetmap.org/way/628774809) | Kent Ridge | academic/administrative | SDE 4 | 1.29681,103.77035 | none in OSM | SDE3-OPP 138 m |
| `shaw-foundation-alumni-house` | Shaw Foundation Alumni House | [way/142080252](https://www.openstreetmap.org/way/142080252) | Kent Ridge | academic/administrative | SFAH | 1.29325,103.7736 | none in OSM | NUSS-OPP 109 m |
| `sheares-block-a` | Sheares Block A | [way/455250294](https://www.openstreetmap.org/way/455250294) | Kent Ridge | residential | - | 1.29151,103.77531 | none in OSM | HSSML-OPP 148 m |
| `sheares-block-b` | Sheares Block B | [way/627395979](https://www.openstreetmap.org/way/627395979) | Kent Ridge | residential | - | 1.29125,103.7752 | none in OSM | HSSML-OPP 174 m |
| `sheares-block-c` | Sheares Block C | [way/455250299](https://www.openstreetmap.org/way/455250299) | Kent Ridge | residential | - | 1.29112,103.7754 | none in OSM | HSSML-OPP 192 m |
| `sheares-block-d` | Sheares Block D | [way/455250300](https://www.openstreetmap.org/way/455250300) | Kent Ridge | residential | - | 1.29105,103.77571 | none in OSM | HSSML-OPP 211 m |
| `sheares-block-e` | Sheares Block E | [way/639080232](https://www.openstreetmap.org/way/639080232) | Kent Ridge | residential | - | 1.29095,103.77595 | none in OSM | HSSML-OPP 232 m |
| `sheares-hall-1` | Sheares Hall | [way/639258228](https://www.openstreetmap.org/way/639258228) | Kent Ridge | residential | - | 1.29137,103.7761 | none in OSM | HSSML-OPP 202 m |
| `sheares-hall-2` | Sheares Hall | [way/640840065](https://www.openstreetmap.org/way/640840065) | Kent Ridge | residential | - | 1.2914,103.77601 | none in OSM | HSSML-OPP 193 m |
| `singapore-synchrotron-light-source` | Singapore Synchrotron Light Source | [way/54619730](https://www.openstreetmap.org/way/54619730) | Kent Ridge | academic/administrative | - | 1.29563,103.77515 | **candidate** [main 11155921865](https://www.openstreetmap.org/node/11155921865) 1.295767,103.774913 (30 m from centroid) | COM3 152 m |
| `singapore-wind-tunnel-facility` | Singapore Wind Tunnel Facility | [way/643598737](https://www.openstreetmap.org/way/643598737) | Kent Ridge | academic/administrative | - | 1.30105,103.77535 | none in OSM | MUSEUM 185 m |
| `stephen-riady-centre` | Stephen Riady Centre | [way/125774787](https://www.openstreetmap.org/way/125774787) | UTown | academic/administrative | UTSRC | 1.30462,103.77252 | none in OSM | UTOWN 248 m |
| `techno-edge` | Techno Edge | [way/730959512](https://www.openstreetmap.org/way/730959512) | Kent Ridge | food/dining (unconfirmed) | - | 1.29795,103.77153 | none in OSM | IT 153 m |
| `technology-centre-for-offshore-and-marine-singapore` | Technology Centre for Offshore and Marine, Singapore | [way/546374635](https://www.openstreetmap.org/way/546374635) | Kent Ridge | academic/administrative | - | 1.29311,103.77668 | none in OSM | TCOMS 65 m |
| `temasek-hall` | Temasek Hall | [way/142221851](https://www.openstreetmap.org/way/142221851) | Kent Ridge | residential | TH | 1.2927,103.77138 | none in OSM | AS5 103 m |
| `temasek-hall-block-a` | Temasek Hall Block A | [way/142221852](https://www.openstreetmap.org/way/142221852) | Kent Ridge | residential | - | 1.29304,103.77079 | none in OSM | AS5 100 m |
| `temasek-hall-block-b` | Temasek Hall Block B | [way/142221865](https://www.openstreetmap.org/way/142221865) | Kent Ridge | residential | - | 1.29268,103.77056 | none in OSM | AS5 146 m |
| `temasek-hall-block-c` | Temasek Hall Block C | [way/142221858](https://www.openstreetmap.org/way/142221858) | Kent Ridge | residential | - | 1.29265,103.77096 | none in OSM | AS5 122 m |
| `temasek-hall-block-d` | Temasek Hall Block D | [way/142221853](https://www.openstreetmap.org/way/142221853) | Kent Ridge | residential | - | 1.29268,103.77182 | none in OSM | NUSS-OPP 106 m |
| `temasek-hall-block-e` | Temasek Hall Block E | [way/142221863](https://www.openstreetmap.org/way/142221863) | Kent Ridge | residential | - | 1.29265,103.77221 | none in OSM | NUSS-OPP 77 m |
| `temasek-life-sciences-laboratory` | Temasek Life Sciences Laboratory | [way/84517831](https://www.openstreetmap.org/way/84517831) | Kent Ridge | research | - | 1.29415,103.77716 | only non-pedestrian nodes: yes | TCOMS 62 m |
| `tembusu-multi-purpose-hall` | Tembusu Multi-Purpose Hall | [way/124230875](https://www.openstreetmap.org/way/124230875) | UTown | residential | - | 1.30594,103.77385 | none in OSM | UTOWN 245 m |
| `tembusu-tower` | Tembusu Tower | [way/124230878](https://www.openstreetmap.org/way/124230878) | UTown | residential | - | 1.30621,103.7737 | **candidate** [yes 11411601592](https://www.openstreetmap.org/node/11411601592) 1.306104,103.773760 (14 m from centroid) | UTOWN 266 m |
| `tembusu-west-learn-lobe` | Tembusu West Learn Lobe | [way/124411297](https://www.openstreetmap.org/way/124411297) | UTown | residential | - | 1.30592,103.77348 | none in OSM | UTOWN 260 m |
| `the-deck` | The Deck | [way/140087193](https://www.openstreetmap.org/way/140087193) | Kent Ridge | food/dining (unconfirmed) | - | 1.29467,103.77249 | none in OSM | AS5 162 m |
| `town-plaza` | Town Plaza | [relation/15314907](https://www.openstreetmap.org/relation/15314907) | UTown | academic/administrative | TP | 1.3039,103.77398 | 3 candidates, none preferred: [yes 10847824860](https://www.openstreetmap.org/node/10847824860), [yes 11026965718](https://www.openstreetmap.org/node/11026965718), [yes 11026965719](https://www.openstreetmap.org/node/11026965719) | UTOWN 71 m |
| `tropical-marine-science-institute` | Tropical Marine Science Institute | [way/163560567](https://www.openstreetmap.org/way/163560567) | Kent Ridge | academic/administrative | - | 1.29756,103.77421 | none in OSM | YIH 148 m |
| `university-cultural-centre` | University Cultural Centre | `UNIVERSITY_CULTURAL_CENTRE` (not an OSM id) | UTown | arts/culture | - | 1.30176,103.77229 | none (no OSM id) | RAFFLES 101 m |
| `university-cultural-centre-nus-museum` | University Cultural Centre / NUS Museum | [way/54583930](https://www.openstreetmap.org/way/54583930) | UTown | arts/culture | - | 1.30176,103.77229 | none in OSM | RAFFLES 101 m |
| `university-hall` | University Hall | `UNIVERSITY_HALL` (not an OSM id) | Kent Ridge | residential | - | 1.29697,103.77787 | none (no OSM id) | UHALL-OPP 71 m |
| `university-hall-lee-kong-chian-wing` | University Hall (Lee Kong Chian Wing) | [way/140087580](https://www.openstreetmap.org/way/140087580) | Kent Ridge | residential | - | 1.29697,103.77787 | none in OSM | UHALL-OPP 71 m |
| `university-hall-tan-chin-tuan-wing` | University Hall (Tan Chin Tuan Wing) | [way/140087584](https://www.openstreetmap.org/way/140087584) | Kent Ridge | residential | - | 1.29716,103.77744 | none in OSM | UHALL-OPP 85 m |
| `university-health-centre` | University Health Centre | [way/54583487](https://www.openstreetmap.org/way/54583487) | Kent Ridge | health | - | 1.29905,103.77643 | none in OSM | UHC 40 m |
| `university-sports-centre` | University Sports Centre | [way/730956214](https://www.openstreetmap.org/way/730956214) | Kent Ridge | sports | - | 1.29971,103.77546 | none in OSM | UHC-OPP 104 m |
| `utown-residence-north-tower` | UTown Residence North Tower | [relation/7765113](https://www.openstreetmap.org/relation/7765113) | UTown | residential | - | 1.30538,103.77379 | **candidate** [main 4366419790](https://www.openstreetmap.org/node/4366419790) 1.305201,103.773795 (20 m from centroid) | UTOWN 174 m |
| `utown-residence-south-tower` | UTown Residence South Tower | [relation/7765114](https://www.openstreetmap.org/relation/7765114) | UTown | residential | - | 1.30488,103.77395 | **candidate** [main 4366419789](https://www.openstreetmap.org/node/4366419789) 1.305033,103.773854 (20 m from centroid) | UTOWN 154 m |
| `ventus` | Ventus | [way/503403831](https://www.openstreetmap.org/way/503403831) | Kent Ridge | academic/administrative | - | 1.29529,103.77022 | **candidate** [yes 11145614465](https://www.openstreetmap.org/node/11145614465) 1.295100,103.770191 (21 m from centroid) | LT13-OPP 54 m |
| `yale-nus-college` | Yale-NUS College | [way/732229050](https://www.openstreetmap.org/way/732229050) | UTown | residential | - | 1.30739,103.77257 | **candidate** [yes 11260211008](https://www.openstreetmap.org/node/11260211008) 1.307403,103.772704 (15 m from centroid) | UTOWN 446 m |
| `yale-nus-college-arts-centre` | Yale-NUS College Arts Centre | [way/732229049](https://www.openstreetmap.org/way/732229049) | UTown | academic/administrative | - | 1.30716,103.77196 | none in OSM | UTOWN 470 m |
| `yale-nus-college-reception-and-admissions` | Yale-NUS College Reception and Admissions | [way/732229044](https://www.openstreetmap.org/way/732229044) | UTown | academic/administrative | - | 1.30644,103.7718 | none in OSM | UTOWN 424 m |
| `yong-siew-toh-conservatory-of-music` | Yong Siew Toh Conservatory of Music | [way/111973157](https://www.openstreetmap.org/way/111973157) | UTown | arts/culture | YSTCM | 1.30218,103.77265 | **candidate** [main 11018992675](https://www.openstreetmap.org/node/11018992675) 1.301757,103.772812 (50 m from centroid) | RAFFLES 91 m |
| `yusof-ishak-house` | Yusof Ishak House | [way/54583491](https://www.openstreetmap.org/way/54583491) | Kent Ridge | academic/administrative | YI | 1.2985,103.77477 | none in OSM | YIH 61 m |
