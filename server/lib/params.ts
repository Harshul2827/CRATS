import { notFound } from './http'

/** Route params arrive as strings (and as a Promise in Next 16). Anything that is not a whole id is a 404. */
export async function idParam(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw notFound()
  return n
}

export type IdContext = { params: Promise<{ id: string }> }
