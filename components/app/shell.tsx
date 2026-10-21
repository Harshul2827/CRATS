'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BriefcaseBusiness, Building2, CircleHelp, FileText, GraduationCap, LayoutDashboard, Menu, Plus, Search,
  ShieldCheck, UserRound, Users, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useSession, type Me } from '@/components/app/providers'
import { Spinner } from '@/components/app/states'
import { ThemeToggle } from '@/components/app/theme-toggle'
import { NotificationBell } from '@/components/app/notification-bell'
import { UserMenu } from '@/components/app/user-menu'
import { SignInDialog } from '@/components/app/sign-in-dialog'
import type { Role } from '@/lib/demo-accounts'

type PageRole = Exclude<Role, 'faculty'>

interface NavItem {
  label: string
  icon: LucideIcon
  href?: string
  badge?: number
}

const ROLE_LABEL: Record<PageRole, string> = { tpo: 'TPO', recruiter: 'Recruiter', student: 'Student' }
const MENU_HEADING: Record<PageRole, string> = { tpo: 'Navigation', recruiter: 'Navigation', student: 'Portal menu' }

function navFor(role: PageRole, driveBadge?: number): NavItem[] {
  if (role === 'tpo') {
    return [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Companies', icon: Building2 },
      { label: 'Students', icon: Users },
      { label: 'Audit log', icon: ShieldCheck },
    ]
  }
  if (role === 'recruiter') {
    return [
      { label: 'My Drives', icon: BriefcaseBusiness },
      { label: 'Create Drive', icon: Plus, href: '/create-drive' },
      { label: 'Candidates', icon: Users },
      { label: 'Company profile', icon: Building2 },
    ]
  }
  return [
    { label: 'Open Drives', icon: BriefcaseBusiness, href: '/open-drives', badge: driveBadge },
    { label: 'My Applications', icon: FileText },
    { label: 'My Profile', icon: UserRound },
    { label: 'Help', icon: CircleHelp },
  ]
}

function Brand({ role }: { role: PageRole }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-[#4c42df] text-white"><GraduationCap /></div>
      <div>
        <div className="text-lg font-bold tracking-tight">CRATS</div>
        <div className="text-[11px] uppercase tracking-wider text-indigo-300">SPIT MUMBAI</div>
      </div>
      <span className="ml-auto rounded-md bg-indigo-500/30 px-2 py-1 text-xs font-semibold text-indigo-200">{ROLE_LABEL[role]}</span>
    </div>
  )
}

function Sidebar({ role, user, student, driveBadge, open, onClose }: {
  role: PageRole
  user: Me['user'] | null
  student: Me['student']
  driveBadge?: number
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const items = navFor(role, driveBadge)
  const itemClass = (active: boolean) =>
    cn(
      'flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-sm font-medium text-indigo-100 transition hover:bg-white/10',
      active && 'bg-indigo-400/25 text-white ring-1 ring-inset ring-indigo-300/50',
    )

  return (
    <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 flex-col bg-sidebar text-white lg:z-20 lg:flex', open ? 'flex' : 'hidden')}>
      <div className="flex items-center border-b border-white/10 p-6">
        <div className="flex-1"><Brand role={role} /></div>
        <button className="ml-3 rounded-md p-1 text-indigo-200 hover:bg-white/10 lg:hidden" aria-label="Close menu" onClick={onClose}><X className="size-5" /></button>
      </div>
      <div className="flex-1 p-4">
        <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-indigo-300">{MENU_HEADING[role]}</p>
        <nav className="grid gap-2">
          {items.map((item) => {
            const Icon = item.icon
            const badge = item.badge !== undefined && <span className="rounded bg-indigo-500 px-2 py-0.5 text-xs">{item.badge}</span>
            return item.href ? (
              <Link key={item.label} href={item.href} aria-current="page" onClick={onClose} className={itemClass(true)}>
                <Icon className="size-5" /><span className="flex-1">{item.label}</span>{badge}
              </Link>
            ) : (
              <button
                key={item.label}
                onClick={() => { onClose(); toast(`${item.label} is outside the demo scope`) }}
                className={itemClass(false)}
              >
                <Icon className="size-5" /><span className="flex-1">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
      <div className="border-t border-white/10 p-5">
        {user ? (
          <>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-indigo-500/30 text-sm font-bold">{user.initials}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="truncate text-xs text-indigo-200">{user.sidebar_subtitle}</div>
              </div>
            </div>
            {student && (
              <div className="mt-5 flex justify-between text-xs text-indigo-200">
                <span>CGPA: <b className="text-white">{student.cgpa.toFixed(2)}</b></span>
                {student.verification_status === 'VERIFIED'
                  ? <span className="text-emerald-300">✓ Verified</span>
                  : <span className="text-amber-300">● {student.verification_status === 'PENDING' ? 'Pending' : 'Rejected'}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-indigo-200">Not signed in</p>
        )}
      </div>
    </aside>
  )
}

export interface SearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function Header({ title, user, search, onMenu }: { title: string; user: Me['user'] | null; search?: SearchProps; onMenu: () => void }) {
  const toast = useToast()
  return (
    <header className="sticky top-0 z-10 flex h-20 items-center gap-5 border-b bg-background/95 px-5 backdrop-blur lg:ml-64 lg:px-10">
      <button className="lg:hidden" aria-label="Open menu" onClick={onMenu}><Menu /></button>
      <h1 className="hidden text-2xl font-bold md:block">{title}</h1>
      <div className="relative ml-auto w-full max-w-md">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          aria-label="Search"
          value={search?.value ?? undefined}
          onChange={search ? (e) => search.onChange(e.target.value) : undefined}
          onKeyDown={search ? undefined : (e) => { if (e.key === 'Enter') toast('Search is outside the demo scope on this page') }}
          className="h-10 w-full rounded-lg border bg-muted/40 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          placeholder={search?.placeholder ?? 'Search drives or companies...'}
        />
      </div>
      <ThemeToggle />
      {user && <NotificationBell />}
      <div className="h-7 w-px bg-border" />
      {user ? <UserMenu user={user} /> : <span className="text-sm text-muted-foreground">Signed out</span>}
    </header>
  )
}

interface ShellProps {
  role: PageRole
  title: string
  search?: SearchProps
  /** Number shown on the student's "Open Drives" nav item. */
  driveBadge?: number
  children: (me: Me) => React.ReactNode
}

/** Role-aware chrome (sidebar, top bar, sign-in dialog). Content renders only for the signed-in user of this page's role. */
export function Shell({ role, title, search, driveBadge, children }: ShellProps) {
  const { me, status } = useSession()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrongRole = status === 'authed' && me !== null && me.user.role !== role

  useEffect(() => {
    if (wrongRole && me) router.replace(me.home)
  }, [wrongRole, me, router])

  const user = status === 'authed' && me && !wrongRole ? me.user : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <Sidebar role={role} user={user} student={user ? (me?.student ?? null) : null} driveBadge={driveBadge} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Header title={title} user={user} search={search} onMenu={() => setMenuOpen(true)} />
      <div className="lg:ml-64">
        {status === 'loading' || wrongRole ? (
          <Spinner />
        ) : status === 'anon' ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Sign in to see this page.</p>
        ) : (
          me && children(me)
        )}
      </div>
      <SignInDialog />
    </div>
  )
}
