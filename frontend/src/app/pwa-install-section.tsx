import { useId, useState, useSyncExternalStore } from 'react'
import { IconButton } from '../ui/button'
import { DownloadIcon } from '../ui/icons'
import { Pill } from '../ui/pill'
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
  const [showInstructions, setShowInstructions] = useState(false)
  const instructionsId = useId()

  const download = (): void => {
    if (prompt) {
      setShowInstructions(false)
      void requestInstall()
    } else {
      setShowInstructions((visible) => !visible)
    }
  }

  return <section className="pwa-install-section" aria-label="Download NUSGo">
    <div className="pwa-install-row">
      <img className="pwa-install-logo" src={`${import.meta.env.BASE_URL}icons/pwa-icon-192.png`}
        width="44" height="44" alt="" />
      <h2>{installed ? 'NUSGo' : 'Download NUSGo'}</h2>
      {installed
        ? <span role="status" aria-label="NUSGo is installed on this device"><Pill label="Installed" tone="success" /></span>
        : <IconButton label="Download NUSGo" icon={<DownloadIcon />} size="lg"
            variant="primary" onClick={download} expanded={prompt ? undefined : showInstructions}
            controls={prompt || !showInstructions ? undefined : instructionsId} />}
    </div>
    {!installed && showInstructions && <p id={instructionsId} className="pwa-install-help">
      Open your browser menu and choose Install app or Add to home screen. On iPhone or iPad,
      open this page in Safari, tap Share, then Add to Home Screen.
    </p>}
  </section>
}
