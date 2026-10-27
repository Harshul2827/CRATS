// Small typed fetch helper. Every API failure becomes an ApiError with the server's code, message and field errors.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public reasons: string[] = [],
  ) {
    super(message)
  }
}

export const UNAUTHORIZED_EVENT = 'crats:unauthorized'
export const NOTIFICATIONS_CHANGED_EVENT = 'crats:notifications-changed'

interface Options {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, { method = 'GET', body, signal }: Options = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check that it is running and try again')
  }

  if (res.ok) return (await res.json()) as T

  let payload: { error?: { code?: string; message?: string; fields?: Record<string, string>; reasons?: string[] } } = {}
  try {
    payload = await res.json()
  } catch {
    // non-JSON error body
  }
  const err = payload.error
  if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Something went wrong', err?.fields, err?.reasons)
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong')

export function notifyNotificationsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}
