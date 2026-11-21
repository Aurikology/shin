// Mechanical evidence for the 93 register items (job: register). Read-only. Run: node register-evidence.mjs > evidence.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "C:/shin";
const RD = path.join(ROOT, "docs/readiness");
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", maxBuffer: 64e6 });
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

const items = read(path.join(RD, "register.jsonl")).trim().split("\n").map((l) => JSON.parse(l));

// commits since the register, with full message and files
const raw = git("log", "--since=2026-11-18", "--format=@@%h%x09%s%n%b%x09END", "--name-only");
const commits = [];
for (const block of raw.split("@@").slice(1)) {
  const [head, ...rest] = block.split("\n");
  const [hash, subj] = head.split("\t");
  const body = rest.join("\n");
  const files = body.split("\n").filter((l) => /^[\w.\-\/]+\.\w+$/.test(l.trim()) && !l.includes("END"));
  commits.push({ hash, subj, text: head + "\n" + body, files });
}

const docs = {
  needsJamin: read(path.join(RD, "needs-jamin.md")),
  fixBrief: read(path.join(RD, "FIX-BRIEF.md")),
  drills: read(path.join(RD, "DRILLS.md")),
  runbook: read(path.join(RD, "RUNBOOK.md")),
  handover: read(path.join(RD, "HANDOVER.md")),
  templates: read(path.join(RD, "TEMPLATES.md")),
  rulings: read(path.join(ROOT, "RULINGS.md")),
};

const drillSecs = docs.drills.split(/^## /m).slice(1).map((s) => ({
  title: s.split("\n")[0],
  covers: ((s.match(/Covers ([^.]*)\./) || [])[1] || ""),
}));
const drillLog = [...docs.drills.matchAll(/^\| (\d+) [^|]*\| ([^|]*) \|/gm)].map((m) => [m[1], m[2].trim()]);

const pathRe = /(?:[\w.\-]+\/)+[\w.\-]+\.(?:mjs|js|ts|sh|md|json|yml|yaml|html|plist|env|swift|jsonl)\b/g;
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const out = [];
for (const it of items) {
  const n = it.id;
  const re = new RegExp("\\b" + n + "\\b");
  const cs = commits.filter((c) => re.test(c.text));
  const rbMatch = docs.runbook.match(new RegExp("\\*\\*" + n + " [\\s\\S]*?(?=\\n\\*\\*R\\d\\d |\\n# |$)"));
  const rb = rbMatch ? rbMatch[0] : "";
  const rbFind = (rb.match(/- Find out: ([^\n]*)/) || [])[1] || "";
  const rbWho = (rb.match(/- Who: ([^\n]*)/) || [])[1] || "";
  const cand = new Set([...(it.smallest_fix + " " + rb).matchAll(pathRe)].map((m) => m[0]));
  for (const c of cs) for (const f of c.files) cand.add(f);
  const present = [], missing = [];
  for (const p of cand) (exists(p) ? present : missing).push(p);
  const where = (d) => docs[d].split("\n").filter((l) => re.test(l)).length;
  const rulingLines = docs.rulings.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => i + ":" + l.slice(0, 90));
  const drills = drillSecs.filter((d) => re.test(d.covers)).map((d) => d.title.slice(0, 30));
  out.push({
    id: n, tier: it.tier, state0: it.state, slug: it.slug,
    commits: cs.map((c) => c.hash + " " + c.subj.slice(0, 70)),
    present: present.slice(0, 14), missing,
    runbook: !!rb, rbFind: rbFind.slice(0, 160), rbWho: rbWho.slice(0, 80),
    needsJaminLines: where("needsJamin"), fixBriefLines: where("fixBrief"), handoverLines: where("handover"), templatesLines: where("templates"),
    drills, rulings: rulingLines.slice(0, 3),
  });
}
fs.writeFileSync(path.join(RD, "review-2026-11-21/register-evidence.json"), JSON.stringify({ drillLog, out }, null, 1));
// compact print
console.log("drill log", JSON.stringify(drillLog));
for (const o of out) {
  console.log(`${o.id} t${o.tier} ${o.slug} | commits:${o.commits.map((c) => c.split(" ")[0]).join(",") || "-"} | files ok:${o.present.length} MISSING:${o.missing.join(",") || "-"} | rb:${o.runbook ? "y" : "n"} nj:${o.needsJaminLines} hov:${o.handoverLines} tpl:${o.templatesLines} drills:${o.drills.map((d) => d.split(" ")[0]).join(",") || "-"} | rulings:${o.rulings.length}`);
}
