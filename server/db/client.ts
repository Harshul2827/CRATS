import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export type DB = Database.Database

const DEFAULT_DB_FILE = path.join(process.cwd(), 'data', 'crats.db')
const SCHEMA_FILE = path.join(process.cwd(), 'server', 'db', 'schema.sql')

type Holder = typeof globalThis & { __cratsDb?: DB }
const holder = globalThis as Holder

export function openDb(file: string = process.env.DATABASE_PATH || DEFAULT_DB_FILE): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  if (file !== ':memory:') db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

/** Shared connection (cached on globalThis so every route bundle and hot reload reuses it). */
export function getDb(): DB {
  if (!holder.__cratsDb) {
    const db = openDb()
    const ready = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()
    if (!ready) {
      db.close()
      throw new Error('Database is empty. Run `pnpm db:seed` first.')
    }
    holder.__cratsDb = db
  }
  return holder.__cratsDb
}

/** Tests inject an in-memory database here. Pass null to clear. */
export function setDb(db: DB | null) {
  if (db) holder.__cratsDb = db
  else delete holder.__cratsDb
}

/** Drops every table/trigger/index and recreates the schema. Used by db:seed and the demo reset. */
export function resetSchema(db: DB) {
  db.pragma('foreign_keys = OFF')
  const objects = db
    .prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'index' THEN 1 ELSE 2 END")
    .all() as { type: string; name: string }[]
  for (const o of objects) db.exec(`DROP ${o.type.toUpperCase()} IF EXISTS "${o.name}"`)
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'))
  db.pragma('foreign_keys = ON')
}
