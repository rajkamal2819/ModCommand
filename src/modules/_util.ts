// Per-call timeout — any single slow API doesn't block everything else.
// Cancels the timer when the real promise resolves first so we don't get
// misleading "timed out" logs after the function already returned.
//
// Shared by all modules that fan out parallel Reddit/Redis API calls
// (copilot, dossier, etc.). The `prefix` argument lets each caller namespace
// its log lines so playtest logs are easy to filter.
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
  label: string,
  prefix = 'Module'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutP = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[${prefix}] ${label} timed out at ${ms}ms`)
      resolve(fallback)
    }, ms)
  })
  return Promise.race([
    p.then(
      (v) => { if (timer) clearTimeout(timer); return v },
      (err) => {
        if (timer) clearTimeout(timer)
        console.error(`[${prefix}] ${label} rejected:`, err instanceof Error ? err.message : err)
        return fallback
      }
    ),
    timeoutP,
  ])
}
