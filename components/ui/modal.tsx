'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** When false the dialog cannot be closed with Escape, the backdrop or an X (used by the sign-in dialog). */
  dismissable?: boolean
  className?: string
}

/** A themed dialog on top of Base UI: focus trap, Escape, backdrop and portal come from the primitive. */
export function Modal({ open, onOpenChange, title, description, children, footer, dismissable = true, className }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={!dismissable}
      onOpenChange={(next) => {
        if (dismissable || next) onOpenChange?.(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup
            className={cn(
              'relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-[14px] border bg-card text-card-foreground shadow-xl outline-none transition-all data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
                )}
              </div>
              {dismissable && (
                <Dialog.Close
                  aria-label="Close"
                  className="rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </Dialog.Close>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
