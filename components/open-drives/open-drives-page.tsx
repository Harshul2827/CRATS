'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Shell } from '@/components/app/shell'
import { useSession } from '@/components/app/providers'
import { EmptyState, ErrorState, Spinner } from '@/components/app/states'
import { DriveDialog } from '@/components/open-drives/drive-dialog'
import { useToast } from '@/components/ui/toast'
import { api, ApiError, errorMessage, isAbort, notifyNotificationsChanged } from '@/lib/api'
import type { DriveCard, listStudentDrives } from '@/server/services/student-drives'
import { cn } from '@/lib/utils'

type DriveList = ReturnType<typeof listStudentDrives>

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'applied', label: 'Applied' },
] as const

export function OpenDrivesPage() {
  const [search, setSearch] = useState('')
  const [badge, setBadge] = useState<number | undefined>(undefined)
  return (
    <Shell role="student" title="Open Drives" search={{ value: search, onChange: setSearch, placeholder: 'Search drives or companies...' }} driveBadge={badge}>
      {() => <OpenDrives search={search} onTotal={setBadge} />}
    </Shell>
  )
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-lg border bg-card py-2 pl-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
    </div>
  )
}

function OpenDrives({ search, onTotal }: { search: string; onTotal: (n: number) => void }) {
  const toast = useToast()
  const { demoMode, refresh } = useSession()
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('deadline')
  const [data, setData] = useState<DriveList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [switching, setSwitching] = useState(false)

  // Debounce the header search so the server is not queried on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const p = new URLSearchParams({ type, filter, sort })
    if (q) p.set('q', q)
    setLoading(true)
    api<DriveList>(`/api/student/drives?${p}`, { signal: controller.signal })
      .then((d) => { setData(d); setError(null) })
      .catch((e) => { if (!isAbort(e)) setError(errorMessage(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [q, type, filter, sort, reloadKey])

  useEffect(() => {
    if (data && !q && type === 'all') onTotal(data.counts.all)
  }, [data, q, type, onTotal])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const apply = async (id: number) => {
    setApplyingId(id)
    try {
      await api(`/api/student/drives/${id}/apply`, { method: 'POST' })
      toast('Application submitted. Good luck!', 'success')
      notifyNotificationsChanged()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_APPLIED') toast('You have already applied', 'info')
      else if (e instanceof ApiError && e.reasons.length > 0) toast(`${e.message}: ${e.reasons[0]}`, 'error')
      else toast(errorMessage(e), 'error')
    } finally {
      setApplyingId(null)
      reload()
    }
  }

  const setVerification = async (status: 'VERIFIED' | 'PENDING') => {
    if (data?.verification_status === status) return
    setSwitching(true)
    try {
      await api('/api/demo/verification', { method: 'POST', body: { status } })
      toast(status === 'VERIFIED' ? 'Profile marked as verified (demo)' : 'Profile marked as unverified (demo)', 'info')
      notifyNotificationsChanged()
      await refresh()
      reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSwitching(false)
    }
  }

  if (!data) {
    return error ? <ErrorState message={error} onRetry={reload} /> : <Spinner label="Loading drives…" />
  }

  const verified = data.verification_status === 'VERIFIED'
  const filtersActive = q !== '' || type !== 'all' || filter !== 'all'

  return (
    <main className="p-5 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-bold">Open Drives</h2>
            <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs text-indigo-700 dark:border-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">{data.cycle}</span>
          </div>
          <p className="mt-1 text-sm">
            {data.counts.all} open {data.counts.all === 1 ? 'drive' : 'drives'} — <span className="text-emerald-600 dark:text-emerald-400">{data.counts.eligible} you can apply to</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {demoMode && (
            <div className="rounded-lg border bg-card p-1 text-sm" role="group" aria-label="Demo profile state">
              <button disabled={switching} onClick={() => setVerification('VERIFIED')} aria-pressed={verified} className={cn('rounded-md px-3 py-1.5', verified && 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200')}>Verified</button>
              <button disabled={switching} onClick={() => setVerification('PENDING')} aria-pressed={!verified} className={cn('rounded-md px-3 py-1.5', !verified && 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200')}>Unverified</button>
            </div>
          )}
          {verified ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><ShieldCheck className="mr-2 inline size-4" /> Profile verified (TPO)</span>
          ) : (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><ShieldAlert className="mr-2 inline size-4" /> Profile {data.verification_status.toLowerCase()}</span>
          )}
        </div>
      </div>

      {!verified && (
        <div role="alert" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Your profile is {data.verification_status.toLowerCase()}.</b> You can browse drives, but applying is switched off until a faculty coordinator or the TPO verifies your profile.
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn('rounded-md px-4 py-2', filter === f.value && 'bg-card text-indigo-700 shadow-sm dark:text-indigo-300')}
            >
              {f.label} {data.counts[f.value]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Select label="Job type" value={type} onChange={setType}>
            <option value="all">All Types</option>
            <option value="FTE">Full-time</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="INTERN_FTE">Intern + FTE</option>
          </Select>
          <Select label="Sort by" value={sort} onChange={setSort}>
            <option value="deadline">Deadline: Soonest</option>
            <option value="deadline_desc">Deadline: Latest</option>
            <option value="ctc">Compensation: Highest</option>
            <option value="company">Company: A to Z</option>
          </Select>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {data.items.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No drives match your filters' : 'No open drives right now'}
          message={filtersActive ? 'Try a different search, type or status.' : 'New drives appear here as soon as the TPO approves them.'}
          action={filtersActive ? <button onClick={() => { setType('all'); setFilter('all') }} className="mt-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">Reset filters</button> : undefined}
        />
      ) : (
        <div className={cn('mt-7 grid gap-5 transition-opacity xl:grid-cols-2', loading && 'opacity-60')} aria-busy={loading}>
          {data.items.map((d) => (
            <Card key={d.id} drive={d} verified={verified} applying={applyingId === d.id} onApply={apply} onOpen={setDetailId} />
          ))}
        </div>
      )}

      <DriveDialog driveId={detailId} version={reloadKey} applying={applyingId === detailId} onClose={() => setDetailId(null)} onApply={apply} />
    </main>
  )
}

function Card({ drive, verified, applying, onApply, onOpen }: {
  drive: DriveCard
  verified: boolean
  applying: boolean
  onApply: (id: number) => void
  onOpen: (id: number) => void
}) {
  const eligible = drive.status === 'eligible'
  const applied = drive.status === 'applied'
  const canApply = eligible && verified
  return (
    <article className={cn('rounded-[14px] border bg-card p-6 shadow-sm transition-shadow hover:shadow-md', !eligible && !applied && 'opacity-70')}>
      <div className="flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-indigo-200 bg-indigo-50 text-xl font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">{drive.company_initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{drive.title}</h3>
            <span className={cn('rounded-full px-3 py-1 text-xs font-medium', eligible ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : applied ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300')}>
              {eligible ? '● Eligible to apply' : applied ? '◉ Applied' : '× Not eligible'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{drive.company} <span className="mx-2">•</span><span className="rounded bg-muted px-2 py-1 text-xs">{drive.job_type_label}</span></p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-4 text-sm">
        <div><span className="block text-xs text-muted-foreground">{drive.is_stipend ? 'Stipend' : 'Compensation'}</span><b>{drive.ctc_text}</b></div>
        <div><span className="block text-xs text-muted-foreground">Work Location</span><b>{drive.location_label}</b></div>
        <div><span className="block text-xs text-muted-foreground">Openings</span><b>{drive.openings} positions</b></div>
      </div>
      {drive.reasons.length > 0 && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <b>ⓘ WHY YOU CAN&apos;T APPLY:</b>
          {drive.reasons.map((r) => <div key={r} className="mt-1">× {r}</div>)}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
        <span>Deadline: <b>{drive.deadline_label}</b></span>
        <span className="rounded border bg-muted px-2 py-1 text-xs">{drive.days_left_label}</span>
        <button onClick={() => onOpen(drive.id)} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">{eligible ? 'View details' : applied ? 'View details' : 'View criteria'}</button>
        <button
          disabled={!canApply || applying}
          onClick={() => onApply(drive.id)}
          className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold', canApply ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70' : 'bg-muted text-muted-foreground')}
        >
          {applying && <Loader2 className="size-4 animate-spin" />}
          {applied ? drive.applied_label : applying ? 'Applying…' : eligible ? 'Apply now' : 'Apply'}
        </button>
      </div>
    </article>
  )
}
