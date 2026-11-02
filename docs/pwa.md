# Installable NUSGo

NUSGo is an installable web app for Chrome on Android and desktop. The service worker is generated during the Vite production build from the final asset list, so each deployment gets a cache version tied to its built files.

## Cache policy

- The app shell, built JavaScript and CSS, icons, and files under `frontend/public` are precached before the service worker can activate.
- Page navigation serves the versioned cached app shell immediately, without waiting for a network timeout. Updates arrive through the service-worker update flow, keeping HTML and built assets from the same version together. The network is used only when the shell is missing.
- Built assets and static campus data use the cache first. The cache is versioned from the built and public asset contents.
- Requests to another origin bypass the service worker. Same-origin requests with an `api` path segment also bypass it, as do non-GET requests. The Express API also sends `Cache-Control: no-store`, so live NUS and LTA arrivals are not served from either cache.
- The arrival clients continue applying their existing freshness limits to data already held in memory. The offline notice says that arrival data will stop refreshing.
- External map tiles and the Express API are not cached. The app shell and static campus data work offline, while the basemap and live arrival updates need a connection. Offline launches use a local empty map style so campus overlays can initialize. If an online remote style takes more than four seconds, a local style takes its place; reload online to restore the basemap.

A new worker precaches the new build before it waits to activate. When an update is ready, NUSGo offers an Update now action. Activating the update reloads controlled tabs after the new worker takes control, then removes older NUSGo caches.

## Install and verify

### Chrome on Android

1. Open the deployed HTTPS NUSGo site in Chrome while online.
2. Use the in-app Install prompt or Chrome's menu and choose **Install app**.
3. Open the installed NUSGo app and confirm it starts in standalone mode.

### Chrome on desktop

1. Open the deployed HTTPS site in Chrome while online.
2. Use the in-app Install prompt or the install control in the address bar.
3. Confirm the installed app opens in a standalone window.

### Offline and update checks

1. Load NUSGo while online and wait for the service worker to finish installing.
2. Turn off the device network and reload the page. The app shell and static campus data should load with the offline notice; map tiles and live arrivals should not load.
3. Keep an older app tab open, deploy a new build, then revisit or reload NUSGo while online. Choose **Update now** when it appears and confirm the app reloads to the new build.
4. In Chrome DevTools, open **Application** to inspect the manifest, icons, service worker and Cache Storage. Run the **Lighthouse** PWA category against the deployed HTTPS site for installability checks.

## Known gaps

- Offline map tiles are out of scope. The map can appear without its external basemap while offline.
- Live NUS and public-bus arrival updates require the API and network. Service-worker caching cannot extend the existing arrival freshness limits.
- Browsers that do not dispatch `beforeinstallprompt` do not show the in-app install prompt; their own install flow may still be available.
