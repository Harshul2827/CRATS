/** Demo helpers are on unless DEMO_MODE=false; in production they stay off unless DEMO_MODE=true. */
export function isDemoMode() {
  const flag = process.env.DEMO_MODE
  if (flag !== undefined && flag !== '') return flag === 'true'
  return process.env.NODE_ENV !== 'production'
}
