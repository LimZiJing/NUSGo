import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme-startup'
import './index.css'
import App from './app/app.tsx'
import { checkApiDataVersion } from './infrastructure/api/compatibility'

// Dev-only controls gallery at /?gallery. import.meta.env.DEV is a build-time constant, so
// production builds drop this dynamic import, the gallery module and its CSS.
const Gallery = import.meta.env.DEV
  ? lazy(() => import('./ui/gallery/gallery').then((module) => ({ default: module.Gallery })))
  : null
const showGallery = Gallery !== null && new URLSearchParams(window.location.search).has('gallery')

if (import.meta.env.DEV || __NAVUS_API_ORIGIN__) {
  void checkApiDataVersion(__NAVUS_API_ORIGIN__, __NAVUS_DATA_VERSION__).catch((error: unknown) => {
    console.error('NavUS backend compatibility check failed.', error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showGallery && Gallery
      ? <Suspense fallback={null}><Gallery /></Suspense>
      : <App />}
  </StrictMode>,
)
