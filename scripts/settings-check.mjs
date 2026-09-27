// Checks for settings/src/index.ts, the one module every setting Shin's live
// code reads lives in (CLAUDE.md, "some code is dependent on certain
// decisions... this creates a lot of piled up garbage"). Parsed as text, not
// imported: a repo check must run under plain `node`, and importing a .ts
// module needs nothing extra on this Node build, but a check that stays text
// -only never depends on that staying true.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** One row of the settings module's `SETTINGS` table. */
export function parseSettingsKeys(moduleText) {
  const keys = [];
  const re = /\{\s*env:\s*'([A-Z0-9_]+)'[^}]*?ruling:\s*(?:'([^']*)'|"([^"]*)")[^}]*?(secret:\s*true)?[^}]*?\}/g;
  let m;
  while ((m = re.exec(moduleText))) {
    keys.push({ env: m[1], ruling: m[2] ?? m[3], secret: Boolean(m[4]) });
  }
  return keys;
}

/** Every `### ` heading in RULINGS.md, its title text only. */
export function parseRulingTitles(rulingsText) {
  const titles = new Set();
  for (const line of rulingsText.split(/\r?\n/)) {
    if (line.startsWith('### ')) titles.add(line.slice(4).trim());
  }
  return titles;
}

/** Every `SHIN_[A-Z0-9_]+` name that appears on a `Governs:` line in RULINGS.md. */
export function parseGovernsShinNames(rulingsText) {
  const names = new Set();
  for (const line of rulingsText.split(/\r?\n/)) {
    if (!line.startsWith('Governs:')) continue;
    for (const match of line.matchAll(/\bSHIN_[A-Z0-9_]+\b/g)) names.add(match[0]);
  }
  return names;
}

/**
 * Every `.ts`/`.mjs`/`.js` file under `dirs` (relative to `root`), skipping
 * `node_modules`, any path segment `test` or `eval`, and any path in `skip`
 * (repo-relative, forward slashes).
 */
export function liveFiles(root, dirs, skip) {
  const skipSet = new Set(skip);
  const out = [];
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      if (name === 'node_modules') continue;
      const childAbs = join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(childAbs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'test' || name === 'eval') continue;
        walk(childAbs, childRel);
      } else if (/\.(ts|mjs|js)$/.test(name)) {
        if (skipSet.has(childRel)) continue;
        out.push(childRel);
      }
    }
  };
  for (const dir of dirs) {
    const abs = join(root, dir);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue; // not present; nothing to walk
    }
    if (st.isDirectory()) {
      walk(abs, dir);
    } else if (!skipSet.has(dir)) {
      out.push(dir); // a bare file entry (e.g. 'app/server.ts')
    }
  }
  return out.map((p) => p.split(sep).join('/'));
}

/** Every `process.env.NAME` occurrence: {path, line, name}. */
export function findNamedProcessEnvReads(root, files) {
  const hits = [];
  for (const path of files) {
    let text;
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const re = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
      let m;
      while ((m = re.exec(lines[i]))) {
        hits.push({ path, line: i + 1, name: m[1] });
      }
    }
  }
  return hits;
}
