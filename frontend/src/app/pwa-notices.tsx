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
        <section className="pwa-notice pwa-notice-install" role="status" aria-live="polite">
          <span className="pwa-install-icon"><DownloadIcon size={22} /></span>
          <div className="pwa-notice-content">
            <strong className="pwa-notice-title">NUSGo, one tap away</strong>
            <p>Add it to your home screen for quick access, even offline.</p>
            <Button className="pwa-install-action" size="lg" label="Install NUSGo" onClick={() => void requestInstall()} />
          </div>
          <IconButton label="Dismiss install prompt" icon={<CloseIcon />} variant="ghost"
            size="lg" onClick={dismissInstallPrompt} />
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
