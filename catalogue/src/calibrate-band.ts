/**
 * What the confident band's threshold should actually be, measured.
 *
 * WHY THIS EXISTS. CONFIDENT_SIM and LEAD_MARGIN were picked by feel before
 * there was a catalogue to look at, and the first real queries put every single
 * one of them in the ambiguous band: the top two similarities land within a
 * hundredth of each other every time, and the margin asks for four hundredths.
 * A band nothing can reach is not a cautious band, it is a broken one, because
 * the product then asks the user to disambiguate on every scan, including the
 * ones where it knew the answer.
 *
 * WHAT IT MEASURES. Two sets of queries with known right answers.
 *
 *   settled  a query naming one specific product: brand, product and size. The
 *            catalogue should be confident, and the gap between the leader and
 *            the runner-up on these is what the margin has to be able to clear.
 *
 *   open     a query naming a kind of thing, where several rows are all equally
 *            correct answers. The catalogue should NOT be confident, and the gap
 *            on these is what the margin has to stay above.
 *
 * The threshold has to sit between the two distributions. If they overlap, then
 * raw cosine distance is the wrong quantity to threshold on and the finding is
 * that, not a number.
 *
 * Run: node src/calibrate-band.ts
 */

import { Catalogue } from './search.ts';
import { openCatalogue } from './schema.ts';
import { defaultEmbedder } from './embed.ts';

/**
 * Queries shaped the way the identify stage actually issues them.
 *
 * That is the whole point of the second version of this script. The first one
 * passed only text, so brandAgrees and sizeAgrees came back null on every row,
 * and a measurement that says two signals are useless when it never asked for
 * them is worse than no measurement. The model reads a brand and a size off the
 * package and passes them as their own fields; this does the same.
 */
interface Probe {
  readonly text: string;
  readonly brand?: string;
  readonly sizeValue?: number;
  readonly sizeUnit?: string;
}

/** Each is a real product in the loaded Canadian catalogue, pinned by brand and size. */
const SETTLED: Probe[] = [
  { text: 'Kraft smooth peanut butter', brand: 'Kraft', sizeValue: 1000, sizeUnit: 'g' },
  { text: 'Nutella hazelnut spread', brand: 'Nutella', sizeValue: 725, sizeUnit: 'g' },
  { text: 'Heinz tomato ketchup', brand: 'Heinz', sizeValue: 1000, sizeUnit: 'ml' },
  { text: 'Cheerios original cereal', brand: 'General Mills', sizeValue: 570, sizeUnit: 'g' },
  { text: 'Coca-Cola classic', brand: 'Coca-Cola', sizeValue: 2000, sizeUnit: 'ml' },
  { text: 'Campbell chicken noodle soup', brand: "Campbell's", sizeValue: 284, sizeUnit: 'ml' },
  { text: 'Tim Hortons original blend coffee', brand: 'Tim Hortons', sizeValue: 300, sizeUnit: 'g' },
  { text: 'Quaker instant oatmeal maple brown sugar', brand: 'Quaker', sizeValue: 344, sizeUnit: 'g' },
  { text: 'Special K red berries', brand: "Kellogg's", sizeValue: 425, sizeUnit: 'g' },
  { text: 'Lays classic potato chips', brand: "Lay's", sizeValue: 235, sizeUnit: 'g' },
];

/** Each names a kind. Several rows are equally right and none should win. */
const OPEN: Probe[] = [
  { text: 'peanut butter' },
  { text: 'orange juice' },
  { text: 'potato chips' },
  { text: 'greek yogurt' },
  { text: 'olive oil' },
  { text: 'whole wheat bread' },
  { text: 'cheddar cheese' },
  { text: 'ground coffee' },
  { text: 'tomato sauce' },
  { text: 'sparkling water' },
];

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    min: s[0],
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    max: s[s.length - 1],
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  };
}

function show(label: string, xs: number[]) {
  const t = stats(xs);
  const f = (n: number) => n.toFixed(4);
  console.log(
    `${label.padEnd(9)} n=${xs.length}  min ${f(t.min)}  p10 ${f(t.p10)}  ` +
    `median ${f(t.median)}  p90 ${f(t.p90)}  max ${f(t.max)}`,
  );
}

async function main() {
  const db = openCatalogue('data/catalogue.db');
  const cat = new Catalogue(db, await defaultEmbedder());

  const out: Record<string, { tops: number[]; gaps: number[]; rrf: number[]; agree: number[] }> = {
    settled: { tops: [], gaps: [], rrf: [], agree: [] },
    open: { tops: [], gaps: [], rrf: [], agree: [] },
  };

  for (const [name, queries] of [['settled', SETTLED], ['open', OPEN]] as const) {
    for (const probe of queries) {
      const q = probe.text;
      const r = await cat.search({ ...probe, limit: 5 });
      const a = r.candidates[0]?.signals.similarity;
      const b = r.candidates[1]?.signals.similarity;
      if (a == null) {
        console.log(`  no candidates for "${q}"`);
        continue;
      }
      out[name].tops.push(a);
      if (b != null) out[name].gaps.push(a - b);

      const head = r.candidates[0];
      // The rank-fusion score is scale free by construction, which is the
      // property cosine turned out not to have. Recorded as a ratio so a
      // catalogue twice the size does not move the threshold.
      const r1 = head.signals.rrf;
      const r2 = r.candidates[1]?.signals.rrf;
      if (r2) out[name].rrf.push(r1 / r2);

      // Whether the leader agrees with what the query pinned down. Zero, one or
      // two of brand and size.
      const agree =
        (head.signals.brandAgrees === true ? 1 : 0) + (head.signals.sizeAgrees === true ? 1 : 0);
      out[name].agree.push(agree);

      console.log(
        `  ${name.padEnd(8)} ${q.padEnd(44)} top ${a.toFixed(4)} gap ${
          b == null ? '   n/a' : (a - b).toFixed(4)
        } rrfx ${r2 ? (r1 / r2).toFixed(3) : ' n/a '} agree ${agree}  ${head.brands ?? ''} ${head.name}`.slice(0, 165),
      );
    }
  }

  console.log('\ntop similarity');
  show('settled', out.settled.tops);
  show('open', out.open.tops);

  console.log('\nlead over the runner-up, cosine');
  show('settled', out.settled.gaps);
  show('open', out.open.gaps);

  console.log('\nlead over the runner-up, rank fusion ratio');
  show('settled', out.settled.rrf);
  show('open', out.open.rrf);

  console.log('\nbrand and size agreement on the leader, 0 to 2');
  show('settled', out.settled.agree);
  show('open', out.open.agree);

  // The verdict this script exists to produce. A margin only works if the
  // settled gaps sit above the open ones; if they do not, the answer is that
  // cosine gap is the wrong signal, not that the number needs nudging.
  const s = stats(out.settled.gaps);
  const o = stats(out.open.gaps);
  console.log('');
  if (s.p10 > o.p90) {
    console.log(`separable: put LEAD_MARGIN between ${o.p90.toFixed(4)} and ${s.p10.toFixed(4)}`);
  } else {
    console.log(
      `NOT separable on cosine gap alone: settled p10 ${s.p10.toFixed(4)} is not above ` +
      `open p90 ${o.p90.toFixed(4)}. The band needs a different signal.`,
    );
  }
}

await main();
