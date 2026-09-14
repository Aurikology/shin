// mac/deploy/notion.mjs
//
// Two ways to read and edit the shared Notion page, behind one interface:
//   session.fetch()                      -> { lines, content }
//   session.applyHunks(page, hunks)      -> exact-text edits of the lines named
//   session.appendSection(page, lines)   -> add lines at the end of the page
//   session.close()
//
// RestSession: the Notion API (NOTION_TOKEN in mac/config.env), version
// 2022-06-28. Block-level: a line is replaced only after re-reading that
// block and finding exactly the text that was fetched.
//
// ClaudeSession: fallback with no token. One headless `claude -p` process
// (haiku, only the two Notion tools loaded) held open over stream-json, so
// the fetch and the edit are two turns of one process and the edit's
// old_str comes from the fetched text, computed here, not by the model.
// Edits are update_content with exact strings, never replace_content.

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { markdownEdits, normText, parseMarkdownLines, renderMd } from './lib.mjs';

export class NotionAccessError extends Error {}

// ---------------------------------------------------------------- REST

const KIND_TYPE = { h1: 'heading_1', h2: 'heading_2', h3: 'heading_3', p: 'paragraph', bullet: 'bulleted_list_item', number: 'numbered_list_item' };
const TYPE_KIND = Object.fromEntries(Object.entries(KIND_TYPE).map(([k, v]) => [v, k]));

export function blockToLine(b, index) {
  const data = b[b.type] ?? {};
  const plain = Array.isArray(data.rich_text) ? data.rich_text.map((t) => t.plain_text ?? t.text?.content ?? '').join('') : '';
  return { kind: TYPE_KIND[b.type] ?? 'other', text: normText(plain), plain, id: b.id, type: b.type, index };
}

export function lineToBlock(line) {
  const type = KIND_TYPE[line.kind] ?? 'paragraph';
  return { object: 'block', type, [type]: { rich_text: [{ type: 'text', text: { content: line.text.slice(0, 2000) } }] } };
}

export class RestSession {
  constructor({ token, pageId, fetchImpl = globalThis.fetch, log = () => {}, minGapMs = 350 }) {
    this.minGapMs = minGapMs;
    this.token = token;
    this.pageId = pageId;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.calls = 0;
  }

  async api(method, path, body) {
    for (let attempt = 0; attempt < 4; attempt++) {
      // Notion allows about 3 requests a second: keep calls 350 ms apart.
      const gap = (this.lastCallAt ?? 0) + this.minGapMs - Date.now();
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      this.lastCallAt = Date.now();
      this.calls++;
      const res = await this.fetchImpl(`https://api.notion.com/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30e3),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, (Number(res.headers?.get?.('retry-after')) || 1) * 1000));
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404 || ['object_not_found', 'unauthorized', 'restricted_resource'].includes(json.code)) {
        throw new NotionAccessError(`${method} ${path.split('?')[0]}: ${json.code ?? res.status}`);
      }
      if (!res.ok) throw new Error(`Notion ${method} ${path.split('?')[0]}: ${res.status} ${json.code ?? ''}`);
      return json;
    }
    throw new Error('Notion rate limited 4 times');
  }

  async fetch() {
    const blocks = [];
    let cursor;
    do {
      const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const r = await this.api('GET', `/blocks/${this.pageId}/children${q}`);
      blocks.push(...r.results);
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    return { lines: blocks.filter((b) => !b.archived && !b.in_trash).map(blockToLine), content: null };
  }

  /** True when the block still holds exactly the text we fetched. */
  async verify(line) {
    const b = await this.api('GET', `/blocks/${line.id}`);
    if (b.archived || b.in_trash) return false;
    return blockToLine(b).plain === line.plain;
  }

  async insertAfter(afterId, lines) {
    const body = { children: lines.map(lineToBlock) };
    if (afterId) body.after = afterId;
    const r = await this.api('PATCH', `/blocks/${this.pageId}/children`, body);
    // With `after`, results are the new blocks; take the last one we added.
    const ids = (r.results ?? []).map((b) => b.id);
    return ids.length >= lines.length ? ids[ids.length - 1] : afterId;
  }

  async applyHunks(_page, hunks) {
    let skipped = 0;
    for (const h of hunks) {
      const ok = await Promise.all(h.del.map((d) => this.verify(d)));
      if (ok.includes(false)) {
        skipped++;
        this.log(`REST: hunk skipped, a line changed since it was read`);
        continue;
      }
      let anchor = h.prev?.id ?? null;
      let ai = 0;
      for (const d of h.del) {
        const a = h.add[ai];
        if (a && KIND_TYPE[a.kind] === d.type) {
          const type = d.type;
          await this.api('PATCH', `/blocks/${d.id}`, { [type]: lineToBlock(a)[type] });
          anchor = d.id;
          ai++;
        } else {
          await this.api('DELETE', `/blocks/${d.id}`);
        }
      }
      if (ai < h.add.length) await this.insertAfter(anchor, h.add.slice(ai));
    }
    if (skipped) throw new Error(`${skipped} edit(s) skipped: text changed under us`);
  }

  async appendSection(_page, lines) {
    for (let i = 0; i < lines.length; i += 90) await this.insertAfter(null, lines.slice(i, i + 90));
  }

  close() {}
}

// ---------------------------------------------------------------- claude -p

const ALLOWED = ['mcp__claude_ai_Notion__notion-fetch', 'mcp__claude_ai_Notion__notion-update-page'];
// Every other connector tool is disallowed so its schema is not sent: with
// them loaded a fetch costs ~$0.12-0.18, without them ~$0.006.
const DISALLOWED_SERVERS = ['mcp__claude_ai_Gmail', 'mcp__claude_ai_Google_Drive', 'mcp__claude_ai_Google_Calendar'];
const NOTION_OTHER = [
  'notion-ai-search', 'notion-check-mcp-next-steps', 'notion-convert-page-to-skill', 'notion-create-attachment', 'notion-create-comment',
  'notion-create-database', 'notion-create-file-upload', 'notion-create-folder', 'notion-create-pages', 'notion-create-view',
  'notion-download-attachment', 'notion-download-skill', 'notion-duplicate-page', 'notion-get-async-task', 'notion-get-comments',
  'notion-get-session-status', 'notion-get-teams', 'notion-get-users', 'notion-list-favorite-pages', 'notion-list-private-pages',
  'notion-list-recent-pages', 'notion-list-session-events', 'notion-list-shared-pages', 'notion-move-pages', 'notion-query-data-sources',
  'notion-query-meeting-notes', 'notion-query-multiple-data-sources', 'notion-query-sessions', 'notion-read-session-event',
  'notion-search', 'notion-search-agents', 'notion-search-sessions', 'notion-search-skills', 'notion-send-message-to-session',
  'notion-show-advanced-analysis-next-steps', 'notion-spawn-session', 'notion-stop-session', 'notion-update-data-source',
  'notion-update-folder', 'notion-update-view', 'notion-wait-session',
].map((t) => `mcp__claude_ai_Notion__${t}`);

/** Page markdown out of a notion-fetch tool_result. */
export function contentFromFetchResult(toolResult) {
  const parts = Array.isArray(toolResult.content) ? toolResult.content : [{ text: String(toolResult.content ?? '') }];
  const raw = parts.map((p) => p.text ?? '').join('');
  let text = raw;
  let truncated = false;
  try {
    const j = JSON.parse(raw);
    text = j.text ?? raw;
    truncated = j.truncated === true;
  } catch {}
  const m = text.match(/<content>\n?([\s\S]*?)\n?<\/content>/);
  if (!m) throw new Error('fetch result had no <content> block');
  return { content: m[1], truncated };
}

export class ClaudeSession {
  constructor({ pageId, cwd, claudeBin = 'claude', env, log = () => {}, costLog, turnTimeoutMs = 150e3 }) {
    this.pageId = pageId;
    this.log = log;
    this.costLog = costLog;
    this.turnTimeoutMs = turnTimeoutMs;
    this.cost = 0;
    this.messages = [];
    this.waiters = [];
    const args = [
      '-p', '--model', 'haiku', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--tools', '', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands',
      '--system-prompt', 'You operate two Notion tools exactly as instructed, copying tool inputs character for character. After the tool call, reply only: ok',
      '--allowedTools', ALLOWED.join(','), '--disallowedTools', [...DISALLOWED_SERVERS, ...NOTION_OTHER].join(','),
    ];
    this.child = spawn(claudeBin, args, { cwd, env: { ...env, MCP_CONNECTION_NONBLOCKING: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    this.child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        this.messages.push(msg);
        if (msg.type === 'result') {
          this.cost = msg.total_cost_usd ?? this.cost;
          const w = this.waiters.shift();
          if (w) w(msg);
        }
      }
    });
    this.child.stderr.on('data', () => {});
    this.exited = new Promise((r) => this.child.on('close', r));
    this.child.on('close', () => {
      for (const w of this.waiters.splice(0)) w({ type: 'result', subtype: 'process_exited', is_error: true });
    });
  }

  async turn(text) {
    const from = this.messages.length;
    const done = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('claude turn timed out')), this.turnTimeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
    this.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n');
    const result = await done;
    const msgs = this.messages.slice(from);
    const uses = msgs.filter((m) => m.type === 'assistant').flatMap((m) => m.message.content.filter((c) => c.type === 'tool_use'));
    const results = msgs.filter((m) => m.type === 'user' && Array.isArray(m.message?.content)).flatMap((m) => m.message.content.filter((c) => c.type === 'tool_result'));
    if (result.is_error) throw new Error(`claude turn failed: ${result.subtype}`);
    return { uses, results };
  }

  async fetch() {
    const { uses, results } = await this.turn(`Call notion-fetch once with id "${this.pageId}". Then reply ok.`);
    const use = uses.find((u) => u.name.endsWith('notion-fetch'));
    const res = use && results.find((r) => r.tool_use_id === use.id);
    if (!res || res.is_error) throw new Error('notion-fetch did not return');
    const { content, truncated } = contentFromFetchResult(res);
    if (truncated) throw new Error('page fetch truncated');
    return { lines: parseMarkdownLines(content), content };
  }

  async update(input) {
    const json = JSON.stringify(input);
    const { uses, results } = await this.turn(
      `Call notion-update-page once. Its input is exactly this JSON object, copied character for character (keep every newline, · and →):\n${json}\nThen reply ok.`,
    );
    const use = uses.find((u) => u.name.endsWith('notion-update-page'));
    if (!use) throw new Error('model did not call notion-update-page');
    if (JSON.stringify(use.input) !== json) this.log('claude transport: model altered the update input (edit may be off; next sync repairs)');
    const res = results.find((r) => r.tool_use_id === use.id);
    const text = res ? JSON.stringify(res.content) : '';
    if (!res || res.is_error || /"error"|no match|not found|did not match/i.test(text)) throw new Error(`notion-update-page failed: ${text.slice(0, 200)}`);
  }

  async applyHunks(page, hunks) {
    if (!hunks.length) return;
    await this.update({ page_id: this.pageId, command: 'update_content', content_updates: markdownEdits(page.content, hunks) });
  }

  async appendSection(_page, lines) {
    let n = 1;
    const md = lines.map((l) => renderMd(l, l.kind === 'number' ? n++ : ((n = 1), 1))).join('\n');
    await this.update({ page_id: this.pageId, command: 'insert_content', content: md, position: { type: 'end' } });
  }

  async close() {
    try {
      this.child.stdin.end();
    } catch {}
    const t = setTimeout(() => this.child.kill('SIGKILL'), 10e3);
    await this.exited;
    clearTimeout(t);
    if (this.costLog) {
      try {
        appendFileSync(this.costLog, `${new Date().toISOString()} ${this.cost.toFixed(4)}\n`);
      } catch {}
    }
  }
}

export const costLogPath = (home) => join(home, 'logs', 'claude-cost.log');
