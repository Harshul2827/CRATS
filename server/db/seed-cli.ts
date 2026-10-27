// `pnpm db:seed`: drops and recreates every table, then loads the deterministic demo data.
import { openDb } from './client'
import { seedDatabase } from './seed'

const db = openDb()
const started = Date.now()
seedDatabase(db)
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
console.log(
  `Seeded in ${Date.now() - started} ms: ${count('SELECT COUNT(*) n FROM users')} users, ` +
    `${count('SELECT COUNT(*) n FROM students')} students, ${count('SELECT COUNT(*) n FROM drives')} drives, ` +
    `${count('SELECT COUNT(*) n FROM applications')} applications, ${count('SELECT COUNT(*) n FROM offers')} offers.`,
)
db.close()
