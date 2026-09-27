/**
 * The slice of the catalogue that goes on a phone.
 *
 * THE PROBLEM THIS SOLVES. The catalogue is a 3.47 GB file and its vector index
 * is heading toward 8 GB on top. None of that can go near a phone, and none of
 * it needs to. The free tier's whole promise is that a barcode is answered
 * instantly and without limit, and a barcode is a key lookup: it needs the code,
 * the name, the brand and the size, and nothing else at all.
 *
 * WHAT IT COSTS, rebuilt and measured 2026-09-26 rather than estimated:
 *
 *   Canadian groceries   116,998 rows    5.15 MB raw    1.87 MB gzip    1.38 MB brotli
 *   All Canadian rows    465,269 rows   30.28 MB raw   10.14 MB gzip    6.43 MB brotli
 *
 * The entire Canadian catalogue is a 10.1 MB download. That is smaller than one
 * photo from the camera this app is built around.
 *
 * WHAT THE 2026-09-05 NUMBERS IN THIS COMMENT USED TO SAY, and why they were
 * replaced rather than kept as a comparison: 618,310 rows, 77.43 MB raw,
 * 7.47 MB brotli. The raw figure no longer reproduces on the same data, so
 * this exporter's layout changed at some point after that measurement and
 * nobody re-measured. On 2026-09-26 tonight's cleanup was checked against the
 * pre-cleanup copy of the database with THIS version of the exporter, which is
 * the only comparison that means anything: 618,311 rows, 42.10 MB raw,
 * 6.46 MB brotli, against 465,269 rows, 30.28 MB raw, 6.43 MB brotli.
 *
 * SO THE 25% OF ROWS THAT WERE DUPLICATE SPELLINGS WERE COSTING THE PHONE
 * ALMOST NOTHING: 0.03 MB of a 6.46 MB download, half of one percent. Brotli
 * had already collapsed them, because a duplicate row's name is the same text
 * and its barcode differs by one leading zero, which is exactly what a
 * compressor is good at. The cleanup was still right, for reasons that are not
 * download size: one product is now one row, so a text search cannot return the
 * same product twice, and the embedding work is not paid twice on 202,697 pairs.
 * Anyone who reaches for this file expecting a fatter row count to be a fatter
 * download should read those two numbers first.
 *
 * WHY NOT SQLITE ON THE PHONE. A database in the browser costs about a megabyte
 * of WebAssembly runtime and a worker thread, to buy a query planner for a
 * lookup that is `WHERE code = ?`. A sorted array of codes with a binary search
 * over it answers the same question in microseconds with no runtime at all.
 *
 * WHAT IT CANNOT DO, said plainly because the screen has to say it too: this
 * answers what a thing is, never what it should cost. Prices change weekly and
 * live on the server. A phone holding this pack still needs the network before
 * anybody sees a verdict. What it buys is the product's name appearing
 * instantly and reliably in an aisle with no signal, which is where this app is
 * used.
 *
 *   node src/export-pack.ts --scope=grocery --out=data/pack-grocery.bin
 *   node src/export-pack.ts --scope=canada  --out=data/pack-canada.bin
 */

import { openCatalogueReadOnly } from './schema.ts';
import { writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';

type Scope = 'grocery' | 'canada';

/**
 * A barcode shaped like a barcode.
 *
 * 54 Canadian codes are 15 to 33 digits long, which no scanner can produce, so
 * they are left out rather than carried as dead weight. They are a data defect,
 * recorded here rather than silently dropped.
 */
const MAX_GTIN_DIGITS = 14;

/**
 * Icecat's product images are all one template plus a 40 character hash, so the
 * template is stored once in the header and each row keeps the hash. Measured:
 * the URL is 82 bytes and the hash is 40, which over the 474,777 Canadian rows
 * that carry one is about 20 MB of the pack that does not need to be there.
 */
const ICECAT_IMAGE = /^https:\/\/images\.icecat\.biz\/img\/gallery\/([0-9a-f]{40})\.jpg$/;

interface PackRow {
  readonly code: bigint;
  readonly name: string;
  readonly brands: string;
  readonly quantity: string;
  readonly sizeValue: number;
  readonly sizeUnit: string;
  /** The icecat hash when it is one, the whole URL when it is not, empty when absent. */
  readonly image: string;
}

function scopeSql(scope: Scope): string {
  return scope === 'grocery'
    ? `WHERE sold_in_canada = 1 AND source = 'openfoodfacts'`
    : `WHERE sold_in_canada = 1`;
}

/**
 * Layout, and why it is this and not JSON.
 *
 *   magic     8 bytes   "SHINPK01"
 *   count     4 bytes   little endian
 *   codes     8 bytes each, ASCENDING, so the phone binary searches them
 *   offsets   4 bytes each, into the blob, plus one terminator
 *   blob      each row's fields, tab separated, UTF-8
 *
 * Codes as unsigned 64 bit integers rather than strings: every barcode fits,
 * they compare numerically, and it makes the search half of the file a plain
 * typed array the browser can search without parsing anything.
 */
function pack(rows: readonly PackRow[]): Buffer {
  const encoder = new TextEncoder();
  const payloads = rows.map((r) =>
    encoder.encode(
      [r.name, r.brands, r.quantity, r.sizeValue || '', r.sizeUnit, r.image].join('\t'),
    ),
  );

  const blobSize = payloads.reduce((n, p) => n + p.length, 0);
  const header = 8 + 4;
  const codesSize = rows.length * 8;
  const offsetsSize = (rows.length + 1) * 4;
  const buf = Buffer.allocUnsafe(header + codesSize + offsetsSize + blobSize);

  buf.write('SHINPK01', 0, 'latin1');
  buf.writeUInt32LE(rows.length, 8);

  let at = header;
  for (const r of rows) {
    buf.writeBigUInt64LE(r.code, at);
    at += 8;
  }

  let offset = 0;
  for (let i = 0; i < payloads.length; i += 1) {
    buf.writeUInt32LE(offset, at);
    at += 4;
    offset += payloads[i].length;
  }
  buf.writeUInt32LE(offset, at);
  at += 4;

  for (const p of payloads) {
    buf.set(p, at);
    at += p.length;
  }
  return buf;
}

function main(): number {
  const args = process.argv.slice(2);
  const scope = ((args.find((a) => a.startsWith('--scope='))?.split('=')[1] ?? 'canada') as Scope);
  const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? `data/pack-${scope}.bin`;
  if (scope !== 'grocery' && scope !== 'canada') {
    console.error('--scope must be grocery or canada');
    return 1;
  }

  const db = openCatalogueReadOnly(DB_PATH);
  const started = Date.now();

  const raw = db
    .prepare(
      `SELECT code, name, brands, quantity, size_value, size_unit, image_url
       FROM product ${scopeSql(scope)} ORDER BY code`,
    )
    .all() as unknown as {
    code: string;
    name: string;
    brands: string | null;
    quantity: string | null;
    size_value: number | null;
    size_unit: string | null;
    image_url: string | null;
  }[];

  let skippedShape = 0;
  const rows: PackRow[] = [];
  for (const r of raw) {
    const digits = r.code.replace(/\D/g, '');
    if (digits.length === 0 || digits.length > MAX_GTIN_DIGITS) {
      skippedShape += 1;
      continue;
    }
    const image = r.image_url ?? '';
    const icecat = ICECAT_IMAGE.exec(image);
    rows.push({
      code: BigInt(digits),
      name: r.name,
      brands: (r.brands ?? '').split(',')[0].trim(),
      quantity: r.quantity ?? '',
      sizeValue: r.size_value ?? 0,
      sizeUnit: r.size_unit ?? '',
      image: icecat ? icecat[1] : image,
    });
  }

  // Sorted by the numeric code, which is what the phone binary searches. The
  // SQL ORDER BY is on the TEXT code, and "0068100084245" and "68100084245"
  // order differently as text and as numbers, so this is not redundant.
  rows.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const body = pack(rows);
  const gz = gzipSync(body, { level: 9 });
  const br = brotliCompressSync(body, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 },
  });

  writeFileSync(out, body);
  writeFileSync(`${out}.gz`, gz);
  writeFileSync(`${out}.br`, br);

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`scope           ${scope}`);
  console.log(`rows            ${rows.length.toLocaleString()}`);
  if (skippedShape > 0) {
    console.log(`skipped         ${skippedShape} codes no scanner can produce (over ${MAX_GTIN_DIGITS} digits)`);
  }
  console.log(`raw             ${mb(body.length)}  ${out}`);
  console.log(`gzip            ${mb(gz.length)}  ${out}.gz`);
  console.log(`brotli          ${mb(br.length)}  ${out}.br`);
  console.log(`built in        ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return 0;
}

process.exit(main());
