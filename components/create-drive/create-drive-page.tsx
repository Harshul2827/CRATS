'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CircleHelp, Loader2, Send } from 'lucide-react'
import { Shell } from '@/components/app/shell'
import { EmptyState, ErrorState, Spinner } from '@/components/app/states'
import { RangeField, SelectField, StepperField, ToggleRow } from '@/components/create-drive/fields'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { api, ApiError, errorMessage, isAbort, notifyNotificationsChanged } from '@/lib/api'
import type { CriteriaInput, DraftView, previewEligibility } from '@/server/services/drives'
import { cn } from '@/lib/utils'

type Preview = ReturnType<typeof previewEligibility>
type Fields = Record<string, string>

const emptyForm: CriteriaInput = {
  min_cgpa: null, max_active_backlogs: null, max_dead_backlogs: null, min_tenth_pct: null,
  min_twelfth_pct: null, allowed_graduation_year: null, allow_already_placed: false,
}

const YEARS = [
  { value: 2026, label: '2026 (Current Batch)' },
  { value: 2027, label: '2027 (Upcoming Batch)' },
  { value: 2028, label: '2028' },
]

const toForm = (c: DraftView['drive']['criteria']): CriteriaInput => ({
  min_cgpa: c.min_cgpa, max_active_backlogs: c.max_active_backlogs, max_dead_backlogs: c.max_dead_backlogs,
  min_tenth_pct: c.min_tenth_pct, min_twelfth_pct: c.min_twelfth_pct,
  allowed_graduation_year: c.allowed_graduation_year, allow_already_placed: c.allow_already_placed,
})

/** The same rules the server enforces, so the Submit button can stay disabled until the form is complete. */
function localErrors(f: CriteriaInput): Fields {
  const e: Fields = {}
  if (f.min_cgpa !== null && (f.min_cgpa < 0 || f.min_cgpa > 10)) e.min_cgpa = 'CGPA must be between 0 and 10'
  for (const k of ['max_active_backlogs', 'max_dead_backlogs'] as const) {
    if (f[k] !== null && (f[k]! < 0 || !Number.isInteger(f[k]))) e[k] = 'Must be a whole number, 0 or more'
  }
  if (f.min_tenth_pct !== null && (f.min_tenth_pct < 0 || f.min_tenth_pct > 100)) e.min_tenth_pct = 'Must be between 0 and 100'
  if (f.min_twelfth_pct === null) e.min_twelfth_pct = 'Minimum 12th percentage is required'
  else if (f.min_twelfth_pct < 0 || f.min_twelfth_pct > 100) e.min_twelfth_pct = 'Must be between 0 and 100'
  if (f.allowed_graduation_year === null) e.allowed_graduation_year = 'Allowed graduation year is required'
  return e
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The plain-English summary shown in the student preview. */
function summarise(f: CriteriaInput): React.ReactNode {
  const parts: React.ReactNode[] = []
  const b = (t: string) => <b key={t} className="text-indigo-700 dark:text-indigo-300">{t}</b>
  if (f.min_cgpa !== null) parts.push(<span key="cgpa">a {b(`CGPA of ${f.min_cgpa} or higher`)}</span>)
  if (f.max_active_backlogs !== null) {
    parts.push(f.max_active_backlogs === 0 ? <span key="a">no active backlogs</span> : <span key="a">at most {b(plural(f.max_active_backlogs, 'active backlog'))}</span>)
  }
  if (f.max_dead_backlogs !== null) {
    parts.push(f.max_dead_backlogs === 0 ? <span key="d">no dead backlogs</span> : <span key="d">at most {b(plural(f.max_dead_backlogs, 'dead backlog'))}</span>)
  }
  if (f.min_tenth_pct !== null) parts.push(<span key="10">at least {b(`${f.min_tenth_pct}% in 10th`)}</span>)
  if (f.min_twelfth_pct !== null) parts.push(<span key="12">at least {b(`${f.min_twelfth_pct}% in 12th`)}</span>)
  const year = f.allowed_graduation_year
  return (
    <>
      Students can apply if they have{' '}
      {parts.length === 0 ? 'any academic record' : parts.map((p, i) => (
        <span key={i}>{i > 0 && (i === parts.length - 1 ? ', and ' : ', ')}{p}</span>
      ))}
      {year !== null && <>, and graduate in {b(String(year))}</>}.
      {f.allow_already_placed ? ' Already-placed students may also apply.' : ''}
    </>
  )
}

export function CreateDrivePage() {
  return (
    <Shell role="recruiter" title="Create new drive">
      {() => <CreateDrive />}
    </Shell>
  )
}

function CreateDrive() {
  const toast = useToast()
  const [draft, setDraft] = useState<DraftView | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<CriteriaInput>(emptyForm)
  const [saved, setSaved] = useState<CriteriaInput>(emptyForm)
  const [errors, setErrors] = useState<Fields>({})
  const [errorDemo, setErrorDemo] = useState(false)
  const [busy, setBusy] = useState<'save' | 'next' | 'submit' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const { draft: d } = await api<{ draft: DraftView | null }>('/api/draft')
      setDraft(d)
      if (d) {
        const f = toForm(d.drive.criteria)
        setForm(f)
        setSaved(f)
      }
    } catch (e) {
      setLoadError(errorMessage(e))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Live preview: debounced call to the server's shared eligibility function.
  const formKey = JSON.stringify(form)
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!draft) return
    const controller = new AbortController()
    setPreviewing(true)
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      api<Preview>('/api/eligibility/preview', { method: 'POST', body: { criteria: form }, signal: controller.signal })
        .then((p) => { setPreview(p); setPreviewError(false) })
        .catch((e) => { if (!isAbort(e)) setPreviewError(true) })
        .finally(() => { if (!controller.signal.aborted) setPreviewing(false) })
    }, 350)
    return () => { controller.abort(); clearTimeout(previewTimer.current) }
    // `form` is represented by formKey
  }, [formKey, draft?.drive.id])

  const local = useMemo(() => localErrors(form), [form])
  const complete = Object.keys(local).length === 0
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const readOnly = draft?.read_only ?? true

  const update = <K extends keyof CriteriaInput>(key: K, value: CriteriaInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!(key in e)) return e
      const { [key as string]: _drop, ...rest } = e
      return rest
    })
  }

  /** Persists the form. Returns true on success; shows server field errors otherwise. */
  const persist = async (): Promise<boolean> => {
    try {
      const { draft: d } = await api<{ draft: DraftView }>('/api/draft', { method: 'PUT', body: { criteria: form } })
      setDraft(d)
      const f = toForm(d.drive.criteria)
      setForm(f)
      setSaved(f)
      setErrors({})
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setErrors(e.fields)
        toast('Fix the highlighted fields and try again', 'error')
      } else {
        toast(errorMessage(e), 'error')
      }
      return false
    }
  }

  const saveDraft = async () => {
    setBusy('save')
    if (await persist()) toast('Draft saved', 'success')
    setBusy(null)
  }

  const next = async () => {
    if (readOnly) {
      toast('Step 3 (Departments & skills) is outside the demo scope')
      return
    }
    setBusy('next')
    if (await persist()) toast('Eligibility saved. Step 3 (Departments & skills) is outside the demo scope', 'success')
    setBusy(null)
  }

  const submit = async () => {
    setBusy('submit')
    try {
      if (dirty && !(await persist())) {
        setConfirming(false)
        return
      }
      const { draft: d } = await api<{ draft: DraftView }>('/api/draft/submit', { method: 'POST' })
      setDraft(d)
      setJustSubmitted(d.drive.reference_id)
      setConfirming(false)
      notifyNotificationsChanged()
      toast(`Submitted for TPO approval as ${d.drive.reference_id}`, 'success')
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setErrors(e.fields)
      toast(errorMessage(e), 'error')
      setConfirming(false)
    } finally {
      setBusy(null)
    }
  }

  if (draft === undefined) {
    return loadError ? <ErrorState message={loadError} onRetry={load} /> : <Spinner label="Loading your draft…" />
  }
  if (draft === null) {
    return (
      <main className="p-5 lg:p-10">
        <EmptyState title="No draft in progress" message="Drives you have submitted are with the TPO or already open to students. A drive returned by the TPO appears here so you can fix and resubmit it." />
      </main>
    )
  }

  const { drive } = draft
  const pending = drive.status === 'PENDING_APPROVAL'
  // The demo switch shows how errors look even when the form is valid.
  const shown: Fields = errorDemo ? { min_twelfth_pct: 'Minimum 12th percentage is required', allowed_graduation_year: 'Allowed graduation year is required', ...errors } : errors
  const yearOptions = form.allowed_graduation_year !== null && !YEARS.some((y) => y.value === form.allowed_graduation_year)
    ? [...YEARS, { value: form.allowed_graduation_year, label: String(form.allowed_graduation_year) }]
    : YEARS

  return (
    <main className="p-5 lg:p-10">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        My Drives <ChevronRight className="size-4" /> Create Drive <ChevronRight className="size-4" /> <span className="text-foreground">Eligibility</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">
            Create new drive{' '}
            <span className="ml-2 rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{drive.title}</span>{' '}
            <span className={cn('ml-1 rounded-full px-3 py-1 align-middle text-xs font-medium', pending ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}>
              {pending ? 'Pending approval' : 'Draft'}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {drive.company}{drive.reference_id ? ` • ${drive.reference_id}` : ''} • Last saved {draft.updated_label}
            {dirty && !readOnly && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">• Unsaved changes</span>}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-1 text-sm" role="group" aria-label="Demo view">
          <button onClick={() => setErrorDemo(false)} aria-pressed={!errorDemo} className={cn('rounded-md px-4 py-2', !errorDemo && 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200')}>Standard View</button>
          <button onClick={() => setErrorDemo(true)} aria-pressed={errorDemo} className={cn('rounded-md px-4 py-2', errorDemo && 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200')}>Validation Error State</button>
        </div>
      </div>

      {drive.rejection_reason && !pending && (
        <div role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <b>Returned by the TPO</b>
          <p className="mt-1">{drive.rejection_reason}</p>
        </div>
      )}
      {pending && (
        <div role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <b>{justSubmitted ? `Submitted as ${justSubmitted}.` : `Awaiting TPO approval${drive.reference_id ? ` (${drive.reference_id})` : ''}.`}</b>{' '}
          The form is read-only while the TPO reviews it. You will get a notification with the decision.
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-card p-6 shadow-sm">
        <Step n="✓" label="Position" done />
        <Step n="2" label="Eligibility" active />
        <Step n="3" label="Departments & skills" />
        <Step n="4" label="Selection rounds" />
        <Step n="5" label="Review" />
      </div>

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-12">
        <section className="rounded-[14px] border bg-card p-7 shadow-sm xl:col-span-8">
          <h3 className="text-[25px] font-semibold tracking-tight">Who can apply?</h3>
          <p className="mt-2 max-w-2xl text-muted-foreground">Students must meet ALL of these conditions to apply. You can change them until you submit for institutional approval.</p>
          <div className="my-6 border-t" />
          <div className="grid gap-6 md:grid-cols-2">
            <RangeField label="Minimum CGPA" hint="Minimum requirement for student eligibility." value={form.min_cgpa} onChange={(v) => update('min_cgpa', v)} min={0} max={10} step={0.1} error={shown.min_cgpa} disabled={readOnly} />
            <SelectField label="Allowed graduation year" hint="Only this batch can apply." value={form.allowed_graduation_year} onChange={(v) => update('allowed_graduation_year', v)} options={yearOptions} placeholder="Select a batch" error={shown.allowed_graduation_year} disabled={readOnly} />
            <StepperField label="Maximum active backlogs" hint="Backlogs that are currently uncleared." value={form.max_active_backlogs} onChange={(v) => update('max_active_backlogs', v)} error={shown.max_active_backlogs} disabled={readOnly} />
            <StepperField label="Maximum dead backlogs" hint="Backlogs cleared after a failed attempt." value={form.max_dead_backlogs} onChange={(v) => update('max_dead_backlogs', v)} error={shown.max_dead_backlogs} disabled={readOnly} />
            <RangeField label="Minimum 10th percentage" hint="Minimum requirement for student eligibility." value={form.min_tenth_pct} onChange={(v) => update('min_tenth_pct', v)} min={0} max={100} step={1} suffix="%" error={shown.min_tenth_pct} disabled={readOnly} />
            <RangeField label="Minimum 12th percentage" hint="Required before you can submit." value={form.min_twelfth_pct} onChange={(v) => update('min_twelfth_pct', v)} min={0} max={100} step={1} suffix="%" error={shown.min_twelfth_pct} disabled={readOnly} />
          </div>
          <div className="mt-6">
            <ToggleRow title="Allow already-placed students to apply" description="When off, students who have accepted an offer are excluded automatically." checked={form.allow_already_placed} onChange={(v) => update('allow_already_placed', v)} disabled={readOnly} />
          </div>
          <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200">
            <CircleHelp className="mr-2 inline size-4" /> Academic branches, eligible engineering departments, and required technical skills are configured in the next step.
          </div>
        </section>

        <aside className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-6 dark:border-indigo-900 dark:bg-indigo-950/20 xl:col-span-4">
          <div className="flex items-start justify-between">
            <div><h3 className="font-semibold">Student preview</h3><p className="text-sm text-muted-foreground">Live eligibility matrix</p></div>
            {previewing && <Loader2 aria-label="Updating preview" className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="mt-6 rounded-lg border bg-card p-4 text-sm">{summarise(form)}</div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wider">Sample SPIT cohort</p>
          {previewError && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">Could not update the preview.</p>}
          <div className={cn('transition-opacity', previewing && 'opacity-60')}>
            {preview?.samples.map((s) => (
              <div key={s.id} className="mt-2 flex items-start justify-between gap-3 rounded border bg-card p-3 text-sm">
                <span>
                  <b>{s.name}</b>
                  <small className="block text-muted-foreground">{s.department} • CGPA {s.cgpa}</small>
                  {!s.eligible && s.reasons[0] && <small className="mt-1 block text-rose-600 dark:text-rose-400">{s.reasons[0]}{s.reasons.length > 1 ? ` (+${s.reasons.length - 1} more)` : ''}</small>}
                </span>
                <span className={cn('h-fit shrink-0 rounded px-2 py-1 text-xs', s.eligible ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300')}>
                  {s.eligible ? '✓ Eligible' : '× Ineligible'}
                </span>
              </div>
            ))}
            {!preview && !previewError && <p className="mt-2 text-sm text-muted-foreground">Calculating…</p>}
            {preview && (
              <div className="mt-6 rounded-lg border bg-card p-4">
                <b className="text-2xl">{preview.pool.percent}%</b> estimated verified students qualify
                <small className="mt-1 block text-muted-foreground">{preview.pool.qualifying} of {preview.pool.pool_size} verified students{form.allowed_graduation_year ? ` in the ${form.allowed_graduation_year} batch` : ''}</small>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-7 flex flex-wrap justify-between gap-3">
        <button onClick={() => toast('Step 1 (Position) is outside the demo scope')} className="rounded-lg border px-5 py-3 hover:bg-muted">← Back: Position</button>
        <div className="flex flex-wrap gap-3">
          <button onClick={saveDraft} disabled={readOnly || busy !== null} className="inline-flex items-center gap-2 rounded-lg border px-5 py-3 hover:bg-muted disabled:pointer-events-none disabled:opacity-50">
            {busy === 'save' && <Loader2 className="size-4 animate-spin" />} Save as draft
          </button>
          <button onClick={() => setConfirming(true)} disabled={readOnly || !complete || busy !== null} title={!complete && !readOnly ? 'Complete the required fields first' : undefined} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:pointer-events-none disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
            <Send className="size-4" /> Submit for TPO approval
          </button>
          <button onClick={next} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy === 'next' && <Loader2 className="size-4 animate-spin" />} Next: Departments & skills →
          </button>
        </div>
      </div>

      <Modal
        open={confirming}
        onOpenChange={(o) => busy !== 'submit' && setConfirming(o)}
        title="Submit for TPO approval?"
        description={`${drive.title} (${drive.company})`}
        footer={
          <>
            <button onClick={() => setConfirming(false)} disabled={busy === 'submit'} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={submit} disabled={busy === 'submit'} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy === 'submit' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          The TPO will review the drive and its eligibility criteria. While it is pending you will not be able to edit it. If the TPO sends it back, you can fix it and submit again.
        </p>
      </Modal>
    </main>
  )
}

function Step({ n, label, done, active }: { n: string; label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('grid size-10 place-items-center rounded-full font-semibold', done || active ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-muted-foreground dark:bg-indigo-950/40')}>{n}</div>
      <div>
        <b className={cn((done || active) && 'text-indigo-700 dark:text-indigo-300')}>{label}</b>
        <small className="block text-muted-foreground">{active ? 'Criteria definition' : ' '}</small>
      </div>
    </div>
  )
}
