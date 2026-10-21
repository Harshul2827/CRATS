// Deterministic demo data. Same output on every run (seeded RNG + fixed DEMO_NOW clock).
// Nothing here is a dashboard number: every figure the UI shows is computed from these rows by SQL.

import bcrypt from 'bcryptjs'
import type { DB } from './client'
import { resetSchema } from './client'
import { ago, dateFromDemoToday } from '../lib/clock'
import { evaluateEligibility, loadCriteria, loadStudentFacts } from '../services/eligibility'
import { DEMO_PASSWORD } from '../../lib/demo-accounts'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** All stored timestamps are UTC ISO strings so they sort correctly as text. */
const utc = (value: string) => new Date(value).toISOString()

const DEPARTMENTS = [
  { name: 'Computer Engineering', code: 'CE' },
  { name: 'Information Technology', code: 'IT' },
  { name: 'Electronics & Telecom', code: 'EXTC' },
  { name: 'Electronics Engineering', code: 'ETRX' },
  { name: 'Mechanical Engineering', code: 'MECH' },
]
const [CE, IT, EXTC, ETRX, MECH] = [0, 1, 2, 3, 4]

const FIRST_NAMES = [
  'Aditya', 'Ananya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Manav', 'Nisha', 'Pranav', 'Riya', 'Sahil', 'Tanvi',
  'Varun', 'Zoya', 'Harsh', 'Isha', 'Kunal', 'Mitali', 'Omkar', 'Pooja', 'Rahul', 'Sneha', 'Tushar', 'Vedant',
  'Yash', 'Aisha', 'Bhavesh', 'Chaitanya', 'Devika', 'Esha', 'Gaurav', 'Hriday', 'Jhanvi', 'Kabir', 'Lakshmi',
  'Mihir', 'Nikhil', 'Pallavi', 'Rutuja', 'Siddharth', 'Trisha', 'Uday', 'Vaishnavi', 'Aryan', 'Bhakti', 'Chirag',
  'Dhruv', 'Farhan', 'Gargi', 'Ishita',
]
const LAST_NAMES = [
  'Sharma', 'Kulkarni', 'Deshmukh', 'Iyer', 'Nair', 'Gupta', 'Patil', 'Kapoor', 'Reddy', 'Menon', 'Naik', 'Pawar',
  'Bhatt', 'Chopra', 'Rane', 'Shetty', 'Khan', 'Singh', 'Desai', 'Jain', 'Verma', 'Pillai', 'Banerjee', 'Das',
  'Gokhale', 'Sawant', 'Thakur', 'Agarwal',
]

const COMPANIES = [
  'TechNova Solutions', 'CloudWave Systems', 'Finserve Analytics', 'NimbusSoft', 'Orbit Labs', 'Zenith Retail Tech',
]

type Kind = 'pass' | 'cgpa' | 'active' | 'dead' | 'tenth' | 'twelfth' | 'pending'

interface StudentSpec {
  name: string
  dept: number
  year: number
  cgpa: number
  active: number
  dead: number
  tenth: number
  twelfth: number
  placed: boolean
  verified: boolean
  createdDaysAgo: number
  verifiedAt: string | null
}

export function seedDatabase(db: DB) {
  resetSchema(db)
  const rng = mulberry32(20261014)
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo)
  const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
  const round1 = (n: number) => Math.round(n * 10) / 10
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
  const shuffle = <T>(arr: T[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10)

  db.transaction(() => {
    // ---------- departments, users ----------
    const deptIds = DEPARTMENTS.map(
      (d) => Number(db.prepare('INSERT INTO departments (name) VALUES (?)').run(d.name).lastInsertRowid),
    )

    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    const addUser = (name: string, email: string, role: string, createdAt: string, active = 1) =>
      Number(insertUser.run(name, email, passwordHash, role, active, createdAt).lastInsertRowid)

    const tpoId = addUser('Dr. Anil Kulkarni', 'tpo@spit.edu', 'tpo', ago(300))
    const facultyId = addUser('Prof. Sunita Rao', 'sunita.rao@spit.edu', 'faculty', ago(300))

    // ---------- companies and recruiters ----------
    const companyIds: Record<string, number> = {}
    for (const name of COMPANIES) {
      companyIds[name] = Number(
        db.prepare("INSERT INTO companies (name, approval_status) VALUES (?, 'APPROVED')").run(name).lastInsertRowid,
      )
    }
    const insertRecruiter = db.prepare(
      'INSERT INTO recruiters (user_id, company_id, designation, is_primary_contact) VALUES (?, ?, ?, ?)',
    )
    const recruiter = (name: string, email: string, company: string, designation: string, primary = 1, active = 1) => {
      const id = addUser(name, email, 'recruiter', ago(intBetween(90, 200)), active)
      insertRecruiter.run(id, companyIds[company], designation, primary)
      return id
    }
    const priyaId = recruiter('Priya Mehta', 'priya.mehta@technova.com', 'TechNova Solutions', 'HR Manager')
    const rahulId = recruiter('Rahul Verma', 'rahul.verma@cloudwave.io', 'CloudWave Systems', 'Talent Acquisition Lead')
    const meeraId = recruiter('Meera Iyer', 'meera.iyer@finserve.in', 'Finserve Analytics', 'HR Business Partner')
    const karanId = recruiter('Karan Malhotra', 'karan.malhotra@nimbussoft.com', 'NimbusSoft', 'Campus Hiring Manager')
    const ishitaId = recruiter('Ishita Banerjee', 'ishita.banerjee@orbitlabs.io', 'Orbit Labs', 'Recruitment Lead')
    const vikramId = recruiter('Vikram Desai', 'vikram.desai@zenithretail.com', 'Zenith Retail Tech', 'HR Manager')
    // A former recruiter whose account was switched off (demonstrates the blocked login).
    recruiter('Deepak Nair', 'deepak.nair@nimbussoft.com', 'NimbusSoft', 'Former Campus Recruiter', 0, 0)

    // ---------- students ----------
    const reserved = new Set(['Aarav', 'Neha', 'Rohan', 'Priya', 'Sunita', 'Anil'])
    const combos = shuffle(
      FIRST_NAMES.filter((f) => !reserved.has(f)).flatMap((f) => LAST_NAMES.map((l) => `${f} ${l}`)),
    )
    let nameCursor = 0
    const nextName = () => combos[nameCursor++]

    const specs: StudentSpec[] = []
    const verifiedOn = (daysAgo: number) => ago(daysAgo, 2)

    // The three named 2027-batch students used throughout the demo.
    specs.push({
      name: 'Aarav Patel', dept: CE, year: 2027, cgpa: 8.2, active: 0, dead: 1, tenth: 91, twelfth: 88,
      placed: false, verified: true, createdDaysAgo: 40, verifiedAt: '2026-10-02T11:30:00+05:30',
    })
    specs.push({
      name: 'Neha Joshi', dept: IT, year: 2027, cgpa: 7.1, active: 0, dead: 0, tenth: 84, twelfth: 80,
      placed: false, verified: true, createdDaysAgo: 45, verifiedAt: '2026-10-02T11:45:00+05:30',
    })
    specs.push({
      name: 'Rohan Shah', dept: EXTC, year: 2027, cgpa: 7.8, active: 1, dead: 0, tenth: 79, twelfth: 81,
      placed: false, verified: true, createdDaysAgo: 38, verifiedAt: '2026-10-02T12:00:00+05:30',
    })

    // 27 more students in the 2027 batch: 15 meet the default criteria, 9 each miss exactly one rule, 3 are unverified.
    const kinds: Kind[] = shuffle([
      ...Array<Kind>(15).fill('pass'),
      ...(['cgpa', 'active', 'dead', 'tenth', 'twelfth', 'cgpa', 'active', 'dead', 'twelfth'] as Kind[]),
      'pending', 'pending', 'pending',
    ])
    const slots2027 = shuffle([
      ...Array(8).fill(CE), ...Array(6).fill(IT), ...Array(4).fill(EXTC), ...Array(4).fill(ETRX), ...Array(5).fill(MECH),
    ]) as number[]
    let verifiedSoFar = 0
    kinds.forEach((kind, i) => {
      const s: StudentSpec = {
        name: nextName(), dept: slots2027[i], year: 2027,
        cgpa: round1(between(7.6, 9.4)), active: 0, dead: intBetween(0, 1),
        tenth: intBetween(76, 96), twelfth: intBetween(76, 95),
        placed: false, verified: kind !== 'pending', createdDaysAgo: intBetween(60, 200), verifiedAt: null,
      }
      if (kind === 'cgpa') s.cgpa = round1(between(6.2, 7.4))
      if (kind === 'active') s.active = intBetween(1, 2)
      if (kind === 'dead') s.dead = intBetween(2, 3)
      if (kind === 'tenth') s.tenth = intBetween(62, 74)
      if (kind === 'twelfth') s.twelfth = intBetween(60, 74)
      if (kind === 'pending') {
        s.cgpa = round1(between(7.0, 9.0))
        s.createdDaysAgo = intBetween(3, 12)
      }
      if (s.verified) {
        verifiedSoFar++
        // Prof. Sunita Rao verified 14 profiles on 12 Oct; the rest earlier in the month.
        s.verifiedAt = verifiedSoFar <= 14 ? verifiedOn(2) : verifiedOn(intBetween(6, 12))
        if (verifiedSoFar % 5 === 0) s.createdDaysAgo = intBetween(13, 20)
      }
      specs.push(s)
    })

    // 20 students in the 2026 batch, 12 of them placed.
    const batch2026: { dept: number; total: number; placed: number }[] = [
      { dept: CE, total: 6, placed: 4 }, { dept: IT, total: 5, placed: 3 }, { dept: EXTC, total: 3, placed: 2 },
      { dept: ETRX, total: 3, placed: 1 }, { dept: MECH, total: 3, placed: 2 },
    ]
    for (const b of batch2026) {
      for (let i = 0; i < b.total; i++) {
        specs.push({
          name: nextName(), dept: b.dept, year: 2026,
          cgpa: round1(between(6.9, 9.2)), active: 0, dead: intBetween(0, 1),
          tenth: intBetween(65, 95), twelfth: intBetween(65, 95),
          placed: i < b.placed, verified: true, createdDaysAgo: intBetween(120, 300),
          verifiedAt: ago(intBetween(30, 100)),
        })
      }
    }

    const insertStudent = db.prepare(
      `INSERT INTO students (user_id, roll_no, department_id, graduation_year, cgpa, active_backlogs, dead_backlogs,
         tenth_pct, twelfth_pct, resume_url, placement_status, verification_status, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const rollCounters: Record<string, number> = {}
    const studentIds: { id: number; spec: StudentSpec }[] = []
    for (const s of specs) {
      const slug = s.name.toLowerCase().replaceAll(' ', '.')
      const id = addUser(s.name, `${slug}@spit.edu`, 'student', ago(s.createdDaysAgo))
      const code = DEPARTMENTS[s.dept].code
      const yy = s.year === 2027 ? '23' : '22'
      const key = `${code}${yy}`
      rollCounters[key] = (rollCounters[key] ?? 0) + 1
      insertStudent.run(
        id, `${key}${String(rollCounters[key]).padStart(3, '0')}`, deptIds[s.dept], s.year, s.cgpa, s.active, s.dead,
        s.tenth, s.twelfth, `/resumes/${slug.replaceAll('.', '-')}.pdf`,
        s.placed ? 'PLACED' : 'UNPLACED', s.verified ? 'VERIFIED' : 'PENDING',
        s.verified ? facultyId : null, s.verifiedAt ? new Date(s.verifiedAt).toISOString() : null,
      )
      studentIds.push({ id, spec: s })
    }
    const aaravId = studentIds[0].id

    // ---------- drives ----------
    const insertDrive = db.prepare(
      `INSERT INTO drives (company_id, created_by, title, description, job_type, ctc_text, ctc_value, location, work_mode,
         openings, deadline, status, rejection_reason, reference_id, created_at, updated_at, submitted_at, approved_by, approved_at)
       VALUES (@company_id, @created_by, @title, @description, @job_type, @ctc_text, @ctc_value, @location, @work_mode,
         @openings, @deadline, @status, @rejection_reason, @reference_id, @created_at, @updated_at, @submitted_at, @approved_by, @approved_at)`,
    )
    const insertCriteria = db.prepare(
      `INSERT INTO eligibility_criteria (drive_id, min_cgpa, max_active_backlogs, max_dead_backlogs, min_tenth_pct,
         min_twelfth_pct, allowed_graduation_year, allow_already_placed)
       VALUES (@drive_id, @min_cgpa, @max_active_backlogs, @max_dead_backlogs, @min_tenth_pct, @min_twelfth_pct,
         @allowed_graduation_year, 0)`,
    )
    const insertDriveDept = db.prepare('INSERT INTO drive_departments (drive_id, department_id) VALUES (?, ?)')

    interface DriveSpec {
      company: string
      by: number
      title: string
      description: string
      type: 'FTE' | 'INTERNSHIP' | 'INTERN_FTE'
      ctcText: string
      ctc: number
      location: string
      mode: 'Remote' | 'Hybrid' | 'On-site'
      openings: number
      deadline: string
      status: 'DRAFT' | 'PENDING_APPROVAL' | 'OPEN' | 'CLOSED' | 'COMPLETED'
      ref: string
      createdAt: string
      updatedAt?: string
      submittedAt?: string | null
      approvedAt?: string | null
      rejection?: string | null
      criteria: {
        cgpa?: number | null; active?: number | null; dead?: number | null; tenth?: number | null
        twelfth?: number | null; year?: number | null
      }
      depts?: number[]
    }

    const addDrive = (d: DriveSpec) => {
      const id = Number(
        insertDrive.run({
          company_id: companyIds[d.company], created_by: d.by, title: d.title, description: d.description,
          job_type: d.type, ctc_text: d.ctcText, ctc_value: d.ctc, location: d.location, work_mode: d.mode,
          openings: d.openings, deadline: d.deadline, status: d.status, rejection_reason: d.rejection ?? null,
          reference_id: d.ref, created_at: utc(d.createdAt), updated_at: utc(d.updatedAt ?? d.submittedAt ?? d.createdAt),
          submitted_at: d.submittedAt ? utc(d.submittedAt) : null, approved_by: d.approvedAt ? tpoId : null,
          approved_at: d.approvedAt ? utc(d.approvedAt) : null,
        }).lastInsertRowid,
      )
      insertCriteria.run({
        drive_id: id, min_cgpa: d.criteria.cgpa ?? null, max_active_backlogs: d.criteria.active ?? null,
        max_dead_backlogs: d.criteria.dead ?? null, min_tenth_pct: d.criteria.tenth ?? null,
        min_twelfth_pct: d.criteria.twelfth ?? null, allowed_graduation_year: d.criteria.year ?? null,
      })
      for (const dept of d.depts ?? []) insertDriveDept.run(id, deptIds[dept])
      return id
    }

    // The six OPEN drives the student page lists.
    const backendId = addDrive({
      company: 'TechNova Solutions', by: priyaId, title: 'Backend Software Engineer',
      description: 'Build and scale payment and order-processing services in Java and Go. You will own services end to end, from design review to on-call.',
      type: 'FTE', ctcText: 'Rs 12-14 LPA', ctc: 13, location: 'Pune', mode: 'Hybrid', openings: 8,
      deadline: '2026-10-28', status: 'OPEN', ref: 'DRV-2026-0031', createdAt: ago(9), submittedAt: ago(2, 5),
      approvedAt: ago(0, 2),
      criteria: { cgpa: 7.5, active: 0, dead: 1, tenth: 75, twelfth: 75, year: 2027 }, depts: [CE, IT],
    })
    const cloudId = addDrive({
      company: 'CloudWave Systems', by: rahulId, title: 'Cloud Engineer Trainee',
      description: 'Six-month trainee programme on infrastructure automation, Kubernetes and observability, converting to a full-time role.',
      type: 'INTERN_FTE', ctcText: 'Rs 8-10 LPA', ctc: 9, location: 'Remote', mode: 'Remote', openings: 5,
      deadline: '2026-10-30', status: 'OPEN', ref: 'DRV-2026-0032', createdAt: ago(14), submittedAt: ago(9),
      approvedAt: ago(8), criteria: { cgpa: 7.0, year: 2027 },
    })
    const frontendId = addDrive({
      company: 'TechNova Solutions', by: priyaId, title: 'Frontend Developer Intern',
      description: 'Ship customer-facing features in React and TypeScript alongside the web platform team during a three-month internship.',
      type: 'INTERNSHIP', ctcText: 'Rs 35,000/month', ctc: 4.2, location: 'Mumbai', mode: 'On-site', openings: 4,
      deadline: '2026-10-16', status: 'OPEN', ref: 'DRV-2026-0033', createdAt: ago(11), submittedAt: ago(6),
      approvedAt: ago(5), criteria: { cgpa: 7.0, year: 2027 }, depts: [CE, IT],
    })
    const analystId = addDrive({
      company: 'Finserve Analytics', by: meeraId, title: 'Product Analyst',
      description: 'Work with product managers to define metrics, run experiments and turn lending data into decisions.',
      type: 'FTE', ctcText: 'Rs 9-11 LPA', ctc: 10, location: 'Mumbai', mode: 'Hybrid', openings: 3,
      deadline: '2026-11-01', status: 'OPEN', ref: 'DRV-2026-0034', createdAt: ago(8), submittedAt: ago(5),
      approvedAt: ago(4), criteria: { cgpa: 7.0, dead: 1, year: 2027 },
    })
    const quantId = addDrive({
      company: 'CloudWave Systems', by: rahulId, title: 'Quant Developer',
      description: 'Implement low-latency pricing and risk libraries in C++ and Python for the trading platform team.',
      type: 'FTE', ctcText: 'Rs 18-22 LPA', ctc: 20, location: 'Mumbai', mode: 'On-site', openings: 2,
      deadline: '2026-11-02', status: 'OPEN', ref: 'DRV-2026-0035', createdAt: ago(7), submittedAt: ago(4),
      approvedAt: ago(3), criteria: { cgpa: 8.5, year: 2027 },
    })
    const embeddedId = addDrive({
      company: 'CloudWave Systems', by: rahulId, title: 'Embedded Systems Engineer',
      description: 'Firmware and driver development for IoT gateways: RTOS, C, and board bring-up.',
      type: 'FTE', ctcText: 'Rs 7-9 LPA', ctc: 8, location: 'Pune', mode: 'On-site', openings: 4,
      deadline: '2026-11-05', status: 'OPEN', ref: 'DRV-2026-0036', createdAt: ago(10), submittedAt: ago(7),
      approvedAt: ago(6), criteria: { dead: 0, year: 2026 }, depts: [EXTC, ETRX],
    })

    // Awaiting TPO approval.
    addDrive({
      company: 'TechNova Solutions', by: priyaId, title: 'Data Analyst Intern',
      description: 'Support the growth analytics team with SQL, dashboards and weekly experiment reports.',
      type: 'INTERNSHIP', ctcText: 'Rs 30,000/month', ctc: 3.6, location: 'Mumbai', mode: 'On-site', openings: 6,
      deadline: '2026-11-08', status: 'PENDING_APPROVAL', ref: 'DRV-2026-0038', createdAt: ago(4),
      submittedAt: '2026-10-12T11:00:00+05:30',
      criteria: { cgpa: 7.0, active: 0, dead: 2, tenth: 70, twelfth: 70, year: 2027 }, depts: [CE, IT, EXTC],
    })
    addDrive({
      company: 'NimbusSoft', by: karanId, title: 'DevOps Engineer',
      description: 'Own CI/CD, infrastructure as code and reliability for a multi-tenant SaaS platform.',
      type: 'FTE', ctcText: 'Rs 10-12 LPA', ctc: 11, location: 'Pune', mode: 'Hybrid', openings: 4,
      deadline: '2026-11-10', status: 'PENDING_APPROVAL', ref: 'DRV-2026-0039', createdAt: ago(3),
      submittedAt: '2026-10-13T15:30:00+05:30',
      criteria: { cgpa: 7.5, active: 0, dead: 1, tenth: 75, twelfth: 75, year: 2027 }, depts: [CE, IT],
    })
    addDrive({
      company: 'Orbit Labs', by: ishitaId, title: 'QA Automation Intern',
      description: 'Write and maintain end-to-end test suites for the mobile and web products.',
      type: 'INTERNSHIP', ctcText: 'Rs 25,000/month', ctc: 3, location: 'Mumbai', mode: 'Hybrid', openings: 3,
      deadline: '2026-11-12', status: 'PENDING_APPROVAL', ref: 'DRV-2026-0040', createdAt: ago(2),
      submittedAt: '2026-10-14T09:15:00+05:30',
      criteria: { cgpa: 6.5, active: 1, dead: 2, tenth: 65, twelfth: 65, year: 2027 },
    })

    // The recruiter's draft, returned by the TPO yesterday: 12th percentage is empty.
    const draftId = addDrive({
      company: 'TechNova Solutions', by: priyaId, title: 'Product Engineer',
      description: 'Full-stack product engineering across TypeScript services and a React front end, with strong ownership of features.',
      type: 'FTE', ctcText: 'Rs 14-16 LPA', ctc: 15, location: 'Pune', mode: 'Hybrid', openings: 5,
      deadline: '2026-11-15', status: 'DRAFT', ref: 'DRV-2026-0037', createdAt: ago(6),
      submittedAt: ago(3), updatedAt: ago(1),
      rejection: 'Minimum 12th percentage is missing from the eligibility criteria. Please add it and resubmit.',
      criteria: { cgpa: 7.5, active: 0, dead: 1, tenth: 75, twelfth: null, year: 2027 },
    })

    // Past drives (2026 batch) that produced the offers.
    const pastDefaults = { cgpa: 6.5, active: 0, dead: 2, year: 2026 }
    const pastDrive = (company: string, by: number, title: string, ctcText: string, ctc: number, status: 'COMPLETED' | 'CLOSED', deadlineDaysAgo: number, ref: string) =>
      addDrive({
        company, by, title, description: `Campus hiring for the 2026 batch: ${title}.`, type: 'FTE', ctcText, ctc,
        location: 'Mumbai', mode: 'Hybrid', openings: 6, deadline: dateFromDemoToday(-deadlineDaysAgo), status, ref,
        createdAt: ago(deadlineDaysAgo + 15), submittedAt: ago(deadlineDaysAgo + 12), approvedAt: ago(deadlineDaysAgo + 10),
        criteria: pastDefaults,
      })
    const p1 = pastDrive('TechNova Solutions', priyaId, 'Software Development Engineer', 'Rs 10-13 LPA', 11.5, 'COMPLETED', 95, 'DRV-2026-0025')
    const p2 = pastDrive('CloudWave Systems', rahulId, 'Associate Cloud Engineer', 'Rs 9-11 LPA', 10, 'COMPLETED', 92, 'DRV-2026-0026')
    const p3 = pastDrive('Finserve Analytics', meeraId, 'Data Engineer', 'Rs 10-13 LPA', 11.5, 'COMPLETED', 80, 'DRV-2026-0027')
    const p4 = pastDrive('NimbusSoft', karanId, 'Platform Engineer', 'Rs 8-10 LPA', 9, 'COMPLETED', 70, 'DRV-2026-0028')
    const p5 = pastDrive('Orbit Labs', ishitaId, 'Firmware Engineer', 'Rs 8-10 LPA', 9, 'CLOSED', 60, 'DRV-2026-0029')
    const p6 = pastDrive('Zenith Retail Tech', vikramId, 'Retail Analytics Associate', 'Rs 6-8 LPA', 7, 'CLOSED', 40, 'DRV-2026-0030')

    // ---------- applications and offers ----------
    const insertApp = db.prepare(
      'INSERT INTO applications (drive_id, student_id, status, applied_at, resume_snapshot_url) VALUES (?, ?, ?, ?, ?)',
    )
    const insertOffer = db.prepare(
      'INSERT INTO offers (application_id, ctc, status, issued_at, responded_at) VALUES (?, ?, ?, ?, ?)',
    )
    const resumeOf = (id: number) =>
      (db.prepare('SELECT resume_url FROM students WHERE user_id = ?').get(id) as { resume_url: string }).resume_url
    const addApp = (driveId: number, studentId: number, status: string, appliedAt: string) =>
      Number(insertApp.run(driveId, studentId, status, appliedAt, resumeOf(studentId)).lastInsertRowid)

    const pastDriveDeadlineDaysAgo: Record<number, number> = { [p1]: 95, [p2]: 92, [p3]: 80, [p4]: 70, [p5]: 60, [p6]: 40 }
    const placed2026 = studentIds.filter((s) => s.spec.year === 2026 && s.spec.placed)
    const unplaced2026 = studentIds.filter((s) => s.spec.year === 2026 && !s.spec.placed)

    // 12 accepted offers, spread over the last 12 weeks.
    const acceptedOffers: { drive: number; ctc: number; daysAgo: number }[] = [
      { drive: p1, ctc: 11, daysAgo: 82 }, { drive: p2, ctc: 9.5, daysAgo: 79 }, { drive: p1, ctc: 12, daysAgo: 71 },
      { drive: p3, ctc: 10.5, daysAgo: 63 }, { drive: p2, ctc: 10, daysAgo: 62 }, { drive: p1, ctc: 10, daysAgo: 50 },
      { drive: p4, ctc: 8.5, daysAgo: 45 }, { drive: p3, ctc: 11, daysAgo: 44 }, { drive: p2, ctc: 11, daysAgo: 27 },
      { drive: p5, ctc: 9.5, daysAgo: 26 }, { drive: p1, ctc: 13, daysAgo: 12 }, { drive: p6, ctc: 7.5, daysAgo: 5 },
    ]
    const pastDrives = [p1, p2, p3, p4, p5, p6]
    const appliedPast = new Map<number, Set<number>>()

    placed2026.forEach((student, i) => {
      const offer = acceptedOffers[i]
      const appliedDays = pastDriveDeadlineDaysAgo[offer.drive] + intBetween(3, 14)
      const appId = addApp(offer.drive, student.id, 'SELECTED', ago(appliedDays))
      insertOffer.run(appId, offer.ctc, 'ACCEPTED', ago(offer.daysAgo + 2), ago(offer.daysAgo))
      appliedPast.set(student.id, new Set([offer.drive]))
    })
    // Three more selected students who have not (yet) accepted: two offers issued, one declined.
    const pending = [
      { s: unplaced2026[0], drive: p3, status: 'ISSUED', issued: 6, ctc: 11 },
      { s: unplaced2026[1], drive: p4, status: 'ISSUED', issued: 3, ctc: 9 },
      { s: unplaced2026[2], drive: p5, status: 'DECLINED', issued: 20, ctc: 8.5 },
    ]
    for (const p of pending) {
      const appId = addApp(p.drive, p.s.id, 'SELECTED', ago(pastDriveDeadlineDaysAgo[p.drive] + 6))
      insertOffer.run(appId, p.ctc, p.status, ago(p.issued), p.status === 'DECLINED' ? ago(p.issued - 2) : null)
      appliedPast.set(p.s.id, new Set([p.drive]))
    }
    // Everyone in the 2026 batch applied to three past drives in total; the rest ended in other outcomes.
    for (const student of [...placed2026, ...unplaced2026]) {
      const have = appliedPast.get(student.id) ?? new Set<number>()
      for (const drive of shuffle(pastDrives)) {
        if (have.size >= 3) break
        if (have.has(drive)) continue
        have.add(drive)
        const roll = rng()
        const status = student.spec.placed
          ? roll < 0.7 ? 'REJECTED' : 'WITHDRAWN'
          : roll < 0.45 ? 'REJECTED' : roll < 0.7 ? 'SHORTLISTED' : roll < 0.85 ? 'APPLIED' : 'WITHDRAWN'
        addApp(drive, student.id, status, ago(pastDriveDeadlineDaysAgo[drive] + intBetween(3, 14)))
      }
    }

    // Open-drive applications use the real eligibility function, so only eligible students applied.
    const named = new Set(studentIds.slice(0, 3).map((s) => s.id))
    const applyOpen = (driveId: number, pool: typeof studentIds, probability: number, window: [number, number], shortlistChance: number) => {
      const criteria = loadCriteria(db, driveId)
      for (const s of pool) {
        if (named.has(s.id) || !s.spec.verified) continue
        const facts = loadStudentFacts(db, s.id)
        if (!facts || !evaluateEligibility(facts, criteria).eligible || rng() > probability) continue
        const status = rng() < shortlistChance ? 'SHORTLISTED' : 'APPLIED'
        addApp(driveId, s.id, status, ago(between(window[0], window[1])))
      }
    }
    const batch2027 = studentIds.filter((s) => s.spec.year === 2027)
    applyOpen(backendId, batch2027, 0.2, [0.01, 0.07], 0)
    applyOpen(frontendId, batch2027, 0.55, [2.2, 4], 0.15)
    applyOpen(analystId, batch2027, 0.5, [0.6, 3], 0.1)
    applyOpen(quantId, batch2027, 0.7, [0.6, 2], 0)
    applyOpen(embeddedId, studentIds.filter((s) => s.spec.year === 2026), 0.8, [1, 5], 0.2)
    // Cloud Engineer Trainee already had its Round 1 results published: shortlisted or rejected.
    {
      const criteria = loadCriteria(db, cloudId)
      for (const s of batch2027) {
        if (named.has(s.id) || !s.spec.verified) continue
        const facts = loadStudentFacts(db, s.id)
        if (!facts || !evaluateEligibility(facts, criteria).eligible || rng() > 0.6) continue
        const roll = rng()
        addApp(cloudId, s.id, roll < 0.5 ? 'SHORTLISTED' : roll < 0.8 ? 'REJECTED' : 'APPLIED', ago(between(2, 7)))
      }
    }
    // Aarav's one application: Frontend Developer Intern, 12 Oct 2026.
    addApp(frontendId, aaravId, 'APPLIED', ago(2))

    // ---------- audit log ----------
    const insertAudit = db.prepare(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const audit = (actor: number, action: string, type: string, entityId: number | null, value: unknown, at: string) =>
      insertAudit.run(actor, action, type, entityId, null, JSON.stringify(value), at)
    audit(tpoId, 'DRIVE_APPROVED', 'drive', cloudId, { status: 'OPEN' }, ago(8))
    audit(facultyId, 'PROFILES_VERIFIED', 'student', null, { count: 14 }, ago(2, 1))
    audit(tpoId, 'COMPANY_REGISTERED', 'company', companyIds['Finserve Analytics'], { approval_status: 'APPROVED' }, ago(2))
    audit(tpoId, 'ROUND_RESULTS_PUBLISHED', 'drive', cloudId, { round: 1 }, ago(1, 3))
    audit(
      tpoId, 'DRIVE_REJECTED', 'drive', draftId,
      { reason: 'Minimum 12th percentage is missing from the eligibility criteria. Please add it and resubmit.', summary: '12th percentage missing' },
      ago(1, 2),
    )
    audit(tpoId, 'DRIVE_APPROVED', 'drive', backendId, { status: 'OPEN' }, ago(0, 2))

    // ---------- notifications ----------
    const insertNote = db.prepare(
      'INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    const note = (user: number, title: string, message: string, read: boolean, at: string) =>
      insertNote.run(user, title, message, read ? 1 : 0, at)
    note(aaravId, 'Profile verified', 'Prof. Sunita Rao verified your profile. You can now apply to drives.', true, '2026-10-02T06:30:00.000Z')
    note(aaravId, 'Application submitted', 'Your application for Frontend Developer Intern (TechNova Solutions) was received.', true, ago(2))
    note(aaravId, 'New drive open', 'Backend Software Engineer (TechNova Solutions) is now open. You meet the eligibility criteria.', false, ago(0, 2))
    note(priyaId, 'Product Engineer returned', 'The TPO returned Product Engineer: Minimum 12th percentage is missing from the eligibility criteria. Please add it and resubmit.', false, ago(1, 2))
    note(priyaId, 'Drive approved', 'Backend Software Engineer was approved and is now open to students.', false, ago(0, 2))
    note(priyaId, 'New applications', 'Frontend Developer Intern has new applications from eligible students.', true, ago(2))
    note(tpoId, 'Drive awaiting approval', 'Data Analyst Intern (TechNova Solutions) was submitted for approval.', false, '2026-10-12T05:30:00.000Z')
    note(tpoId, 'Drive awaiting approval', 'DevOps Engineer (NimbusSoft) was submitted for approval.', false, '2026-10-13T10:00:00.000Z')
    note(tpoId, 'Drive awaiting approval', 'QA Automation Intern (Orbit Labs) was submitted for approval.', false, '2026-10-14T03:45:00.000Z')
  })()
}
