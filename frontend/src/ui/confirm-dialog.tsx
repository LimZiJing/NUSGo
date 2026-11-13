import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './button'
import './styles/confirm-dialog.css'

interface ConfirmDialogProps {
  readonly open: boolean
  readonly title: string
  /** Extra content between the title and the actions, e.g. a consequence summary. */
  readonly children?: ReactNode
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * A small modal decision. It uses the native `dialog` element for focus trapping and Escape, starts
 * focus on Cancel so an accidental Enter cannot confirm, and always returns focus to whatever opened
 * it (the browser does that when a modal dialog closes).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  if (!open) return null

  return <dialog
    ref={dialogRef}
    className="confirm-dialog"
    aria-labelledby="confirm-dialog-title"
    onCancel={(event) => {
      event.preventDefault()
      onCancel()
    }}
    // A click on the backdrop lands on the dialog element itself, not its content.
    onClick={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}
  >
    <div className="confirm-dialog-body">
      <h2 id="confirm-dialog-title">{title}</h2>
      {children}
      <div className="confirm-dialog-actions">
        <Button label={cancelLabel} ref={cancelRef} onClick={onCancel} />
        <Button
          label={confirmLabel}
          variant={destructive ? 'secondary' : 'primary'}
          className={destructive ? 'confirm-dialog-destructive' : undefined}
          onClick={onConfirm}
        />
      </div>
    </div>
  </dialog>
}
