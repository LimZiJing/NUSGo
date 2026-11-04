import { useSyncExternalStore } from 'react'
import { Button, IconButton } from '../ui/button'
import { CloseIcon, CloudOffIcon, DownloadIcon } from '../ui/icons'
import {
  activateServiceWorkerUpdate,
  dismissInstallPrompt,
  getInstallBannerSnapshot,
  getOnlineStatusSnapshot,
  getServiceWorkerUpdateSnapshot,
  requestInstall,
  subscribeToInstallPrompt,
  subscribeToOnlineStatus,
  subscribeToServiceWorkerUpdate,
} from '../infrastructure/pwa/pwa-runtime'
import './pwa-notices.css'

interface PwaNoticesProps {
  readonly basemapUnavailable?: boolean
  readonly onReload?: () => void
}

export function PwaNotices({
  basemapUnavailable = false,
  onReload = () => window.location.reload(),
}: PwaNoticesProps = {}) {
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatusSnapshot,
    () => true,
  )
  const installPrompt = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallBannerSnapshot,
    () => false,
  )
  const updateAvailable = useSyncExternalStore(
    subscribeToServiceWorkerUpdate,
    getServiceWorkerUpdateSnapshot,
    () => false,
  )

  if (isOnline && !basemapUnavailable && !installPrompt && !updateAvailable) return null

  return (
    <div className="pwa-notices">
      {!isOnline && (
        <p className="pwa-pill pwa-pill-offline" role="status" aria-live="polite">
          <CloudOffIcon size={18} />
          <span>Offline</span>
          <span className="visually-hidden">. Bus arrivals have stopped updating.</span>
        </p>
      )}
      {isOnline && basemapUnavailable && (
        <section className="pwa-notice" role="status" aria-live="polite">
          <p>The background map is unavailable. Reload to try again.</p>
          <Button label="Reload map" onClick={onReload} />
        </section>
      )}
      {installPrompt && (
        <section className="pwa-pill pwa-pill-install" role="status" aria-live="polite">
          <img className="pwa-pill-app-icon" src={`${import.meta.env.BASE_URL}icons/pwa-icon-192.png`}
            width="24" height="24" alt="" />
          <span>Download NUSGo</span>
          <IconButton label="Download NUSGo" icon={<DownloadIcon size={16} />} variant="primary"
            size="sm" className="pwa-pill-action" onClick={() => void requestInstall()} />
          <IconButton label="Dismiss install prompt" icon={<CloseIcon size={12} />} variant="secondary"
            size="sm" className="pwa-pill-dismiss" onClick={dismissInstallPrompt} />
        </section>
      )}
      {updateAvailable && (
        <section className="pwa-notice pwa-notice-update" role="status" aria-live="polite">
          <div className="pwa-notice-content">
            <strong className="pwa-notice-title">Update ready</strong>
            <p>Reload NUSGo to use the latest version.</p>
          </div>
          <Button label="Update now" onClick={activateServiceWorkerUpdate} />
        </section>
      )}
    </div>
  )
}
