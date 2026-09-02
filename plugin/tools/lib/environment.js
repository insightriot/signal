// `.planning/ENVIRONMENT.md` — the environment the agent cannot see.
//
// WHAT IT IS FOR. Everything true about a project that is not in its code:
// external services, configuration variable NAMES, test accounts, support
// channels, deploy targets. `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` names
// environment readiness as Signal's absent axis and blocks it on a permission
// model (`/sig:permissions`). Half of it is not blocked on anything — it is a
// markdown file. Useful attended; a prerequisite unattended, where it turns a
// halt into a lookup.
//
// ⚠ NAMES, NEVER VALUES. This file lands in `.planning/`, which is tracked by
// standing policy, in repositories that are frequently public — `B97` is what
// happens when a public repo publishes more than intended. So the contract is
// enforced on the write path AND stated inside the template itself, because the
// file will be hand-edited long after any command wrote it.
//
// ⚠ THE APPROVED INSTRUCTION WAS INSUFFICIENT, AND THIS DEVIATES FROM IT.
// `BACKLOG.md` (accepted 2026-08-08) says "the write path needs the same
// sensitive-data scrub `/sig:add` already runs." Measured against the actual
// patterns, that is not enough for THIS file:
//   - `SENSITIVE_PATTERNS` catches AWS keys, `ghp_` tokens, `Bearer …`, and
//     40-char hex. It does NOT match `DATABASE_URL=postgres://u:pw@host/db`,
//     `API_KEY=sk-…`, or any ordinary `NAME=value` pair — which is exactly the
//     shape a `.env` paste produces, and a `.env` paste is the realistic way
//     this file goes wrong.
//   - `hex-blob-40` matches every git SHA, so reusing the scrub unchanged would
//     fire on any commit reference legitimately present here.
// So the guard below is VALUE-SHAPED rather than secret-shaped: in a file whose
// contract is "names only", any populated assignment is a violation regardless
// of whether the value resembles a known secret. `scrubSensitive` still runs as
// a second pass, because a bare token pasted on its own line is not an
// assignment and this guard would miss it. See DECISIONS.md.

import { join } from 'node:path';

/** Path to a project's environment file. */
export function environmentPath(baseDir) {
  return join(baseDir, '.planning', 'ENVIRONMENT.md');
}

/**
 * Placeholders that are NOT values — the template ships full of them, and a
 * stub must not fail its own guard on the way to disk.
 */
/**
 * A value that is a PLACEHOLDER rather than a secret.
 *
 * ⚠ The bracketed forms require **whitespace inside them**. A first attempt
 * accepted any bracketed content — `\[[^\]]*\]|<[^>]*>` — to let documentation
 * examples like `<value from 1Password>` through. That opened a bypass in the
 * same change that closed six others: `API_KEY=[sk_live_51H8abc]` read as a
 * placeholder and passed. Found by the CI reviewer on `#197`.
 *
 * The space requirement is what separates them: a placeholder is a phrase
 * (`<value from 1Password>`, `[FILL IN — where the value lives]`), while a
 * credential is a single token. The enumerated single-word markers below stay
 * listed explicitly rather than being swept in by a pattern.
 */
const PLACEHOLDER_RE =
  /^(\[[^\]]*\s[^\]]*\]|<[^>]*\s[^>]*>|\[FILL IN\]|\[INFERRED\]|<none>|<unset>|<unknown>|none|unknown|n\/a|tbd|—|-)$/i;

/**
 * For the COLON form only: does this value look like a credential rather than a
 * label?
 *
 * ⚠ Requiring merely "no whitespace" was wrong, and wrong in the expensive
 * direction — it flagged `SLACK: #eng-help`, `STATUS: active` and
 * `NODE_ENV: production`, and because the guard REFUSES the write, that made
 * the file unusable for exactly the content it exists to hold. The template's
 * own filled-in examples (`#eng-help in Slack`, `Vercel, auto-deploys main`)
 * invite that shape. Found by the CI reviewer on `#197`.
 *
 * The discriminator is length plus mixed letters-and-digits: real keys and
 * tokens are long and alphanumeric; labels are short words. ⚠ Residual, stated
 * rather than hidden: a SHORT secret in colon form is missed — `PIN: 1234` has
 * no letters and `KEY: abc` is too short. The equals form has no such floor, so
 * the gap is narrow, but it is real.
 */
function looksLikeCredential(value) {
  return value.length >= 12 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

/**
 * Leading markdown decoration to look past before the key: any depth of
 * blockquote, an optional bullet OR numbered-list marker, and optional bold or
 * code emphasis.
 *
 * ⚠ EVERY ONE OF THESE FORMS WAS A HOLE ON FIRST SHIP, found by the CI
 * reviewer on `#195` and confirmed by running it — blockquote, bold, numbered
 * list and the colon form all passed a guard whose stated contract is "any
 * populated assignment is a violation". The blockquote miss was the worst of
 * them: `renderEnvironmentTemplate`'s own "Names, never values" warning box is
 * written in `>`-prefixed style, so the file primed editors toward the exact
 * shape it could not see.
 */
const LEAD = String.raw`^[ \t]*(?:>[ \t]*)*(?:(?:[-*+]|\d+[.)])[ \t]+)?(?:\*\*|__|\x60)?`;
const KEY = String.raw`([A-Z][A-Z0-9_]{2,})`;
const CLOSE = String.raw`(?:\*\*|__|\x60)?`;

/** `KEY = value` — the `.env`-paste shape. */
const ASSIGNMENT_RE = new RegExp(`${LEAD}${KEY}${CLOSE}[ \\t]*=[ \\t]*(.+?)[ \\t]*\x60?$`);

/**
 * `KEY: value` — the other way people write these down.
 *
 * Narrower than the equals form ON PURPOSE: the value must be a single
 * whitespace-free token. `NOTE: remember to rotate this` is prose and must not
 * fail the file, while `API_KEY: sk-live-abc123` must. A real credential, URL,
 * or token never contains a space; a sentence almost always does.
 */
const COLON_ASSIGNMENT_RE = new RegExp(`${LEAD}${KEY}${CLOSE}[ \\t]*:[ \\t]+(\\S+)[ \\t]*\x60?$`);

/**
 * A URL carrying inline credentials — `postgres://user:pw@host/db`.
 *
 * Listed separately because it is the single highest-value catch here and it
 * survives being written as prose rather than as an assignment.
 */
const CREDENTIALED_URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi;

/**
 * Find every place this file states a VALUE rather than a name.
 *
 * @param {string} body
 * @returns {Array<{kind: 'assignment'|'credentialed-url', line: number, key: string|null, excerpt: string}>}
 */
export function findStatedValues(body) {
  const found = [];
  // ⚠ Split on CRLF as well as LF. Tightening the trailing match from `\s*` to
  // `[ \t]*` (to stop it eating the line ending) meant a leftover `\r` made
  // every pattern fail on a CRLF checkout — a silent fail-open in a guard whose
  // job is refusing secrets, and this module was the only `.planning/` reader
  // in the repo not normalising line endings (`state.js`, `retrospective.js`,
  // `migrate-memory.js` and `archive-tree.js` all do). Found by the CI reviewer
  // on `#197`, in the change that fixed the previous six holes.
  const lines = String(body ?? '').split(/\r?\n/);

  // ⚠ FENCED CODE IS SCANNED, and the first version of this file skipped it.
  // The reasoning was "an example belongs in a fence" — which inverted the
  // threat model, because pasting a `.env` block into markdown NORMALLY puts it
  // in a fence. So the one shape this guard exists to catch was the one shape
  // it waved through, and a test shipped pinning that as intended behaviour.
  // Found by the CI reviewer on `#195`, confirmed by running it.
  //
  // Skipping fences also left a second defect: `inFence = !inFence` is a bare
  // parity toggle, so one unterminated fence disabled detection for the whole
  // rest of the file while still reporting `ok: true`. Scanning every line
  // removes the toggle and the failure mode with it.
  //
  // There is no legitimate populated assignment in a names-only file, inside a
  // fence or out. Documentation examples use a placeholder — `<value from
  // 1Password>`, `[FILL IN]` — and `PLACEHOLDER_RE` accepts any bracketed form.
  lines.forEach((line, i) => {
    const equals = line.match(ASSIGNMENT_RE);
    const colon = equals ? null : line.match(COLON_ASSIGNMENT_RE);
    const assignment = equals ?? colon;
    if (assignment) {
      const [, key, rawValue] = assignment;
      const value = rawValue.replace(/^`|`$/g, '').trim();
      // The colon form additionally requires the value to look like a
      // credential — see `looksLikeCredential`. `KEY: label` is how this file
      // is meant to be written; `KEY=value` never is.
      const credentialShaped = equals ? true : looksLikeCredential(value);
      if (value && credentialShaped && !PLACEHOLDER_RE.test(value)) {
        found.push({
          kind: 'assignment',
          line: i + 1,
          key,
          // Never echo the value back — an error message is another place it
          // can be read from, and it may reach a log or a transcript.
          excerpt: `${key}=<redacted, ${value.length} chars>`,
        });
      }
    }

    CREDENTIALED_URL_RE.lastIndex = 0;
    if (CREDENTIALED_URL_RE.test(line)) {
      found.push({
        kind: 'credentialed-url',
        line: i + 1,
        key: null,
        excerpt: 'a URL containing inline credentials (user:password@host)',
      });
    }
  });

  return found;
}

/**
 * Decide whether a proposed ENVIRONMENT.md body may be written.
 *
 * REFUSES rather than redacting. That matches the posture `/sig:add` and
 * `/sig:checkpoint` already take on a sensitive hit — refuse-to-write, nothing
 * mutated, the user decides — and their anti-rationalization tables forbid
 * auto-redaction outright ("auto-redact corrupts the captured decision"). It is
 * a stronger stance than the warn-not-block chosen for `B75` earlier the same
 * day, and the difference is deliberate: a skipped confirmation is a judgment
 * call about process, while a value in a names-only file is a violation of the
 * file's stated contract, and the cost of being wrong is a published secret.
 *
 * @param {string} body
 * @param {{scrub?: (b: string) => {hits: Array<object>}}} [opts]
 *   `scrub` is injected so this module does not hard-depend on `add.js`; pass
 *   `scrubSensitive` to run the secret-shaped pass as well.
 * @returns {{ok: boolean, violations: Array<object>, reason: string|null}}
 */
export function checkEnvironmentBody(body, opts = {}) {
  const violations = findStatedValues(body);

  if (typeof opts.scrub === 'function') {
    // Second pass, for a bare token that is not an assignment. `hex-blob-40` is
    // dropped: it matches every 40-char git SHA, and a commit reference is
    // legitimate content here — keeping it would make the guard cry wolf on the
    // most ordinary thing a project note contains.
    const { hits } = opts.scrub(String(body ?? ''));
    for (const hit of hits ?? []) {
      if (hit.type === 'hex-blob-40') continue;
      violations.push({
        kind: 'secret-pattern',
        line: null,
        key: hit.type,
        excerpt: `a ${hit.type} literal`,
      });
    }
  }

  if (violations.length === 0) return { ok: true, violations: [], reason: null };

  return {
    ok: false,
    violations,
    reason:
      `ENVIRONMENT.md records variable NAMES, never values — it is committed to ` +
      `.planning/, which is tracked, in a repository that may be public. ` +
      `${violations.length} ${violations.length === 1 ? 'line states a value' : 'lines state values'}: ` +
      violations
        .map((v) => (v.line ? `line ${v.line}: ${v.excerpt}` : v.excerpt))
        .join('; ') +
      `. Nothing was written. Remove the values — keep the names — and retry.`,
  };
}

/**
 * The starting template.
 *
 * Every section is a `[FILL IN]` stub rather than being omitted, so a section
 * nobody has filled reads as UNANSWERED rather than as ABSENT — `/sig:docs-sweep`
 * already reports unfilled `[FILL IN]` markers, which is why this slice does
 * not add a calibration question to go looking for the same information.
 *
 * @param {{projectName?: string, today?: string}} [opts]
 */
export function renderEnvironmentTemplate(opts = {}) {
  const name = opts.projectName ?? '[FILL IN — project name]';
  const today = opts.today ?? '[FILL IN — date]';
  return `# Environment

What is true about this project that is **not in the code**. Written for an agent
that cannot see your dashboards, your CI settings, or your team's Slack.

> ## ⚠ Names, never values
>
> This file lists the **names** of configuration variables, the **names** of
> services, and where to look them up. It must never contain a secret, a
> password, a token, a connection string with credentials in it, or the contents
> of a \`.env\` file.
>
> **This file is committed.** \`.planning/\` is tracked, and plenty of
> repositories using Signal are public. A value pasted here is published.
>
> Signal refuses to write this file when a line states a value. That check runs
> on the write path only — it cannot see a hand-edit, which is why the rule is
> printed here rather than only in the command that created the file.

**Project:** ${name}
**Last updated:** ${today}

## External services

Which third-party services this project talks to, and what each is for. Name the
service and the environment, not the account.

[FILL IN — e.g. "Stripe (test mode) for billing; Postmark for transactional mail"]

## Configuration variable names

The environment variables this project reads, and **where the values live** —
a password manager, a CI secret store, a teammate. Names only.

[FILL IN — e.g. "DATABASE_URL, STRIPE_SECRET_KEY — values in 1Password, vault 'eng'"]

## Test accounts and fixtures

How to exercise this project without touching real data or real customers.

[FILL IN — e.g. "seed script at scripts/seed.ts; sandbox tenant 'acme-test'"]

## Deploy targets

Where this ships, what triggers it, and who can roll it back.

[FILL IN — e.g. "Vercel, auto-deploys main; rollback via the Vercel dashboard"]

## Support and escalation

Who to ask, and where. A channel or a role, not a person's contact details.

[FILL IN — e.g. "#eng-help in Slack; on-call rota in PagerDuty"]

## What an agent should NOT touch

Anything destructive, expensive, or customer-visible that automation must leave
alone. **Be specific** — a vague warning is one an agent will reason past.

[FILL IN — e.g. "never run migrations against production; never send real email"]
`;
}
