import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden="true" /> {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-[14px] border border-rose-200 bg-rose-50 p-8 text-center text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
      <AlertCircle className="size-6" aria-hidden="true" />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg border border-rose-300 bg-card px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950">
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto my-10 flex max-w-md flex-col items-center gap-2 rounded-[14px] border border-dashed bg-card p-10 text-center">
      <Inbox className="size-7 text-muted-foreground" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
