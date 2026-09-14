import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffLines, freshState, readSection, renderSection } from '../lib.mjs';
import { NotionAccessError, RestSession, blockToLine, contentFromFetchResult } from '../notion.mjs';

// Shapes as the Notion API (2022-06-28) returns them.
const rt = (s) => [{ type: 'text', text: { content: s, link: null }, plain_text: s, annotations: {} }];
const block = (id, type, text) => ({ object: 'block', id, type, archived: false, in_trash: false, has_children: false, [type]: { rich_text: rt(text), color: 'default' } });

function fakeNotion(blocks) {
  const calls = [];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  let order = blocks.map((b) => b.id);
  let n = 0;
  const reply = (status, body) => ({ status, ok: status < 300, json: async () => body, headers: { get: () => null } });
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://api.notion.com/v1', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body });
    assert.equal(init.headers['Notion-Version'], '2022-06-28');
    let m;
    if (init.method === 'GET' && (m = path.match(/^\/blocks\/([^/]+)\/children/))) {
      if (m[1] !== 'page') return reply(404, { object: 'error', code: 'object_not_found' });
      return reply(200, { results: order.map((id) => byId.get(id)), has_more: false, next_cursor: null });
    }
    if (init.method === 'GET' && (m = path.match(/^\/blocks\/([^/]+)$/))) return reply(200, byId.get(m[1]));
    if (init.method === 'PATCH' && (m = path.match(/^\/blocks\/page\/children$/))) {
      const made = body.children.map((c) => ({ ...c, id: `new${++n}`, archived: false }));
      for (const b of made) byId.set(b.id, { ...b, [b.type]: { rich_text: rt(b[b.type].rich_text[0].text.content) } });
      const at = body.after ? order.indexOf(body.after) + 1 : order.length;
      order.splice(at, 0, ...made.map((b) => b.id));
      return reply(200, { results: made });
    }
    if (init.method === 'PATCH' && (m = path.match(/^\/blocks\/([^/]+)$/))) {
      const b = byId.get(m[1]);
      b[b.type] = { rich_text: rt(body[b.type].rich_text[0].text.content) };
      return reply(200, b);
    }
    if (init.method === 'DELETE' && (m = path.match(/^\/blocks\/([^/]+)$/))) {
      order = order.filter((id) => id !== m[1]);
      return reply(200, { ...byId.get(m[1]), archived: true });
    }
    return reply(400, { code: 'validation_error' });
  };
  return { fetchImpl, calls, texts: () => order.map((id) => byId.get(id)).map((b) => `${b.type}:${blockToLine(b).plain}`) };
}

test('REST: reads blocks as lines and edits only the lines that differ, verifying each first', async () => {
  const s = freshState();
  s.lastCheckAt = Date.parse('2026-09-14T05:00:00Z');
  s.live = { commit: 'a'.repeat(40), subject: 'x' };
  const desired0 = renderSection(s, null);
  const kinds = { h2: 'heading_2', h3: 'heading_3', p: 'paragraph', bullet: 'bulleted_list_item', number: 'numbered_list_item' };
  const blocks = [
    block('b1', 'heading_2', 'Needs attention'),
    block('b2', 'bulleted_list_item', 'someone else · untouched'),
    ...desired0.map((l, i) => block(`s${i}`, kinds[l.kind], l.text)),
  ];
  // A request a human wrote, inside the Requests subsection.
  const reqIdx = blocks.findIndex((b) => b.id.startsWith('s') && b.heading_3?.rich_text[0].plain_text === 'Queue');
  blocks.splice(reqIdx, 0, block('r1', 'bulleted_list_item', 'hold · from jamin · 2026-09-14 05:00 UTC · tunnel'));
  const fake = fakeNotion(blocks);
  const rest = new RestSession({ token: 'test-token', pageId: 'page', fetchImpl: fake.fetchImpl });
  const page = await rest.fetch();
  const section = readSection(page.lines);
  const { ingest, parseRequest } = await import('../lib.mjs');
  ingest(s, section.requests.map((l) => parseRequest(l.text)), s.lastCheckAt + 60e3);
  s.lastCheckAt += 60e3;
  const hunks = diffLines(section.lines, renderSection(s, section));
  await rest.applyHunks(page, hunks);
  const texts = fake.texts();
  assert.equal(texts[1], 'bulleted_list_item:someone else · untouched');
  assert.ok(texts.includes('bulleted_list_item:hold · from jamin · 2026-09-14 05:00 UTC · tunnel → seen 05:01, hold on'));
  assert.ok(texts.some((t) => /^paragraph:Status: .*hold: jamin, tunnel, since 05:01/.test(t)));
  assert.ok(texts.some((t) => t.includes('jamin put a hold: tunnel. Deploys wait')));
  const mutating = fake.calls.filter((c) => c.method !== 'GET');
  assert.ok(mutating.every((c) => !c.path.includes('b1') && !c.path.includes('b2')), 'no call touches other sections');
  for (const c of mutating.filter((c) => c.method === 'PATCH' && !c.path.endsWith('/children'))) {
    const id = c.path.split('/').pop();
    const i = fake.calls.indexOf(c);
    assert.ok(fake.calls.slice(0, i).some((p) => p.method === 'GET' && p.path === `/blocks/${id}`), `block ${id} verified before update`);
  }
  // Converged: a fresh read needs no edits.
  const page2 = await rest.fetch();
  const sec2 = readSection(page2.lines);
  assert.equal(diffLines(sec2.lines, renderSection(s, sec2)).length, 0);
});

test('REST: a line changed by someone else between read and write is not overwritten', async () => {
  const blocks = [block('h', 'heading_2', 'Mac server'), block('st', 'paragraph', 'Status: old')];
  const fake = fakeNotion(blocks);
  const rest = new RestSession({ token: 't', pageId: 'page', fetchImpl: fake.fetchImpl });
  const page = await rest.fetch();
  blocks[1].paragraph.rich_text = rt('Status: edited by a human');
  const sec = readSection(page.lines);
  await assert.rejects(rest.applyHunks(page, diffLines(sec.lines, [{ kind: 'h2', text: 'Mac server' }, { kind: 'p', text: 'Status: new' }])));
  assert.equal(blocks[1].paragraph.rich_text[0].plain_text, 'Status: edited by a human');
});

test('REST: a key that cannot see the page raises NotionAccessError (caller falls back)', async () => {
  const fake = fakeNotion([]);
  const rest = new RestSession({ token: 't', pageId: 'not-shared', fetchImpl: fake.fetchImpl });
  await assert.rejects(rest.fetch(), NotionAccessError);
});

test('claude transport: page markdown out of a recorded notion-fetch tool_result', () => {
  const recorded = {
    tool_use_id: 'toolu_1',
    type: 'tool_result',
    content: [{ type: 'text', text: JSON.stringify({ metadata: { type: 'page' }, text: 'Here is the result\n<page>\n<content>\nIntro\n## Needs attention\n- (nothing yet)\n</content>\n</page>' }) }],
  };
  const { content, truncated } = contentFromFetchResult(recorded);
  assert.equal(content, 'Intro\n## Needs attention\n- (nothing yet)');
  assert.equal(truncated, false);
});
