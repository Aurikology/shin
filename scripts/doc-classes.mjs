// One ruling, one place: every tracked file gets exactly one class, so a later
// check can tell a "live" file (must defer to RULINGS.md) from a file that is
// allowed to hold history, a snapshot in time, or something that is not a
// ruling-bearing doc at all (code, config, data, tests).
//
// classify(path) takes a path relative to the repo root, forward slashes,
// exactly as `git ls-files` prints it, and returns one class string. No file
// I/O: this is pure string logic so it can be unit tested without a repo.

const STATUS_BASENAMES = new Set([
  'NOW.md',
  'QUEUE.md',
  'DEFECTS.md',
  'SCOREBOARD.md',
  'PASS.md',
  'README.md',
]);

const STATUS_EXACT_PATHS = new Set(['notes/catch-up.md']);

const LOG_EXACT_PATHS = new Set(['docs/decisions.md', 'memory/lessons.md']);

const SNAPSHOT_DIR_PREFIXES = [
  'research/',
  'docs/design/',
  'docs/migrations/',
  'Shin_Gemini_Pricing_Engine/',
  'comms/messages/',
];

const DATED_FILENAME_RE = /\d{4}-\d{2}-\d{2}/;

const SKILL_MD_RE = /^\.claude\/skills\/[^/]+\/SKILL\.md$/;
const SKILL_REFERENCES_RE = /^\.claude\/skills\/[^/]+\/references\//;

const TEST_DIR_RE = /(^|\/)(test|tests|__tests__)\//;
const TEST_NAME_RE = /\.(test|spec)\./;

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'mjs', 'cjs', 'py', 'sh', 'ps1', 'swift', 'kt', 'java',
]);

const CONFIG_EXTENSIONS = new Set(['json', 'yaml', 'yml', 'toml', 'plist']);

const LIVE_DOC_EXTENSIONS = new Set(['md', 'txt', 'html']);

function extensionOf(basename) {
  const dot = basename.lastIndexOf('.');
  if (dot <= 0) return ''; // no extension, or a dotfile with no further dot (e.g. ".gitignore")
  return basename.slice(dot + 1).toLowerCase();
}

/**
 * Classify one repo-relative path into exactly one doc class.
 * Order matters: register, constitution, log, status, test, snapshot, then
 * the rest (live-doc, code, config, data). Earlier checks win.
 */
export function classify(path) {
  const basename = path.split('/').pop() ?? path;
  const ext = extensionOf(basename);

  // 1. register — the one root file every other class defers to.
  if (path === 'RULINGS.md') return 'register';

  // 2. constitution — the rules that govern how the repo runs.
  if (path === 'CLAUDE.md' || path === '.claude/CLAUDE.md') return 'constitution';
  if (SKILL_MD_RE.test(path)) return 'constitution';

  // 3. log — history by design, allowed to hold rulings that are no longer
  //    current. Exact paths only: a dated file that merely lives near these
  //    is not exempt.
  if (LOG_EXACT_PATHS.has(path)) return 'log';

  // 4. status — the current-state boards, read instead of the code/docs.
  if (STATUS_EXACT_PATHS.has(path)) return 'status';
  // Root-level only: research/competitors/README.md is a snapshot, not a board.
  if (!path.includes('/') && STATUS_BASENAMES.has(basename)) return 'status';

  // 5. test — excluded from "code" regardless of extension.
  if (TEST_DIR_RE.test(path)) return 'test';
  if (TEST_NAME_RE.test(basename)) return 'test';

  // 6. snapshot — dated by filename, or living in a folder that is a point
  //    in time by convention (research notes, design explorations, migration
  //    write-ups, the pricing engine drop, archived comms, skill reference
  //    material).
  if (DATED_FILENAME_RE.test(basename)) return 'snapshot';
  for (const prefix of SNAPSHOT_DIR_PREFIXES) {
    if (path.startsWith(prefix)) return 'snapshot';
  }
  if (SKILL_REFERENCES_RE.test(path)) return 'snapshot';

  // 7. the rest.
  if (LIVE_DOC_EXTENSIONS.has(ext)) return 'live-doc';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (basename === '.gitignore' || basename === '.gitattributes') return 'config';
  if (basename.endsWith('.env.example')) return 'config';

  return 'data';
}

export default classify;
