/**
 * A DOM small enough to keep, for the tests that have to be behavioural.
 *
 * WHY THIS EXISTS. This app carries zero runtime dependencies by decision
 * (`test/sheet.test.mjs`'s header states it, `test/radiogroup.test.mjs` says
 * "no DOM, no jsdom and no new dependency"), so most client tests check a
 * rendered HTML STRING or check the SOURCE of a screen. That is enough for
 * markup. It is not enough for the two promises `grounded-client.test.mjs`
 * has to keep, because both are about what happens when a real click travels
 * through a real tree:
 *
 *   - a tap inside a `[data-no-track]` region records nothing, and the same
 *     button outside it records one tap;
 *   - `grounded.js` builds nodes, not strings, so there is no HTML to grep
 *     until something has actually run `createElement` for it.
 *
 * A grep would pass on a `track.js` whose guard had been moved below the
 * `track()` call, and on a `grounded.js` that built the right elements and
 * appended them in the wrong place. So: about two hundred lines of DOM, no
 * dependency, and the checks get to be about behaviour.
 *
 * DELIBERATELY NOT A BROWSER. `innerHTML` stores the string and does not
 * parse it, which is exactly right for the one place this client assigns it
 * (Google's own rendered Search Suggestions markup, which no test needs to
 * walk into and which nothing here is allowed to rewrite). Selector support
 * is tag, `.class`, `[attr]`, `[attr="value"]`, and comma lists, because that
 * is the whole vocabulary the files under test use. Anything richer would be
 * a second browser to maintain and a second thing to be wrong.
 */

const ATTR = /^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/;

function matchesOne(node, sel) {
  const s = sel.trim();
  if (s === '') return false;
  const attr = ATTR.exec(s);
  if (attr) {
    const [, name, value] = attr;
    if (!node.attributes.has(name)) return false;
    return value === undefined || node.attributes.get(name) === value;
  }
  if (s.startsWith('.')) return node.classList.contains(s.slice(1));
  return node.tagName === s.toLowerCase();
}

function matches(node, selector) {
  return String(selector).split(',').some((part) => matchesOne(node, part));
}

class MiniClassList {
  constructor(node) { this.node = node; }
  get set() {
    const raw = this.node.attributes.get('class') ?? '';
    return new Set(raw.split(/\s+/).filter(Boolean));
  }
  contains(name) { return this.set.has(name); }
  add(name) { const s = this.set; s.add(name); this.node.attributes.set('class', [...s].join(' ')); }
  remove(name) { const s = this.set; s.delete(name); this.node.attributes.set('class', [...s].join(' ')); }
  toggle(name, on) { if (on) this.add(name); else this.remove(name); }
}

export class MiniElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = [];
    this._text = '';
    /** Raw, unparsed. See the header: this is a store, not a parser. */
    this.innerHTMLRaw = '';
    this._innerHTMLWrites = 0;
    this.classList = new MiniClassList(this);
    this.dataset = new Proxy({}, {
      get: (_t, key) => this.attributes.get(`data-${camelToDash(String(key))}`),
      set: (_t, key, value) => { this.attributes.set(`data-${camelToDash(String(key))}`, String(value)); return true; },
      has: (_t, key) => this.attributes.has(`data-${camelToDash(String(key))}`),
    });
  }

  get className() { return this.attributes.get('class') ?? ''; }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }

  get innerHTML() { return this.innerHTMLRaw; }
  set innerHTML(value) {
    this.innerHTMLRaw = String(value);
    this._innerHTMLWrites += 1;
    // An assignment replaces children in a browser; keep that true so a
    // template assignment followed by appendChild behaves the way the screens
    // expect it to.
    this.childNodes = [];
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this._text = value === null || value === undefined ? '' : String(value);
    this.childNodes = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  get children() { return this.childNodes; }

  closest(selector) {
    let node = this;
    while (node) {
      if (node instanceof MiniElement && matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  /** Depth-first, document order, self excluded. Same as the real thing. */
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  /** Every element in the subtree, self included. For the sweeping assertions. */
  all() {
    const out = [this];
    const walk = (node) => { for (const c of node.childNodes) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  addEventListener(type, fn, opts = {}) {
    this.listeners.push({ type, fn, capture: Boolean(opts.capture ?? opts === true) });
  }
}

function camelToDash(key) {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

class MiniDocument extends MiniElement {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.documentElement = new MiniElement('html', this);
    this.documentElement.parentNode = this;
    this.body = new MiniElement('body', this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
    this.hidden = false;
  }
  createElement(tag) { return new MiniElement(tag, this); }
}

export function makeDocument() {
  return new MiniDocument();
}

/**
 * Fire a click at `target`, capture phase first, exactly as a browser orders
 * it: document down to the target, then the target back up.
 *
 * The capture half is the half that matters here. `track.js` listens in the
 * capture phase on purpose (so a screen calling `stopPropagation` cannot make
 * a tap invisible), and a test that only ran the bubble half would report a
 * guard working when the listener it is guarding never ran at all.
 */
export function click(target, init = {}) {
  const path = [];
  for (let node = target; node; node = node.parentNode) path.push(node);
  const event = {
    type: 'click',
    target,
    clientX: init.clientX ?? 10,
    clientY: init.clientY ?? 10,
    ...init,
  };
  for (let i = path.length - 1; i >= 0; i -= 1) {
    for (const l of path[i].listeners) if (l.type === 'click' && l.capture) l.fn(event);
  }
  for (let i = 0; i < path.length; i += 1) {
    for (const l of path[i].listeners) if (l.type === 'click' && !l.capture) l.fn(event);
  }
  return event;
}

/** A localStorage that is a Map, so a test can read what was written. */
export function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

/**
 * Everything `track.js` reads at import time, and nothing more.
 *
 * `track.js` gates all of its listener wiring on
 * `typeof window !== 'undefined' && typeof document !== 'undefined'`, so these
 * have to be in place BEFORE the dynamic import that pulls it in. Its own
 * header explains why that gate exists: a bare top-level `screen.width` once
 * took down every suite that imports `camera.js` for a pure function.
 */
export function installBrowser({ doc, storage }) {
  const win = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const prior = {};
  // `defineProperty`, not assignment: on Node 24 `navigator` is a getter-only
  // accessor on globalThis and a plain `globalThis.navigator = ...` throws.
  const set = (name, value) => {
    prior[name] = globalThis[name];
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  };
  set('window', win);
  set('document', doc);
  set('Element', MiniElement);
  set('localStorage', storage);
  set('navigator', { userAgent: 'mini', language: 'en-CA', connection: null });
  set('screen', { width: 390, height: 844 });
  set('matchMedia', () => ({ matches: false }));
  set('fetch', async () => ({ ok: false, status: 0, json: async () => ({}) }));
  return () => {
    for (const [name, value] of Object.entries(prior)) {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }
  };
}
