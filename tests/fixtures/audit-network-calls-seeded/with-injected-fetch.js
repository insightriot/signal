// Seeded fixture (M6.E3 t1.2, B125): the injected-fetch idiom Signal's own
// code uses. `fetchFn(url)` never matches /\bfetch\s*\(/, so before B125 this
// shape passed the audit unseen. It is NOT in the known-call list, so the audit
// must flag it.
export async function getThing({ fetchFn = fetch } = {}) {
  return fetchFn('https://example.invalid/thing');
}
