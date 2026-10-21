'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Bell, CheckCheck } from 'lucide-react'
import { api, NOTIFICATIONS_CHANGED_EVENT } from '@/lib/api'
import type { listNotifications } from '@/server/services/notifications'
import { cn } from '@/lib/utils'

type Notifications = ReturnType<typeof listNotifications>

export function NotificationBell() {
  const [data, setData] = useState<Notifications | null>(null)
  const [failed, setFailed] = useState(false)
  // Responses can arrive out of order (poll vs. mark-as-read). Only the newest request may update the list.
  const latest = useRef(0)

  const request = useCallback(async (path: string, init?: Parameters<typeof api>[1]) => {
    const mine = ++latest.current
    try {
      const result = await api<Notifications>(path, init)
      if (mine === latest.current) {
        setData(result)
        setFailed(false)
      }
    } catch {
      if (mine === latest.current) setFailed(true)
    }
  }, [])

  const load = useCallback(() => request('/api/notifications'), [request])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 20000)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load)
    return () => {
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load)
    }
  }, [load])

  const markRead = (ids?: number[]) => request('/api/notifications/read', { method: 'POST', body: ids ? { ids } : {} })

  const unread = data?.unread ?? 0

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-[14px] border bg-popover text-popover-foreground shadow-xl outline-none">
            <div className="flex items-center justify-between border-b p-4">
              <Popover.Title className="font-semibold">Notifications</Popover.Title>
              <button
                onClick={() => markRead()}
                disabled={unread === 0}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline disabled:pointer-events-none disabled:text-muted-foreground dark:text-indigo-300"
              >
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {failed && !data && <p className="p-6 text-center text-sm text-rose-600 dark:text-rose-300">Could not load notifications.</p>}
              {data && data.items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">You are all caught up.</p>}
              {data?.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.is_read && markRead([n.id])}
                  className={cn('flex w-full gap-3 border-b p-4 text-left last:border-b-0 hover:bg-muted/60', !n.is_read && 'bg-accent/60')}
                >
                  <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-indigo-600')} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className={cn('block', !n.is_read && 'font-semibold')}>{n.title}</span>
                    <span className="mt-0.5 block text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{n.time}</span>
                  </span>
                  {!n.is_read && <span className="sr-only">Unread</span>}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
