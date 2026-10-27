// Role -> permission map. Every API route calls requirePermission() with one of these codes.
import type { Role } from '../../lib/demo-accounts'

export type Permission =
  | 'dashboard.read' | 'drive.review' | 'activity.read'
  | 'draft.read' | 'draft.write' | 'draft.submit' | 'eligibility.preview'
  | 'drives.read' | 'drives.apply'
  | 'notifications.read'

const COMMON: Permission[] = ['notifications.read']

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  tpo: ['dashboard.read', 'drive.review', 'activity.read', ...COMMON],
  recruiter: ['draft.read', 'draft.write', 'draft.submit', 'eligibility.preview', ...COMMON],
  student: ['drives.read', 'drives.apply', ...COMMON],
  // Faculty verify students in the real system; there is no faculty screen in this demo.
  faculty: [],
}

export const can = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false
