#!/usr/bin/env node
// Counts the build tree and checks the numbers the document states about itself.
// Written 2026-09-06 after three miscounts in one day: "three walls" when there were four,
// "nineteen lines opened" when it was sixteen, and "two lines carry no measurement" when nine
// ends did. Every one was caught by a reader rather than by the writer. A number about this
// document is produced by running this, never typed from memory.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/the-tree.md";
const lines = readFileSync(path, "utf8").split("\n");

// The tree is everything between the root and the sections that talk about the tree. Bullets in
// those closing sections are prose, not nodes, and counting them is how the second level was
// overstated by four.
const stop = lines.findIndex((l) => /^## (What can be worked|Proposed|Cut,|What this pass|Checked)/.test(l));
const end = stop === -1 ? lines.length : stop;

const bullets = [];
for (let i = 0; i < end; i++) {
  const m = /^(\s*)- (.*)$/.exec(lines[i]);
  if (!m) continue;
  const indent = m[1].length;
  let text = m[2];
  let j = i + 1;
  while (j < lines.length && lines[j].startsWith(" ".repeat(indent + 2)) && !/^\s*- /.test(lines[j])) {
    text += " " + lines[j].trim();
    j++;
  }
  bullets.push({ indent, text });
  i = j - 1;
}

const at = (n) => bullets.filter((b) => b.indent === n);
const has = (b) => b.text.includes("Shown by") || b.text.includes("Nothing shows this");
const second = at(0), third = at(2), fourth = at(4), fifth = at(6);
const leavesAt = (n) => {
  const out = [];
  for (let i = 0; i < bullets.length; i++) {
    if (bullets[i].indent !== n) continue;
    const next = bullets[i + 1];
    if (!next || next.indent <= n) out.push(bullets[i]);
  }
  return out;
};

const counts = {
  walls: second.filter((b) => b.text.startsWith("**WALL:")).length,
  blocked: second.filter((b) => b.text.startsWith("**BLOCKED OUTSIDE:")).length,
  his: bullets.filter((b) => b.text.startsWith("**HIS:") || b.text.startsWith("HIS:")).length,
  second: second.length,
  third: third.length,
  fourth: fourth.length,
  fifth: fifth.length,
  leavesSecond: leavesAt(0).length,
  leavesThird: leavesAt(2).length,
  leavesFourth: leavesAt(4).length,
  leavesFifth: leavesAt(6).length,
};
counts.leaves = counts.leavesSecond + counts.leavesThird + counts.leavesFourth + counts.leavesFifth;
// A level narrower than the one above it is only correct when the level above it is mostly ends.
// This cannot be judged mechanically, since whether a line is really an end is a reading. So it is
// printed as something to look at, and what actually fails the run is the ends-per-level numbers
// disagreeing with the prose: any shape change that nobody re-read shows up there.
const narrowing = [];
if (counts.fourth < counts.third) narrowing.push(["fourth", counts.leavesThird, counts.third]);
if (counts.fifth < counts.fourth) narrowing.push(["fifth", counts.leavesFourth, counts.fourth]);

// The claims the document makes about itself, as written in its own prose.
const body = lines.join(" ");
const claim = (re) => { const m = re.exec(body); if (!m) return null; const n = Number(m[1]); return Number.isNaN(n) ? null : n; };
const shape = /\*\*(\d+), then (\d+), then (\d+), then (\d+)\*\*/.exec(body);
const claims = [
  ["walls named in the closing note", claim(/ways around the (\w+) walls/), counts.walls,
    { one: 1, two: 2, three: 3, four: 4, five: 5 }],
  ["second level in the stated shape", shape ? Number(shape[1]) : null, counts.second],
  ["third level in the stated shape", shape ? Number(shape[2]) : null, counts.third],
  ["fourth level in the stated shape", shape ? Number(shape[3]) : null, counts.fourth],
  ["fifth level in the stated shape", shape ? Number(shape[4]) : null, counts.fifth],
  ["ends", claim(/\*\*(\d+) ends\*\*/), counts.leaves],
  ["ends at the second level", claim(/(\d+) at the second level/), counts.leavesSecond],
  ["ends at the third level", claim(/(\d+) at the third/), counts.leavesThird],
  ["ends at the fourth level", claim(/(\d+) at the fourth/), counts.leavesFourth],
  ["ends at the fifth level", claim(/(\d+) at the fifth/), counts.leavesFifth],
];

let bad = 0;
console.log(`counted in ${path}`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
console.log("checks");
for (const [name, stated, actual, words] of claims) {
  const said = words && stated === null ? words[/ways around the (\w+) walls/.exec(body)?.[1]] : stated;
  const ok = said === actual;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "WRONG"} ${name}: document says ${said ?? "nothing"}, file has ${actual}`);
}
for (const [level, ends, total] of narrowing) {
  console.log(`  look  the ${level} level is narrower than the one above it; that is correct only `
    + `because ${ends} of those ${total} lines are ends. Read a sample and check they really are.`);
}
process.exit(bad === 0 ? 0 : 1);
