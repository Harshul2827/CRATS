'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Download, TrendingUp, X } from 'lucide-react'
import { Shell } from '@/components/app/shell'
import { ErrorState, Spinner } from '@/components/app/states'
import { ReviewDialog } from '@/components/dashboard/review-dialog'
import { api, errorMessage, isAbort } from '@/lib/api'
import type { DashboardData } from '@/server/services/dashboard'
import { cn } from '@/lib/utils'

type Pending = DashboardData['pending_approvals'][number]

export function DashboardPage() {
  const [search, setSearch] = useState('')
  return (
    <Shell role="tpo" title="Placement Dashboard" search={{ value: search, onChange: setSearch, placeholder: 'Search pending drives or companies...' }}>
      {() => <Dashboard search={search} />}
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
        className="h-10 appearance-none rounded-lg border bg-card py-2 pl-4 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
    </div>
  )
}

function Dashboard({ search }: { search: string }) {
  const [department, setDepartment] = useState('')
  const [range, setRange] = useState('all')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<Pending | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (department) p.set('department', department)
    p.set('range', range)
    return p.toString()
  }, [department, range])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    api<DashboardData>(`/api/dashboard?${query}`, { signal: controller.signal })
      .then((d) => { setData(d); setError(null) })
      .catch((e) => { if (!isAbort(e)) setError(errorMessage(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  if (!data) {
    return error ? <ErrorState message={error} onRetry={reload} /> : <Spinner label="Loading dashboard…" />
  }

  const { kpis } = data
  const scrollToPending = () => document.getElementById('pending-approvals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <main className={cn('p-5 transition-opacity lg:p-10', loading && 'opacity-60')} aria-busy={loading}>
      {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">Placement Dashboard</h2>
          <p className="text-sm text-muted-foreground">{data.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select label="Department" value={department} onChange={setDepartment}>
            <option value="">All departments</option>
            {data.filters.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Date range" value={range} onChange={setRange}>
            {data.filters.ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
          <a
            href={`/api/dashboard/export?${query}`}
            download
            className="inline-flex h-10 items-center rounded-lg border bg-card px-4 py-2 text-sm hover:bg-muted"
          >
            <Download className="mr-2 inline size-4" /> Export report
          </a>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Registered students" value={String(kpis.registered.value)} note={kpis.registered.note} tone="positive" />
        <Stat label="Placed students" value={String(kpis.placed.value)} note={kpis.placed.note} />
        <Stat label="Average CTC" value={kpis.avg_ctc.label} note={kpis.avg_ctc.note} tone={kpis.avg_ctc.delta === null ? 'neutral' : kpis.avg_ctc.delta < 0 ? 'negative' : 'positive'} />
        <Stat label="Open drives" value={String(kpis.open_drives.value)} note={kpis.open_drives.note} tone="active" />
        <Stat label="Pending approvals" value={String(kpis.pending.value)} note={kpis.pending.note} tone="accent" onNoteClick={scrollToPending} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Department-wise placement"
          subtitle="Registered vs Placed by engineering discipline"
          right={
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span><i className="mr-1 inline-block size-2 rounded-sm bg-indigo-300" />Registered</span>
              <span><i className="mr-1 inline-block size-2 rounded-sm bg-indigo-700" />Placed</span>
            </div>
          }
        >
          <DepartmentChart items={data.departments_chart.items} />
          <div className="mt-6 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>Top conversion: <b>{data.departments_chart.top_conversion ? `${data.departments_chart.top_conversion.name} (${data.departments_chart.top_conversion.percent}%)` : '—'}</b></span>
            <span>Overall placement rate: <b>{data.departments_chart.overall_percent}%</b></span>
          </div>
        </Panel>
        <Panel title="Application funnel" subtitle="Candidate throughput from application to offer acceptance">
          <Funnel stages={data.funnel} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Placement trend" subtitle="Cumulative placements across 12 academic weeks">
          <Trend trend={data.trend} />
        </Panel>
        <Panel title="Top recruiting companies" subtitle="Accepted offers by employer">
          <div className="grid gap-3 pt-4">
            {data.top_companies.length === 0 && <p className="text-sm text-muted-foreground">No accepted offers in this period.</p>}
            {data.top_companies.map((c, i) => (
              <div key={c.name} title={`${c.name}: ${c.offers} accepted offers`}>
                <div className="flex justify-between text-xs"><span>{i + 1}. {c.name}</span><b>{c.offers} {c.offers === 1 ? 'offer' : 'offers'}</b></div>
                <div className="mt-1 h-2 rounded bg-muted"><div className="h-full rounded bg-indigo-600" style={{ width: `${(c.offers / data.top_companies[0].offers) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Drive status mix" subtitle="Lifecycle of all registered campus drives">
          <StatusMix mix={data.status_mix} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section id="pending-approvals" className="scroll-mt-28">
          <PendingPanel items={data.pending_approvals} search={search} onReview={setReviewing} />
        </section>
        <Panel title="Recent activity" subtitle="Audit log of institutional actions">
          <div className="grid gap-4 pt-4 text-sm">
            {data.activity.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
            {data.activity.map((a) => (
              <div key={a.id} className="flex gap-3">
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', a.tone === 'reject' ? 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300')}>
                  {a.tone === 'reject' ? <X className="size-4" /> : <Check className="size-4" />}
                </span>
                <span>{a.text}<small className="block text-xs text-muted-foreground">{a.time}</small></span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <ReviewDialog drive={reviewing} onClose={() => setReviewing(null)} onDone={reload} />
    </main>
  )
}

type Tone = 'neutral' | 'positive' | 'negative' | 'active' | 'accent'

function Stat({ label, value, note, tone = 'neutral', onNoteClick }: { label: string; value: string; note: string; tone?: Tone; onNoteClick?: () => void }) {
  const noteClass = {
    neutral: 'text-muted-foreground',
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    active: 'text-indigo-600 dark:text-indigo-400',
    accent: 'text-amber-700 dark:text-amber-300',
  }[tone]
  return (
    <div className={cn('rounded-[12px] border bg-card p-5 shadow-sm transition-shadow hover:shadow-md', tone === 'accent' && 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20')}>
      <div className="flex min-h-7 items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {(tone === 'positive' || tone === 'negative') && <span aria-hidden="true" className={cn('grid size-7 place-items-center rounded-full', tone === 'positive' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40')}>↝</span>}
        {tone === 'active' && <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">●</span>}
        {tone === 'accent' && <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40">↝</span>}
      </div>
      <div className="mt-5 text-3xl font-bold tracking-tight">{value}</div>
      <div className={cn('mt-2 text-xs font-medium', noteClass)}>
        {onNoteClick ? (
          <button onClick={onNoteClick} className="inline-flex items-center gap-1 hover:underline">{note}</button>
        ) : (
          <span className="inline-flex items-center gap-1">{(tone === 'positive' || tone === 'negative') && <TrendingUp aria-hidden="true" className={cn('size-3.5', tone === 'negative' && 'rotate-180')} />}{note}</span>
        )}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, right, children }: { title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3 border-b pb-4">
        <div><h3 className="font-semibold tracking-tight">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
        {right}
      </div>
      {children}
    </section>
  )
}

function DepartmentChart({ items }: { items: DashboardData['departments_chart']['items'] }) {
  const max = Math.max(1, ...items.map((d) => d.registered))
  return (
    <div role="img" aria-label="Registered and placed students by department" className="flex items-end justify-around gap-4 border-b border-dashed px-4 pt-8">
      {items.map((d) => (
        <div key={d.id} className="flex flex-1 flex-col items-center" title={`${d.name}: ${d.registered} registered, ${d.placed} placed (${d.percent}%)`}>
          <div className="flex h-56 w-full items-end justify-center gap-2">
            <div className="flex h-full flex-col items-center justify-end">
              <span className="mb-1 text-[10px] text-muted-foreground">{d.registered}</span>
              <div className="w-5 rounded-t bg-indigo-300 dark:bg-indigo-400/70" style={{ height: `${(d.registered / max) * 85}%` }} />
            </div>
            <div className="flex h-full flex-col items-center justify-end">
              <span className="mb-1 text-[10px] text-muted-foreground">{d.placed}</span>
              <div className="w-5 rounded-t bg-indigo-700 dark:bg-indigo-500" style={{ height: `${(d.placed / max) * 85}%` }} />
            </div>
          </div>
          <span className="py-2 text-[10px] text-muted-foreground">{d.short_name}</span>
        </div>
      ))}
    </div>
  )
}

function Funnel({ stages }: { stages: DashboardData['funnel'] }) {
  const barColor = ['bg-indigo-200 dark:bg-indigo-300/60', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700 dark:bg-indigo-500']
  // The biggest drop between two neighbouring stages, computed from the data.
  let drop: { from: string; to: string; pct: number } | null = null
  for (let i = 1; i < stages.length; i++) {
    const pct = stages[i - 1].count === 0 ? 0 : 100 - (stages[i].from_previous ?? 0)
    if (!drop || pct > drop.pct) drop = { from: stages[i - 1].label, to: stages[i].label, pct }
  }
  return (
    <div className="grid gap-4 pt-4">
      {stages.map((s, i) => (
        <div key={s.key} title={`${s.label}: ${s.count} (${s.percent_of_applied}% of applications)`}>
          <div className="flex justify-between text-sm">
            <span>{s.label}</span>
            <b>
              {s.count.toLocaleString('en-IN')}{' '}
              <small className="font-normal text-muted-foreground">({i === 0 ? '100% baseline' : `${s.from_previous}% conv.`})</small>
            </b>
          </div>
          <div className="mt-2 h-5 rounded bg-indigo-100 dark:bg-indigo-950/60">
            <div className={cn('h-full rounded', barColor[i])} style={{ width: `${Math.max(s.percent_of_applied, s.count > 0 ? 2 : 0)}%` }} />
          </div>
        </div>
      ))}
      {drop && stages[0].count > 0 && (
        <p className="text-xs text-muted-foreground">Biggest drop: <b>{drop.from} → {drop.to}</b> ({drop.pct}% do not continue)</p>
      )}
    </div>
  )
}

function Trend({ trend }: { trend: DashboardData['trend'] }) {
  const max = Math.max(1, ...trend.weeks.map((w) => w.cumulative))
  const first = trend.weeks[0]
  const last = trend.weeks[trend.weeks.length - 1]
  return (
    <>
      <div role="img" aria-label="Cumulative placements per week" className="flex h-40 items-end gap-2 pt-8">
        {trend.weeks.map((w, i) => (
          <div
            key={i}
            title={`Week of ${w.label}: ${w.count} accepted, ${w.cumulative} in total`}
            className="flex-1 rounded-t bg-indigo-500/80"
            style={{ height: `${Math.max((w.cumulative / max) * 100, w.cumulative > 0 ? 3 : 0)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{first.label}</span><span>{last.label}</span></div>
      <p className="mt-3 text-xs text-muted-foreground">
        Last 4 weeks: <b>{trend.recent_per_week}/week</b>{' '}
        <b className={trend.delta_per_week >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
          ({trend.delta_per_week >= 0 ? '+' : '−'}{Math.abs(trend.delta_per_week)} vs previous 4 weeks)
        </b>
      </p>
    </>
  )
}

function StatusMix({ mix }: { mix: DashboardData['status_mix'] }) {
  let at = 0
  const stops = mix.segments.map((s) => {
    const from = at
    at += (s.count / mix.total) * 100
    return `${s.color} ${from}% ${at}%`
  })
  return (
    <>
      <div
        role="img"
        aria-label={mix.segments.map((s) => `${s.label}: ${s.count}`).join(', ')}
        className="mx-auto mt-5 grid size-36 place-items-center rounded-full"
        style={{ background: mix.total ? `conic-gradient(${stops.join(', ')})` : 'var(--muted)' }}
      >
        <div className="grid size-24 place-items-center rounded-full bg-card text-center"><div><b className="block text-2xl">{mix.total}</b><small>DRIVES</small></div></div>
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {mix.segments.map((s) => (
          <li key={s.status} title={`${s.label}: ${s.count} drives (${s.percent}%)`}>
            <i className="mr-1 inline-block size-2 rounded-sm" style={{ background: s.color }} />{s.label} {s.count}
          </li>
        ))}
      </ul>
    </>
  )
}

function PendingPanel({ items, search, onReview }: { items: Pending[]; search: string; onReview: (d: Pending) => void }) {
  const term = search.trim().toLowerCase()
  const shown = term ? items.filter((d) => `${d.title} ${d.company} ${d.reference_id ?? ''}`.toLowerCase().includes(term)) : items
  return (
    <Panel
      title="Pending approvals"
      subtitle="Requires TPO institutional verification before opening to students"
      right={term ? <span className="text-xs text-muted-foreground">{shown.length} of {items.length} match “{search.trim()}”</span> : undefined}
    >
      <div className="grid gap-3 pt-4">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing is waiting for approval. Nice work.</p>}
        {items.length > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No pending drive matches your search.</p>}
        {shown.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm last:border-b-0">
            <div>
              <b>{d.title}</b>
              <div className="text-xs text-muted-foreground">{d.company} • submitted {d.submitted_label}</div>
            </div>
            <span className="rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">PENDING APPROVAL</span>
            <button onClick={() => onReview(d)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700">Review</button>
          </div>
        ))}
      </div>
    </Panel>
  )
}
