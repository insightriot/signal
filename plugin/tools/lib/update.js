// tools/lib/update.js — M5.E16 FR6: the pure half of `/sig:update`.
//
// Everything here is a pure function over text. The command file does the I/O
// (shelling out to `claude plugin …`, reading CHANGELOG.md), so the parsing and
// the rendering — the parts that can be wrong in a way nobody notices — are
// testable without a plugin install.
//
// ── Why this command exists ───────────────────────────────────────────────────
//
// `B58`: `marketplace.json` pinned a sha two releases behind its ref, so every
// install since v0.1.14 silently delivered v0.1.13. The user found it by chance
// while menu-diving, after being told "sig is already at the latest version
// (0.1.13)" — twenty minutes after v0.1.15 shipped. **The report was truthful;
// the manifest was lying to it.** Signal, whose whole premise is noticing drift,
// had nothing to say about its own.
//
// And `/plugin` reports that a NUMBER changed. It cannot say what you would be
// GETTING, so deciding whether to update means leaving the tool to read a
// changelog. That gap is the requirement.

/**
 * Stated on every successful update, never acted on.
 *
 * `B52`: a Claude Code session binds to one plugin version for its whole life.
 * The user explicitly wants the restart SURFACED so the timing is theirs to
 * choose — so this is a sentence, not a behaviour.
 *
 * This session is itself the live instance: it ran bound to v0.1.13 while the
 * repo was at v0.1.15, and the v0.1.15 payload was already sitting in the cache.
 */
export const RESTART_NOTICE =
  'Restart Claude Code to pick this up — a session binds to one plugin version ' +
  'for its whole life, so the update is inert until you do.';

/**
 * Parse `claude plugin list`.
 *
 * There is **no `--json` flag** (confirmed by running it, 2026-08-01), so this
 * parses a human format that is not a contract. When the shape changes this
 * returns nothing rather than guessing — inventing a version is how `B58` stayed
 * invisible for two releases.
 *
 * Expected shape:
 *   ❯ sig@signal
 *     Version: 0.1.13
 *     Scope: user
 *     Status: ✔ enabled
 *
 * @param {string} stdout
 * @returns {Array<{name: string, marketplace: string|null, version: string|null, scope: string|null, status: string|null}>}
 */
export function parsePluginList(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return [];

  const out = [];
  let current = null;
  for (const line of stdout.split('\n')) {
    const header = line.match(/^\s*[❯>*-]?\s*([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)\s*$/);
    if (header) {
      if (current) out.push(current);
      current = { name: header[1], marketplace: header[2], version: null, scope: null, status: null };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*(Version|Scope|Status):\s*(.+?)\s*$/);
    if (field) current[field[1].toLowerCase()] = field[2];
  }
  if (current) out.push(current);
  return out;
}

/**
 * The installed version of one plugin, or `null` if it cannot be determined.
 *
 * @param {string} stdout — `claude plugin list` output
 * @param {string} pluginName
 * @returns {string|null}
 */
export function findPluginVersion(stdout, pluginName) {
  const hit = parsePluginList(stdout).find((p) => p.name === pluginName);
  return hit?.version ?? null;
}

/**
 * Compare two dotted versions NUMERICALLY.
 *
 * String comparison would put `0.1.9` after `0.1.13`, and Signal has shipped
 * 0.1.9 through 0.1.16 — the exact range where the naive version is wrong.
 *
 * @returns {-1|0|1}
 */
export function compareVersions(a, b) {
  const parse = (v) => String(v).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [pa, pb] = [parse(a), parse(b)];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

const CHANGELOG_HEADING = /^##\s*\[([^\]]+)\][^\n]*$/;

/**
 * The CHANGELOG entries strictly newer than `fromVersion` and no newer than
 * `toVersion` — i.e. exactly what you would be getting.
 *
 * **This is the half `/plugin` cannot do**, and the reason FR6 exists: a version
 * number tells you something changed, not whether you want it.
 *
 * `[Unreleased]` is skipped — it is not a version anyone can install.
 *
 * @param {string} changelogText
 * @param {string} fromVersion — the version you have (EXCLUSIVE)
 * @param {string} toVersion — the version available (INCLUSIVE)
 * @returns {Array<{version: string, title: string, body: string}>} newest first
 */
export function changelogBetween(changelogText, fromVersion, toVersion) {
  if (typeof changelogText !== 'string' || !fromVersion || !toVersion) return [];

  const lines = changelogText.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(CHANGELOG_HEADING);
    if (m) {
      if (current) sections.push(current);
      current = { version: m[1].trim(), heading: line, body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);

  return sections
    .filter((s) => /^\d+(\.\d+)*$/.test(s.version))
    .filter(
      (s) =>
        compareVersions(s.version, fromVersion) > 0 &&
        compareVersions(s.version, toVersion) <= 0
    )
    .map((s) => ({
      version: s.version,
      // Everything after the version bracket on the heading line — the release's
      // one-line name, which is the most useful thing in the whole report.
      //
      // (M5.E16 REVIEW `S1`: this used to try `heading.replace(CHANGELOG_HEADING, '')`
      // first and fall back to the expression below. That regex is fully anchored,
      // so it matches the whole line and the first operand was ALWAYS the empty
      // string — the fallback ran every time. Two strategies where there was one.)
      title: s.heading.replace(/^##\s*\[[^\]]+\]\s*[—-]?\s*/, '').trim(),
      body: s.body.join('\n').trim(),
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Render the report. PURE — two renders of equal input are byte-identical.
 *
 * Four states, and each says exactly one true thing:
 *   offline           — could not reach the marketplace; no guess, no update
 *   unknown installed — could not read the installed version; no guess
 *   up to date        — one line
 *   behind            — both versions, plus WHAT the difference contains
 *
 * @param {{installed: string|null, available: string|null, entries?: Array, offline?: boolean, updated?: boolean}} params
 * @returns {string}
 */
export function renderUpdateReport(params = {}) {
  const { installed = null, available = null, entries = [], offline = false, updated = false } = params;
  const lines = ['## /sig:update', ''];

  if (offline || available === null) {
    lines.push(
      `Installed: ${installed ?? 'unknown'}`,
      '',
      'Could not reach the plugin marketplace — offline, or the update check failed.',
      'Nothing was changed, and no version is being guessed at.'
    );
    return lines.join('\n') + '\n';
  }

  if (installed === null) {
    lines.push(
      `Available: ${available}`,
      '',
      'Could not determine the installed version from `claude plugin list`.',
      'Nothing was changed. Run `/plugin` to check by hand rather than trust a guess here.'
    );
    return lines.join('\n') + '\n';
  }

  const cmp = compareVersions(installed, available);

  if (cmp >= 0) {
    lines.push(`Installed: ${installed} — up to date.`);
    if (cmp > 0) {
      lines.push(
        '',
        `The marketplace reports ${available}, which is OLDER than what you have.`,
        'That usually means the marketplace has not been refreshed yet.'
      );
    }
    return lines.join('\n') + '\n';
  }

  lines.push(`Installed: ${installed}`, `Available: ${available}`, '');

  if (entries.length === 0) {
    lines.push(
      'No changelog entries could be read for the versions in between, so what',
      'you would be getting is unknown. The version numbers above are still true.'
    );
  } else {
    lines.push(`What you would be getting (${entries.length} release${entries.length === 1 ? '' : 's'}):`, '');
    for (const e of entries) {
      lines.push(`### ${e.version}${e.title ? ` — ${e.title}` : ''}`);
      if (e.body) lines.push('', e.body);
      lines.push('');
    }
  }

  if (updated) {
    lines.push('', `Updated to ${available}.`, '', RESTART_NOTICE);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
