import type { DB } from '../db/client'
import { nowIso, relativeTime } from '../lib/clock'

export function notify(db: DB, userId: number, title: string, message: string, at?: string) {
  db.prepare('INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (?, ?, ?, 0, ?)').run(
    userId, title, message, at ?? nowIso(),
  )
}

/** Notify every active user with a role (e.g. all TPOs). */
export function notifyRole(db: DB, role: string, title: string, message: string) {
  const users = db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1').all(role) as { id: number }[]
  for (const u of users) notify(db, u.id, title, message)
}

export interface NotificationItem {
  id: number
  title: string
  message: string
  is_read: boolean
  time: string
}

export function listNotifications(db: DB, userId: number, limit = 30) {
  const rows = db
    .prepare('SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(userId, limit) as { id: number; title: string; message: string; is_read: number; created_at: string }[]
  const unread = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(userId) as { n: number }).n
  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id, title: r.title, message: r.message, is_read: r.is_read === 1, time: relativeTime(r.created_at),
  }))
  return { unread, items }
}

/** Marks the user's own notifications as read. `ids` omitted means all. Other users' rows are never touched. */
export function markRead(db: DB, userId: number, ids?: number[]) {
  if (!ids) {
    return db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId).changes
  }
  const stmt = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?')
  let changed = 0
  for (const id of ids) changed += stmt.run(userId, id).changes
  return changed
}
