// The write helpers every kind of work record shares (M6.E16.S1.t1.2).
//
// An INTERNAL module: it has no public writer. A record changes only through a
// library that owns its kind (`work-records.js` owns items) and calls these
// under the `work` lock. `tests/work-record-writers.test.js` lists the modules
// that may import this one.
//
// Everything here was module-private to `work-records.js` and is moved, not
// rewritten. What named an item thing is now passed in: the record kind
// (`makeRecordKind`, `work-record.js`), the path resolver, the reader, the
// store check and the view regeneration.
//
// It imports neither `work-records.js` nor `work-views.js`, so it adds nothing
// to the cycle between those two.

import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { hasRemote, resolveDefaultBranch } from './branch-guard.js';
import { acquireLock } from './file-lock.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { asWorkStoreError, lockFailure, WorkStoreError } from './work-errors.js';
import { isGitRepo, WORK_LOCK_REL, WORK_LOCK_TTL_MS } from './work-store.js';

// ── The lock, and the views after a write ───────────────────────────────────

/**
 * Run `fn` under the `work` lock (`.planning/work/.lock`, v1's file, so every
 * writer of the store excludes every other). The store check runs before the
 * lock is taken, so a project that may not be written never grows a lock
 * file; `beforeWrite` runs under it, before `fn`.
 *
 * @param {string} baseDir
 * @param {string} label — who holds the lock, for the message a waiter sees
 * @param {{assertWritable: (baseDir: string) => {key: string}, beforeWrite: () => void}} store
 * @param {(handle: {baseDir: string, key: string}) => Promise<any>} fn
 * @returns {Promise<any>} what `fn` returns
 */
export async function withWorkLock(baseDir, label, { assertWritable, beforeWrite }, fn) {
  const { key } = assertWritable(baseDir);
  let lock;
  try {
    lock = await acquireLock(join(baseDir, WORK_LOCK_REL), { label, ttlMs: WORK_LOCK_TTL_MS });
  } catch (err) {
    throw lockFailure(err);
  }
  try {
    beforeWrite();
    return await fn({ baseDir, key });
  } finally {
    await lock.released();
  }
}

/**
 * Regenerate after a write that landed. A failure does not undo the change:
 * the change is correct, and `notRegenerated(done, err)` builds the error that
 * says so.
 *
 * @param {{baseDir: string}} handle
 * @param {string} done — what landed, as a clause ("SIG-3 was written")
 * @param {(baseDir: string) => Promise<void>} regenerate
 * @param {(done: string, err: unknown) => Error} notRegenerated
 */
export async function regenerateAfter(handle, done, regenerate, notRegenerated) {
  try {
    await regenerate(handle.baseDir);
  } catch (err) {
    throw notRegenerated(done, err);
  }
}

// ── Paths ───────────────────────────────────────────────────────────────────

// `assertRealInsidePlanning`, as a WorkStoreError (v1 `confine`).
export function confine(baseDir, abs) {
  try {
    assertRealInsidePlanning(baseDir, abs, 'work store write');
  } catch (err) {
    throw asWorkStoreError(err, typeof err?.code === 'string' ? 'IO' : 'CONFLICT');
  }
}

export function existsNoFollow(abs) {
  try {
    lstatSync(abs);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw asWorkStoreError(err, 'IO');
  }
}

// ── Records ─────────────────────────────────────────────────────────────────

// Append one event (and apply `fields`) to the record `id` holds now.
export function withEvent(current, event, fields = {}) {
  const next = { ...current.record, ...fields, events: [...current.record.events, event] };
  for (const k of Object.keys(fields)) if (fields[k] === undefined || fields[k] === null) delete next[k];
  return next;
}

/**
 * The write helpers for one kind of record, bound to that kind's pieces.
 *
 * @param {object} of
 * @param {{serializeRecord: Function, checkEvents: Function}} of.kind — from `makeRecordKind`
 * @param {(id: string) => string} of.pathOf — where the record lives, repo-root-relative
 * @param {(record: object) => object} of.entryOf — the record as its library returns it
 * @param {(id: string) => void} of.assertId — throws unless `id` is an ID of this kind
 * @param {(baseDir: string, key: string, id: string) => null|{records: object[], broken: object[]}} of.readOne
 * @param {string} of.noun — what one record is called in messages (`item`)
 * @returns {{recordText: Function, readForWrite: Function, writeRecord: Function, writeRecords: Function}}
 */
export function recordWriter({ kind, pathOf, entryOf, assertId, readOne, noun }) {
  // A record's bytes, validated and with a legal history — or a throw, before
  // anything is written. Shape errors are SCHEMA; an event not legal where it
  // stands (the transition table) is CONFLICT.
  function recordText(record) {
    const text = kind.serializeRecord(record);
    const errors = kind.checkEvents(record);
    if (errors.length > 0) {
      throw new WorkStoreError('CONFLICT', `${record.id}: ${errors.map((e) => e.message).join('; ')} — nothing was written.`);
    }
    return text;
  }

  // A record as it is on disk now, under the lock: {entry, text}.
  function readForWrite(handle, id) {
    assertId(id);
    const found = readOne(handle.baseDir, handle.key, id);
    if (found === null) throw new WorkStoreError('NOT_FOUND', `${id}: no such ${noun}`);
    if (found.broken.length > 0) throw new WorkStoreError('SCHEMA', found.broken.map((b) => b.error).join('; '));
    const entry = found.records[0];
    return { entry, text: readFileSync(join(handle.baseDir, entry.path), 'utf-8') };
  }

  // One existing record, changed: its new bytes written atomically over the old.
  async function writeRecord(handle, next, opts) {
    const text = recordText(next);
    const abs = join(handle.baseDir, pathOf(next.id));
    confine(handle.baseDir, abs);
    try {
      await atomicWrite(abs, text, { renameFn: opts.renameFn });
    } catch (err) {
      throw asWorkStoreError(err, 'IO');
    }
    return entryOf(next);
  }

  // Write several changed records, all or nothing: on a failure each record
  // already written is put back to its old bytes. A put-back that fails is named.
  async function writeRecords(handle, planned, opts) {
    const done = [];
    try {
      for (const p of planned) {
        confine(handle.baseDir, p.abs);
        await atomicWrite(p.abs, p.text, { renameFn: opts.renameFn });
        done.push(p);
      }
    } catch (err) {
      const left = [];
      for (const p of done.reverse()) {
        try {
          await atomicWrite(p.abs, p.oldText);
        } catch {
          left.push(p.next.id);
        }
      }
      const wrapped = asWorkStoreError(err, 'IO', left.length
        ? `the write failed and ${left.join(', ')} could not be put back: `
        : '');
      wrapped.leftChanged = left;
      throw wrapped;
    }
    return planned.map((p) => entryOf(p.next));
  }

  return { recordText, readForWrite, writeRecord, writeRecords };
}

// ── Git: is a commit on the default branch ─────────────────────────────────

const GIT_MAX_BUFFER = 256 * 1024 * 1024;

export function runGit(baseDir, args, execFn) {
  return String(execFn('git', args, { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER }));
}

// A lazy, memoised `git rev-parse --is-shallow-repository` (false on failure).
export function shallowProbe(baseDir, execFn) {
  let shallow;
  return () => {
    if (shallow === undefined) {
      try {
        shallow = runGit(baseDir, ['rev-parse', '--is-shallow-repository'], execFn).trim() === 'true';
      } catch {
        shallow = false;
      }
    }
    return shallow;
  };
}

// The ref a confirmed commit must be an ancestor of, or why there is none.
// The REMOTE ref (`refs/remotes/origin/<branch>`), not the local branch: a
// local `main` can hold commits nobody merged. The ref is built here from a
// fixed prefix, so it cannot begin with `-`.
export function defaultBranchRef(baseDir, execFn) {
  if (!isGitRepo(baseDir, execFn)) return { reason: 'not-a-repo' };
  const remote = hasRemote(baseDir, { execFn });
  if (remote === null) return { reason: 'git-failed' };
  if (remote === false) return { reason: 'no-remote' };
  const branch = resolveDefaultBranch(baseDir, { execFn });
  if (branch === null) return { reason: 'no-default-branch' };
  const ref = `refs/remotes/origin/${branch}`;
  try {
    runGit(baseDir, ['rev-parse', '--verify', '--quiet', ref], execFn);
  } catch {
    return { reason: 'no-default-branch' };
  }
  return { ref };
}

// How many commit-like objects `prefix` abbreviates — commits, and tag objects
// that lead to a commit, which is what git counts when it resolves
// `<prefix>^{commit}`: two sharing the prefix make git call it ambiguous.
// 0 when git cannot say.
export function commitsStartingWith(baseDir, prefix, execFn) {
  let objects;
  try {
    objects = runGit(baseDir, ['rev-parse', `--disambiguate=${prefix}`], execFn).split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return 0;
  }
  // Each listed object once, counted when it is a commit or a tag (M6.E14
  // REVIEW pass 2: counting commits only accepted a proof git itself calls
  // ambiguous, which then could never confirm). Trees and blobs are not counted.
  // Two are enough to answer.
  let n = 0;
  for (const o of new Set(objects)) {
    try {
      const type = runGit(baseDir, ['cat-file', '-t', '--end-of-options', o], execFn).trim();
      // A tag counts only when it leads to a commit: git ignores one that
      // points at a blob or a tree when it resolves `<prefix>^{commit}` (REVIEW pass 3).
      if (type === 'commit') n += 1;
      else if (type === 'tag') {
        runGit(baseDir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${o}^{commit}`], execFn);
        n += 1;
      }
    } catch {
      // not inspectable: not counted
    }
    if (n > 1) break;
  }
  return n;
}

// null when `sha` is an ancestor of `ref`; otherwise why not. `sha` has
// already matched COMMIT_RE, so it is bare lowercase hex and never an option
// (`--end-of-options` says so to git as well).
//
// The proof is resolved to a full SHA FIRST, and only that SHA is checked:
// git resolves `<name>^{commit}` as a branch or tag before it tries an
// abbreviated object id, so a ref named `deadbee` would otherwise stand in for
// a commit (the M6.E13 VERIFY AC7.2 finding). A resolved SHA that does not
// start with the proof means the proof named a ref → `proof-names-a-ref`.
//
// A short proof that more than one commit starts with → `ambiguous-proof`,
// checked FIRST (SIG-276, M6.E14): a branch or tag named the shared prefix
// makes `rev-parse` resolve the ref instead of failing, and the commit it
// points at does start with the prefix — so without this check the proof
// confirmed although it names two commits.
export function ancestryFailure(baseDir, sha, ref, execFn, isShallow) {
  if (sha.length < 40 && commitsStartingWith(baseDir, sha, execFn) > 1) return 'ambiguous-proof';
  let full;
  try {
    full = runGit(baseDir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${sha}^{commit}`], execFn)
      .trim().toLowerCase();
  } catch {
    // In a shallow clone a cut-off commit is simply absent, so it cannot be known.
    return isShallow() ? 'shallow' : 'unknown-commit';
  }
  if (!full.startsWith(sha.toLowerCase())) return 'proof-names-a-ref';
  try {
    execFn('git', ['merge-base', '--is-ancestor', full, ref], {
      cwd: baseDir,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return null;
  } catch (err) {
    // In a shallow clone a missing commit and a cut-off history look the same
    // as "not an ancestor", so the answer is that it cannot be known.
    if (isShallow()) return 'shallow';
    if (err?.status === 1) return 'not-on-default-branch';
    if (err?.status === 128) return 'unknown-commit';
    return 'git-failed';
  }
}
