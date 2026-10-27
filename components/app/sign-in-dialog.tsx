'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useSession, type Me } from '@/components/app/providers'
import { api, ApiError } from '@/lib/api'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo-accounts'
import { cn } from '@/lib/utils'

const inputClass =
  'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-400/20'

/** There is no login page: this dialog opens over whichever of the three pages was visited while signed out. */
export function SignInDialog() {
  const { status, demoMode, setMe } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setBusy(true)
    try {
      const me = await api<Me>('/api/auth/login', { method: 'POST', body: { email, password } })
      setPassword('')
      setMe(me)
      toast(`Signed in as ${me.user.name}`, 'success')
      if (me.home !== pathname) router.replace(me.home)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.fields)
      } else {
        setError('Something went wrong. Please try again')
      }
    } finally {
      setBusy(false)
    }
  }

  const fill = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email)
    setPassword(DEMO_PASSWORD)
    setError(null)
    setFieldErrors({})
  }

  return (
    <Modal
      open={status === 'anon'}
      dismissable={false}
      title="Sign in to CRATS"
      description="Campus Recruitment & Application Tracking System, SPIT Mumbai"
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}
        <label className="grid gap-1.5 text-sm font-semibold">
          Email
          <input
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            className={cn(inputClass, 'font-normal')}
            placeholder="you@spit.edu"
          />
          {fieldErrors.email && <small className="font-normal text-rose-600 dark:text-rose-400">{fieldErrors.email}</small>}
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Password
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              className={cn(inputClass, 'pr-11 font-normal')}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldErrors.password && <small className="font-normal text-rose-600 dark:text-rose-400">{fieldErrors.password}</small>}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoMode && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demo accounts</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.role}
                type="button"
                onClick={() => fill(a)}
                className="rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="block font-semibold">Use demo account</span>
                <span className="block text-xs text-indigo-700 dark:text-indigo-300">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Fills the email and the shared demo password. Then press Sign in.</p>
        </div>
      )}
    </Modal>
  )
}
