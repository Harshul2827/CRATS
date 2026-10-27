// Seeded demo accounts. Shared by the seed script, the sign-in dialog and the tests.
export const DEMO_PASSWORD = 'Crats@2026'

export const DEMO_ACCOUNTS = [
  { role: 'tpo', label: 'TPO', name: 'Dr. Anil Kulkarni', email: 'tpo@spit.edu' },
  { role: 'recruiter', label: 'Recruiter', name: 'Priya Mehta', email: 'priya.mehta@technova.com' },
  { role: 'student', label: 'Student', name: 'Aarav Patel', email: 'aarav.patel@spit.edu' },
] as const

export type Role = 'tpo' | 'recruiter' | 'student' | 'faculty'

/** Where each role lands after signing in (the app has exactly three pages). */
export const ROLE_HOME: Record<Role, string> = {
  tpo: '/dashboard',
  recruiter: '/create-drive',
  student: '/open-drives',
  faculty: '/dashboard',
}
