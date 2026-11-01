import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import {
  activateServiceWorkerUpdate,
  dismissInstallPrompt,
  getInstallPromptSnapshot,
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
    getInstallPromptSnapshot,
    () => null,
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
          <div className="pwa-notice-content">
            <strong className="pwa-notice-title">Install NUSGo</strong>
            <p>Open campus navigation quickly from your home screen.</p>
          </div>
          <div className="pwa-notice-actions">
            <button className="pwa-notice-action" type="button" onClick={() => void requestInstall()}>
              Install
            </button>
            <button
              className="pwa-notice-dismiss"
              type="button"
              aria-label="Dismiss install prompt"
              onClick={dismissInstallPrompt}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
      {updateAvailable && (
        <section className="pwa-notice pwa-notice-update" role="status" aria-live="polite">
          <div className="pwa-notice-content">
            <strong className="pwa-notice-title">Update ready</strong>
            <p>Reload NUSGo to use the latest version.</p>
          </div>
          <button
            className="pwa-notice-action"
            type="button"
            onClick={activateServiceWorkerUpdate}
          >
            Update now
          </button>
        </section>
      )}
    </div>
  )
}
