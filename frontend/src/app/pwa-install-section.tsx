import { useSyncExternalStore } from 'react'
import { Button } from '../ui/button'
import { DownloadIcon } from '../ui/icons'
import {
  getInstalledSnapshot,
  getInstallPromptSnapshot,
  requestInstall,
  subscribeToInstallPrompt,
} from '../infrastructure/pwa/pwa-runtime'
import './pwa-notices.css'

export function PwaInstallSection() {
  const prompt = useSyncExternalStore(subscribeToInstallPrompt, getInstallPromptSnapshot, () => null)
  const installed = useSyncExternalStore(subscribeToInstallPrompt, getInstalledSnapshot, () => false)

  return <section className="pwa-install-section" aria-label="Install NUSGo">
    <div className="pwa-install-heading">
      <span className="pwa-install-icon"><DownloadIcon size={22} /></span>
      <h2>NUSGo on your home screen</h2>
    </div>
    {installed ? <p>NUSGo is installed on this device.</p> : <>
      <p>Open campus navigation in one tap. Saved campus data stays available offline.</p>
      {prompt
        ? <Button size="lg" label="Install NUSGo" icon={<DownloadIcon />} onClick={() => void requestInstall()} />
        : <p className="pwa-install-help">In Chrome, open the browser menu and choose Install app or Add to home screen. On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. If already installed, open NUSGo from its icon.</p>}
    </>}
  </section>
}
