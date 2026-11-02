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
let installationAccepted = false
let installedRelatedApp = false
let installationStatusChecked = false
let installationCheckPending = false
let installationCheckGeneration = 0
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

function isEdgeAndroidBrowser(): boolean {
  return /EdgA\//.test(navigator.userAgent)
}

/** Query the browser rather than interpreting another install event as an uninstall. */
export async function refreshPwaInstallationStatus(): Promise<void> {
  const browser = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown> }
  if (!browser.getInstalledRelatedApps || isStandaloneApp()) return

  const generation = ++installationCheckGeneration
  if (!installationStatusChecked) {
    installationCheckPending = true
    notify(installPromptListeners)
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const apps = await Promise.race([
      browser.getInstalledRelatedApps(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Installed app check timed out')), 2000)
      }),
    ])
    if (generation !== installationCheckGeneration) return
    if (!Array.isArray(apps)) throw new Error('Invalid installed-app response')
    const appId = new URL(__NUSGO_PWA_MANIFEST_ID__, window.location.origin).href
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    const manifestUrl = new URL('manifest.webmanifest', baseUrl).href
    const detectedInstalledApp = apps.some((app: unknown) => {
      if (!app || typeof app !== 'object') return false
      if (!('platform' in app) || app.platform !== 'webapp') return false
      return ('url' in app && app.url === manifestUrl) || ('id' in app && app.id === appId)
    })
    // Edge Android may return [] for an app whose installation just completed.
    // Only reliable absence or positive evidence can replace the current confirmation.
    if (!isEdgeAndroidBrowser() || detectedInstalledApp) {
      installedRelatedApp = detectedInstalledApp
      installedThisVisit = false
      installationAccepted = false
    }
  } catch (error) {
    // A failed check is not evidence that an installed app was removed.
    console.warn('NUSGo could not check installed app status.', error)
  } finally {
    clearTimeout(timeout)
    if (generation === installationCheckGeneration) {
      installationStatusChecked = true
      installationCheckPending = false
      notify(installPromptListeners)
    }
  }
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
    if (isStandaloneApp() || installedThisVisit || installationAccepted) return
    deferredInstallPrompt = event as DeferredInstallPromptEvent
    void refreshPwaInstallationStatus()
    notify(installPromptListeners)
  })
  window.addEventListener('focus', () => { void refreshPwaInstallationStatus() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshPwaInstallationStatus()
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    installedThisVisit = true
    installationStatusChecked = true
    installationCheckGeneration += 1
    installationCheckPending = false
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
  return getInstalledSnapshot() || installationAccepted || installationCheckPending ? null : deferredInstallPrompt
}

export function getInstallBannerSnapshot(): boolean {
  // Edge Android can offer installation without reliably enumerating installed PWAs.
  // Keep installation user-initiated in More on that browser, avoiding repeat banners.
  return !isEdgeAndroidBrowser() && getInstallPromptSnapshot() !== null && !installBannerDismissed
}

export function getInstalledSnapshot(): boolean {
  return installedThisVisit || installedRelatedApp || isStandaloneApp()
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
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      installationAccepted = true
      installationStatusChecked = true
      installationCheckGeneration += 1
      installationCheckPending = false
    }
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
