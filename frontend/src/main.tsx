import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme-startup'
import './index.css'
import App from './app/app.tsx'
import { checkApiDataVersion } from './infrastructure/api/compatibility'
import { refreshPwaInstallationStatus, registerPwaServiceWorker } from './infrastructure/pwa/pwa-runtime'

// Dev-only controls gallery at /?gallery. import.meta.env.DEV is a build-time constant, so
// production builds drop this dynamic import, the gallery module and its CSS.
const Gallery = import.meta.env.DEV
  ? lazy(() => import('./ui/gallery/gallery').then((module) => ({ default: module.Gallery })))
  : null
const showGallery = Gallery !== null && new URLSearchParams(window.location.search).has('gallery')

// Dev-only sample Personal Waypoints at /?sample-waypoints, so the collection can be reviewed with
// realistic volume without hand-editing storage. Build-time DEV constant, so production drops it.
const SAMPLE_KEY = 'navus:personal-waypoints:v1'
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('sample-waypoints')) {
  void import('./features/waypoints/personal/data/sample-personal-waypoints').then(({ createSamplePersonalWaypoints }) => {
    window.localStorage.setItem(SAMPLE_KEY, JSON.stringify({ version: 1, waypoints: createSamplePersonalWaypoints() }))
    window.localStorage.removeItem('navus:personal-waypoint-expanded-categories:v1')
  })
}
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('clear-waypoints')) {
  window.localStorage.removeItem(SAMPLE_KEY)
  window.localStorage.removeItem('navus:personal-waypoint-expanded-categories:v1')
}

registerPwaServiceWorker()
void refreshPwaInstallationStatus()

if (import.meta.env.DEV || __NUSGO_API_ORIGIN__) {
  void checkApiDataVersion(__NUSGO_API_ORIGIN__, __NUSGO_DATA_VERSION__).catch((error: unknown) => {
    console.error('NUSGo backend compatibility check failed.', error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showGallery && Gallery
      ? <Suspense fallback={null}><Gallery /></Suspense>
      : <App />}
  </StrictMode>,
)
