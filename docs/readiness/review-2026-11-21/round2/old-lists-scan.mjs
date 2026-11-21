// Parses DEFECTS.md rows and QUEUE.md items; prints only those not closed/fixed/done/dropped.
import fs from 'fs';
const root = 'C:/shin/';
const d = fs.readFileSync(root + 'DEFECTS.md', 'utf8').split('\n').filter(l => l.startsWith('| D-'));
const closedRe = /(\bclosed\b|\bfixed\b|\bdone\b|\bdropped\b|\bresolved\b|\bmoot\b|\bsuperseded\b|\bwithdrawn\b|\bshipped\b|\bbuilt\b)/i;
let open = [], total = 0;
const hist = {};
let tail = '';
for (const l of d) {
  const m = l.match(/^\| (D-\d+) \| (\S+) \| (.*?) \| (.*?) \| (.*) \|\s*$/);
  if (!m) { console.log('UNPARSED', l.slice(0, 80)); continue; }
  total++;
  const [, id, date, what, by, state] = m;
  const first = state.replace(/\*\*/g, '').trim().split(/[ .,:;(]/)[0].toLowerCase();
  hist[first] = (hist[first] || 0) + 1;
  const lastMark = first;
  const clean = state.replace(/\*\*/g, '');
  const closeIdx = Math.max(...[...clean.matchAll(/\b(Closed|Fixed|Done|Moot)\b[^.]{0,12}20\d\d/g)].map(x => x.index), -1);
  const openIdx = Math.max(...[...clean.matchAll(/\b(still open|Open\b|not fixed|Mac open)/g)].map(x => x.index), -1);
  const laterClosed = closeIdx > openIdx && first !== 'partly';
  tail = clean.slice(-170);
  const isOpen = !['closed', 'fixed', 'done', 'dropped', 'moot', 'superseded', 'withdrawn'].includes(first) && !(first !== 'open' && first !== 'partly' && first !== 'reopened' && closedRe.test(state) && !/\bopen\b/i.test(state.slice(0, 60)));
  if (isOpen && !laterClosed) open.push({ id, date, lastMark, what: what.replace(/\*\*/g, '').slice(0, 130), state: tail });
}
console.log('first-word histogram', JSON.stringify(hist));
console.log(`DEFECTS: ${total} rows parsed, ${open.length} not closed`);
if (process.argv[2] !== 'q') for (const o of open) console.log(`${o.id} ${o.date} [${o.lastMark}] ${o.what} || ${o.state}`);
const q = fs.readFileSync(root + 'QUEUE.md', 'utf8').split('\n');
let qrows = 0, qopen = [];
for (const l of q) {
  const m = l.match(/^\| \*\*([\d.]+[A-Za-z]?)\s*(.*?)\*\*(.*?)\| (.*?) \|/);
  if (!m) continue;
  qrows++;
  const st = m[4];
  if (/built|killed|parked|dropped|done/i.test(st) && !/queued/i.test(st)) continue;
  qopen.push(`${m[1]} [${st.slice(0, 40)}] ${(m[2] + m[3]).slice(0, 130)}`);
}
console.log(`QUEUE: ${qrows} item rows, ${qopen.length} queued/other`);
if (process.argv[2] !== 'q') for (const o of qopen) console.log(o);
