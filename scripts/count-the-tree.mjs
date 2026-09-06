#!/usr/bin/env node
// Counts the build tree and checks the numbers the document states about itself.
// Written 2026-09-06 after three miscounts in one day: "three walls" when there were four,
// "nineteen lines opened" when it was sixteen, and "two lines carry no measurement" when nine
// ends did. Every one was caught by a reader rather than by the writer. A number about this
// document is produced by running this, never typed from memory.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/the-tree.md";
const lines = readFileSync(path, "utf8").split("\n");

const bullets = [];
for (let i = 0; i < lines.length; i++) {
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
const second = at(0), third = at(2), fourth = at(4);

const counts = {
  walls: second.filter((b) => b.text.startsWith("**WALL:")).length,
  blocked: second.filter((b) => b.text.startsWith("**BLOCKED OUTSIDE:")).length,
  his: bullets.filter((b) => b.text.startsWith("**HIS:") || b.text.startsWith("HIS:")).length,
  second: second.length,
  third: third.length,
  fourth: fourth.length,
  thirdOpened: third.filter((b) => !has(b)).length,
  fourthWithout: fourth.filter((b) => !has(b)).length,
};

// The claims the document makes about itself, as written in its own prose.
const body = lines.join(" ");
const claim = (re) => { const m = re.exec(body); if (!m) return null; const n = Number(m[1]); return Number.isNaN(n) ? null : n; };
const claims = [
  ["walls named in the closing note", claim(/ways around the (\w+) walls/), counts.walls,
    { one: 1, two: 2, three: 3, four: 4, five: 5 }],
  ["third-level lines", claim(/Of (\d+) third-level lines/), counts.third],
  ["lines opened", claim(/(\d+) could not name one/), counts.thirdOpened],
  ["fourth-level lines", claim(/fourth level of (\d+)\s*\n?\s*lines/), counts.fourth],
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
if (counts.fourthWithout > 0) {
  bad++;
  console.log(`  WRONG ${counts.fourthWithout} fourth-level lines carry no measurement`);
}
process.exit(bad === 0 ? 0 : 1);
