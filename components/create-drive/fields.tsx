'use client'

import { useId } from 'react'
import { AlertCircle, ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// The input "box" matches the original static fields: h-12, rounded, indigo focus ring. Errors use the rose style.
const box =
  'flex h-12 items-center justify-between gap-2 rounded-lg border bg-background px-4 font-normal shadow-sm transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'
const boxError = 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500/20 dark:border-rose-500/70'
const bare = 'min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60'

interface FieldShellProps {
  label: string
  hint: string
  error?: string
  htmlFor: string
  children: React.ReactNode
}

function FieldShell({ label, hint, error, htmlFor, children }: FieldShellProps) {
  return (
    <div className="grid gap-2 text-sm font-semibold">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <small id={`${htmlFor}-error`} role="alert" className="flex items-center gap-1 font-normal text-rose-600 dark:text-rose-400">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" /> {error}
        </small>
      ) : (
        <small className="font-normal text-muted-foreground">{hint}</small>
      )}
    </div>
  )
}

const toNumber = (raw: string): number | null => {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

interface RangeFieldProps {
  label: string
  hint: string
  value: number | null
  onChange: (v: number | null) => void
  min: number
  max: number
  step: number
  suffix?: string
  error?: string
  disabled?: boolean
}

/** A slider and a number input that always show the same value. */
export function RangeField({ label, hint, value, onChange, min, max, step, suffix, error, disabled }: RangeFieldProps) {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <div className={cn(box, error && boxError)}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value ?? ''}
          placeholder="Not set"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(toNumber(e.target.value))}
          className={bare}
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </FieldShell>
  )
}

interface StepperFieldProps {
  label: string
  hint: string
  value: number | null
  onChange: (v: number | null) => void
  error?: string
  disabled?: boolean
}

/** A whole-number stepper that can never go below 0. */
export function StepperField({ label, hint, value, onChange, error, disabled }: StepperFieldProps) {
  const id = useId()
  const current = value ?? 0
  const button = 'grid size-8 place-items-center rounded-md border bg-card hover:bg-muted disabled:pointer-events-none disabled:opacity-40'
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <div className={cn(box, error && boxError)}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          disabled={disabled}
          value={value ?? ''}
          placeholder="No limit"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const n = toNumber(e.target.value)
            onChange(n === null ? null : Math.max(0, Math.trunc(n)))
          }}
          className={bare}
        />
        <div className="flex gap-1.5">
          <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || current <= 0} onClick={() => onChange(Math.max(0, current - 1))} className={button}>
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(current + 1)} className={button}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </FieldShell>
  )
}

interface SelectFieldProps {
  label: string
  hint: string
  value: number | null
  onChange: (v: number | null) => void
  options: { value: number; label: string }[]
  placeholder: string
  error?: string
  disabled?: boolean
}

export function SelectField({ label, hint, value, onChange, options, placeholder, error, disabled }: SelectFieldProps) {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <div className={cn(box, 'relative', error && boxError)}>
        <select
          id={id}
          disabled={disabled}
          value={value ?? ''}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={cn(bare, 'h-full cursor-pointer appearance-none pr-6')}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 size-4 text-muted-foreground" />
      </div>
    </FieldShell>
  )
}

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function ToggleRow({ title, description, checked, onChange, disabled }: ToggleRowProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-indigo-50 p-4 dark:bg-indigo-950/30">
      <div>
        <b id={id}>{title}</b>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('h-6 w-11 shrink-0 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60', checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600')}
      >
        <span className={cn('block size-4 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}
