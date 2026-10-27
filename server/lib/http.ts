import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'

export interface ErrorExtras {
  fields?: Record<string, string>
  reasons?: string[]
}

/** An expected failure with an HTTP status. Rendered as {error:{code,message,fields?}}. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extras: ErrorExtras = {},
  ) {
    super(message)
  }
}

export const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue')
export const forbidden = (message = 'You do not have permission to do this') => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message)

const NO_STORE = { 'Cache-Control': 'no-store' }

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE })
}

/** First message per field, keyed by the top-level field name. */
export function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    const error = {
      code: e.code,
      message: e.message,
      ...(e.extras.fields && { fields: e.extras.fields }),
      ...(e.extras.reasons && { reasons: e.extras.reasons }),
    }
    return NextResponse.json({ error }, { status: e.status, headers: NO_STORE })
  }
  if (e instanceof ZodError) {
    const error = { code: 'VALIDATION_ERROR', message: 'Some fields need attention', fields: zodFields(e) }
    return NextResponse.json({ error }, { status: 422, headers: NO_STORE })
  }
  console.error(e)
  const error = { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' }
  return NextResponse.json({ error }, { status: 500, headers: NO_STORE })
}

/** Wraps a route handler so thrown ApiErrors and ZodErrors become consistent JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args)
    } catch (e) {
      return errorResponse(e)
    }
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError(400, 'BAD_JSON', 'Request body must be valid JSON')
  }
  return schema.parse(raw)
}
