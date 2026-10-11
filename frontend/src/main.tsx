import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme-startup'
import './index.css'
import App from './app/app.tsx'
import { checkApiDataVersion } from './infrastructure/api/compatibility'

if (import.meta.env.DEV || __NAVUS_API_ORIGIN__) {
  void checkApiDataVersion(__NAVUS_API_ORIGIN__, __NAVUS_DATA_VERSION__).catch((error: unknown) => {
    console.error('NavUS backend compatibility check failed.', error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
