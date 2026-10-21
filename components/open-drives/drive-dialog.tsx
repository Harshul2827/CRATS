'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/app/states'
import { api, errorMessage, isAbort } from '@/lib/api'
import type { StudentDriveDetail } from '@/server/services/student-drives'
import { cn } from '@/lib/utils'

/** "View details" and "View criteria": the drive plus a tick-or-cross checklist of every rule with the student's own value. */
export function DriveDialog({ driveId, version, applying, onClose, onApply }: {
  driveId: number | null
  /** Changes after an application so the dialog re-reads the drive. */
  version: number
  applying: boolean
  onClose: () => void
  onApply: (id: number) => void
}) {
  const [detail, setDetail] = useState<StudentDriveDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (driveId === null) {
      setDetail(null)
      setError(null)
      return
    }
    const controller = new AbortController()
    api<StudentDriveDetail>(`/api/student/drives/${driveId}`, { signal: controller.signal })
      .then((d) => { setDetail(d); setError(null) })
      .catch((e) => { if (!isAbort(e)) setError(errorMessage(e)) })
    return () => controller.abort()
  }, [driveId, version])

  const d = detail?.drive
  const verified = detail?.checks.find((c) => c.rule === 'verified')?.passed ?? false

  return (
    <Modal
      open={driveId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={d ? d.title : 'Drive details'}
      description={d ? `${d.company} • ${d.job_type_label}` : undefined}
      className="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Close</button>
          {detail?.status === 'eligible' && (
            <button
              disabled={applying}
              onClick={() => driveId !== null && onApply(driveId)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {applying && <Loader2 className="size-4 animate-spin" />} Apply now
            </button>
          )}
          {detail?.status === 'applied' && (
            <span className="rounded-lg bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">{detail.applied_label}</span>
          )}
        </>
      }
    >
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!detail && !error && <Spinner className="py-10" />}
      {detail && d && (
        <div className="grid gap-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">
            {[
              [d.job_type === 'INTERNSHIP' ? 'Stipend' : 'Compensation', d.ctc_text],
              ['Work location', d.location_label],
              ['Openings', `${d.openings} positions`],
              ['Deadline', `${d.deadline_label} (${detail.days_left_label})`],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
            ))}
          </dl>
          {d.description && <p className="text-muted-foreground">{d.description}</p>}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Eligibility checklist</h4>
            <ul className="divide-y rounded-lg border">
              {detail.checks.map((c) => (
                <li key={c.rule} className="flex items-start gap-3 px-4 py-3">
                  <span
                    aria-label={c.passed ? 'Met' : 'Not met'}
                    className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', c.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300')}
                  >
                    {c.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-x-4">
                      <b>{c.label}</b>
                      <span className="text-muted-foreground">Required: {c.required} • You: <b className={cn(c.passed ? 'text-foreground' : 'text-rose-700 dark:text-rose-300')}>{c.actual}</b></span>
                    </div>
                    {c.reason && <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{c.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {!verified && <p className="mt-2 text-xs text-muted-foreground">Other rules apply once your profile is verified.</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
