// mac/deploy/lib.mjs
//
// Pure logic for the Mac deploy pipeline: parsing the shared Notion page's
// "Mac server" section, the request/queue/hold/pin/mode state machine, the
// desired rendering of the section, and the line diff that turns "what the
// page says" plus "what it should say" into small exact-text edits.
// No I/O here, so every rule is unit-testable (mac/deploy/test/).

export const MIN = 60e3;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const CHECK_INTERVAL = 30e3;
/** The status line's "last check" is rewritten at most this often when nothing else in it changed. */
export const STATUS_REFRESH = 5 * MIN;
/** Consecutive checks answered 401/403/object_not_found before the key counts as broken. */
export const BROKEN_AFTER = 3;

export const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
export const ymdhm = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
export const short = (sha) => (sha ? String(sha).slice(0, 7) : 'none');

export const REQUEST_HELP =
  'Any session writes one line: deploy · from WHO · YYYY-MM-DD HH:MM UTC · COMMIT or latest · what changed | ' +
  'hold · from WHO · TIME · reason (you are changing the server by hand; deploys wait; refresh within 1 hour) | ' +
  'release · from WHO · TIME | start checking · from WHO · TIME (acts on requests, reading every 30 s) | ' +
  'stop checking · from WHO · TIME (paused: still reads every 30 s, acts only on start checking). ' +
  'The Mac appends what happened to each line.';

/** Text the Mac writes that came from outside (names, reasons, subjects, test names). */
export function clean(s, max = 120) {
  const t = String(s ?? '')
    .replace(/[[\]<>*_`~\\|#→]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Notion markdown (or REST plain text) to comparable plain text. */
export function normText(s) {
  return String(s ?? '')
    .replace(/<empty-block\s*\/>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export const whoKey = (who) => String(who ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseTime(s) {
  const m = String(s ?? '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  return Number.isFinite(t) ? t : null;
}

// ---------------------------------------------------------------- page lines

/** Enhanced-markdown page content to line objects. */
export function parseMarkdownLines(content) {
  return String(content).split('\n').map((raw, index) => {
    let m;
    let kind = 'p';
    let body = raw;
    if ((m = raw.match(/^# (.*)$/))) [kind, body] = ['h1', m[1]];
    else if ((m = raw.match(/^## (.*)$/))) [kind, body] = ['h2', m[1]];
    else if ((m = raw.match(/^### (.*)$/))) [kind, body] = ['h3', m[1]];
    else if ((m = raw.match(/^[-*] (.*)$/))) [kind, body] = ['bullet', m[1]];
    else if ((m = raw.match(/^\d+\. (.*)$/))) [kind, body] = ['number', m[1]];
    else if (/^\s/.test(raw) && raw.trim()) kind = 'nested';
    return { kind, text: normText(body), raw, index };
  });
}

const isBlank = (l) => (l.kind === 'p' || l.kind === 'nested') && l.text === '';

/**
 * Finds "## Mac server" and splits it into its subsections. Lines keep their
 * transport fields (raw/index for markdown, id for REST).
 */
export function readSection(lines) {
  const start = lines.findIndex((l) => l.kind === 'h2' && l.text === 'Mac server');
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && (l.kind === 'h1' || l.kind === 'h2'));
  if (end < 0) end = lines.length;
  const body = lines.slice(start, end).filter((l) => !isBlank(l));
  const sub = { requests: [], queue: [], log: [] };
  let cur = null;
  for (const l of body.slice(1)) {
    if (l.kind === 'h3') {
      cur = l.text === 'Requests to the Mac' ? 'requests' : l.text === 'Queue' ? 'queue' : l.text === 'Mac log' ? 'log' : null;
      continue;
    }
    if (cur === 'requests' && l.text.startsWith('Any session writes one line')) continue;
    if (cur) sub[cur].push(l);
  }
  return { lines: body, ...sub };
}

/** Lines of the "## Needs attention" section. */
export function sectionLines(lines, title) {
  const start = lines.findIndex((l) => l.kind === 'h2' && l.text === title);
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && (l.kind === 'h1' || l.kind === 'h2'));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

// ---------------------------------------------------------------- requests

const VERBS = ['deploy', 'hold', 'release', 'start checking', 'stop checking'];

/**
 * One request line. Returns null for a line that is not a request at all,
 * { bad: true } for one that starts like a request but does not parse.
 */
export function parseRequest(text) {
  const t = normText(text);
  const [baseRaw, ...notes] = t.split('→');
  const base = baseRaw.trim();
  const parts = base.split('·').map((s) => s.trim());
  const verb = (parts[0] ?? '').toLowerCase();
  const key = base.toLowerCase().replace(/\s+/g, ' ');
  const annotated = notes.length > 0;
  if (!VERBS.includes(verb)) {
    if (/^(deploy|hold|release|start|stop)\b/i.test(base)) return { bad: true, base, key, annotated };
    return null;
  }
  const from = (parts[1] ?? '').match(/^from\s+(.+)$/i);
  if (!from) return { bad: true, base, key, annotated };
  const req = { verb, who: from[1].trim(), time: parseTime(parts[2]), base, key, annotated };
  if (verb === 'deploy') {
    const commit = (parts[3] ?? '').toLowerCase();
    if (!/^(latest|[0-9a-f]{7,40})$/.test(commit)) return { bad: true, base, key, annotated };
    req.commit = commit;
    req.what = parts.slice(4).join(' · ');
  }
  if (verb === 'hold') req.reason = parts.slice(3).join(' · ') || 'no reason given';
  return req;
}

// ---------------------------------------------------------------- state

export function freshState() {
  return {
    v: 1,
    mode: 'on', // on | off (paused: reads, acts only on start checking)
    lastCheckAt: 0,
    shownCheckAt: 0, // the "last check" time currently on the page
    keyFailures: 0, // consecutive checks the Notion key was refused
    transientFailures: 0, // consecutive network/429/5xx failures (backoff, never a stop)
    app: null, // { kind: ready|updating|restarting|down, commit, label, since, reason }
    healthFailures: 0, // consecutive checks the public /api/health failed
    serverStartedAt: null, // startedAt of the server process last seen healthy
    restartWindowUntil: 0, // a deploy is restarting the server until then
    originHead: null,
    live: null, // { commit, subject, at }
    holds: [], // { who, reason, since, refreshedAt }
    pin: null, // { who, commit, originHead }
    requests: {}, // key -> { kind, who, seenAt, note, finishedAt, removed }
    queue: [], // { id, who, commit, what, requestedAt, key, unrequested, resolved, step }
    failed: [], // commits whose deploy failed: never auto-queued again
    log: [], // { at, text } newest first
    nextId: 1,
    notionNotes: {},
  };
}

export function addLog(state, now, text) {
  state.log.unshift({ at: now, text });
  state.log = state.log.slice(0, 30);
}

export const itemLabel = (item) =>
  item.resolved ? short(item.resolved) : item.commit === 'latest' ? 'latest' : short(item.commit);

/** New request lines to state. Returns true when anything changed. */
export function ingest(state, parsed, now) {
  let changed = false;
  const fresh = parsed
    .filter((r) => r && !state.requests[r.key])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.time ?? Infinity) - (b.r.time ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
  const wasOff = state.mode === 'off';
  for (const r of fresh) {
    if (state.requests[r.key]) continue;
    if (r.bad) {
      if (r.annotated) continue;
      state.requests[r.key] = { kind: 'bad', seenAt: now, finishedAt: now, note: ` → not understood ${hhmm(now)}, see the format above` };
      changed = true;
      continue;
    }
    if (r.time !== null && now - r.time > 2 * DAY) {
      state.requests[r.key] = { kind: 'stale', seenAt: now, finishedAt: now, note: ` → ignored ${hhmm(now)}: older than 2 days` };
      changed = true;
      continue;
    }
    if (state.mode === 'off' && r.verb !== 'start checking') continue;
    const who = clean(r.who, 40);
    if (r.annotated) {
      // Already carries the Mac's notes but is unknown here: a hold whose time
      // was edited in place (a refresh), or state that was reset. Never act twice.
      state.requests[r.key] = { kind: r.verb, who, seenAt: now, note: null, finishedAt: now };
      changed = true;
      const h = r.verb === 'hold' && state.holds.find((x) => whoKey(x.who) === whoKey(who));
      if (h) h.refreshedAt = now;
      continue;
    }
    const rec = { kind: r.verb, who, seenAt: now, note: '', finishedAt: null };
    state.requests[r.key] = rec;
    changed = true;
    const at = hhmm(now);
    if (r.verb === 'deploy') {
      if (r.commit === 'latest' && state.pin) {
        addLog(state, now, `${state.pin.who}'s pin on ${short(state.pin.commit)} ended: ${who} asked for latest`);
        state.pin = null;
      }
      const item = { id: state.nextId++, who, commit: r.commit, what: clean(r.what, 80), requestedAt: now, key: r.key, unrequested: false, resolved: null, step: null };
      state.queue.push(item);
      const pos = state.queue.length;
      rec.note = ` → seen ${at}, queue position ${pos}`;
      if (pos > 1) addLog(state, now, `${who} joined the queue at position ${pos} behind ${state.queue[pos - 2].who}`);
      else addLog(state, now, `${who}'s deploy ${itemLabel(item)} · queued at position 1`);
    } else if (r.verb === 'hold') {
      const reason = clean(r.reason, 80);
      const h = state.holds.find((x) => whoKey(x.who) === whoKey(who));
      if (h) {
        h.refreshedAt = now;
        h.reason = reason;
        rec.note = ` → seen ${at}, hold refreshed`;
      } else {
        state.holds.push({ who, reason, since: now, refreshedAt: now });
        rec.note = ` → seen ${at}, hold on`;
        addLog(state, now, `${who} put a hold: ${reason}. Deploys wait`);
      }
      rec.finishedAt = now;
    } else if (r.verb === 'release') {
      const mine = state.holds.filter((x) => whoKey(x.who) === whoKey(who));
      const gone = mine.length ? mine : state.holds;
      if (gone.length) {
        state.holds = state.holds.filter((x) => !gone.includes(x));
        rec.note = ` → seen ${at}, released`;
        addLog(state, now, `${who} released the hold (${gone.map((g) => g.who).join(', ')})`);
      } else rec.note = ` → seen ${at}, nothing was held`;
      rec.finishedAt = now;
    } else if (r.verb === 'start checking') {
      rec.note = state.mode === 'on' ? ` → seen ${at}, already checking` : ` → seen ${at}, checking on`;
      if (state.mode !== 'on') addLog(state, now, `${who} started checking: requests are acted on again`);
      state.mode = 'on';
      rec.finishedAt = now;
    } else if (r.verb === 'stop checking') {
      state.mode = 'off';
      rec.note = ` → seen ${at}, checking paused`;
      addLog(state, now, `${who} paused checking: the Mac still reads every 30 s but acts only on start checking`);
      rec.finishedAt = now;
    }
  }
  // Requests written while checking was off, then turned back on in the same read.
  if (wasOff && state.mode !== 'off') ingest(state, parsed, now);
  return changed;
}

/** Hold expiry and finished request lines older than a day. */
export function expire(state, now) {
  for (const h of [...state.holds]) {
    if (now - h.refreshedAt >= HOUR) {
      state.holds = state.holds.filter((x) => x !== h);
      addLog(state, now, `${h.who}'s hold expired: not refreshed for 1 hour`);
    }
  }
  for (const [k, rec] of Object.entries(state.requests)) {
    if (rec.finishedAt && now - rec.finishedAt > DAY) rec.removed = true;
    if (rec.removed && now - rec.finishedAt > 7 * DAY) delete state.requests[k];
  }
}

/**
 * Is a check due? Every 30 s (a little slack so a 30 s launchd tick never
 * skips one), later while backing off from network/429/5xx failures:
 * 30 s doubling per consecutive failure, capped at 10 minutes.
 */
export function checkDue(state, now) {
  const n = state.transientFailures || 0;
  const wait = n ? Math.min(CHECK_INTERVAL * 2 ** n, 10 * MIN) : CHECK_INTERVAL;
  return now - Math.max(state.lastCheckAt || 0, state.lastAttemptAt || 0) >= wait - 5e3;
}

/** Outcome of one check's Notion access, for backoff and broken-key counting. */
export function recordAccess(state, outcome, now) {
  state.lastAttemptAt = now;
  if (outcome === 'ok') {
    state.keyFailures = 0;
    state.transientFailures = 0;
  } else if (outcome === 'refused') {
    state.keyFailures = (state.keyFailures || 0) + 1;
  } else {
    state.transientFailures = (state.transientFailures || 0) + 1;
  }
  return state.keyFailures >= BROKEN_AFTER;
}

/**
 * Keeps the page's "last check" time unless something else on the status line
 * changed or it is STATUS_REFRESH old, so a 30 s check does not write the page.
 */
export function settleShownCheck(state, currentStatusText) {
  const strip = (t) => normText(t).replace(/ · last check [^·]*/, '');
  const fresh = statusLine({ ...state, shownCheckAt: state.lastCheckAt });
  if (!currentStatusText || strip(currentStatusText) !== strip(fresh) || state.lastCheckAt - (state.shownCheckAt || 0) >= STATUS_REFRESH) {
    state.shownCheckAt = state.lastCheckAt;
  }
}

/**
 * New commits on origin/main with no request. Also ends a pin when a newer
 * commit is pushed.
 */
export function autoQueue(state, git, now) {
  if (!git || !git.head) return;
  if (state.pin && git.head !== state.pin.originHead) {
    addLog(state, now, `${state.pin.who}'s pin on ${short(state.pin.commit)} ended: newer commit ${short(git.head)} pushed`);
    state.pin = null;
  }
  state.originHead = git.head;
  if (state.mode === 'off' || state.pin) return;
  if (state.live && state.live.commit === git.head) return;
  if (state.failed.includes(git.head)) return;
  const covers = (q) => q.commit === 'latest' || q.resolved === git.head || git.head.startsWith(q.commit);
  if (state.queue.some(covers)) return;
  const who = `unrequested push by ${clean(git.author, 40) || 'unknown'}`;
  const item = { id: state.nextId++, who, commit: git.head, what: clean(git.subject, 80), requestedAt: now, key: null, unrequested: true, resolved: null, step: null };
  state.queue.push(item);
  const pos = state.queue.length;
  addLog(state, now, pos > 1 ? `${who} joined the queue at position ${pos} behind ${state.queue[pos - 2].who}` : `${who}'s deploy ${short(git.head)} · queued at position 1`);
}

/** The deployer finished queue[0]. */
export function finishDeploy(state, result, now) {
  const item = state.queue[0];
  if (!item) return;
  const rec = item.key ? state.requests[item.key] : null;
  const at = hhmm(now);
  if (result.ok) {
    state.live = { commit: result.sha, subject: result.subject, at: now };
    const explicit = item.commit !== 'latest' && !item.unrequested && result.sha !== result.head;
    if (explicit) {
      state.pin = { who: item.who, commit: result.sha, originHead: result.head };
      const dropped = state.queue.slice(1).filter((q) => q.unrequested);
      if (dropped.length) {
        state.queue = state.queue.filter((q) => !dropped.includes(q));
        addLog(state, now, `dropped ${dropped.map((q) => `${q.who}'s ${itemLabel(q)}`).join(', ')}: ${item.who} pinned ${short(result.sha)}`);
      }
    } else state.pin = null;
    if (rec) rec.note += ` → done ${at}, live ${short(result.sha)}`;
    addLog(state, now, `${item.who}'s deploy ${short(result.sha)} · done, live ${short(result.sha)}${explicit ? ` (pinned by ${item.who})` : ''}${result.detail ? `, ${result.detail}` : ''}`);
  } else {
    if (result.sha && !state.failed.includes(result.sha)) state.failed = [...state.failed, result.sha].slice(-50);
    if (rec) rec.note += ` → failed ${at}: ${clean(result.reason, 160)}`;
    addLog(state, now, `${item.who}'s deploy ${result.sha ? short(result.sha) : itemLabel(item)} · failed: ${clean(result.reason, 200)}`);
  }
  if (rec) rec.finishedAt = now;
  state.queue.shift();
}

// ---------------------------------------------------------------- rendering

export function statusLine(state) {
  const mode = state.mode === 'off' ? 'checker paused (reads every 30 s, acts only on start checking)' : 'checker on · every 30 s';
  const last = state.shownCheckAt ? `${hhmm(state.shownCheckAt)} UTC` : 'never';
  const live = state.live
    ? `live ${short(state.live.commit)} "${clean(state.live.subject, 60)}"${state.pin && state.pin.commit === state.live.commit ? ` (pinned by ${state.pin.who})` : ''}`
    : 'live unknown';
  const hold = state.holds.length ? state.holds.map((h) => `${h.who}, ${h.reason}, since ${hhmm(h.since)}`).join('; ') : 'nobody';
  return `Status: ${mode} · last check ${last} · ${live} · queue ${state.queue.length} · hold: ${hold}`;
}

/** "Is the app ready to test", one line under the status line. */
export function appLine(state) {
  const a = state.app ?? { kind: 'ready', commit: state.live?.commit, since: state.live?.at };
  if (a.kind === 'updating') return `App: updating to ${a.label}, will restart in a few minutes; the current version works until then`;
  if (a.kind === 'restarting') return 'App: restarting now, back within a minute';
  if (a.kind === 'down') return `App: NOT working since ${hhmm(a.since)} UTC (${clean(a.reason, 100)})`;
  return `App: ready to test (live ${short(a.commit)}, since ${a.since ? hhmm(a.since) : '?'} UTC)`;
}

/**
 * One public health reading from the checker. Two failures in a row mark the
 * app down (not during a deploy's restart); a new process outside a deploy's
 * restart is logged.
 * @param {{ok: boolean, startedAt?: string, reason?: string}} h
 */
export function observeHealth(state, h, now, deployRunning) {
  const inRestart = deployRunning && now < (state.restartWindowUntil || 0);
  if (h.ok) {
    state.healthFailures = 0;
    if (state.serverStartedAt && h.startedAt && h.startedAt !== state.serverStartedAt && !inRestart) {
      addLog(state, now, `server restarted outside a deploy at ${hhmm(Date.parse(h.startedAt))}`);
    }
    if (!inRestart) state.serverStartedAt = h.startedAt ?? state.serverStartedAt;
    if (state.app?.kind === 'down') {
      const q = state.queue[0];
      state.app = deployRunning && q?.step
        ? { kind: 'updating', label: itemLabel(q), since: now }
        : { kind: 'ready', commit: state.live?.commit, since: now };
      addLog(state, now, 'app working again');
    }
    return;
  }
  state.healthFailures = (state.healthFailures || 0) + 1;
  if (state.healthFailures >= 2 && !inRestart && state.app?.kind !== 'down') {
    state.app = { kind: 'down', since: now, reason: h.reason ?? 'health check failed' };
    addLog(state, now, `app NOT working: ${clean(h.reason, 100)}`);
  }
}

export function queueLines(state) {
  if (!state.queue.length) return [{ kind: 'p', text: '(empty)' }];
  return state.queue.map((q, i) => ({
    kind: 'number',
    text: i === 0
      ? `${q.who} · deploy ${itemLabel(q)} · requested ${hhmm(q.requestedAt)} · now: ${q.step ?? 'starting'}`
      : `${q.who} · deploy ${itemLabel(q)} · waiting since ${hhmm(q.requestedAt)}`,
  }));
}

/** What the section should say, given what it says now. */
export function renderSection(state, section) {
  const requests = [];
  for (const l of section ? section.requests : []) {
    const r = parseRequest(l.text);
    const rec = r ? state.requests[r.key] : null;
    if (!rec) {
      requests.push({ kind: l.kind, text: l.text });
      continue;
    }
    if (rec.removed) continue;
    requests.push({ kind: l.kind === 'p' ? 'bullet' : l.kind, text: rec.note ? `${r.base}${rec.note}` : l.text });
  }
  return [
    { kind: 'h2', text: 'Mac server' },
    { kind: 'p', text: statusLine(state) },
    { kind: 'p', text: appLine(state) },
    { kind: 'h3', text: 'Requests to the Mac' },
    { kind: 'p', text: REQUEST_HELP },
    ...requests,
    { kind: 'h3', text: 'Queue' },
    ...queueLines(state),
    { kind: 'h3', text: 'Mac log' },
    ...state.log.map((e) => ({ kind: 'bullet', text: `${hhmm(e.at)} UTC · ${e.text}` })),
  ];
}

export const brokenKeyNotice = (now, error) =>
  `to jamin · from the Mac · ${ymdhm(now)} UTC · Notion key is broken (${clean(error, 80)}); the Mac stopped checking this page. ` +
  'Deploy requests are not being read. Fix: make a new key, connect it to this page, replace NOTION_TOKEN on the Mac, then restart the checker.';

/**
 * The one post made when the key is broken: a line at the top of Needs
 * attention and the Mac server status line set to STOPPED. Hunks in page order.
 */
export function brokenKeyHunks(lines, now, error) {
  const hunks = [];
  const na = lines.findIndex((l) => l.kind === 'h2' && l.text === 'Needs attention');
  if (na >= 0) {
    const anchor = lines[na + 1]?.kind === 'p' && lines[na + 1].text ? lines[na + 1] : lines[na];
    hunks.push({ prev: anchor, del: [], add: [{ kind: 'bullet', text: brokenKeyNotice(now, error) }] });
  }
  const ms = lines.findIndex((l) => l.kind === 'h2' && l.text === 'Mac server');
  const st = ms >= 0 ? lines.findIndex((l, i) => i > ms && l.kind === 'p' && l.text.startsWith('Status:')) : -1;
  if (st > 0) hunks.push({ prev: lines[st - 1], del: [lines[st]], add: [{ kind: 'p', text: `Status: checker STOPPED: Notion key broken since ${ymdhm(now)} UTC` }] });
  return hunks;
}

/** Aurik's round-trip test lines under Needs attention: replace ops. */
export function notionTestEdits(lines, state, now) {
  const out = [];
  for (const l of sectionLines(lines, 'Needs attention')) {
    if (/^to jamin · from aurik · /i.test(l.text) && /notion test/i.test(l.text) && !l.text.includes('→')) {
      out.push({ line: l, text: `${l.text} → seen ${hhmm(now)} UTC by the Mac` });
      if (!state.notionNotes[l.text]) {
        state.notionNotes[l.text] = now;
        addLog(state, now, `saw Aurik's Notion test under Needs attention and marked it seen`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- diff

const sameLine = (a, b) => a.kind === b.kind && normText(a.text) === normText(b.text) ||
  (a.kind === 'number' && b.kind === 'number' && normText(a.text) === normText(b.text));

/**
 * LCS line diff. Hunks reference the old line objects so each transport can
 * address them (markdown raw/index, or REST block id).
 * Returns [{ prev, del: [oldLine], add: [newLine] }], prev = last equal old line before the hunk.
 */
export function diffLines(oldL, newL) {
  const n = oldL.length;
  const m = newL.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = sameLine(oldL[i], newL[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hunks = [];
  let i = 0;
  let j = 0;
  let prev = null;
  let cur = null;
  const flush = () => {
    if (cur) hunks.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && sameLine(oldL[i], newL[j])) {
      flush();
      prev = oldL[i];
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      cur ??= { prev, del: [], add: [] };
      cur.add.push(newL[j++]);
    } else {
      cur ??= { prev, del: [], add: [] };
      cur.del.push(oldL[i++]);
    }
  }
  flush();
  return hunks;
}

export function renderMd(line, n = 1) {
  const p = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', number: `${n}. `, p: '' }[line.kind] ?? '';
  return p + line.text;
}

const count = (hay, needle) => {
  let c = 0;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    c++;
    at = hay.indexOf(needle, at + 1);
  }
  return c;
};

/**
 * Hunks to Notion update_content {old_str,new_str} pairs, old strings copied
 * from the fetched markdown and widened upward until unique on the page.
 */
export function markdownEdits(content, hunks) {
  const raw = String(content).split('\n');
  const updates = [];
  for (const h of hunks) {
    if (!h.prev) throw new Error('hunk without an anchor line');
    const first = h.prev.index;
    const last = h.del.length ? h.del[h.del.length - 1].index : first;
    let from = first;
    let old = raw.slice(from, last + 1).join('\n');
    while (count(content, old) > 1 && from > 0) old = raw.slice(--from, last + 1).join('\n');
    let n = 1;
    const added = h.add.map((l) => renderMd(l, l.kind === 'number' ? n++ : 1));
    const keep = raw.slice(from, first + 1).join('\n');
    updates.push({ old_str: old, new_str: [keep, ...added].join('\n') });
  }
  return updates;
}

/** Single-line replacements (outside the Mac section) as hunks. */
export function replaceHunks(lines, ops) {
  return ops.map(({ line, text }) => {
    const idx = lines.indexOf(line);
    return { prev: lines[idx - 1] ?? null, del: [line], add: [{ kind: line.kind, text }] };
  });
}

// ---------------------------------------------------------------- deploy helpers

/** Failing test names from node --test (spec or TAP) and tsc output. */
export function failingTests(output) {
  const names = new Set();
  for (const line of String(output).split('\n')) {
    let m = line.match(/^\s*not ok \d+ - (.+?)\s*(?:#.*)?$/);
    if (!m) m = line.match(/^\s*✖ (.+?)(?: \([\d.]+m?s\))?\s*$/);
    if (m && !/^failing tests:?$/i.test(m[1].trim())) names.add(m[1].trim());
    const t = line.match(/^(\S+\(\d+,\d+\)): error (TS\d+)/);
    if (t) names.add(`${t[1]} ${t[2]}`);
  }
  return [...names];
}

export function summarizeFailures(names, max = 4) {
  if (!names.length) return 'no test names found in the output';
  const shown = names.slice(0, max).map((n) => clean(n, 60));
  return shown.join(', ') + (names.length > max ? ` (+${names.length - max} more)` : '');
}

/** Health body after a restart: fresh process, ok, catalogue no worse than before. */
/**
 * Did a real catalogue search answer? /api/health says catalogueUp as soon as
 * the worker exists, but on 2026-09-14 a photo 2.5 min after a "healthy"
 * restart still hit the 5 s search timeout. So "ready" needs one real search
 * that came back without the error field and inside the server's own 5 s.
 */
export function searchAnswered(body) {
  if (!body || body.catalogueUp !== true) return false;
  if (body.error) return false;
  if (!Array.isArray(body.candidates)) return false;
  return typeof body.ms === 'number' && body.ms < 5000;
}

export function healthGood(body, restartAt, before) {
  if (!body || body.ok !== true) return false;
  if (Date.parse(body.startedAt) < restartAt - 2000) return false;
  if (before && before.catalogueUp === true && body.catalogueUp !== true) return false;
  if (before && before.scanLog === true && body.scanLog !== true) return false;
  return true;
}
