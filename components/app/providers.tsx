'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { api, ApiError, UNAUTHORIZED_EVENT } from '@/lib/api'
import type { describeUser } from '@/server/services/users'

export type Me = ReturnType<typeof describeUser>
export type SessionUser = Me['user']

interface SessionValue {
  me: Me | null
  /** 'loading' until /api/auth/me answers; 'anon' opens the sign-in dialog. */
  status: 'loading' | 'authed' | 'anon'
  demoMode: boolean
  setMe: (me: Me | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <AppProviders>')
  return value
}

export function AppProviders({ demoMode, children }: { demoMode: boolean; children: React.ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null)
  const [status, setStatus] = useState<SessionValue['status']>('loading')

  const setMe = useCallback((next: Me | null) => {
    setMeState(next)
    setStatus(next ? 'authed' : 'anon')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await api<Me | { user: null }>('/api/auth/me')
      setMe(res.user ? (res as Me) : null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null)
      else setStatus((s) => (s === 'loading' ? 'anon' : s))
    }
  }, [setMe])

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setMe(null)
    }
  }, [setMe])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Any 401 from any API call means the session is gone: show the sign-in dialog again.
  useEffect(() => {
    const onUnauthorized = () => setMe(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [setMe])

  const value = useMemo(() => ({ me, status, demoMode, setMe, refresh, signOut }), [me, status, demoMode, setMe, refresh, signOut])

  return (
    <SessionContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </SessionContext.Provider>
  )
}
