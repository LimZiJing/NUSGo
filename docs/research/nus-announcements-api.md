# NUS service announcement source

Status: the existing authenticated Univus proxy's `ticker-tapes` endpoint was verified by controlled, read-only requests on 2026-11-09. No credentials or announcement author values were recorded, and no announcement source was verified as a browser-facing API.

## Sources and authority

- [User-supplied mock API reference](https://github.com/EdwardZehuaZhang/nus-nextbus-mock-api/blob/master/API.md) documents a `GET /Announcements` route as well as ticker tapes. That repository is a **mock** service: it supplies an example response shape, not a production endpoint or a production contract. NUSGo does not consume it.
- [Official Univus guide](https://about-univus.nus.edu.sg/univus-tips/) confirms the bus feature but does not specify its private wire API.
- Production observations below use the repository's existing `NusAuthenticatedClient` and `createNusBusProxyRequest`, with deployment credentials kept in the process environment. See [the existing NUS adapter contract](nus-shuttle-api-contract.md).

## Verified production request

`POST` to the configured bus-proxy host's `/univus/api/bus-proxy/ticker-tapes`, with the existing common session body and headers and no extra operation fields, returned code `00000`.

The envelope contained `data.TimeStamp` and `data.TickerTape`. Each observed item contained string fields `ID`, `Message`, `Status`, `Priority`, `Display_From`, `Display_To`, `Affected_Service_Ids`, `Created_On` and `Created_By`, plus `Accident_Latitude` and `Accident_Longitude`, which were null in the sampled item. The notification adapter needs neither authors nor incident coordinates, so the provider parser drops them.

The response held 310 historic records. All observed statuses were `Enabled`; priorities included `High`, `Medium` and `Low`. Affected services were comma-separated route names, or an empty string for a network-wide message. Historical route lists included retired identifiers (`BTC`, `E`, `L`) alongside current route names, so only canonical routes should be admitted; a list containing only unknown routes must not become a network-wide message.

Only one record fell within its display window at observation time: ID `414`, a Medium-priority network-wide notice about the 9 November public-holiday service schedule. Its display interval was `2026-11-08T16:55:00+08:00` to `2026-11-09T23:00:00+08:00`. Historic items remaining `Enabled` demonstrate why status alone cannot select current announcements, and why the display interval must be applied to the whole feed.

## Mock versus live

- **Mock** (the referenced GitHub repository): `GET /Announcements`, an example of a possible route list. It is not reachable from NUSGo's deployment and was not used to build the adapter.
- **Live** (NUSGo's configured bus proxy): `POST .../univus/api/bus-proxy/ticker-tapes`. This is the only source NUSGo reads.

## Limits and implementation implications

- Require a recognized enabled status and a valid display interval containing the evaluation time. Other status semantics were not verified live; rejecting unknown statuses is conservative. A missing or inverted interval, an unknown priority, or a blank message is dropped rather than guessed.
- Treat message text as untrusted plain text. The backend keeps only identity, message, display interval, priority and canonical service references; the push payload is a bounded one-line excerpt.
- Poll through the existing backend refresh lifecycle, at most once per minute, not once per bus stop and not on a second timer. Reuse session handling, timeout, cancellation and delivery limits.
- Suppress repeat notifications only after accepted delivery; a failed send or exhausted allowance must remain retryable while the announcement is active.
- The candidate proxy operations `announcements`, `announcement`, `get-announcements` and `Announcements` returned HTTP 404 with the configured client. This records the observed responses; it is not proof that no announcements API exists elsewhere.
- The live observation verifies a source and its current response shape; it does not verify push delivery, future schema stability, editing/version behavior or physical-device notification mirroring.
