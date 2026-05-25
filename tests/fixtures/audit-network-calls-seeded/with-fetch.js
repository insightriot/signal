// Seeded fixture for tests/audit-network-calls.test.js.
// Contains a real fetch() call so the audit script's pattern matcher
// has something to detect. Lives under tests/ so the default scan
// scope excludes it; the audit script only sees this file when
// invoked with this fixture directory as an explicit argument.

export async function fetchExample() {
  return fetch('https://example.com');
}
