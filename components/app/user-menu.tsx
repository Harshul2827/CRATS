'use client'

import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { ChevronDown, LogOut, RotateCcw, Users } from 'lucide-react'
import { useSession, type Me } from '@/components/app/providers'
import { useToast } from '@/components/ui/toast'
import { api, errorMessage, notifyNotificationsChanged } from '@/lib/api'

const itemClass =
  'flex w-full cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted'

export function UserMenu({ user }: { user: Me['user'] }) {
  const { demoMode, signOut } = useSession()
  const toast = useToast()
  const [resetting, setResetting] = useState(false)

  const reset = async () => {
    setResetting(true)
    try {
      await api('/api/demo/reset', { method: 'POST' })
      toast('Demo data reset to the starting state', 'success')
      notifyNotificationsChanged()
      // Reload so every page re-reads the freshly seeded database.
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      toast(errorMessage(e), 'error')
      setResetting(false)
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-3 rounded-lg p-1 pr-2 hover:bg-muted" aria-label="Account menu">
        <div className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
          {user.initials}
        </div>
        <div className="hidden text-right text-sm md:block">
          <div className="font-semibold">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.header_subtitle}</div>
        </div>
        <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-56 rounded-[14px] border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none">
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Signed in as
              <div className="truncate text-sm font-medium text-foreground">{user.email}</div>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={itemClass} onClick={() => void signOut()}>
              <LogOut className="size-4" /> Sign out
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={() => void signOut()}>
              <Users className="size-4" /> Switch user
            </Menu.Item>
            {demoMode && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={itemClass} disabled={resetting} onClick={() => void reset()}>
                  <RotateCcw className="size-4" /> {resetting ? 'Resetting…' : 'Reset demo data'}
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
