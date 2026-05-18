// Per-call timeout — any single slow API doesn't block everything else.
// Cancels the timer when the real promise resolves first so we don't get
// misleading "timed out" logs after the function already returned.
//
// Shared by all modules that fan out parallel Reddit/Redis API calls
// (copilot, dossier, etc.). The `prefix` argument lets each caller namespace
// its log lines so playtest logs are easy to filter.
//
// Defensive against Devvit's worker runtime: in some deferred contexts the
// global `setTimeout` is undefined and calling it throws. When that happens
// we skip the deadline and just await the wrapped promise unbounded — the
// wrapped promise's own try/catch + Devvit's Reddit/Redis call defaults still
// apply, so worst case we wait a bit longer.
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
  label: string,
  prefix = 'Module'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutP = new Promise<T>((resolve) => {
    try {
      timer = setTimeout(() => {
        console.warn(`[${prefix}] ${label} timed out at ${ms}ms`)
        resolve(fallback)
      }, ms)
    } catch {
      // setTimeout unavailable in this runtime context — never resolve so the
      // real promise wins the race. We don't pollute logs every call here;
      // the symptom shows up as longer-than-usual response times if at all.
    }
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
