import { useId, useState, useSyncExternalStore } from 'react'
import { ChevronRightIcon } from '../ui/icons'
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
  const [wasInstalledOnMount] = useState(installed)
  const [showInstructions, setShowInstructions] = useState(false)
  const instructionsId = useId()
  const descriptionId = useId()

  const download = (): void => {
    if (prompt) {
      setShowInstructions(false)
      void requestInstall()
    } else {
      setShowInstructions((visible) => !visible)
    }
  }

  return <>
    <span className="visually-hidden" role="status">
      {installed && !wasInstalledOnMount ? 'NUSGo is installed on this device' : ''}
    </span>
    {!installed && <div className="pwa-install-section">
      <button
        type="button"
        className="more-menu-row"
        aria-label="Download NUSGo"
        aria-describedby={descriptionId}
        aria-expanded={prompt ? undefined : showInstructions}
        aria-controls={showInstructions ? instructionsId : undefined}
        onClick={download}
      >
        <span className="more-menu-row-icon">
          <img className="pwa-install-logo" src={`${import.meta.env.BASE_URL}icons/pwa-icon-192.png`}
            width="22" height="22" alt="" />
        </span>
        <span className="more-menu-row-copy">
          <span>Download NUSGo</span>
          <span className="more-menu-row-description" id={descriptionId}>Add to your home screen</span>
        </span>
        <ChevronRightIcon />
      </button>
      {showInstructions && <p id={instructionsId} className="pwa-install-help">
        Open your browser menu and choose Install app or Add to home screen. On iPhone or iPad,
        open this page in Safari, tap Share, then Add to Home Screen.
      </p>}
    </div>}
  </>
}
