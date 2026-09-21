/**
 * ITEM 3. NEVER LET GEMINI'S STATED PRICE STAND ON ITS OWN WORD -- as a CHECK,
 * never a second call (ruling 3, docs/decisions.md 2026-09-19, quoting the
 * walkthrough ruling on checking an answer: "there can be measures in place but
 * definitely not calling the ai a second time"). This file fetches ONE page,
 * only a host on a fixed allowlist, only a URL Gemini's own grounded search
 * already returned as a citation (`run.citations`, from `walkSteps` in
 * `gemini-grounded.ts`), parses it deterministically for a price with no model
 * anywhere in the loop, and reports agreement or mismatch. It NEVER changes the
 * price shown -- Shin's own parse is a check on Gemini's number, never a
 * replacement for it (rule 3, "THE PRICE SHOULD NOT COME FROM US"; the
 * walkthrough ruling "Shin never shows its own price math... a mismatch marks
 * that scan... for later review. Never shown.").
 *
 * NOTHING HERE IS WIRED INTO THE LIVE SCAN. Calling this after a scan, and
 * recording its result on the scan row, is a route-layer decision (which scan
 * to spend the fetch on, when, and where the result is stored) -- out of this
 * package's scope, and `app/server.ts` is owned by another session.
 *
 * `transport` is injected, exactly like `GeminiTransport`/`GroundedTransport`
 * elsewhere in this package, so a test never reaches the real internet.
 */

export interface VerifierTransport {
  (
    url: string,
    init: { readonly signal: AbortSignal; readonly redirect: 'manual' },
  ): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly headers: { get(name: string): string | null };
    text(): Promise<string>;
  }>;
}

/**
 * Hosts this file may fetch. A starter list of major Canadian retailers the
 * grounded search already names most often for a Canadian scan; extending it
 * is his call, never guessed at scan time. Anything not on this list is left
 * unverified rather than fetched, which is the point of an allowlist over a
 * blocklist: a host this file has never heard of cannot slip through.
 */
export const ALLOWED_VERIFIER_HOSTS: ReadonlySet<string> = new Set([
  'www.walmart.ca',
  'www.costco.ca',
  'www.canadiantire.ca',
  'www.realcanadiansuperstore.ca',
  'www.nofrills.ca',
  'www.metro.ca',
  'www.sobeys.ca',
  'www.loblaws.ca',
  'www.wellca.ca',
  'www.amazon.ca',
]);

/**
 * A URL this file may fetch: HTTPS only, no userinfo, no explicit port, a
 * hostname on the allowlist, and a real path (the bare root is never a product
 * page). Open Food Facts and anything else not named is refused by
 * construction -- mirroring `approvedWebProductUrl` (sugar-no-scanner-demo,
 * `src/server/web-product-evidence.ts:17`), which is exactly what "only a
 * host on an allowlist" (ruling 3) asks for.
 */
export function isAllowedVerifierUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username !== '' || u.password !== '') return false;
  if (u.port !== '') return false;
  if (!ALLOWED_VERIFIER_HOSTS.has(u.hostname.toLowerCase())) return false;
  if (u.pathname === '' || u.pathname === '/') return false;
  return true;
}

/** One offer this file could verify, in the shape it needs and nothing more. */
export interface VerifiableOffer {
  readonly retailer: string | null;
  readonly url: string | null;
  /** Dollars, as `ReadOffer.price` already carries it. Converted to cents here, never guessed. */
  readonly price: number | null;
}

/**
 * The one offer this run may verify: cited by Gemini's own grounded search
 * AND on the host allowlist. A URL the model merely states, with no matching
 * citation, is never fetched -- that is what "only a URL the grounded response
 * itself returned" (ruling 3) forbids skipping. `null` when no offer qualifies,
 * which is the common case and never an error.
 */
export function pickVerifiableOffer(
  offers: readonly VerifiableOffer[],
  citations: readonly { readonly url: string }[],
): VerifiableOffer | null {
  const cited = new Set(citations.map((c) => c.url));
  return (
    offers.find((o) => o.url !== null && o.price !== null && Number.isFinite(o.price) && cited.has(o.url) && isAllowedVerifierUrl(o.url)) ??
    null
  );
}

export type VerifyOutcome = 'agree' | 'mismatch' | 'unavailable' | 'not_verifiable';

export interface VerifyResult {
  readonly outcome: VerifyOutcome;
  readonly retailer: string | null;
  readonly url: string | null;
  /** The price this file parsed off the page, in cents, or null when none was found. */
  readonly pageCents: number | null;
  /** The price Gemini stated for this offer, in cents, or null when there was nothing to check. */
  readonly statedCents: number | null;
  readonly reason: string | null;
}

const MAX_PAGE_BYTES = 1_500_000;
const TIMEOUT_MS = 5_000;

/**
 * A price out of a retailer page, deterministically, no model in the loop:
 * first a JSON-LD `Product`/`Offer` block (the schema.org markup most retailer
 * pages already carry for their own search-engine listings), then a bare
 * `"price":"..."` fragment as a fallback. Mirrors `fetchVerifiedWebProduct`
 * (sugar-no-scanner-demo, `src/server/web-product-evidence.ts:249`) in spirit:
 * parse what the page's own structured data says, never guess at prose.
 */
/**
 * A price out of a page, as a number, or null.
 *
 * Retailer pages write grouped thousands in their own JSON-LD
 * (`"price":"1,299.99"`), and `Number` reads that as NaN, so the structured
 * pass fell through to the bare fragment below, which then matched the leading
 * `1` and reported one dollar. A price this file cannot read WHOLE is no price
 * at all: that is the difference between "not verifiable" and marking a scan a
 * mismatch against a number nobody charges. Only the comma-grouped form is
 * read; `1 299,99` is a separator style this file does not know, and guessing
 * which of the two marks is the decimal one is exactly the guess it must not
 * make.
 */
function priceAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(text)) return null;
  const amount = Number(text.replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function priceCentsInHtml(html: string): number | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const offersField = (node as { offers?: unknown } | null)?.offers;
      const offerNodes = Array.isArray(offersField) ? offersField : offersField ? [offersField] : [];
      for (const offer of offerNodes) {
        const amount = priceAmount((offer as { price?: unknown } | null)?.price);
        if (amount !== null) return Math.round(amount * 100);
      }
    }
  }
  // The whole value, up to the closing quote or the end of the JSON token, so
  // a number this file cannot read whole comes back as no price rather than as
  // whichever digits happened to match first.
  const plain = html.match(/"price"\s*:\s*(?:"([^"]*)"|([^",}\s]+))/i);
  if (plain) {
    const amount = priceAmount(plain[1] ?? plain[2]);
    if (amount !== null) return Math.round(amount * 100);
  }
  return null;
}

/**
 * Verifies the one offer `pickVerifiableOffer` names, if any. A 5-second
 * timeout, `redirect: 'manual'` (this file never follows a redirect off the
 * allowlisted host), a `text/html` requirement, and a 1,500,000-byte ceiling
 * all mirror `fetchVerifiedWebProduct`'s own limits. NEVER a second call to any
 * model, and the result NEVER changes what a caller already decided to show
 * (ruling 3): it only says whether the page agreed.
 */
export async function verifyPrice(
  offers: readonly VerifiableOffer[],
  citations: readonly { readonly url: string }[],
  opts: { readonly transport: VerifierTransport },
): Promise<VerifyResult> {
  const offer = pickVerifiableOffer(offers, citations);
  if (!offer || offer.url === null || offer.price === null) {
    return { outcome: 'not_verifiable', retailer: offer?.retailer ?? null, url: offer?.url ?? null, pageCents: null, statedCents: null, reason: 'no offer is both a cited URL and on the allowlist' };
  }
  const statedCents = Math.round(offer.price * 100);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Awaited<ReturnType<VerifierTransport>>;
    try {
      res = await opts.transport(offer.url, { signal: controller.signal, redirect: 'manual' });
    } catch (err) {
      const timedOut = controller.signal.aborted;
      return {
        outcome: 'unavailable',
        retailer: offer.retailer,
        url: offer.url,
        pageCents: null,
        statedCents,
        reason: timedOut ? 'timed out' : `fetch failed: ${String(err)}`,
      };
    }
    if (!res.ok) {
      return { outcome: 'unavailable', retailer: offer.retailer, url: offer.url, pageCents: null, statedCents, reason: `http ${res.status}` };
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('text/html')) {
      return { outcome: 'unavailable', retailer: offer.retailer, url: offer.url, pageCents: null, statedCents, reason: `not html: ${contentType || 'unknown'}` };
    }
    const text = await res.text();
    if (text.length > MAX_PAGE_BYTES) {
      return { outcome: 'unavailable', retailer: offer.retailer, url: offer.url, pageCents: null, statedCents, reason: 'page too large' };
    }
    const pageCents = priceCentsInHtml(text);
    if (pageCents === null) {
      return { outcome: 'not_verifiable', retailer: offer.retailer, url: offer.url, pageCents: null, statedCents, reason: 'no price found on the page' };
    }
    return {
      outcome: pageCents === statedCents ? 'agree' : 'mismatch',
      retailer: offer.retailer,
      url: offer.url,
      pageCents,
      statedCents,
      reason: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
