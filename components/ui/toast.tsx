'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Check, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})
export const useToast = () => useContext(ToastContext)

const TONES: Record<Tone, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100',
  info: 'border-indigo-200 bg-card text-card-foreground dark:border-indigo-900',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = nextId.current++
      setItems((all) => [...all.slice(-3), { id, message, tone }])
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000)
    },
    [dismiss],
  )
  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 text-sm shadow-lg', TONES[t.tone])}>
            {t.tone === 'success' ? <Check className="mt-0.5 size-4 shrink-0" /> : t.tone === 'error' ? <X className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
