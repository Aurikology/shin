/**
 * Turns a CheckRun into report.md (for a person) and findings.jsonl (for a machine). Pure: no file is
 * touched here, run.mts writes the two strings.
 */
import type { CheckRun, Example, RuleResult } from './rules.mts';

function pct(share: number): string {
  if (share === 0) return '0%';
  const p = share * 100;
  return p < 0.01 ? '<0.01%' : `${p.toFixed(2)}%`;
}

function n(v: number): string {
  return v.toLocaleString('en-US');
}

function cell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}

function exampleTable(examples: readonly Example[]): string[] {
  if (examples.length === 0) return ['_none_', ''];
  const out = ['| code | seller | price | seen | why |', '| --- | --- | --- | --- | --- |'];
  for (const e of examples) {
    const price = Number.isFinite(e.priceCents) ? `$${(e.priceCents / 100).toFixed(2)}` : String(e.priceCents);
    out.push(`| ${cell(e.code ?? '(none)')} | ${cell(e.seller)} | ${price} | ${cell(e.seenOn.slice(0, 10))} | ${cell(e.why)} |`);
  }
  out.push('');
  return out;
}

function section(r: RuleResult): string[] {
  const out: string[] = [`## ${r.id}. ${r.title}`, ''];
  out.push(`Count **${n(r.count)}** of ${n(r.total)} rows (${pct(r.share)}). Used by verdicts: **${r.usedByVerdicts}**.`, '');
  out.push('Why it is used or not (from the code):');
  for (const w of r.usedWhy) out.push(`- ${w}`);
  out.push('');
  for (const note of r.notes) out.push(`Note: ${note}`);
  if (r.notes.length > 0) out.push('');
  out.push('| class | rows | share | counted |', '| --- | ---: | ---: | --- |');
  for (const b of r.buckets) out.push(`| ${cell(b.label)}${b.severity === 'high' ? ' **(high)**' : ''} | ${n(b.count)} | ${pct(r.total === 0 ? 0 : b.count / r.total)} | ${b.headline ? 'yes' : 'context'} |`);
  out.push('');
  for (const b of r.buckets) {
    if (b.count === 0) continue;
    out.push(`### ${r.id} ${b.id}: ${b.label}`, '');
    out.push(...exampleTable(b.examples));
  }
  return out;
}

export function renderReport(run: CheckRun, meta: { prices: string; catalogue: string | null }): string {
  const out: string[] = ['# Pexi data checks', ''];
  out.push(`- Prices file: \`${meta.prices}\` (opened read-only), ${n(run.totalRows)} rows`);
  out.push(`- Catalogue: ${meta.catalogue ? `\`${meta.catalogue}\` (opened read-only)` : 'none given, so D8 did not run and D3 cannot split by size'}`);
  out.push(`- Priced as of: ${run.asOf}`);
  out.push('- The counts are the result. A rule being non-zero does not fail the run; D5 (impossible values) does.', '');
  if (run.errors.length > 0) {
    out.push('## RULES THAT THREW (the run fails)', '');
    for (const e of run.errors) out.push(`- ${e.rule}: ${e.error}`);
    out.push('');
  }
  out.push('| rule | what | rows | share | used by verdicts |', '| --- | --- | ---: | ---: | --- |');
  for (const r of run.rules) out.push(`| ${r.id} | ${cell(r.title)} | ${n(r.count)} | ${pct(r.share)} | ${r.usedByVerdicts} |`);
  out.push('');
  out.push('Used-by-verdicts is read from the code, cited per rule below. Line numbers are as of the lane commit this was written on.', '');
  for (const r of run.rules) out.push(...section(r));
  return `${out.join('\n')}\n`;
}

export function renderFindings(run: CheckRun): string {
  const lines: string[] = [];
  for (const e of run.errors) lines.push(JSON.stringify({ rule: e.rule, error: e.error }));
  for (const r of run.rules) {
    for (const b of r.buckets) {
      lines.push(
        JSON.stringify({
          rule: r.id,
          title: r.title,
          bucket: b.id,
          label: b.label,
          headline: b.headline,
          severity: b.severity,
          count: b.count,
          total: run.totalRows,
          share: run.totalRows === 0 ? 0 : b.count / run.totalRows,
          usedByVerdicts: r.usedByVerdicts,
          examples: b.examples,
        }),
      );
    }
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}
