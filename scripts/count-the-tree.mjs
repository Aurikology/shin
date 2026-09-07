#!/usr/bin/env node
// Counts the build tree and checks the numbers the document states about itself.
// Written 2026-09-06 after three miscounts in one day: "three walls" when there were four,
// "nineteen lines opened" when it was sixteen, and "two lines carry no measurement" when nine
// ends did. Every one was caught by a reader rather than by the writer. A number about this
// document is produced by running this, never typed from memory.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/the-tree.md";
// Split on either ending: a Windows checkout leaves a carriage return on every line, which the
// bullet pattern below cannot match, and the whole file then counts as zero nodes while the
// checks report all ten stated numbers as wrong. Found 2026-09-06 on a Windows clone.
const lines = readFileSync(path, "utf8").split(/\r?\n/);

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
const second = at(0), third = at(2), fourth = at(4), fifth = at(6), sixth = at(8);
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
  // A standing rule is enforced from now on rather than built once, so it can sit at any depth,
  // unlike a wall. Counted 2026-09-06, after four passes each marked one in its own branch and
  // the prose went on saying there were four when the file held more.
  standing: bullets.filter((b) => /^\*\*STANDING RULE:/.test(b.text)).length,
  second: second.length,
  third: third.length,
  fourth: fourth.length,
  fifth: fifth.length,
  sixth: sixth.length,
  leavesSecond: leavesAt(0).length,
  leavesThird: leavesAt(2).length,
  leavesFourth: leavesAt(4).length,
  leavesFifth: leavesAt(6).length,
  leavesSixth: leavesAt(8).length,
};
counts.leaves = counts.leavesSecond + counts.leavesThird + counts.leavesFourth
  + counts.leavesFifth + counts.leavesSixth;

// The dimension review, counted rather than counted by hand. Seven slots sit on every second-level
// node. The rules name eight dimensions, but one of them, what happens behind the glass, is the
// node's own children rather than a note, so it is never a slot; that is why the slots per node are
// seven. Written 2026-09-06 because two passes counted this by hand and disagreed with each other,
// and because "372 of 686 were silent" is the kind of number that rots the moment anybody edits.
const SLOTS = [
  ["what the person sees and does", /what the person (sees|does)/i],
  ["how it looks and sounds", /how it (looks|sounds)/i],
  ["what it costs and earns", /what it (costs|earns)/i],
  ["what we are allowed to do", /what we are allowed/i],
  ["who runs it when it breaks", /who runs it/i],
  ["what it feeds back", /what it feeds back/i],
  ["how it reaches people", /how it (reaches people|gets shown)/i],
];
const reviewed = [];
{
  let node = null, inNote = false;
  for (let i = 0; i < end; i++) {
    const l = lines[i];
    if (/^- /.test(l)) { node = { notes: [] }; reviewed.push(node); inNote = false; continue; }
    const d = /^\s*·\s*(.*)$/.exec(l);
    if (d) { if (node) { node.notes.push(d[1]); inNote = true; } continue; }
    if (/^\s*-\s/.test(l) || l.trim() === "") { inNote = false; continue; }
    if (inNote && node) node.notes[node.notes.length - 1] += " " + l.trim();
  }
}
// A note says which slot it fills in its own bold label. The older "does not apply" notes name the
// dimensions in their body instead, so for those the body is what gets read.
const slotText = (note) => {
  const m = /^\*\*(.+?):\*\*(.*)$/.exec(note);
  if (!m) return note;
  return /does not apply/i.test(m[1]) ? m[2] : m[1];
};
let silent = 0;
const silentBySlot = SLOTS.map(() => 0);
for (const node of reviewed) {
  const texts = node.notes.map(slotText);
  SLOTS.forEach(([, re], k) => {
    if (!texts.some((t) => re.test(t))) { silent++; silentBySlot[k]++; }
  });
}
// An end either carries the measurement that will show it worked, or it is one of the kinds that
// is not work at all and says which. Anything else is an end nobody could ever check. Added
// 2026-09-06: the prose had been counting these by hand and was one out before this pass began.
const allLeaves = [].concat(leavesAt(0), leavesAt(2), leavesAt(4), leavesAt(6), leavesAt(8));
const notWork = /^\*\*(HIS|BLOCKED OUTSIDE|WALL|STANDING RULE):/;
// A pointer at work built elsewhere carries no measurement of its own, on purpose, because the
// measurement lives with the build. It is told apart from an end that simply forgot one by the
// "waits on" tag rule 9 already requires. Both are listed, since a work line that hides behind a
// pointer tag would otherwise never be caught.
const pointsElsewhere = (l) => /\[waits on:/.test(l.text);
const unshown = allLeaves.filter((l) => !has(l) && !notWork.test(l.text) && !pointsElsewhere(l));
const pointers = allLeaves.filter((l) => !has(l) && !notWork.test(l.text) && pointsElsewhere(l));
counts.endsThatAreNotWork = allLeaves.filter((l) => notWork.test(l.text)).length;
for (const kind of ["HIS", "BLOCKED OUTSIDE", "WALL", "STANDING RULE"]) {
  const re = new RegExp("^\\*\\*" + kind + ":");
  counts[`ends${kind.replace(/[^A-Z]/g, "")}`] = allLeaves.filter((l) => re.test(l.text)).length;
}
counts.endsThatArePointers = pointers.length;
counts.endsWithNothingToShow = unshown.length;
// A figure that cannot move is worse than no figure, because a line naming one looks finished.
// The front matter split this one on 2026-09-06 and the split was declared done while 124 lines
// still carried the flat version; a fresh reader found it. Counted from here on, and it fails.
// Count on the text with its line breaks flattened, not line by line. The figure is four words
// long and the file wraps at 96 columns, so eight of them sat across a line break and a per-line
// test read the file as clean while they were still there. Found 2026-09-07.
counts.flatFigure = (lines.slice(0, end).join(" ").replace(/\s+/g, " ")
  .match(/answer rate per kind/gi) || []).length;
// A dimension waved away with no reason is silence wearing a label. The old style put "Does not
// apply" in the label itself, which leaves the body holding a list of dimension names and nowhere
// for the reason to go; the notes written that way are the ones a fresh reader found bare. The
// style that works names the dimension in the label and says in the body that it does not apply,
// and why, so the reason has a place to sit.
const bareDismissals = [];
for (const node of reviewed) {
  for (const n of node.notes) {
    if (!/^\*\*Does not apply:\*\*/.test(n)) continue;
    // Two styles say this. One names the dimensions and then gives the reason, in brackets or
    // after a "since"; that is fine. The other names the dimensions and stops, which is silence
    // with a label on it, and is the only one this fails.
    if (!/[(]|since|because/i.test(n.replace("**Does not apply:**", ""))) bareDismissals.push(n);
  }
}
counts.dimensionsWavedAwayWithNoReason = bareDismissals.length;
// A citation bracket that lost the asterisk closing its italic swallows the rest of the line into
// the emphasis, so the line reads as italic prose in any viewer and the "shown by" clause stops
// looking like one. 27 lines were shipped that way in the last round and nobody saw them, because
// the raw text still reads correctly. Counted from here on, and it fails.
counts.brokenCitationClose = lines.slice(0, end)
  .filter((l) => /\)\*\*Shown/.test(l)).length;
// A pointer that names a line which does not exist is worse than a duplicate build, because the
// reader goes looking and finds nothing, and the thing pointed at may never have been built at
// all. Three of them were shipped in the last round, each naming a real node in words the node
// itself does not use. A wall is allowed its shorthand, since the walls are named in the closing
// note. Everything else must appear somewhere outside a pointer bracket. Found 2026-09-07.
const flat = lines.slice(0, end).join(" ").replace(/\s+/g, " ");
const plain = flat.replace(/\*/g, "").toLowerCase();
const pointerTargets = new Set();
for (const m of flat.matchAll(/\[waits on: ([^\]]*)\]/g)) {
  for (const part of m[1].split(";")) {
    const t = part.trim().split(/, (?:since|which|for|and per) /)[0].trim();
    if (t) pointerTargets.add(t);
  }
}
const dangling = [];
for (const t of pointerTargets) {
  if (/\bwall$/i.test(t)) continue;
  const k = t.replace(/\*/g, "").toLowerCase();
  const all = plain.split(k).length - 1;
  const insideBrackets = (plain.match(new RegExp("\\[waits on:[^\\]]*" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  if (all - insideBrackets < 1) dangling.push(t);
}
counts.pointersNamingNoLine = dangling.length;
if (dangling.length) counts.danglingPointers = dangling.join(" | ");
counts.dimensionNodes = reviewed.length;
counts.dimensionSlots = reviewed.length * SLOTS.length;
counts.dimensionSilent = silent;
// A level narrower than the one above it is only correct when the level above it is mostly ends.
// This cannot be judged mechanically, since whether a line is really an end is a reading. So it is
// printed as something to look at, and what actually fails the run is the ends-per-level numbers
// disagreeing with the prose: any shape change that nobody re-read shows up there.
const narrowing = [];
if (counts.fourth < counts.third) narrowing.push(["fourth", counts.leavesThird, counts.third]);
if (counts.fifth < counts.fourth) narrowing.push(["fifth", counts.leavesFourth, counts.fourth]);
if (counts.sixth && counts.sixth < counts.fifth) narrowing.push(["sixth", counts.leavesFifth, counts.fifth]);

// The claims the document makes about itself, as written in its own prose.
const body = lines.join(" ");
const claim = (re) => { const m = re.exec(body); if (!m) return null; const n = Number(m[1]); return Number.isNaN(n) ? null : n; };
// A sixth level is allowed but not wanted, so the stated shape carries a fifth number only when
// the file actually has one. Added 2026-09-06, when one branch needed a sixth level in one place.
const shape = /\*\*(\d+), then (\d+), then (\d+), then (\d+)(?:, then (\d+))?\*\*/.exec(body);
const claims = [
  ["walls named in the closing note", claim(/ways around the (\w+) walls/), counts.walls,
    { one: 1, two: 2, three: 3, four: 4, five: 5 }],
  ["second level in the stated shape", shape ? Number(shape[1]) : null, counts.second],
  ["third level in the stated shape", shape ? Number(shape[2]) : null, counts.third],
  ["fourth level in the stated shape", shape ? Number(shape[3]) : null, counts.fourth],
  ["fifth level in the stated shape", shape ? Number(shape[4]) : null, counts.fifth],
  ["sixth level in the stated shape", shape && shape[5] !== undefined ? Number(shape[5]) : (counts.sixth ? null : 0), counts.sixth],
  ["ends", claim(/\*\*(\d+) ends\*\*/), counts.leaves],
  ["ends at the second level", claim(/(\d+) at the second level/), counts.leavesSecond],
  ["ends at the third level", claim(/(\d+) at the third/), counts.leavesThird],
  ["ends at the fourth level", claim(/(\d+) at the fourth/), counts.leavesFourth],
  ["ends at the fifth level", claim(/(\d+) at the fifth/), counts.leavesFifth],
  ["ends at the sixth level", claim(/(\d+) at the sixth/) ?? (counts.leavesSixth ? null : 0), counts.leavesSixth],
  ["lines still naming the figure that cannot move", 0, counts.flatFigure],
  ["dimensions waved away with no reason", 0, counts.dimensionsWavedAwayWithNoReason],
  ["citation brackets that swallow the rest of their line", 0, counts.brokenCitationClose],
  ["pointers naming a line that does not exist", 0, counts.pointersNamingNoLine],
  ["dimension slots in total", claim(/\d+ of (\d+) dimension slots/), counts.dimensionSlots],
  ["dimension slots left silent", claim(/(\d+) of \d+ dimension slots/), counts.dimensionSilent],
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
if (counts.endsWithNothingToShow) {
  console.log(`  look  ${counts.endsWithNothingToShow} ends name nothing that would show they `
    + `worked and are not one of the kinds that is not work. The first few:`);
  for (const l of unshown.slice(0, 6)) console.log(`          ${l.text.slice(0, 96)}`);
}
if (counts.dimensionSilent) {
  const worst = SLOTS.map(([name], k) => [name, silentBySlot[k]])
    .filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, n]) => `${name} (${n})`).join(", ");
  console.log(`  look  the review is silent in ${counts.dimensionSilent} of `
    + `${counts.dimensionSlots} slots. Most often: ${worst}.`);
}
for (const [level, ends, total] of narrowing) {
  console.log(`  look  the ${level} level is narrower than the one above it; that is correct only `
    + `because ${ends} of those ${total} lines are ends. Read a sample and check they really are.`);
}
process.exit(bad === 0 ? 0 : 1);
