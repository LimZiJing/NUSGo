import { useSyncExternalStore } from 'react'
import { Button, IconButton } from '../ui/button'
import { DownloadIcon, CloseIcon } from '../ui/icons'
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

export function PwaNotices() {
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

  if (isOnline && !installPrompt && !updateAvailable) return null

  return (
    <div className="pwa-notices">
      {!isOnline && (
        <p className="pwa-notice pwa-notice-offline" role="status" aria-live="polite">
          You're offline. Bus arrivals will stop updating until you're back online.
        </p>
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
