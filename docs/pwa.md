# Installable NUSGo

NUSGo is an installable web app for Chrome on Android and desktop. The service worker is generated during the Vite production build from the final asset list, so each deployment gets a cache version tied to its built files.

## Cache policy

- The app shell, built JavaScript and CSS, icons, and files under `frontend/public` are precached before the service worker can activate.
- Page navigation serves the versioned cached app shell immediately, without waiting for a network timeout. Updates arrive through the service-worker update flow, keeping HTML and built assets from the same version together. The network is used only when the shell is missing.
- Built assets and static campus data use the cache first. Runtime downloads are cached only for complete HTTP 200 responses without `Cache-Control: no-store`; cache-write failures leave successful network responses usable. The cache is versioned from the built and public asset contents.
- Release notes are read from the same-origin `releases/index.json` asset, which is part of the public-file precache. Each installed app therefore reads the history bundled with its own build while offline; the running version is matched by its embedded commit SHA. Release metadata is independent of `VITE_DATA_VERSION`. The browser does not call the GitHub API for release history.
- Requests to another origin bypass the service worker. Same-origin requests with an `api` path segment also bypass it, as do non-GET requests. The Express API also sends `Cache-Control: no-store`, so live NUS and LTA arrivals are not served from either cache.
- The arrival clients continue applying their existing freshness limits to data already held in memory. The offline pill says that bus arrivals have stopped updating.
- External map tiles and the Express API are not cached. The app shell and static campus data work offline, while the basemap and live arrival updates need a connection. Offline launches use a local empty map style so campus overlays can initialize. If an online remote style takes more than four seconds, a local style takes its place; once online, an in-app **Reload map** action offers to reload the app and restore the basemap. The app keeps campus overlays available until the user chooses to reload.

A new worker precaches the new build before it waits to activate. When an update is ready, an **Update NUSGo** pill offers to activate it. Activating the update reloads controlled tabs after the new worker takes control, then removes older NUSGo caches.

## Map notices

Notices are compact pills at the top centre of the map. Each pill has a `role="status"` live region.

- **Offline**: shown when the device is offline. Its accessible text is "Offline. Bus arrivals have stopped updating."
- **Download NUSGo**: shown when the install prompt is available. Its close bubble sits on the top-left corner of the pill and dismisses the prompt for the current visit.
- **Update NUSGo**: shown when a new service worker is ready.
- **Map unavailable**: shown online when the basemap fails to load, with a **Reload map** button.

The notices are compact pills that stay centred at the top of the map. At 320px wide they fit between the map controls without covering them.

## Push notifications

Settings offers an opt-in **Notifications** section for service updates: a delayed bus or live arrivals pausing at a stop. The browser prompt is requested only after **Enable notifications** is tapped, and the explanation stays visible above the button. The stored choice survives a reload; a stored preference only counts as on while the browser still permits notifications. On iOS a browser tab has no Push API, so the section explains that NUSGo must be added to the Home Screen and opened from there. A denied permission points at browser settings and offers no in-app toggle. Alight reminders are a separate opt-in on stop details, described below; both topics share one browser subscription.

When enabling notifications, the browser reuses its subscription only if it is bound to the deployment's current VAPID public key. After key rotation, Settings may still show notifications as on because it retains the saved preference. Existing users must open **Settings > Notifications**, choose **Turn off notifications**, then choose **Enable notifications** to create a subscription with the new key. If an earlier enable attempt failed before saving a preference, retry **Enable notifications**; it removes the old-key server registration and browser subscription before creating a replacement. Turning notifications off removes both the saved endpoint and the current browser endpoint if they differ; a failed server removal keeps the saved choice so the operation can be retried.

The notification has a short title, a one-line body and a deep link. An arrival update links to the affected stop (`?stop=<id>`), and a service notice links to the Stops view itself (`?view=stops`). Notification navigation transfers focus into Stops and reveals a collapsed mobile Stops sheet. Tapping it focuses an open app window and hands it the link, or opens the installed app at that destination when none is open.

### Alight reminders

Stop details adds an opt-in **Remind me** control for one canonical route at that stop, including while live arrivals are unavailable. The rider chooses a lead time of one, two or three minutes, defaulting to two, and the same value travels to the server with the registration. NUSGo sends one notification when the live ETA for that route enters the chosen window, then stops: the watch is removed only after a push service accepts the notification. A transient delivery failure leaves the watch in place so the next snapshot can retry, and a delivery already in flight for an endpoint blocks a duplicate send. A watch waiting for a delivery worker is checked again for cancellation, expiry, replacement and snapshot freshness before sending. Cancellation cannot recall a request already sent to the push service. The evaluator subtracts the per-stop observation age before checking the lead-time threshold and skips predictions whose arrival time has passed. The notification says the bus is due soon and gives an approximate minute count from the server's copy of the arrival estimate, which is approximate and may differ by a minute or more from what a frozen screen shows.

A watch expires two hours after it is registered. The registry assigns both the creation time and the expiry from the server clock, so a client cannot extend its own watch; the `201` response echoes the stored lead time and expiry for the app to display. An expired watch is removed on read and never fires, including when no fresh snapshot exists or service hours are unavailable. The rider can cancel at any time, which removes the watch for both the saved and current endpoint if the browser has refreshed it, without cancelling the subscription that service updates also use. Failed server removal keeps the saved reminder for retry. Turning service updates off keeps that shared subscription while a reminder still needs it. Key rotation unregisters both topics before replacing their shared browser endpoint, then restores any other active topic on the new endpoint. Restoring a reminder renews its server-owned two-hour expiry. Mounted controls re-read preferences after this change; a failed restoration leaves the displaced topic off instead of claiming the dead endpoint is still watching.

Cached service hours suppress a reminder when the route is known to be outside service or unavailable. If no service hours are cached, a fresh positive arrival is used without fetching hours; this does not independently prove that the route is running. Reminders are evaluated only from snapshots the backend already publishes. They add no poller, no upstream request, no background location and no stored journey or Personal Waypoint.

Server side:

- VAPID keys come from environment variables. Set both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, or neither; setting one alone fails startup. The public key must be a 65-byte uncompressed P-256 point, and `VAPID_SUBJECT` must be a `mailto:` address or an `https://` URL. Placeholder values only in `backend/.env.example` and `deploy/backend.env.example`; real keys stay in the deployment environment. Generate a pair with `npx web-push generate-vapid-keys`.
- `GET /api/push/public-key` returns `{ publicKey }`, or `null` when push is not configured. `POST /api/push/subscriptions` stores a subscription, and `POST /api/push/subscriptions/remove` forgets one.
- `POST /api/push/reminders` registers an alight reminder: the endpoint, its two keys, the pinned `alight-reminders` topic, a `watch` of `{ stopId, routeId }` and an optional `leadTimeSeconds` (60, 120 or 180; omitted means 120, any other value is rejected). A stop or route outside the canonical network is rejected. The `201` body is `{ topic, leadTimeSeconds, expiresAt }`. `POST /api/push/reminders/remove` forgets the watch for an endpoint and answers `204`, including for an endpoint it does not hold.
- Stored fields are the push endpoint, its two keys and the topic. Reminders keep their own registry holding the endpoint, keys, watch, lead time and server timestamps. Nothing identifies the person. Input is validated at the boundary, the endpoints are rate limited per client, and each subscription is capped at `PUSH_NOTIFICATIONS_PER_HOUR_CAP` notifications per hour. Re-registering or unsubscribing resets that endpoint's hourly window.
- A new registration is accepted only for a supported push service host (FCM, Mozilla autopush, Apple Web Push) on the default HTTPS port. Local, loopback, private-network and credential-bearing endpoints and host lookalikes are rejected, so a client cannot point the sender at an arbitrary host. Removal accepts any public HTTPS endpoint, which keeps older records unsubscribable without widening what may be registered or contacted.
- Each send requests high urgency for prompt delivery and carries a two-minute TTL and a ten-second request timeout, so a device that was offline does not receive a stale service update much later and a slow push service cannot hold the sender open.
- Arrival updates are derived from existing published shuttle snapshots, so arrival detection adds no poller or upstream request. At most one notification is sent per snapshot, choosing the largest valid update, with a repeat window per stop and route. An alight reminder is one-shot, is removed only once a push service accepts it, and spends its hourly allowance only then.
- The subscription store and reminder registry reject new endpoints with HTTP 503 when full; existing endpoints may still refresh, and a registration flood cannot evict current riders. Expired reminders are reclaimed before admission. A full hourly-cap tracker also rejects new delivery reservations until expired, settled history can be reclaimed, preserving active budgets. Anonymous registrations are not proof of endpoint ownership, so admission exhaustion can still deny new enrollments.
- Subscriptions that a push service reports as gone (404 or 410) are pruned, and a reminder whose delivery reports them is removed too. A temporary delivery failure keeps the subscription and releases its reserved hourly allowance. In-flight sends reserve capacity across publishers, so overlapping snapshots cannot bypass the cap.

Service notices come from the NUS ticker tape (`POST` to the configured bus-proxy `ticker-tapes` endpoint through the existing authenticated client). The feed is historic — hundreds of past records — so only records whose explicit `Display_From`/`Display_To` interval contains the current time are announcements; `Status` must be `Enabled`, and a record with a missing or inverted interval, an unknown priority or no message is ignored. Missing or malformed affected-service fields are rejected rather than treated as global; retained feeds and message sizes are bounded. A record with an empty `Affected_Service_Ids` applies to every service (a global notice). A non-empty list is matched case-insensitively against the canonical shuttle route ids; a notice that names only retired or unknown services resolves to no audience and is not treated as global. Author and incident-coordinate fields are dropped by the provider parser and never leave the backend.

Announcements are fetched through the existing arrival refresh lifecycle, not by a new poller: the refresh-complete hook asks the feed, which serves a cached result for a minute and shares a single in-flight request. Display windows are rechecked on cached and failed refreshes, so an unavailable provider cannot prolong an expired notice; failed attempts also retain the one-minute request budget. The arrival cycle runs every 30 seconds over 33 stops, so this is at most one logical ticker-tape refresh per minute (with the configured provider retry policy) rather than one per stop or per cycle, and a failed arrival batch does not suppress an announcement refresh. No ticker-tape request is made when push is not configured. Each cycle offers at most one unsent notice per endpoint, highest priority first; delivery records a fixed-size digest of the notice's id, message and canonical route scope only after the push service accepted it, so a transient failure or a full hourly budget retries it. Editing a notice's message makes it a new identity and announces it again.

Settings subscriptions cover all current routes; notices naming specific routes include those route IDs in their notification body. There is no per-route subscription preference. Arrival updates and notices share the configured hourly allowance, so multiple active notices can reduce the allowance left for arrival alerts; no cross-topic priority is promised.

Service notices intentionally use the same two-minute TTL as arrival alerts: NUSGo favors prompt notices over delivering an old excerpt after an offline period. Push-service acceptance records delivery for deduplication; it is not proof that the device displayed the notice. A device offline past the TTL may therefore miss an accepted notice.

A service notice has the title **Service notice**, a single-line body excerpted from the message (bounded to 120 characters), and the `?view=stops` deep link. It cannot link to a stop, because a global notice applies to every service and NUSGo has no canonical route-to-stop mapping to pick a representative one.

Subscriptions and alight reminders live in process memory, so they do not survive a backend restart, and a restart means devices must opt in again. This matches the single-instance limitation of the shuttle snapshot. Notification delivery in a background or screen-off device, on a Wear OS companion, and on a physical phone are not verified here, and neither is whether an alight reminder reaches a rider whose device is asleep when the bus arrives.

## Install and verify

### Chrome on Android

1. Open the deployed HTTPS NUSGo site in Chrome while online.
2. Use the in-app Install prompt, the install section in **More**, or Chrome's menu and choose **Install app**.
3. Open the installed NUSGo app and confirm it starts in standalone mode.

### Chrome on desktop

1. Open the deployed HTTPS site in Chrome while online.
2. Use the in-app Install prompt or the install control in the address bar.
3. Confirm the installed app opens in a standalone window.

### Offline and update checks

1. Load NUSGo while online and wait for the service worker to finish installing.
2. Turn off the device network and reload the page. The app shell and static campus data should load with the Offline pill; map tiles and live arrivals should not load.
3. Keep an older app tab open, deploy a new build, then revisit or reload NUSGo while online. Choose **Update NUSGo** when it appears and confirm the app reloads to the new build.
4. In Chrome DevTools, open **Application** to inspect the manifest, icons, service worker and Cache Storage. Inspect the manifest/installability diagnostics on the deployed HTTPS site. Lighthouse removed its PWA category; do not interpret ordinary Lighthouse scores as PWA validation. See the [official removal notice](https://github.com/GoogleChrome/lighthouse/blob/main/changelog.md#pwa-category-removal) and [Chrome PWA debugging guide](https://developer.chrome.com/docs/devtools/progressive-web-apps/).

The install banner can be dismissed for the current page visit while installation remains available in More. Repeated eligibility events do not reset dismissal; a reload or new visit can offer installation again when eligible. No permanent dismissal or installed flag is stored. Before exposing installation controls, supported browsers are checked with `getInstalledRelatedApps()`. A matching installed NUSGo app suppresses the banner even in a regular Chrome tab; repeated eligibility events cannot undo installation confirmed during this visit. Checks run on startup and when the tab becomes active. Only the initial check hides installation controls while pending; later background checks retain the last known state until they complete. An existing installation found by the startup check stays silent in the app's live announcement region, even when detection resolves after the page renders; the browser's `appinstalled` event announces a completion during the current visit. After uninstall, a successful empty result in a browser with reliable enumeration permits a fresh eligible prompt. On Edge Android, empty enumeration does not erase an installation confirmed during the current visit; reload to start a fresh detection session. Browsers control when they report eligibility; detection is limited to the same browser/profile and origin. More provides browser-menu instructions when a native prompt is unavailable and removes the Download NUSGo row when installation is detected.

## Known gaps

- Offline map tiles are out of scope. The map can appear without its external basemap while offline.
- Live NUS and public-bus arrival updates require the API and network. Service-worker caching cannot extend the existing arrival freshness limits.
- Browsers that do not dispatch `beforeinstallprompt` do not show the in-app install prompt; their own install flow may still be available.

## Installation detection configuration

The manifest references itself under `related_applications`. Production builds also add the absolute app id required by desktop Chromium, using `VITE_PWA_ORIGIN` (default `https://nusgo.app`) and the canonical manifest `id`. Manifest ids resolve against the site origin, while the manifest URL and service-worker scope resolve under `VITE_BASE_PATH`; these values intentionally differ for a subpath preview. For a custom HTTPS preview, set `VITE_PWA_ORIGIN` to its origin when building, for example `https://your-device.your-tailnet.ts.net`. Keep it consistent with the URL used to install the PWA. Changing this detection setting does not change the app's existing relative manifest id.

Chrome supports checking a same-scope installed PWA on Android 84+ and desktop 140+. See [Chrome's installation detection guide](https://developer.chrome.com/docs/capabilities/get-installed-related-apps). Unsupported browsers retain their native installation flow and More instructions; a universal installed/uninstalled signal is unavailable.

On Edge for Android, installation remains available in More, but the automatic install banner is suppressed. Its installed-PWA enumeration is not covered by Chrome's documented support guarantee, so an empty result must not cause repeated installation offers. More uses a compact logo/title/action row, with browser-menu instructions revealed on demand. A positive detection or standalone launch silently hides the installation controls. The browser's `appinstalled` event announces installation completed during the current visit. Installed related web apps are matched by their app id or manifest URL.

## Review validation (2 November 2026)

The regression suite covers dismissal across repeated eligibility events, Edge Android installation confirmation after an empty focus refresh, and ID-only detection with a subpath preview. All 1,428 tests, lint, and the production build passed; the build retains its large-chunk warning.

Android 16 emulator Chrome 156 reported no manifest or installability errors and offered a native Install action for the local production preview. The page could not render because MapLibre raised `GPUInitializationError: WebGL2 is required to display this map.` Installation completion, standalone launch, and offline cold launch therefore remain unverified on Chrome Android. Repeat these checks on a device with working WebGL2 and inspect installability on the deployed HTTPS site before marking the remaining #501 acceptance checks complete. The temporary loopback preview and its debug port mappings were removed after testing.
