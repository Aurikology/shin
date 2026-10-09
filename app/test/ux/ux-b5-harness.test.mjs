/**
 * UX build 5 test harness: a fake browser small enough to keep, big enough to
 * run the REAL app (main.js, the router, every screen) from a cold launch.
 *
 * WHY A SECOND DOM. test/mini-dom.mjs stores innerHTML without parsing it, which
 * is right for the one place it was written for and useless here: the camera,
 * pad and verdict sheet are drawn by assigning HTML and then reached with
 * querySelector and a delegated click handler. A tap-count test that never
 * parses the sheet counts nothing. This file parses HTML, matches the selectors
 * the screens use, bubbles events, and reproduces the one browser behaviour a
 * form depends on (a click on a submit button submits its form). Anything it
 * does not know it THROWS on, so a missing feature is a loud red test and never
 * a silently empty page.
 *
 * WHAT IS REAL: every module under public/js, loaded fresh per launch (the
 * resolve hook below stamps each import with a launch number, so a second launch
 * shares no state with the first). WHAT IS STUBBED, and only this: the camera
 * reader (eye-attach.js is swapped for a stub that hands the screen's handlers to
 * the test), the server (a fetch that answers from a route table and records
 * every call), the phone share API, and the clock-free parts of the browser
 * (history, location, localStorage, canvas).
 *
 * THIS FILE ALSO HOLDS ITS OWN NEGATIVE CONTROLS (bottom of file): a harness
 * that cannot go red proves nothing, so it is shown a click that must not
 * count, a selector that must not match and a screen that must not appear.
 *
 * Blocks covered: none directly. Every test file named ux-b5-*.test.mjs imports
 * this one. Tests expected red until built: none here; the controls are green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ======================================================================= */
/* The fake DOM                                                            */
/* ======================================================================= */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—', ndash: '–', times: '×', rarr: '→', larr: '←' };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : m;
  });
}
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const camelToDash = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const dashToCamel = (k) => k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());

/* ---- selectors ---- */

function splitTop(sel, ch) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of sel) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth += 1;
    if (c === ')' || c === ']') depth -= 1;
    if (c === ch && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCompound(src) {
  const parts = [];
  let i = 0;
  const ident = /^-?[_a-zA-Z][\w-]*/;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if (rest[0] === '*') { i += 1; continue; }
    if ((m = ident.exec(rest)) && i === 0) { parts.push({ k: 'tag', v: m[0].toLowerCase() }); i += m[0].length; continue; }
    if (rest[0] === '#' && (m = ident.exec(rest.slice(1)))) { parts.push({ k: 'id', v: m[0] }); i += 1 + m[0].length; continue; }
    if (rest[0] === '.' && (m = ident.exec(rest.slice(1)))) { parts.push({ k: 'class', v: m[0] }); i += 1 + m[0].length; continue; }
    if (rest[0] === '[') {
      const end = rest.indexOf(']');
      assert.notEqual(end, -1, `fake DOM: unterminated attribute selector in ${JSON.stringify(src)}`);
      const body = rest.slice(1, end);
      const am = /^([\w:-]+)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]*))(?:\s+[is])?)?$/.exec(body.trim());
      assert.ok(am, `fake DOM: cannot parse attribute selector [${body}]`);
      parts.push({ k: 'attr', name: am[1], op: am[2] ?? null, v: am[3] ?? am[4] ?? am[5] ?? '' });
      i += end + 1;
      continue;
    }
    if (rest[0] === ':') {
      const pm = /^:([\w-]+)(?:\(((?:[^()]|\([^()]*\))*)\))?/.exec(rest);
      assert.ok(pm, `fake DOM: cannot parse pseudo in ${JSON.stringify(src)}`);
      const name = pm[1];
      if (name === 'not') parts.push({ k: 'not', list: parseList(pm[2]) });
      else if (['first-child', 'last-child', 'checked', 'disabled', 'enabled', 'empty', 'focus', 'hover', 'active', 'only-child'].includes(name)) parts.push({ k: 'pseudo', v: name });
      else throw new Error(`fake DOM: pseudo-class :${name} is not supported; add it here deliberately (selector ${JSON.stringify(src)})`);
      i += pm[0].length;
      continue;
    }
    throw new Error(`fake DOM: cannot parse selector fragment ${JSON.stringify(rest)} of ${JSON.stringify(src)}`);
  }
  return parts;
}

function parseComplex(src) {
  // Tokenise into compounds and combinators.
  const tokens = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  const flush = () => { if (cur) { tokens.push({ compound: parseCompound(cur) }); cur = ''; } };
  for (const c of src.trim()) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth += 1;
    if (c === ')' || c === ']') depth -= 1;
    if (depth === 0 && (c === '>' || c === '+' || c === '~')) { flush(); tokens.push({ comb: c }); continue; }
    if (depth === 0 && /\s/.test(c)) { flush(); if (tokens.length && !tokens.at(-1).comb) tokens.push({ comb: ' ' }); continue; }
    cur += c;
  }
  flush();
  // Collapse " " that sits next to an explicit combinator.
  const out = [];
  for (const t of tokens) {
    if (t.comb === ' ' && out.at(-1)?.comb) continue;
    if (t.comb && t.comb !== ' ' && out.at(-1)?.comb === ' ') out.pop();
    out.push(t);
  }
  if (out.at(-1)?.comb === ' ') out.pop();
  return out;
}

function parseList(sel) {
  return splitTop(sel, ',').map((s) => s.trim()).filter(Boolean).map(parseComplex);
}

const selCache = new Map();
function compiled(sel) {
  if (!selCache.has(sel)) selCache.set(sel, parseList(sel));
  return selCache.get(sel);
}

function matchCompound(el, parts) {
  for (const p of parts) {
    if (p.k === 'tag') { if (el.localName !== p.v) return false; }
    else if (p.k === 'id') { if (el.getAttribute('id') !== p.v) return false; }
    else if (p.k === 'class') { if (!el.classList.contains(p.v)) return false; }
    else if (p.k === 'attr') {
      const got = el.getAttribute(p.name);
      if (got === null) return false;
      if (p.op === null) continue;
      if (p.op === '=' && got !== p.v) return false;
      if (p.op === '~=' && !got.split(/\s+/).includes(p.v)) return false;
      if (p.op === '^=' && !got.startsWith(p.v)) return false;
      if (p.op === '$=' && !got.endsWith(p.v)) return false;
      if (p.op === '*=' && !got.includes(p.v)) return false;
      if (p.op === '|=' && !(got === p.v || got.startsWith(`${p.v}-`))) return false;
    } else if (p.k === 'not') {
      if (p.list.some((cx) => matchComplex(el, cx))) return false;
    } else if (p.k === 'pseudo') {
      const sibs = el.parentNode?.children ?? [el];
      if (p.v === 'first-child' && sibs[0] !== el) return false;
      if (p.v === 'last-child' && sibs.at(-1) !== el) return false;
      if (p.v === 'only-child' && sibs.length !== 1) return false;
      if (p.v === 'checked' && !(el.checked === true)) return false;
      if (p.v === 'disabled' && !el.hasAttribute('disabled')) return false;
      if (p.v === 'enabled' && el.hasAttribute('disabled')) return false;
      if (p.v === 'empty' && el.childNodes.length) return false;
      if (p.v === 'focus' && el.ownerDocument.activeElement !== el) return false;
      if (p.v === 'hover' || p.v === 'active') return false;
    }
  }
  return true;
}

function matchComplex(el, cx, i = cx.length - 1) {
  // cx alternates compound, comb, compound...
  const last = cx[i];
  if (!last || last.comb) throw new Error('fake DOM: malformed selector');
  if (!matchCompound(el, last.compound)) return false;
  if (i === 0) return true;
  const comb = cx[i - 1].comb;
  if (comb === '>') return el.parentElement ? matchComplex(el.parentElement, cx, i - 2) : false;
  if (comb === ' ') {
    for (let p = el.parentElement; p; p = p.parentElement) if (matchComplex(p, cx, i - 2)) return true;
    return false;
  }
  if (comb === '+' || comb === '~') {
    const sibs = el.parentNode?.children ?? [];
    const at = sibs.indexOf(el);
    if (comb === '+') return at > 0 ? matchComplex(sibs[at - 1], cx, i - 2) : false;
    for (let j = at - 1; j >= 0; j -= 1) if (matchComplex(sibs[j], cx, i - 2)) return true;
    return false;
  }
  throw new Error(`fake DOM: combinator ${comb} is not supported`);
}

/* ---- nodes ---- */

class FNode {
  constructor() { this.parentNode = null; this.childNodes = []; }
  get parentElement() { return this.parentNode instanceof FElement ? this.parentNode : null; }
  get ownerDocument() { return FNode.doc; }
  get isConnected() { let n = this; while (n) { if (n === FNode.doc) return true; n = n.parentNode; } return false; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? (s[s.indexOf(this) + 1] ?? null) : null; }
  get previousSibling() { const s = this.parentNode?.childNodes; return s ? (s[s.indexOf(this) - 1] ?? null) : null; }
  get nextElementSibling() { const s = this.parentNode?.children; return s ? (s[s.indexOf(this) + 1] ?? null) : null; }
  get previousElementSibling() { const s = this.parentNode?.children; return s ? (s[s.indexOf(this) - 1] ?? null) : null; }
  get children() { return this.childNodes.filter((n) => n instanceof FElement); }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  get childElementCount() { return this.children.length; }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, ref) {
    if (child instanceof FFragment) {
      for (const c of [...child.childNodes]) this.insertBefore(c, ref);
      return child;
    }
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    if (ref === null || ref === undefined) this.childNodes.push(child);
    else {
      const at = this.childNodes.indexOf(ref);
      assert.notEqual(at, -1, 'fake DOM: insertBefore reference is not a child');
      this.childNodes.splice(at, 0, child);
    }
    return child;
  }
  removeChild(child) {
    const at = this.childNodes.indexOf(child);
    assert.notEqual(at, -1, 'fake DOM: removeChild of a node that is not a child');
    this.childNodes.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  append(...items) { for (const it of items) this.appendChild(typeof it === 'string' ? new FText(it) : it); }
  prepend(...items) { const first = this.childNodes[0] ?? null; for (const it of items) this.insertBefore(typeof it === 'string' ? new FText(it) : it, first); }
  replaceChildren(...items) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...items); }
  remove() { this.parentNode?.removeChild(this); }
  contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
  after(...items) { const p = this.parentNode; const ref = this.nextSibling; for (const it of items) p.insertBefore(typeof it === 'string' ? new FText(it) : it, ref); }
  before(...items) { const p = this.parentNode; for (const it of items) p.insertBefore(typeof it === 'string' ? new FText(it) : it, this); }
  replaceWith(...items) { const p = this.parentNode; const ref = this.nextSibling; this.remove(); for (const it of items) p.insertBefore(typeof it === 'string' ? new FText(it) : it, ref); }
}

class FText extends FNode {
  constructor(data) { super(); this.data = String(data); this.nodeType = 3; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  get nodeValue() { return this.data; }
  cloneNode() { return new FText(this.data); }
}

class FClassList {
  constructor(el) { this.el = el; }
  get list() { return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean); }
  contains(c) { return this.list.includes(c); }
  add(...cs) { const l = this.list; for (const c of cs) if (!l.includes(c)) l.push(c); this.el.setAttribute('class', l.join(' ')); }
  remove(...cs) { this.el.setAttribute('class', this.list.filter((c) => !cs.includes(c)).join(' ')); }
  toggle(c, force) {
    const on = force === undefined ? !this.contains(c) : Boolean(force);
    if (on) this.add(c); else this.remove(c);
    return on;
  }
  replace(a, b) { if (!this.contains(a)) return false; this.remove(a); this.add(b); return true; }
  get length() { return this.list.length; }
  toString() { return this.list.join(' '); }
  [Symbol.iterator]() { return this.list[Symbol.iterator](); }
}

function makeStyle() {
  const props = new Map();
  const target = {
    setProperty: (k, v) => { props.set(k, String(v)); },
    removeProperty: (k) => { const old = props.get(k) ?? ''; props.delete(k); return old; },
    getPropertyValue: (k) => props.get(k) ?? '',
  };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (typeof key === 'symbol') return undefined;
      if (key === 'cssText') return [...props].map(([k, v]) => `${k}: ${v}`).join('; ');
      return props.get(camelToDash(String(key))) ?? '';
    },
    set(t, key, value) {
      if (key === 'cssText') { props.clear(); return true; }
      if (value === '' || value === null || value === undefined) props.delete(camelToDash(String(key)));
      else props.set(camelToDash(String(key)), String(value));
      return true;
    },
  });
}

class FEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stop = false;
    this._stopNow = false;
    Object.assign(this, init);
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopNow = true; }
}

class FTarget {
  constructor() { this._listeners = []; }
  addEventListener(type, fn, opts) {
    const o = typeof opts === 'boolean' ? { capture: opts } : (opts ?? {});
    if (o.signal?.aborted) return;
    const rec = { type, fn, capture: Boolean(o.capture), once: Boolean(o.once) };
    if (this._listeners.some((l) => l.type === type && l.fn === fn && l.capture === rec.capture)) return;
    this._listeners.push(rec);
    o.signal?.addEventListener('abort', () => this.removeEventListener(type, fn, rec.capture), { once: true });
  }
  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
    this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  _fire(ev, phase) {
    ev.currentTarget = this;
    for (const l of [...this._listeners]) {
      if (l.type !== ev.type) continue;
      if (phase === 'capture' && !l.capture) continue;
      if (phase === 'bubble' && l.capture) continue;
      if (l.once) this.removeEventListener(l.type, l.fn, l.capture);
      l.fn.call(this, ev);
      if (ev._stopNow) return;
    }
  }
  dispatchEvent(ev) {
    ev.target = ev.target ?? this;
    const path = [];
    for (let n = this; n; n = n.parentNode) path.push(n);
    if (path.at(-1) === FNode.doc) path.push(FNode.win);
    for (let i = path.length - 1; i > 0 && !ev._stop; i -= 1) path[i]._fire(ev, 'capture');
    if (!ev._stop) path[0]._fire(ev, 'at');
    if (ev.bubbles) for (let i = 1; i < path.length && !ev._stop; i += 1) path[i]._fire(ev, 'bubble');
    return !ev.defaultPrevented;
  }
}
for (const name of Object.getOwnPropertyNames(FTarget.prototype)) {
  if (name === 'constructor') continue;
  Object.defineProperty(FNode.prototype, name, { value: FTarget.prototype[name], writable: true, configurable: true });
}

const BOOL_ATTRS = ['hidden', 'disabled', 'checked', 'selected', 'required', 'readonly', 'open', 'multiple', 'autofocus', 'autoplay', 'muted', 'playsinline', 'inert', 'draggable'];

class FElement extends FNode {
  constructor(tag) {
    super();
    this._listeners = [];
    this.localName = String(tag).toLowerCase();
    this.nodeType = 1;
    this.attributes = new Map();
    this.classList = new FClassList(this);
    this.style = makeStyle();
    this._value = undefined;
    this._checked = undefined;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.dataset = new Proxy({}, {
      get: (_t, key) => (typeof key === 'symbol' ? undefined : (this.attributes.get(`data-${camelToDash(key)}`))),
      set: (_t, key, value) => { this.attributes.set(`data-${camelToDash(String(key))}`, String(value)); return true; },
      has: (_t, key) => this.attributes.has(`data-${camelToDash(String(key))}`),
      deleteProperty: (_t, key) => { this.attributes.delete(`data-${camelToDash(String(key))}`); return true; },
      ownKeys: () => [...this.attributes.keys()].filter((k) => k.startsWith('data-')).map((k) => dashToCamel(k.slice(5))),
      getOwnPropertyDescriptor: (_t, key) => (this.attributes.has(`data-${camelToDash(String(key))}`) ? { enumerable: true, configurable: true, value: this.attributes.get(`data-${camelToDash(String(key))}`) } : undefined),
    });
    if (this.localName === 'template') this.content = new FFragment();
  }
  get tagName() { return this.localName.toUpperCase(); }
  get nodeName() { return this.tagName; }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get type() { return this.getAttribute('type') ?? (this.localName === 'button' ? 'submit' : 'text'); }
  set type(v) { this.setAttribute('type', v); }
  get name() { return this.getAttribute('name') ?? ''; }
  get href() { return this.getAttribute('href') ?? ''; }
  set href(v) { this.setAttribute('href', v); }
  get download() { return this.getAttribute('download') ?? ''; }
  set download(v) { this.setAttribute('download', v); }
  get src() { return this.getAttribute('src') ?? ''; }
  set src(v) { this.setAttribute('src', v); }
  get title() { return this.getAttribute('title') ?? ''; }
  set title(v) { this.setAttribute('title', v); }
  get placeholder() { return this.getAttribute('placeholder') ?? ''; }
  set placeholder(v) { this.setAttribute('placeholder', v); }
  get form() { return this.closest('form'); }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? -1); }
  set tabIndex(v) { this.setAttribute('tabindex', v); }
  get clientWidth() { return this.localName === 'video' || this.parentNode ? 390 : 0; }
  get clientHeight() { return this.localName === 'video' || this.parentNode ? 700 : 0; }
  get offsetWidth() { return this.clientWidth; }
  get offsetHeight() { return this.clientHeight; }
  get scrollHeight() { return this.clientHeight; }
  get videoWidth() { return 1280; }
  get videoHeight() { return 720; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.localName === 'textarea') return this.textContent;
    return this.getAttribute('value') ?? (this.localName === 'select' ? '' : '');
  }
  set value(v) { this._value = String(v); }
  get checked() { return this._checked !== undefined ? this._checked : this.hasAttribute('checked'); }
  set checked(v) { this._checked = Boolean(v); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, force) {
    const on = force === undefined ? !this.hasAttribute(name) : Boolean(force);
    if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
    return on;
  }
  get attrs() { return [...this.attributes].map(([name, value]) => ({ name, value })); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) {
    for (const c of [...this.childNodes]) this.removeChild(c);
    if (v !== '' && v !== null && v !== undefined) this.appendChild(new FText(v));
  }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(html) {
    const host = this.localName === 'template' ? this.content : this;
    for (const c of [...host.childNodes]) host.removeChild(c);
    for (const n of parseHtml(String(html))) host.appendChild(n);
  }
  get outerHTML() { return serialize(this); }
  set outerHTML(html) {
    const parent = this.parentNode;
    assert.ok(parent, 'fake DOM: outerHTML set on a node with no parent');
    const ref = this.nextSibling;
    parent.removeChild(this);
    for (const n of parseHtml(String(html))) parent.insertBefore(n, ref);
  }
  insertAdjacentHTML(pos, html) {
    const nodes = parseHtml(String(html));
    if (pos === 'beforeend') nodes.forEach((n) => this.appendChild(n));
    else if (pos === 'afterbegin') { const first = this.childNodes[0] ?? null; nodes.forEach((n) => this.insertBefore(n, first)); }
    else if (pos === 'beforebegin') nodes.forEach((n) => this.parentNode.insertBefore(n, this));
    else if (pos === 'afterend') { const ref = this.nextSibling; nodes.forEach((n) => this.parentNode.insertBefore(n, ref)); }
    else throw new Error(`fake DOM: insertAdjacentHTML position ${pos}`);
  }
  querySelectorAll(sel) {
    const list = compiled(sel);
    const out = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c instanceof FElement) {
          if (list.some((cx) => matchComplex(c, cx))) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  matches(sel) { return compiled(sel).some((cx) => matchComplex(this, cx)); }
  closest(sel) {
    for (let n = this; n instanceof FElement; n = n.parentNode) if (n.matches(sel)) return n;
    return null;
  }
  getElementsByTagName(tag) { return this.querySelectorAll(tag); }
  getElementsByClassName(c) { return this.querySelectorAll(`.${c}`); }
  cloneNode(deep) {
    const c = new FElement(this.localName);
    for (const [k, v] of this.attributes) c.attributes.set(k, v);
    if (deep) for (const n of this.childNodes) c.appendChild(n.cloneNode(true));
    return c;
  }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 700, width: 390, height: 700 }; }
  focus() {
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new FEvent('focus', { bubbles: false }));
    this.dispatchEvent(new FEvent('focusin'));
  }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  select() {}
  scrollIntoView() {}
  scrollTo() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  animate() {
    const a = { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, oncancel: null };
    return a;
  }
  getContext() { return FNode.canvasContext?.(this) ?? null; }
  toBlob(cb, type) { FNode.canvasToBlob(this, cb, type); }
  toDataURL() { return 'data:image/png;base64,AAAA'; }
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
  requestSubmit() { this.dispatchEvent(new FEvent('submit')); }
  submit() {}
  click() { fireClick(this); }
  showModal() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); }
}
for (const attr of BOOL_ATTRS) {
  Object.defineProperty(FElement.prototype, attr, {
    get() { return this.hasAttribute(attr); },
    set(v) { this.toggleAttribute(attr, Boolean(v)); },
    configurable: true,
  });
}
// `checked` is overridden above on purpose (it can diverge from the attribute); re-assert it.
Object.defineProperty(FElement.prototype, 'checked', {
  get() { return this._checked !== undefined ? this._checked : this.hasAttribute('checked'); },
  set(v) { this._checked = Boolean(v); },
  configurable: true,
});

class FFragment extends FElement {
  constructor() { super('#fragment'); this.nodeType = 11; }
  get tagName() { return '#document-fragment'; }
}

function serialize(node) {
  if (node instanceof FText) return escText(node.data);
  const attrs = [...node.attributes].map(([k, v]) => (v === '' ? ` ${k}=""` : ` ${k}="${escAttr(v)}"`)).join('');
  if (VOID.has(node.localName)) return `<${node.localName}${attrs}>`;
  const inner = node.localName === 'template' ? node.content.childNodes.map(serialize).join('') : node.childNodes.map(serialize).join('');
  return `<${node.localName}${attrs}>${inner}</${node.localName}>`;
}

/* ---- the HTML parser ---- */

function parseHtml(html) {
  const root = new FFragment();
  const stack = [root];
  const top = () => stack.at(-1);
  let i = 0;
  const n = html.length;
  const pushText = (t) => { if (t !== '') top().appendChild(new FText(decode(t))); };
  while (i < n) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      assert.notEqual(end, -1, 'fake DOM: unterminated HTML comment in markup');
      i = end + 3;
      continue;
    }
    if (html[i] === '<' && html[i + 1] === '/') {
      const m = /^<\/([a-zA-Z][^\s>]*)\s*>/.exec(html.slice(i, i + 80));
      if (!m) { pushText(html[i]); i += 1; continue; }
      const name = m[1].toLowerCase();
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].localName === name) { stack.length = s; break; }
      }
      i += m[0].length;
      continue;
    }
    if (html[i] === '<' && /[a-zA-Z]/.test(html[i + 1] ?? '')) {
      const m = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 80));
      const name = m[1].toLowerCase();
      i += m[0].length;
      const el = new FElement(name);
      let selfClose = false;
      for (;;) {
        while (i < n && /\s/.test(html[i])) i += 1;
        if (i >= n) throw new Error(`fake DOM: unterminated <${name}> tag in markup`);
        if (html[i] === '>') { i += 1; break; }
        if (html[i] === '/' && html[i + 1] === '>') { selfClose = true; i += 2; break; }
        if (html[i] === '/') { i += 1; continue; }
        const am = /^([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(html.slice(i));
        assert.ok(am, `fake DOM: cannot parse attributes in <${name} ...> near ${JSON.stringify(html.slice(i, i + 40))}`);
        el.attributes.set(am[1], decode(am[2] ?? am[3] ?? am[4] ?? ''));
        i += am[0].length;
      }
      top().appendChild(el);
      if (name === 'template') {
        // Content of a template goes into .content.
        const close = html.toLowerCase().indexOf('</template>', i);
        assert.notEqual(close, -1, 'fake DOM: unterminated <template>');
        for (const c of parseHtml(html.slice(i, close))) el.content.appendChild(c);
        i = close + '</template>'.length;
        continue;
      }
      if (!VOID.has(name) && !selfClose) {
        if (RAW_TEXT.has(name) || name === 'textarea') {
          const close = html.toLowerCase().indexOf(`</${name}>`, i);
          assert.notEqual(close, -1, `fake DOM: unterminated <${name}>`);
          const body = html.slice(i, close);
          if (body) el.appendChild(new FText(name === 'textarea' ? decode(body) : body));
          i = close + name.length + 3;
        } else {
          stack.push(el);
        }
      }
      continue;
    }
    // text up to the next tag-looking '<'
    let j = i + 1;
    while (j < n && !(html[j] === '<' && (html[j + 1] === '/' || html[j + 1] === '!' || /[a-zA-Z]/.test(html[j + 1] ?? '')))) j += 1;
    pushText(html.slice(i, j));
    i = j;
  }
  const out = [...root.childNodes];
  for (const c of out) c.parentNode = null;
  root.childNodes = [];
  return out;
}

/* ---- document, window, click ---- */

class FDocument extends FElement {
  constructor() {
    super('#document');
    this.nodeType = 9;
    this.documentElement = new FElement('html');
    this.head = new FElement('head');
    this.body = new FElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = null;
    this.hidden = false;
    this.visibilityState = 'visible';
    this.title = '';
    this.readyState = 'complete';
    this.cookie = '';
    this.fonts = { ready: Promise.resolve(), load: () => Promise.resolve() };
  }
  get tagName() { return '#document'; }
  createElement(tag) { return new FElement(tag); }
  createElementNS(_ns, tag) { return new FElement(tag); }
  createTextNode(t) { return new FText(t); }
  createDocumentFragment() { return new FFragment(); }
  getElementById(id) { return this.querySelector(`[id="${id}"]`); }
  get title() { return this._title ?? ''; }
  set title(v) { this._title = String(v); }
}

/**
 * A click exactly as a browser orders it: capture down, target, bubble up, and
 * then the default action of a submit button (submit its form unless a handler
 * called preventDefault). A disabled control swallows the click, as in a browser.
 */
function fireClick(target, init = {}) {
  const control = target.closest?.('button, input, a, select, textarea') ?? null;
  if (control?.hasAttribute('disabled')) return { disabled: true, defaultPrevented: false };
  const ev = new FEvent('click', { clientX: 10, clientY: 10, detail: 1, button: 0, ...init });
  ev.target = target;
  target.dispatchEvent(ev);
  const submitter = target.closest?.('button, input');
  if (!ev.defaultPrevented && submitter && submitter.type === 'submit' && !submitter.hasAttribute('disabled')) {
    const form = submitter.closest('form');
    if (form) {
      const sub = new FEvent('submit');
      sub.target = form;
      sub.submitter = submitter;
      form.dispatchEvent(sub);
    }
  }
  const link = target.closest?.('a[download]');
  if (!ev.defaultPrevented && link) FNode.onDownload?.(link);
  if (!ev.defaultPrevented && target.closest?.('input[type="checkbox"]')) {
    const box = target.closest('input[type="checkbox"]');
    box.checked = !box.checked;
    const ch = new FEvent('change');
    ch.target = box;
    box.dispatchEvent(ch);
  }
  return ev;
}

/* ======================================================================= */
/* The browser around it                                                   */
/* ======================================================================= */

function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;
const HOST = 'https://pexi.test';

/**
 * Install the fake browser on globalThis. Returns the handles a test needs.
 * Timers are unref'd so a pending 4-second hint timer never holds the process.
 */
export function installFakeBrowser({ storage = makeStorage(), search = '' } = {}) {
  // A browser reports an exception thrown in a timer or a listener to
  // window.onerror and carries on. This list is that report. A test that
  // expects one takes it (app.takeErrors()); stop() fails on any left over.
  const errors = [];
  const guarded = (fn) => (...args) => {
    try { return fn(...args); } catch (e) { errors.push(e); return undefined; }
  };
  const doc = new FDocument();
  FNode.doc = doc;
  const win = new FTarget();
  win._listeners = win._listeners ?? [];
  FNode.win = win;
  win.parentNode = null;
  const loc = { search, pathname: '/', origin: HOST, host: 'pexi.test', hostname: 'pexi.test', protocol: 'https:', hash: '' };
  Object.defineProperty(loc, 'href', { get: () => `${HOST}${loc.pathname}${loc.search}`, enumerable: true });
  const entries = [{ state: null, search }];
  let at = 0;
  const hist = {
    state: null,
    get length() { return entries.length; },
    pushState(state, _t, url) {
      const u = new URL(url, HOST);
      loc.search = u.search;
      hist.state = state;
      entries.splice(at + 1);
      entries.push({ state, search: u.search });
      at = entries.length - 1;
    },
    replaceState(state, _t, url) {
      const u = new URL(url, HOST);
      loc.search = u.search;
      hist.state = state;
      entries[at] = { state, search: u.search };
    },
    // Like a browser: the move is asynchronous, and the page hears popstate.
    go(n) {
      const next = Math.min(Math.max(at + n, 0), entries.length - 1);
      if (next === at) return;
      at = next;
      loc.search = entries[at].search;
      hist.state = entries[at].state;
      const h = realSetTimeout(guarded(() => win.dispatchEvent(new FEvent('popstate', { bubbles: false, state: hist.state }))), 0);
      h.unref?.();
    },
    back() { hist.go(-1); },
    forward() { hist.go(1); },
  };
  const slot = new FElement('main');
  slot.setAttribute('id', 'screen');
  const status = new FElement('div');
  status.setAttribute('id', 'route-status');
  doc.body.appendChild(slot);
  doc.body.appendChild(status);

  // Every timer the app starts is unref'd (a pending hint timer must not hold the
  // process) and remembered, so stop() can cancel what a finished launch left
  // behind instead of letting it fire into the next launch's globals.
  const liveTimers = new Set();
  const timers = (fn) => (cb, ms, ...a) => {
    const h = fn(guarded(cb), ms, ...a);
    h?.unref?.();
    liveTimers.add(h);
    return h;
  };
  const set = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  Object.assign(win, {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, outerWidth: 390, outerHeight: 844,
    document: doc, location: loc, history: hist, localStorage: storage, sessionStorage: makeStorage(),
    scrollTo() {}, scrollBy() {}, open() { throw new Error('fake browser: window.open was called'); },
    getComputedStyle: () => ({ getPropertyValue: () => '', paddingTop: '0px', marginTop: '0px' }),
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame: (cb) => { const h = realSetTimeout(guarded(() => cb(performance.now())), 0); h.unref?.(); return h; },
    cancelAnimationFrame: (h) => clearTimeout(h),
    visualViewport: null,
    screen: { width: 390, height: 844 },
  });
  win.window = win;
  win.self = win;
  win.top = win;
  win.parent = win;
  win.dispatchEvent = FTarget.prototype.dispatchEvent;
  const navigatorStub = {
    userAgent: 'ux-b5-fake', language: 'en-CA', languages: ['en-CA'], onLine: true, connection: null,
    standalone: false, maxTouchPoints: 5,
    // vibrate is present so haptic code runs; the count is exposed for tests.
    vibrate: (p) => { win.__vibrations.push(p); return true; },
  };
  win.__vibrations = [];
  win.navigator = navigatorStub;
  for (const [k, v] of Object.entries({
    window: win, self: win, document: doc, location: loc, history: hist, localStorage: storage,
    sessionStorage: win.sessionStorage, navigator: navigatorStub, screen: win.screen,
    Element: FElement, HTMLElement: FElement, Node: FNode, Text: FText, DocumentFragment: FFragment,
    HTMLInputElement: FElement, HTMLButtonElement: FElement, HTMLFormElement: FElement, HTMLVideoElement: FElement, HTMLCanvasElement: FElement,
    Event: FEvent, CustomEvent: class extends FEvent { constructor(type, init = {}) { super(type, init); this.detail = init.detail ?? null; } },
    KeyboardEvent: FEvent, PointerEvent: FEvent, MouseEvent: FEvent,
    Image: class {
      constructor() { this.width = 220; this.height = 220; this.complete = false; }
      set src(v) {
        this._src = v;
        const h = realSetTimeout(guarded(() => { this.complete = true; this.onload?.(); }), 0);
        h.unref?.();
      }
      get src() { return this._src; }
      decode() { return Promise.resolve(); }
    },
    getComputedStyle: win.getComputedStyle, matchMedia: win.matchMedia,
    requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame,
    addEventListener: (...a) => win.addEventListener(...a), removeEventListener: (...a) => win.removeEventListener(...a),
    dispatchEvent: (ev) => win.dispatchEvent(ev),
    scrollTo() {},
    setTimeout: timers(realSetTimeout), setInterval: timers(realSetInterval),
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
  })) set(k, v);
  win.setTimeout = globalThis.setTimeout;
  win.setInterval = globalThis.setInterval;
  win.clearTimeout = clearTimeout;
  win.clearInterval = clearInterval;
  win.addEventListener = FTarget.prototype.addEventListener;
  win.removeEventListener = FTarget.prototype.removeEventListener;
  win._fire = FTarget.prototype._fire;
  const phone = installPhone(win, navigatorStub);
  return { doc, win, slot, status, loc, hist, storage, liveTimers, phone, errors };
}

/* ======================================================================= */
/* The phone: share sheet, clipboard, canvas, downloads                    */
/* ======================================================================= */

/**
 * The phone's side of the app: navigator.share (the OS share sheet), the
 * clipboard, a canvas that records what was drawn, and the browser's download.
 * Everything the app sends out through one of these lands in an array a test can
 * read. `failRender` makes canvas.toBlob return nothing, the way a device that
 * ran out of memory drawing the 1080 x 1350 card does.
 */
function installPhone(win, navigatorStub) {
  const phone = {
    shares: [],
    copied: [],
    downloads: [],
    draws: 0,
    failRender: false,
    shareSheetAvailable: true,
    shareRejects: null,
  };
  navigatorStub.share = async (data) => {
    if (!phone.shareSheetAvailable) throw new Error('fake phone: navigator.share is not available');
    if (phone.shareRejects) throw phone.shareRejects;
    phone.shares.push(data);
  };
  navigatorStub.canShare = (data) => phone.shareSheetAvailable && (!data?.files || data.files.length > 0);
  navigatorStub.clipboard = { writeText: async (text) => { phone.copied.push(String(text)); } };
  phone.position = { latitude: 43.83, longitude: -79.5 };
  navigatorStub.geolocation = {
    getCurrentPosition(ok, bad) {
      if (phone.position) ok({ coords: { ...phone.position, accuracy: 30 }, timestamp: Date.now() });
      else bad?.({ code: 1, message: 'denied' });
    },
  };
  const ctx2d = () => {
    const calls = [];
    return new Proxy({ calls }, {
      get(t, key) {
        if (key in t) return t[key];
        if (key === 'measureText') return (s) => ({ width: String(s).length * 10 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (typeof key === 'symbol') return undefined;
        return (...a) => { calls.push([key, ...a]); };
      },
      set() { return true; },
    });
  };
  FNode.canvasContext = () => { phone.draws += 1; return ctx2d(); };
  FNode.canvasToBlob = (_el, cb, type) => {
    if (phone.failRender) cb(null);
    else cb(new Blob(['ux-b5-card'], { type: type || 'image/png' }));
  };
  FNode.onDownload = (a) => { phone.downloads.push({ name: a.getAttribute('download'), href: a.getAttribute('href') }); };
  win.getComputedStyle = () => ({ getPropertyValue: (p) => (String(p).startsWith('--') ? '#123456' : ''), paddingTop: '0px', marginTop: '0px' });
  globalThis.getComputedStyle = win.getComputedStyle;
  return phone;
}

/* ======================================================================= */
/* The server stub                                                         */
/* ======================================================================= */

/**
 * A fetch that answers from a route table and records every call. A route is
 * (method, path-prefix) -> (request) => body | { status, body }. A path with no
 * route answers 404 AND is recorded in `unrouted`, which a test may assert is
 * empty: a silent default would hide a request the test did not plan for.
 */
export function makeServer(routes = {}) {
  const calls = [];
  const unrouted = [];
  const table = new Map(Object.entries(routes));
  async function fetchStub(url, init = {}) {
    const u = new URL(String(url), HOST);
    const method = (init.method ?? 'GET').toUpperCase();
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const call = { method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, url: String(url) };
    calls.push(call);
    const key = [`${method} ${u.pathname}`, u.pathname].find((k) => table.has(k));
    if (!key) {
      unrouted.push(call);
      return respond(404, { error: 'no route in the test server' });
    }
    const out = table.get(key);
    const result = typeof out === 'function' ? await out(call) : out;
    if (result && typeof result === 'object' && '__status' in result) return respond(result.__status, result.body);
    return respond(200, result);
  }
  return {
    fetch: fetchStub,
    calls,
    unrouted,
    route(key, handler) { table.set(key, handler); },
    callsTo: (path) => calls.filter((c) => c.path === path),
  };
}

export const status = (code, body = {}) => ({ __status: code, body });

function respond(code, body) {
  const text = JSON.stringify(body ?? {});
  return {
    ok: code >= 200 && code < 300,
    status: code,
    statusText: String(code),
    headers: { get: () => null, has: () => false },
    json: async () => JSON.parse(text),
    text: async () => text,
    blob: async () => new Blob([text]),
    clone() { return respond(code, body); },
  };
}

/* ======================================================================= */
/* Module hooks: fresh launch per instance, and the camera reader stub     */
/* ======================================================================= */

const APP_ROOT = pathToFileURL(fileURLToPath(new URL('../../public/js/', import.meta.url))).href;

const EYE_STUB = `
export async function attachEye(video, surfaces, handlers = {}) {
  const hub = globalThis.__uxb5Eye;
  if (!hub) throw new Error('eye stub: the test did not install globalThis.__uxb5Eye');
  return hub.attach(video, surfaces, handlers);
}
export async function startCaptureQueue() { return () => {}; }
`;

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL ?? '';
      const inst = /[?&]inst=(\d+)/.exec(parent)?.[1];
      if (inst && parent.startsWith(APP_ROOT) && /(^|\/)eye-attach\.js$/.test(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(EYE_STUB)}`, shortCircuit: true };
      }
      const out = nextResolve(specifier, context);
      if (inst && out.url.startsWith(APP_ROOT) && !out.url.includes('inst=')) {
        return { ...out, url: `${out.url}?inst=${inst}` };
      }
      return out;
    },
  });
}

/* ======================================================================= */
/* The camera reader stub                                                  */
/* ======================================================================= */

/**
 * What the screen hands the eye, and what the eye hands back. `ready(code)` is
 * "the vote settled on this code" (the eye's onBarcodeReady). `scanBarcode()` is
 * the eye's one emit path today: it sends the settled code to onBarcode and
 * returns true, or returns false with nothing ready. `pressCount` counts how
 * often the screen asked for a scan, so a test can prove nothing was pressed.
 */
export function makeEyeHub() {
  const hub = {
    handlers: null,
    attached: 0,
    readyCode: null,
    scanCalls: 0,
    barcodeMode: null,
    async attach(video, surfaces, handlers) {
      hub.handlers = handlers;
      hub.attached += 1;
      return {
        live: true,
        stop() {},
        capture() {},
        scanBarcode() {
          hub.scanCalls += 1;
          if (!hub.readyCode) return false;
          handlers.onBarcode({ value: hub.readyCode, format: 'EAN13', box: { x: 0, y: 0, width: 10, height: 10 }, frames: 12 });
          return true;
        },
        setBarcodeMode(on) { hub.barcodeMode = on; },
        setTorch() {},
        clearSelection() { hub.readyCode = null; },
        torch: { supported: false },
      };
    },
    /** The vote settles on `code`: the screen hears onBarcodeReady, nothing else. */
    ready(code, frames = 12) {
      assert.ok(hub.handlers, 'eye stub: the camera screen never attached an eye');
      hub.readyCode = code;
      hub.handlers.onBarcodeReady?.(code ? { value: code, format: 'EAN13', box: { x: 0, y: 0, width: 10, height: 10 }, frames } : null);
    },
    /** The vote loses its winner (the code left the frame). */
    lost() { hub.readyCode = null; hub.handlers.onBarcodeReady?.(null); },
  };
  return hub;
}

/* ======================================================================= */
/* Launch                                                                  */
/* ======================================================================= */

let launchCount = 0;
let restoreListeners = null;

/**
 * Cold-launch the real app: fresh module graph, fresh storage, fresh DOM.
 *
 * @param opts.seed      key -> value written to localStorage before boot
 * @param opts.search    the query string the page opens on, e.g. '?s=camera'
 * @param opts.server    route table (see makeServer); merged over the defaults
 * @returns the launch handle: the screen root, helpers to tap and read, and the
 *          counters. `taps` counts every tap this launch has made.
 */
export async function launchApp({ seed = {}, search = '', server: serverRoutes = {} } = {}) {
  installHooks();
  const storage = makeStorage();
  for (const [k, v] of Object.entries(seed)) storage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  const env = installFakeBrowser({ storage, search });
  const hub = makeEyeHub();
  globalThis.__uxb5Eye = hub;
  const server = makeServer({ ...defaultRoutes(), ...serverRoutes });
  Object.defineProperty(globalThis, 'fetch', { value: server.fetch, writable: true, configurable: true });
  launchCount += 1;
  const inst = launchCount;
  const errors = env.errors;
  const onError = (e) => errors.push(e);
  // node:test fails the running test on any unhandled rejection, even with a
  // listener of our own. The app's own `void promise()` chains reject here when
  // a guard throws, and that is a result a test may expect, so for the life of
  // a launch the runner's listeners step aside and the errors land in `errors`.
  restoreListeners?.();
  const saved = { rej: process.listeners('unhandledRejection'), unc: process.listeners('uncaughtException') };
  process.removeAllListeners('unhandledRejection');
  process.removeAllListeners('uncaughtException');
  process.on('unhandledRejection', onError);
  process.on('uncaughtException', onError);
  restoreListeners = () => {
    process.off('unhandledRejection', onError);
    process.off('uncaughtException', onError);
    for (const l of saved.rej) process.on('unhandledRejection', l);
    for (const l of saved.unc) process.on('uncaughtException', l);
    restoreListeners = null;
  };
  await import(`${APP_ROOT}main.js?inst=${inst}`);
  await settle();

  const app = {
    ...env, hub, server, errors, inst,
    taps: 0,
    keystrokes: 0,
    log: [],
    get root() { return env.slot; },
    get screen() { return env.slot.dataset.screen ?? null; },
    get cam() { return env.slot.querySelector('.cam'); },
    get state() { return env.slot.querySelector('.cam')?.dataset.state ?? null; },
    /** Taps plus typed letters: how the design document counts a journey. */
    get count() { return app.taps + app.keystrokes; },
    /** The verdict bell is up: the journey's finish line. */
    atVerdict: () => app.state === 'result' && env.slot.querySelector('.sheet.dist') !== null,
    /** Find or fail loudly: a tap on something that is not on screen is a failed journey, not a skipped step. */
    find(selector) {
      const el = env.slot.querySelector(selector);
      assert.ok(el, `nothing on screen matches ${selector} (screen=${app.screen}, state=${app.state})`);
      return el;
    },
    has: (selector) => env.slot.querySelector(selector) !== null,
    all: (selector) => env.slot.querySelectorAll(selector),
    /**
     * One tap on one control, as a finger does it: pointer down, pointer up,
     * click. The verdict sheet's grabber answers to the pointer pair, not the
     * click, so a click-only tap would miss it. Counted. Refuses to tap what a
     * shopper could not tap (hidden, disabled, or at a detent not yet opened).
     */
    async tap(target, why = '') {
      const el = typeof target === 'string' ? app.find(target) : target;
      const label = why || (typeof target === 'string' ? target : el.localName);
      assertTappable(el, label);
      for (const type of ['pointerdown', 'pointerup']) {
        const ev = new FEvent(type, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
        ev.target = el;
        el.dispatchEvent(ev);
      }
      fireClick(el);
      if (el.matches('input, textarea')) el.focus();
      app.taps += 1;
      app.log.push(`${app.taps}. ${label}`);
      await settle();
    },
    /** A pad key: a tap on [data-pad="k"]. Counted like any tap. */
    key: (k) => app.tap(`[data-pad="${k}"]`, `pad ${k}`),
    /** Type letters into a field, one input event each. Counted as keystrokes, not taps. */
    async type(target, text) {
      const el = typeof target === 'string' ? app.find(target) : target;
      assertTappable(el, `type into ${typeof target === 'string' ? target : el.localName}`);
      el.focus();
      for (const ch of text) {
        el.value = el.value + ch;
        const ev = new FEvent('input', { data: ch });
        ev.target = el;
        el.dispatchEvent(ev);
        app.keystrokes += 1;
        await settle(2);
      }
    },
    /** A module of THIS launch (same instance the app is using), e.g. mod('shops.js'). */
    mod: (name) => import(`${APP_ROOT}${name}?inst=${inst}`),
    text: () => env.slot.textContent,
    async wait(ms) { await new Promise((r) => realSetTimeout(r, ms)); await settle(); },
    assertNoErrors() { assert.deepEqual(errors.map(String), [], 'the app raised errors during this launch'); },
    /** The errors the app raised so far (timers, listeners, promises), removed from the list. A test that expects a loud failure reads it here. */
    takeErrors() { return errors.splice(0); },
    /** End the launch. Fails on any error nobody took: a silent exception is a defect, not noise. */
    stop() {
      for (const h of env.liveTimers) { clearTimeout(h); clearInterval(h); }
      env.liveTimers.clear();
      restoreListeners?.();
      assert.deepEqual(errors.map((e) => String(e?.stack ?? e)), [], 'the app raised errors during this launch that the test did not expect');
    },
  };
  return app;
}

/** Fail loudly when a test taps something a shopper could not tap. */
function assertTappable(el, why) {
  assert.ok(el.isConnected, `tapped a node that is no longer on screen: ${why}`);
  for (let n = el; n instanceof FElement; n = n.parentNode) {
    assert.ok(!n.hasAttribute('hidden'), `tapped something hidden (${why}): <${n.localName} hidden>`);
  }
  const control = el.closest('button, input, a, select, textarea');
  assert.ok(!(control && control.hasAttribute('disabled')), `tapped a disabled control (${why}); a shopper's tap would do nothing`);
  const part = el.closest('.sheet-half, .sheet-full');
  const sheet = el.closest('.sheet');
  if (part && sheet) {
    const order = ['peek', 'half', 'full'];
    const at = order.indexOf(sheet.dataset.detent || 'peek');
    const need = part.classList.contains('sheet-full') ? 2 : 1;
    assert.ok(at >= need, `tapped a control that lives at the ${order[need]} detent while the sheet is at ${order[at]} (${why}); the shopper must open the sheet first, and that is a counted tap`);
  }
}

/** Let promises and zero-delay timers drain (a handful of macrotask turns). */
export async function settle(turns = 6) {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => realSetTimeout(r, 0));
}

/* ======================================================================= */
/* Default server answers                                                  */
/* ======================================================================= */

export const STORE_KEYS = {
  // filled by journeys that need a returning user; see seedReturning()
};

function defaultRoutes() {
  return {
    '/api/scenarios': { items: [] },
    '/api/catalogue': { items: [] },
    '/api/categories': [],
    '/api/quota': { used: 0, limit: 5, remaining: 5, resetsAt: null },
    '/api/consent': { photos: false, location: false, updatedAt: null },
    '/api/event': { stored: true },
    '/api/events/batch': { stored: true },
    '/api/stores': { stores: [] },
    '/api/store-chains': { chains: [] },
    '/api/attribution': { items: [] },
    '/api/identify/demo': { items: [] },
    '/api/scan-price': { stored: true },
    '/api/scan-rating': { stored: true },
    '/api/correction': { stored: true },
    '/api/search': { candidates: [] },
  };
}

/* ======================================================================= */
/* Shared fixtures and steps for the build 5 test files                    */
/* ======================================================================= */

export const CODE = '0068100084245';
export const KD = {
  name: 'Kraft Dinner Original',
  brand: 'Kraft',
  size: '225 g',
  barcode: CODE,
  category: { tag: 'en:pasta', name: 'Pasta' },
};

/** A store that has finished first-run: the camera is the first screen. */
export const RETURNING = { 'shin.v1': { seenIntro: true, consentSeen: true, permissionsSeen: true } };

/**
 * A verdict-bell answer with the shopper's price placed in it. `cents` is the
 * price the shopper typed; `suspect` marks a likely x100 slip with a suggestion.
 */
export async function verdictAt(cents, { suspectSuggest = null } = {}) {
  const F = await import('../verdict-fixtures.mjs');
  const v = JSON.parse(JSON.stringify(F.GOOD));
  if (cents === null || cents === undefined) { v.shopper = null; return v; }
  const pct = ((cents - v.centreCents) / v.centreCents) * 100;
  const zone = pct <= -30 ? 'great' : pct <= -20 ? 'good' : pct >= 20 ? 'bad' : 'reasonable';
  v.shopper = {
    cents, zone, offByPct: Math.round(pct * 10) / 10,
    beyond: suspectSuggest ? 'high' : null,
    suspect: suspectSuggest ? { suggestCents: suspectSuggest } : null,
  };
  return v;
}

/** The server's catalogue-first answer to /api/identify for a barcode the catalogue holds. */
export function identifyRoute({ identity = KD, suspectOver = null } = {}) {
  return async (call) => {
    const cents = call.query.shelfPriceCents ? Number(call.query.shelfPriceCents) : null;
    const suspect = suspectOver && cents && cents >= suspectOver.atLeast ? suspectOver.suggest : null;
    return {
      kind: 'catalogue', outcome: 'catalogue_hit', offerManualEntry: false, catalogueUp: true,
      barcode: call.query.gtin ?? identity.barcode, identity, range: null,
      verdict: await verdictAt(cents, { suspectSuggest: suspect }),
      scanId: 41,
    };
  };
}

/** Launch as a returning shopper with the catalogue answering KD. Extra routes win. */
export async function launchReturning({ seed = {}, server = {}, ...rest } = {}) {
  return launchApp({
    ...rest,
    seed: { ...RETURNING, ...seed },
    server: { '/api/identify': identifyRoute(), ...server },
  });
}

/** Permissions Continue, Consent Continue. Two counted taps. */
export async function onboard(app) {
  assert.equal(app.screen, 'permissions', `expected the permission screen first, got ${app.screen}`);
  await app.tap('[data-act="go"]', 'Permissions Continue');
  assert.equal(app.screen, 'consent', `expected the consent screen second, got ${app.screen}`);
  await app.tap('[data-act="go"]', 'Consent Continue');
  assert.equal(app.screen, 'camera', `expected the camera third, got ${app.screen}`);
}

/** Point at a barcode and press the scan control, the way a shopper does today. One counted tap. */
export async function pressScan(app, code = CODE) {
  app.hub.ready(code);
  await app.tap('[data-act="scan-barcode"]', 'scan press');
  // UX build 1 (R-4): the frame holds CAPTURE_HOLD_MS on the code before the pad rises. Time, not a tap.
  const { CAPTURE_HOLD_MS } = await app.mod('lib/haptics.js');
  await app.wait(CAPTURE_HOLD_MS + 40);
}

/**
 * Get to a verdict by whichever pad the app has (with or without a point key),
 * for tests whose subject is what happens AFTER the verdict. The price is $4.99.
 * Read `app.taps` afterwards as the baseline; these taps are setup, not journey.
 */
export async function reachVerdict(app, keys) {
  await pressScan(app);
  const k = keys ?? (app.has('[data-pad="."]') ? ['4', '.', '9', '9'] : ['4', '9', '9']);
  await typePrice(app, k);
  assert.equal(app.atVerdict(), true, `setup failed: the verdict is not up (screen=${app.screen}, state=${app.state})`);
}

/**
 * Hold the phone steady on a barcode for `ms`, the way the real eye behaves:
 * it reports the settled code again on every tick for as long as the code stays
 * in frame. Stops early the moment the screen leaves the viewfinder (the scan
 * fired). Returns how long it held, in ms. Nothing here taps anything.
 */
export async function holdSteady(app, code, ms, everyMs = 30) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (app.state !== 'idle') break;
    app.hub.ready(code);
    await app.wait(everyMs);
  }
  return Date.now() - t0;
}

/** The keys of a price, as pad presses ("4","9","9"), then the confirm key. Counted. */
export async function typePrice(app, keys) {
  for (const k of keys) await app.key(k);
  await app.tap('[data-act="pad-confirm"]', 'pad confirm');
}

/* ======================================================================= */
/* The harness's own negative controls                                     */
/* ======================================================================= */

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  test('harness control: the parser builds the tree the HTML describes', () => {
    installFakeBrowser();
    const el = new FElement('div');
    el.innerHTML = '<p class="a b" data-x-y="1">hi <b>there</b></p><button data-pad="4" disabled>4</button><input value="v"><svg><path d="M0"/></svg>';
    assert.equal(el.children.length, 4);
    assert.equal(el.querySelector('p.a.b').dataset.xY, '1');
    assert.equal(el.querySelector('p').textContent, 'hi there');
    assert.equal(el.querySelector('input').value, 'v');
    assert.ok(el.querySelector('svg > path'));
    assert.equal(el.querySelectorAll('[data-pad]').length, 1);
  });

  test('harness control: a selector that should match nothing matches nothing', () => {
    installFakeBrowser();
    const el = new FElement('div');
    el.innerHTML = '<button data-pad="4">4</button><button data-pad="9">9</button>';
    assert.equal(el.querySelector('[data-pad="5"]'), null);
    assert.equal(el.querySelectorAll('[data-pad]:not([data-pad="4"])').length, 1);
    assert.throws(() => el.querySelector(':nth-child(2)'), /not supported/, 'an unsupported selector must throw, never return empty');
  });

  test('harness control: a disabled button swallows the click, so a tap on it cannot be counted as a step', async () => {
    installFakeBrowser();
    const el = new FElement('div');
    el.innerHTML = '<button id="go" disabled>go</button>';
    FNode.doc.body.appendChild(el);
    let fired = 0;
    el.addEventListener('click', () => { fired += 1; });
    const result = fireClick(el.querySelector('#go'));
    assert.equal(fired, 0);
    assert.equal(result.disabled, true);
  });

  test('harness control: clicks bubble through a delegated listener and a submit button submits its form', () => {
    installFakeBrowser();
    const root = new FElement('div');
    root.innerHTML = '<form><input name="q" value="milk"><button type="submit">go</button></form>';
    FNode.doc.body.appendChild(root);
    const seen = [];
    root.addEventListener('click', (e) => seen.push(`click:${e.target.closest('button')?.localName}`));
    root.addEventListener('submit', (e) => { seen.push('submit'); e.preventDefault(); });
    fireClick(root.querySelector('button'));
    assert.deepEqual(seen, ['click:button', 'submit']);
    // And a button that calls preventDefault on its click does not submit.
    const seen2 = [];
    root.addEventListener('submit', () => seen2.push('submit'));
    root.querySelector('button').addEventListener('click', (e) => e.preventDefault());
    fireClick(root.querySelector('button'));
    assert.deepEqual(seen2, [], 'preventDefault on the click must stop the submit');
  });

  test('harness control: the server stub records an unplanned request instead of answering it quietly', async () => {
    const s = makeServer({ '/api/known': { ok: 1 } });
    const known = await s.fetch('/api/known');
    assert.equal(known.status, 200);
    const unknown = await s.fetch('/api/never-planned');
    assert.equal(unknown.status, 404);
    assert.equal(s.unrouted.length, 1, 'a request with no route must be listed so a test can assert none happened');
  });

  test('harness control: a returning launch opens on the camera with no tap, and the eye stub was attached', async () => {
    const app = await launchReturning();
    assert.equal(app.screen, 'camera');
    assert.equal(app.taps, 0);
    assert.equal(app.hub.attached, 1, 'the camera screen never asked the eye for a reader');
    app.assertNoErrors();
    app.stop();
  });

  test('harness control: a shopper cannot tap a disabled key or a control at a detent that is not open', async () => {
    const app = await launchReturning();
    await pressScan(app);
    await assert.rejects(app.tap('[data-act="pad-confirm"]'), /disabled control/, 'the confirm key is off until a price is typed');
    await typePrice(app, ['4', '9', '9']);
    assert.equal(app.atVerdict(), true);
    await assert.rejects(app.tap('[data-act="correct"]'), /half detent/, 'Correct it lives at the half detent');
    const before = app.taps;
    await app.tap('[data-act="detent-step"]', 'grabber');
    assert.equal(app.find('.sheet').dataset.detent, 'half', 'a pointer tap on the grabber must open the half detent');
    await app.tap('[data-act="correct"]');
    assert.equal(app.screen, 'correct');
    assert.equal(app.taps, before + 2, 'a refused tap must not be counted');
    app.stop();
  });

  test('harness control: the real app boots to the permissions screen on a fresh install, and a tap is counted once', async () => {
    const app = await launchApp();
    assert.equal(app.screen, 'permissions', `a fresh install should open the permission screen; got ${app.screen}. errors: ${app.errors.map(String).join('; ')}`);
    assert.equal(app.taps, 0);
    assert.equal(app.has('[data-no-such-control]'), false);
    assert.throws(() => app.find('[data-no-such-control]'), /nothing on screen matches/);
    app.stop();
  });
}
