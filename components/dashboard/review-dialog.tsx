'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { api, ApiError, errorMessage, notifyNotificationsChanged } from '@/lib/api'
import { criteriaRows } from '@/lib/criteria-text'
import type { DashboardData } from '@/server/services/dashboard'
import { cn } from '@/lib/utils'

type Pending = DashboardData['pending_approvals'][number]

const MIN_REASON = 10

/** Review one drive: see the summary and criteria, then Approve, or Reject with a required reason. */
export function ReviewDialog({ drive, onClose, onDone }: { drive: Pending | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  useEffect(() => {
    setRejecting(false)
    setReason('')
    setReasonError(null)
    setBusy(null)
  }, [drive?.id])

  const send = async (action: 'approve' | 'reject') => {
    if (!drive) return
    if (action === 'reject' && reason.trim().length < MIN_REASON) {
      setReasonError(`Give a reason of at least ${MIN_REASON} characters`)
      return
    }
    setBusy(action)
    try {
      await api(`/api/drives/${drive.id}/review`, {
        method: 'POST',
        body: action === 'approve' ? { action } : { action, reason: reason.trim() },
      })
      toast(
        action === 'approve' ? `${drive.title} approved. It is now open to eligible students.` : `${drive.title} returned to ${drive.company} with your reason.`,
        'success',
      )
      notifyNotificationsChanged()
      onDone()
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.fields.reason) setReasonError(e.fields.reason)
      else toast(errorMessage(e), 'error')
      setBusy(null)
    }
  }

  const facts = drive
    ? [
        ['Company', drive.company],
        ['Reference', drive.reference_id ?? '—'],
        ['Type', drive.job_type_label],
        ['Compensation', drive.ctc_text],
        ['Location', drive.location_label],
        ['Openings', `${drive.openings} positions`],
        ['Deadline', drive.deadline_label],
        ['Submitted', drive.submitted_label ?? '—'],
      ]
    : []

  return (
    <Modal
      open={drive !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
      title={drive ? `Review: ${drive.title}` : 'Review'}
      description="Check the drive and its eligibility criteria before it opens to students."
      className="max-w-2xl"
      footer={
        rejecting ? (
          <>
            <button disabled={!!busy} onClick={() => { setRejecting(false); setReasonError(null) }} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Back</button>
            <button
              disabled={!!busy}
              onClick={() => send('reject')}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy === 'reject' ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Confirm rejection
            </button>
          </>
        ) : (
          <>
            <button disabled={!!busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button
              disabled={!!busy}
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              <X className="size-4" /> Reject…
            </button>
            <button
              disabled={!!busy}
              onClick={() => send('approve')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve
            </button>
          </>
        )
      }
    >
      {drive && (
        <div className="grid gap-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {drive.description && <p className="text-muted-foreground">{drive.description}</p>}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Eligibility criteria</h4>
            <ul className="divide-y rounded-lg border">
              {criteriaRows(drive.criteria).map((r) => (
                <li key={r.label} className="flex justify-between gap-4 px-4 py-2">
                  <span className="text-muted-foreground">{r.label}</span>
                  <b>{r.value}</b>
                </li>
              ))}
            </ul>
          </div>
          {rejecting && (
            <label className="grid gap-1.5 font-semibold">
              Reason for rejection <span className="text-xs font-normal text-muted-foreground">Required. The recruiter sees this and can fix and resubmit.</span>
              <textarea
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setReasonError(null) }}
                aria-invalid={!!reasonError}
                className={cn(
                  'w-full resize-none rounded-lg border bg-background p-3 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                  reasonError && 'border-rose-400 ring-2 ring-rose-400/20',
                )}
                placeholder="e.g. Minimum 12th percentage is missing from the eligibility criteria."
              />
              {reasonError && <small role="alert" className="font-normal text-rose-600 dark:text-rose-400">{reasonError}</small>}
            </label>
          )}
        </div>
      )}
    </Modal>
  )
}
