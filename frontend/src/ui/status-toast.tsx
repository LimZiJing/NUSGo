import type { ReactNode } from 'react'
import { Toast } from '@base-ui/react/toast'
import { statusToastManager } from './status-toast-manager'

export function StatusToastProvider({ children }: { readonly children: ReactNode }) {
  return <Toast.Provider toastManager={statusToastManager} timeout={7000} limit={1}>
    {children}
    <StatusToastViewport />
  </Toast.Provider>
}

function StatusToastViewport() {
  const { toasts } = Toast.useToastManager()

  return <Toast.Viewport className="more-panel-toast-viewport" aria-label="Notifications">
    {toasts.map((toast) => <Toast.Root
      key={toast.id}
      className="more-panel-toast"
      toast={toast}
    >
      <Toast.Content>
        <Toast.Description />
      </Toast.Content>
    </Toast.Root>)}
  </Toast.Viewport>
}
