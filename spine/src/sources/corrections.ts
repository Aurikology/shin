/**
 * The prices people typed in themselves.
 *
 * This is the read half of `price/src/corrections.ts`. It is the file that makes
 * the mascot's own line true: the correction screen has always said "counts once
 * a second tag agrees", and until this adapter existed nothing counted, because
 * nothing read the corrections back. Grocery needs two price points
 * (`categories.ts`, minPoints 2), so one shopper's correction plus one crawled
 * observation, or two shoppers in two shops, is the difference between a refusal
 * and a verdict for a product our feeds have never priced.
 *
 * IT IDENTIFIES NOTHING, ON PURPOSE. `identify()` returns null on every query and
 * always will. A person correcting a price is telling us what a tag says, not
 * telling us what the product is; treating a typed price as evidence of identity
 * would let a mistyped correction pull a later scan onto the wrong product, which
 * is the pilot's worst failure class (a Canon R6 query answered with an R6 Mark
 * II, every price accurate and all of them about a different camera). It also
 * means this source's position in `registry.ts` cannot affect identity
 * resolution at all, since that tie-break only reads sources that identify.
 *
 * THE SELLER IS THE POINT. `observed.ts` has to hide most of its rows behind a
 * sentinel because openprices does not say which shop a price came from, so the
 * spine cannot exclude a shopper's own store from its own comparison. A
 * correction does not have that problem: the shop is the one field the
 * correction screen refuses to save without, and it is stored as the person
 * typed it, so `spine.ts`'s self-exclusion (`askingSellerKey`) works on these
 * rows the way it was designed to. A correction made in the Metro you are
 * standing in is dropped from the comparison you are standing in.
 *
 * WHAT THIS SOURCE CANNOT DO, stated so nobody reads more into a number than is
 * there. It cannot tell a mistake from a lie. One person filing one price per
 * shop per day is enforced upstream by a unique index, so nobody manufactures
 * agreement with themselves, but two devices reporting the same wrong number are
 * indistinguishable here from two honest shoppers. What limits the damage today
 * is that they still count as one distinct seller, so `confidenceOf` cannot rate
 * them high. Reverses when there is enough volume to compare a correction
 * against the distribution of every other reading of the same shelf, which is a
 * real check and not this file's job.
 */

import { correctionsFor, type CorrectionRow } from '../../../price/src/corrections.ts';
import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';

/**
 * Every category a person can stand in front of a tag in, which is all of them
 * except produce.
 *
 * Produce is left out because `contract.ts` has a refusal reason whose text is
 * "Category has no source we trust. Produce, today.", and quietly adding one
 * here would reverse that decision as a side effect of building something else.
 * The reason produce is hard is not supply anyway: it is that loose produce is
 * priced per kilogram against a weight nobody records, so two readings of the
 * same bin are not comparable numbers. REVERSES IF the correction screen ever
 * collects a weight or a unit alongside the price, at which point this list
 * should include produce and this comment should be deleted rather than edited.
 */
const SERVED: readonly CategoryId[] = ['grocery', 'tech', 'used', 'furniture'];

/**
 * The provenance sentence carried on every point this source produces. It is
 * shown, not hidden: a number somebody typed on a phone is a different kind of
 * evidence from a number a retailer published, and the person reading the
 * verdict is entitled to know which one is holding it up.
 */
const NOTE = 'Typed in by a shopper standing in front of the tag, not fetched from a seller.';

export class CorrectionSource implements PriceSource {
  readonly id = 'corrections';
  readonly label = 'Prices shoppers typed in from the tag in front of them';
  readonly categories = SERVED;
  /**
   * True, and the only true one in the source list today. "Verified" here means
   * this file's own read path has been run against the real store, which is the
   * sense `observed.ts` and `bestbuy.ts` are careful about when they say false.
   *
   * THE RUN, 2026-09-05, through the running app server and its real catalogue,
   * on Lay's Classic Potato Chips (0060410015292), asking $4.99:
   *
   *   before   1 point, walmart.ca $3.47, "1 price where groceries and
   *            household usually needs 2; 1 seller where it usually needs 2"
   *   posted   $3.99 at No Frills, through POST /api/correction
   *   after    2 points, No Frills $3.99 from this source alongside it, and the
   *            verdict line moved from one store to "about $3.73 across 2
   *            stores"
   *   again    the same correction re-sent came back as the same row, not a
   *            second witness
   *   standing the same query with askingSeller "No Frills" dropped the
   *   in it    correction from its own comparison, leaving walmart.ca alone
   */
  readonly verified = true;

  available(): SourceAvailability {
    // Deliberately always ok. `correctionsFor` never throws and answers an
    // unopened or missing database with an empty list, so this source with no
    // file behaves exactly as the app did before corrections existed. Reporting
    // unavailable instead would put a scary line in the sources report for the
    // ordinary state of a phone nobody has corrected anything on yet.
    return { ok: true };
  }

  /** Always null. See the header: a typed price is not an identification. */
  async identify(_query: SpineQuery): Promise<ProductIdentity | null> {
    return null;
  }

  async prices(identity: ProductIdentity): Promise<readonly PricePoint[]> {
    const rows = correctionsFor({ code: identity.gtin ?? null, productId: identity.id });
    return rows.map((r) => toPricePoint(r));
  }
}

function toPricePoint(row: CorrectionRow): PricePoint {
  return {
    seller: row.seller,
    amountCents: row.price_cents,
    currency: 'CAD',
    kind: row.kind,
    // The day the tag was seen, never the day the row was written. A correction
    // queued offline in an aisle and flushed three days later is still evidence
    // about the day it was read, and staleness is checked against this field.
    observedAt: row.seen_on,
    sourceId: 'corrections',
    note: NOTE,
  };
}
