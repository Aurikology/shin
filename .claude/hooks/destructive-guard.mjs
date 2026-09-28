#!/usr/bin/env node
/**
 * destructive-guard -- PreToolUse guard on Bash / PowerShell.
 *
 * WHY THIS EXISTS. Jamin, 2026-09-28, "build 1-5": a builder made a temp copy of the
 * repo that linked the real node_modules folders (junctions/symlinks inside the copy
 * pointing at the real ones), then deleted the copy recursively -- and with it every
 * real dependency, because a recursive delete follows those links down into the real
 * target. A second, separate incident nearly deleted real shopper photos the same way.
 * The common shape in both: a recursive delete or move that either names node_modules
 * or a data folder directly, or walks into one through a link it never checked for.
 *
 * WHAT IT BLOCKS (exit 2, reason on stderr):
 *   a. a recursive delete whose target is or contains node_modules
 *   b. creating a link/junction that points at or is named node_modules
 *   c. a recursive delete or move whose target is inside a Shin data folder
 *   d. a recursive delete of a directory that exists and contains a symlink/junction
 *      within 3 levels -- the exact mechanism of the incident, name-agnostic
 *   e. `git clean -x` / `-X`, which deletes gitignored files -- node_modules and the
 *      data folders are both gitignored
 *
 * ALLOWED: deleting your own temp folders under the OS temp dir that contain no links,
 * `npm ci`, `git worktree remove` of a worktree with no links, everything else.
 *
 * METHOD. Same text-first style as no-blind-git-add.mjs: a command "shape" (recursive
 * delete / link creation / git clean) is matched with a regex anchored to the verb, the
 * remainder of that statement is scanned for the dangerous target. Rule (d) is the one
 * exception that is not pure text: it lstats the real candidate path (never deletes,
 * never follows into it beyond a bounded depth) because that is the only way to catch a
 * link the command line itself never names -- which is exactly what happened in the
 * incident. `opts.repoRoot` / `opts.dataDirEnv` exist so the selftest can point rule
 * (c)/(d) at a scratch directory and never touch a real data folder.
 *
 * Blocking protocol: exit 2 with the reason on stderr, the version-stable PreToolUse
 * contract this repo's other hooks use. Fail-open on ANY internal error (bad stdin,
 * an unreadable path, a regex throwing) -- a guard must never wedge a session -- but the
 * failure is written to stderr first, so "fail open" is never silent.
 */
import { readFileSync, lstatSync, readdirSync } from "node:fs";
import { resolve as resolvePath, isAbsolute, sep, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Same-statement window: everything up to the next command separator. Mirrors no-blind-git-add.mjs. */
const SEG = "[^\\n;|&]*";

/** All tails (text after each match of `leadSrc`, up to the next separator) in `cmd`. */
function tails(cmd, leadSrc) {
  const re = new RegExp(leadSrc + "(" + SEG + ")", "gi");
  const out = [];
  let m;
  while ((m = re.exec(cmd))) {
    out.push(m[1] ?? "");
    if (m.index === re.lastIndex) re.lastIndex += 1; // guard a zero-width match
  }
  return out;
}

/**
 * Bare (non-flag) tokens in a clause -- Unix `-x` and Windows `/x` flags are both skipped.
 * A Windows flag is one letter after the slash (`/s`, `/q`, `/J`); anything longer is an
 * absolute Unix path and stays a candidate. Skipping every "/" token let
 * `rm -rf /Users/.../linked-copy` through on the Mac (caught by CI on Linux, 2026-09-28).
 */
function candidatesIn(clause) {
  const tokens = clause.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const out = [];
  for (const raw of tokens) {
    const tok = raw.replace(/^["']|["']$/g, "");
    if (!tok || tok.startsWith("-") || /^\/[a-z?]$/i.test(tok)) continue;
    out.push(tok);
  }
  return out;
}

function mentions(text, needle) {
  return text.toLowerCase().includes(needle);
}

function hasSegment(pathText, names) {
  const norm = String(pathText).replace(/\\/g, "/").toLowerCase();
  return names.some((n) => new RegExp("(^|/)" + n + "(/|$)").test(norm));
}

function underDataDir(pathText, dataDirEnv) {
  if (!dataDirEnv) return false;
  const norm = String(pathText).replace(/\\/g, "/").toLowerCase();
  const envNorm = String(dataDirEnv).replace(/\\/g, "/").toLowerCase();
  return envNorm.length > 0 && norm.startsWith(envNorm);
}

function resolveCandidate(p, repoRoot) {
  try {
    return isAbsolute(p) ? resolvePath(p) : resolvePath(repoRoot, p);
  } catch {
    return null;
  }
}

/**
 * Rule (d)'s check. True if `resolved` is itself a symlink/junction, or is a directory
 * that contains one within `depth` levels. Windows junctions report as symbolic links
 * via lstat, same as a real symlink. Fails open (false) on any read error -- a path
 * that does not exist, or that this process cannot read, is never treated as a hit.
 */
function linkRisk(resolved, depth = 3) {
  let st;
  try {
    st = lstatSync(resolved);
  } catch {
    return false;
  }
  if (st.isSymbolicLink()) return true;
  if (!st.isDirectory()) return false;
  return containsLinkWithin(resolved, depth);
}

function containsLinkWithin(dir, depth) {
  if (depth < 0) return false;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    const full = dir + sep + e.name;
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) return true;
    if (st.isDirectory() && depth > 0 && containsLinkWithin(full, depth - 1)) return true;
  }
  return false;
}

/* -------------------------------------------------------------- shapes */

/** `rm -r` / `-rf` / `-fr` / `--recursive` -- any combined short flag containing r/R. */
const RM_FLAG = /(?:--recursive\b|(?<![\w-])-[a-zA-Z]*[rR][a-zA-Z]*\b)/;
/** `rmdir /s`, `rd /s`, `del /s` -- the cmd.exe recursive-delete switch. */
const SLASH_S = /\/s\b/i;
/** `-Recurse` and PowerShell's unambiguous-prefix abbreviations of it (`-Rec`, `-Recu`, ...). */
const DASH_REC = /(?<![\w-])-rec\w*\b/i;

/** Every spelling of "delete this directory tree" this hook knows, bash and PowerShell alike. */
const DELETE_SHAPES = [
  { lead: "\\brm\\b", flag: RM_FLAG },
  { lead: "\\brimraf\\b", flag: null },
  { lead: "\\brmdir\\b", flag: SLASH_S },
  { lead: "\\brmdir\\b", flag: DASH_REC },
  { lead: "\\brd\\b", flag: SLASH_S },
  { lead: "\\brd\\b", flag: DASH_REC },
  { lead: "\\bdel\\b", flag: SLASH_S },
  { lead: "\\bdel\\b", flag: DASH_REC },
  { lead: "\\bremove-item\\b", flag: DASH_REC },
  { lead: "\\bri\\b", flag: DASH_REC },
  { lead: "\\berase\\b", flag: DASH_REC },
];

/** `mv` / `Move-Item` / cmd's `move` -- rule (c) also covers moving a data folder away. */
const MOVE_LEAD = "\\b(?:mv|move-item|move)\\b";

/** Creating a link/junction: `mklink /J|/D`, `ln -s`, `New-Item -ItemType Junction|SymbolicLink`. */
const LINK_SHAPES = [
  { lead: "\\bmklink\\b", flag: /\/[jJdD]\b/ },
  { lead: "\\bln\\b", flag: /(?:--symbolic\b|(?<![\w-])-[a-zA-Z]*s[a-zA-Z]*\b)/ },
  { lead: "\\bnew-item\\b", flag: /-itemtype\s+["']?(?:junction|symboliclink)\b/i },
];

/** `git clean -x` / `-X` / combined (`-xdf`, `-fdX`, ...) -- deletes gitignored files. */
const GIT_CLEAN_X = /\bgit\b[^\n;|&]*\bclean\b[^\n;|&]*(?<![\w-])-[a-zA-Z]*[xX][a-zA-Z]*\b/;

/** `node -e` / `--eval` / `-p` -- the only way `fs.rmSync`/`rmdirSync` reach this hook as text. */
const NODE_EVAL = /\bnode\b\s+(?:-e\b|--eval\b|-p\b)/i;

/* -------------------------------------------------------------- classifier */

/**
 * Pure classifier, exported so the selftest can replay cases without a subprocess.
 * `opts.repoRoot` and `opts.dataDirEnv` let the selftest redirect rule (c)/(d)'s
 * filesystem checks at a scratch directory instead of this real repo.
 */
export function classify(tool, cmd, opts = {}) {
  if (tool !== "Bash" && tool !== "PowerShell") return { verdict: "na", rule: null };
  cmd = String(cmd ?? "");
  if (!cmd.trim()) return { verdict: "na", rule: null };

  const repoRoot = opts.repoRoot || REPO_ROOT;
  const dataDirEnv = opts.dataDirEnv !== undefined ? opts.dataDirEnv : process.env.SHIN_DATA_DIR;

  // rule e -- git clean -x/-X
  if (GIT_CLEAN_X.test(cmd)) {
    return { verdict: "violation", rule: "e", detail: "git clean with -x/-X, which deletes gitignored files (node_modules and the data folders are both gitignored)" };
  }

  // rule b -- a link/junction that points at or is named node_modules
  for (const shape of LINK_SHAPES) {
    for (const t of tails(cmd, shape.lead)) {
      if (shape.flag && !shape.flag.test(t)) continue;
      if (mentions(t, "node_modules")) {
        return { verdict: "violation", rule: "b", detail: `a link/junction command names or targets node_modules: "${t.trim().slice(0, 140)}"` };
      }
    }
  }

  // rule a / c / d -- recursive delete
  for (const shape of DELETE_SHAPES) {
    for (const t of tails(cmd, shape.lead)) {
      if (shape.flag && !shape.flag.test(t)) continue;
      for (const cand of candidatesIn(t)) {
        const resolved = resolveCandidate(cand, repoRoot);
        const checkText = resolved || cand; // underDataDir needs an absolute path to compare against SHIN_DATA_DIR
        if (hasSegment(cand, ["node_modules"])) {
          return { verdict: "violation", rule: "a", detail: `recursive delete targets node_modules: "${cand}"` };
        }
        if (hasSegment(cand, ["data", "photos", "shutter"]) || underDataDir(checkText, dataDirEnv)) {
          return { verdict: "violation", rule: "c", detail: `recursive delete targets a Shin data folder: "${cand}"` };
        }
        if (resolved && linkRisk(resolved)) {
          return { verdict: "violation", rule: "d", detail: `recursive delete of "${cand}", which exists and contains a symlink/junction within 3 levels` };
        }
      }
    }
  }

  // rule c -- moving a data folder away
  for (const t of tails(cmd, MOVE_LEAD)) {
    for (const cand of candidatesIn(t)) {
      const resolved = resolveCandidate(cand, repoRoot);
      const checkText = resolved || cand;
      if (hasSegment(cand, ["data", "photos", "shutter"]) || underDataDir(checkText, dataDirEnv)) {
        return { verdict: "violation", rule: "c", detail: `move targets a Shin data folder: "${cand}"` };
      }
    }
  }

  // a / c / d, spelled as `node -e "...fs.rmSync/rmdirSync(path, {recursive: true})..."`
  if (NODE_EVAL.test(cmd)) {
    for (const m of cmd.matchAll(/\b(rm(?:dir)?Sync)\s*\(([^)]*)\)/gis)) {
      const [, fn, args] = m;
      if (!/recursive\s*:\s*true/i.test(args)) continue;
      const pm = args.match(/(['"`])((?:(?!\1).)*)\1/);
      const p = pm ? pm[2] : null;
      if (!p) continue; // dynamic path expression -- cannot determine the target, known gap
      const resolved = resolveCandidate(p, repoRoot);
      const checkText = resolved || p;
      if (hasSegment(p, ["node_modules"])) {
        return { verdict: "violation", rule: "a", detail: `node -e ${fn}(...) targets node_modules: "${p}"` };
      }
      if (hasSegment(p, ["data", "photos", "shutter"]) || underDataDir(checkText, dataDirEnv)) {
        return { verdict: "violation", rule: "c", detail: `node -e ${fn}(...) targets a Shin data folder: "${p}"` };
      }
      if (resolved && linkRisk(resolved)) {
        return { verdict: "violation", rule: "d", detail: `node -e ${fn}(...) deletes "${p}", which exists and contains a symlink/junction within 3 levels` };
      }
    }
  }

  return { verdict: "na", rule: null };
}

const ALTERNATIVE = {
  a: "Safe alternative: `npm ci` reinstalls node_modules from the lockfile. It never needs a manual recursive delete.",
  b: "Safe alternative: none needed inside this repo -- a real dependency install never needs a hand-made link to node_modules.",
  c: "Safe alternative: work in a copy made with `git worktree remove`/`git worktree add`, or a temp folder under the OS temp dir. Never move or delete the data folder itself.",
  d: "Safe alternative: `git worktree remove <path>` for a worktree, or delete a plain temp folder under the OS temp dir instead -- one that was never linked into anything real.",
  e: "Safe alternative: `git clean -n` first to see what would go, and if node_modules or data/ show up, that is the sign not to run it -- use `npm ci` or a scoped `rm`/`Remove-Item` on the exact path instead.",
};

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch (err) {
    try {
      process.stderr.write(`[destructive-guard] failed to parse stdin, failing open: ${err && err.message}\n`);
    } catch {}
    return 0;
  }

  let result;
  try {
    result = classify(payload.tool_name ?? "", payload.tool_input?.command ?? "");
  } catch (err) {
    try {
      process.stderr.write(`[destructive-guard] internal error, failing open: ${err && err.stack ? err.stack : err}\n`);
    } catch {}
    return 0;
  }

  if (result.verdict !== "violation") return 0;

  process.stderr.write(
    `[destructive-guard] BLOCKED (rule ${result.rule}). ${result.detail}\n\n` +
      `2026-09-28: a temp copy of this repo linked the real node_modules folders, and a\n` +
      `recursive delete of the copy followed those links into the real ones and destroyed\n` +
      `them; a second incident nearly did the same to real shopper photos.\n\n` +
      `${ALTERNATIVE[result.rule]}\n`,
  );
  return 2;
}

/* Run only when invoked as the hook. Imported by the selftest, it stays inert. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let code = 0;
  try {
    code = main();
  } catch {
    code = 0; // a guard must never wedge a session
  }
  process.exit(code);
}
