export interface DeferredInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

type Listener = () => void

let isOnline = typeof navigator === 'undefined' ? true : navigator.onLine
let installBannerDismissed = false
let installedThisVisit = false
let deferredInstallPrompt: DeferredInstallPromptEvent | null = null
let waitingServiceWorker: ServiceWorker | null = null
let serviceWorkerRegistrationStarted = false

const onlineListeners = new Set<Listener>()
const installPromptListeners = new Set<Listener>()
const updateListeners = new Set<Listener>()

function notify(listeners: ReadonlySet<Listener>): void {
  listeners.forEach((listener) => listener())
}

function isStandaloneApp(): boolean {
  const safariStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return safariStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

// This singleton deliberately owns page-lifetime browser listeners, which the browser
// removes on page teardown; React subscribers have their own explicit unsubscribe paths.
if (typeof window !== 'undefined') {
  const updateOnlineStatus = (): void => {
    const nextStatus = navigator.onLine
    if (isOnline === nextStatus) return
    isOnline = nextStatus
    notify(onlineListeners)
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault()
    if (isStandaloneApp() || installedThisVisit) return
    installBannerDismissed = false

    deferredInstallPrompt = event as DeferredInstallPromptEvent
    notify(installPromptListeners)
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    installedThisVisit = true
    notify(installPromptListeners)
  })
}

export function subscribeToOnlineStatus(listener: Listener): () => void {
  onlineListeners.add(listener)
  return () => onlineListeners.delete(listener)
}

export function getOnlineStatusSnapshot(): boolean {
  return isOnline
}

export function subscribeToInstallPrompt(listener: Listener): () => void {
  installPromptListeners.add(listener)
  return () => installPromptListeners.delete(listener)
}

export function getInstallPromptSnapshot(): DeferredInstallPromptEvent | null {
  return deferredInstallPrompt
}

export function getInstallBannerSnapshot(): boolean {
  return getInstallPromptSnapshot() !== null && !installBannerDismissed
}

export function getInstalledSnapshot(): boolean {
  return installedThisVisit || isStandaloneApp()
}

export function dismissInstallPrompt(): void {
  installBannerDismissed = true
  notify(installPromptListeners)
}

export async function requestInstall(): Promise<void> {
  const prompt = getInstallPromptSnapshot()
  if (!prompt) return
  deferredInstallPrompt = null
  notify(installPromptListeners)

  try {
    await prompt.prompt()
    await prompt.userChoice
  } catch (error) {
    console.error('NUSGo install prompt failed.', error)
  } finally {
    notify(installPromptListeners)
  }
}

export function subscribeToServiceWorkerUpdate(listener: Listener): () => void {
  updateListeners.add(listener)
  return () => updateListeners.delete(listener)
}

export function getServiceWorkerUpdateSnapshot(): boolean {
  return waitingServiceWorker !== null
}

export function activateServiceWorkerUpdate(): void {
  waitingServiceWorker?.postMessage({ type: 'SKIP_WAITING' })
}

export function reloadOnServiceWorkerControllerChange(
  serviceWorkerContainer: ServiceWorkerContainer,
  reload: () => void,
): void {
  let hasController = serviceWorkerContainer.controller !== null
  let isReloading = false

  serviceWorkerContainer.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true
      return
    }
    if (isReloading) return

    isReloading = true
    reload()
  })
}

export function registerPwaServiceWorker(): void {
  if (
    serviceWorkerRegistrationStarted ||
    !import.meta.env.PROD ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) return

  serviceWorkerRegistrationStarted = true
  reloadOnServiceWorkerControllerChange(navigator.serviceWorker, () => window.location.reload())

  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  void navigator.serviceWorker.register(new URL('sw.js', baseUrl).toString(), {
    scope: baseUrl.pathname,
  }).then((registration) => {
    const publishWaitingWorker = (installingWorker?: ServiceWorker | null): void => {
      if (!navigator.serviceWorker.controller) return
      const worker = registration.waiting ?? installingWorker
      if (!worker || waitingServiceWorker === worker) return
      waitingServiceWorker = worker
      notify(updateListeners)
    }

    publishWaitingWorker()
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing
      if (!installingWorker) return
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed') publishWaitingWorker(installingWorker)
      })
    })
  }).catch((error: unknown) => {
    console.error('NUSGo service worker registration failed.', error)
  })
}
