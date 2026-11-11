/**
 * The words of a crawl: report.md and failures.jsonl. The first line of report.md is the verdict in one
 * breath (runs, steps, distinct failures, coverage), and says so up front when coverage is too low
 * for a clean result to mean anything.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeStep } from './world.mjs';

/** Below this share of lines, "no failures" is not evidence the app works. */
export const LOW_COVERAGE_LINES = 60;

const pct = (a, b) => (b === 0 ? 0 : (100 * a) / b);
const f1 = (n) => n.toFixed(1);

/** The screens the app registers (main.js) and the camera's states (camera.js), read from source. */
export function appInventory() {
  const main = readFileSync(fileURLToPath(new URL('../../../app/public/js/main.js', import.meta.url)), 'utf8');
  const cam = readFileSync(fileURLToPath(new URL('../../../app/public/js/screens/camera.js', import.meta.url)), 'utf8');
  const list = /for \(const s of \[([^\]]+)\]\)/.exec(main)?.[1] ?? '';
  const screens = list.split(',').map((s) => s.trim()).filter(Boolean);
  const states = new Set(['idle']);
  for (const m of cam.matchAll(/setState\('(\w+)'\)/g)) states.add(m[1]);
  return { screens, cameraStates: [...states] };
}

export function buildSummaryLine({ runs, stepsTaken, failures, cov, expectedTotal = 0 }) {
  const high = failures.filter((f) => f.severity === 'high').length;
  const low = failures.length - high;
  const lp = pct(cov.lines[0], cov.lines[1]);
  const fp = pct(cov.fns[0], cov.fns[1]);
  let line = `Crawl: ${runs} runs, ${stepsTaken} steps, ${failures.length} distinct failures (${high} high, ${low} low; ${expectedTotal} expected signals not counted), coverage ${f1(lp)}% of lines and ${f1(fp)}% of functions.`;
  if (lp < LOW_COVERAGE_LINES) {
    line += failures.length === 0
      ? ' LOW COVERAGE: this clean result covers little of the app and proves little.'
      : ' LOW COVERAGE: the crawl saw only part of the app, so more failures are likely unseen.';
  }
  return line;
}

export function buildReport(r) {
  const { opts, failures, cov, reached, inventory, timing, mix, gaps, strays, notes } = r;
  const out = [];
  out.push(buildSummaryLine({ runs: r.runs, stepsTaken: r.stepsTaken, failures, cov, expectedTotal: (r.expected ?? []).reduce((a, e) => a + e.count, 0) }));
  out.push('');
  out.push(`Seed ${opts.seed}; ${opts.steps} steps per run at most; ${opts.workers === 0 ? 'in one process' : `${opts.workers} worker processes`}; faults, flags, language, clock and consent drawn per run from the seed.`);
  out.push(`Speed: ${f1(timing.runsPerMin)} runs/minute, ${f1(timing.stepsPerSec)} steps/second (${f1(timing.runPhaseSec)} s on runs, ${f1(timing.shrinkPhaseSec)} s shrinking, ${timing.launches} app launches).`);
  out.push('');
  out.push('## Failures');
  out.push('');
  if (failures.length === 0) { out.push('None found.'); out.push(''); }
  for (const f of failures) {
    out.push(`### ${f.severity.toUpperCase()} x${f.count}: ${f.rule} on ${f.screen}`);
    out.push(`${f.message}`);
    out.push(`Seed ${f.seed}, found at step ${f.foundAt}; ${f.reproduced ? `shrunk ${f.originalSteps} to ${f.minimal.length} step${f.minimal.length === 1 ? '' : 's'} in ${f.replays} replays${f.exhausted ? ' (budget spent, not proven minimal)' : ''}` : (f.shrunk === false ? 'not shrunk (shrink budget spent)' : 'did not reproduce on replay (timing-dependent); the list is the original')}.`);
    out.push(`Start: ${describeStart(f.start)}`);
    out.push('');
    if (f.minimal.length === 0) out.push('1. (fails on launch, before any tap)');
    f.minimal.forEach((s, i) => out.push(`${i + 1}. ${describeStep(s)}`));
    out.push('');
  }
  out.push('## Expected signals (counted, not failures)');
  out.push('');
  out.push('Deliberate loud logs the app sends on purpose, listed with their file and line in scripts/crawler/lib/expected.mjs. Runs in which each was seen:');
  out.push('');
  if (!r.expected?.length) out.push('None seen.');
  for (const e of r.expected ?? []) out.push(`- ${e.count} x ${e.what}`);
  out.push('');
  out.push('## Coverage');
  out.push('');
  out.push(`Lines ${cov.lines[0]}/${cov.lines[1]} (${f1(pct(...cov.lines))}%), functions ${cov.fns[0]}/${cov.fns[1]} (${f1(pct(...cov.fns))}%), V8 precise coverage over app/public/js, merged across every launch.`);
  out.push('');
  out.push('| file | lines | % | functions | % |');
  out.push('|---|---|---|---|---|');
  const files = [...cov.files].sort((a, b) => (b.lines[1] - b.lines[0]) - (a.lines[1] - a.lines[0]));
  for (const x of files.slice(0, 25)) {
    out.push(`| ${x.file}${x.loaded ? '' : ' (never loaded)'} | ${x.lines[0]}/${x.lines[1]} | ${f1(pct(...x.lines))} | ${x.fns[0]}/${x.fns[1]} | ${f1(pct(...x.fns))} |`);
  }
  if (files.length > 25) out.push(`| ... ${files.length - 25} more files, full list in coverage.json | | | | |`);
  out.push('');
  out.push('## Screens');
  out.push('');
  const missing = inventory.screens.filter((s) => !reached.screens.includes(s));
  out.push(`Reached ${reached.screens.filter((s) => inventory.screens.includes(s)).length} of ${inventory.screens.length} screens: ${reached.screens.filter((s) => inventory.screens.includes(s)).join(', ') || 'none'}.`);
  out.push(`Never reached: ${missing.join(', ') || 'none'}.`);
  const camStates = inventory.cameraStates;
  const seenCam = camStates.filter((s) => reached.states.includes(`camera/${s}`));
  out.push(`Camera states reached: ${seenCam.join(', ') || 'none'}; never reached: ${camStates.filter((s) => !seenCam.includes(s)).join(', ') || 'none'}.`);
  out.push(`Distinct (screen, state) pairs seen: ${reached.states.length}.`);
  out.push('');
  out.push('## Start-state mix');
  out.push('');
  out.push(Object.entries(mix).map(([k, v]) => `${k}: ${v}`).join('; '));
  out.push('');
  if (gaps.length) {
    out.push('## Crawler gaps');
    out.push('');
    out.push(`The app asked for real server routes the crawler's table does not answer (they got a 404): ${gaps.join(', ')}.`);
    out.push('');
  }
  if (notes.length) { out.push('## Notes'); out.push(''); for (const n of notes) out.push(`- ${n}`); out.push(''); }
  if (strays) out.push(`Late callbacks swallowed between runs (answers arriving after their screen was gone): ${strays}.`);
  return `${out.join('\n')}\n`;
}

function describeStart(s) {
  const flagsOn = Object.entries(s.flags).filter(([, v]) => v).map(([k]) => k);
  const faults = s.faults.length ? s.faults.map((f) => `${f.kind} on ${f.path ?? 'any route'} at ${Math.round(f.rate * 100)}%`).join(', ') : 'none';
  return `${s.first ? 'first launch' : 'returning'}, consent photos ${s.consent.photos ? 'yes' : 'no'} / location ${s.consent.location ? 'yes' : 'no'}, ${s.plus ? 'Plus' : 'free'}, ${s.lang === 'fr' ? 'French' : 'English'}, clock +${s.clockDays} days, opened on ${s.search || 'the default screen'}, flags on [${flagsOn.join(', ')}], faults: ${faults}${s.packRead ? ', pack read on' : ''}${s.dev ? ', developer mode on' : ''}.`;
}

export function buildJsonl(failures) {
  return failures.map((f) => JSON.stringify({
    signature: f.sig, rule: f.rule, severity: f.severity, screen: f.screen, message: f.message,
    count: f.count, seed: f.seed, start: f.start, steps: f.minimal, stepsText: f.minimal.map(describeStep),
    foundAtStep: f.foundAt, originalSteps: f.originalSteps, reproduced: f.reproduced, replays: f.replays,
  })).join('\n') + (failures.length ? '\n' : '');
}
