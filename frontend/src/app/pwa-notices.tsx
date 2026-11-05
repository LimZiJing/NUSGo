import { useState, useSyncExternalStore } from 'react'
import { IconButton } from '../ui/button'
import { CloseIcon, CloudOffIcon, DownloadIcon, RefreshIcon } from '../ui/icons'
import {
  activateServiceWorkerUpdate,
  dismissInstallPrompt,
  getInstallBannerSnapshot,
  getInstallationCompletionSnapshot,
  getInstalledSnapshot,
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

function PwaInstallationStatus() {
  const installed = useSyncExternalStore(subscribeToInstallPrompt, getInstalledSnapshot, () => false)
  const installationCompletion = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallationCompletionSnapshot,
    () => 0,
  )
  const [installationStatus, setInstallationStatus] = useState({
    installed,
    completion: installationCompletion,
    notice: '',
  })

  if (installationCompletion !== installationStatus.completion) {
    setInstallationStatus({
      installed,
      completion: installationCompletion,
      notice: 'NUSGo is installed on this device',
    })
  } else if (installed !== installationStatus.installed) {
    setInstallationStatus({
      ...installationStatus,
      installed,
      notice: installed ? installationStatus.notice : '',
    })
  }

  return <span className="visually-hidden" role="status" aria-label="Installation status">
    {installationStatus.notice}
  </span>
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

  const showNotices = !isOnline || basemapUnavailable || installPrompt || updateAvailable

  return <>
    <PwaInstallationStatus />
    {showNotices && <div className="pwa-notices">
      {!isOnline && (
        <p className="pwa-pill pwa-pill-offline" role="status" aria-live="polite">
          <CloudOffIcon size={18} />
          <span>Offline</span>
          <span className="visually-hidden">. Bus arrivals have stopped updating.</span>
        </p>
      )}
      {isOnline && basemapUnavailable && (
        <section className="pwa-pill pwa-pill-reload" role="status" aria-live="polite">
          <span>Map unavailable</span>
          <IconButton label="Reload map" icon={<RefreshIcon size={16} />} variant="primary"
            size="sm" className="pwa-pill-action" onClick={onReload} />
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
        <section className="pwa-pill pwa-pill-update" role="status" aria-live="polite">
          <span>Update NUSGo</span>
          <IconButton label="Update NUSGo" icon={<RefreshIcon size={16} />} variant="primary"
            size="sm" className="pwa-pill-action" onClick={activateServiceWorkerUpdate} />
        </section>
      )}
    </div>}
  </>
}
