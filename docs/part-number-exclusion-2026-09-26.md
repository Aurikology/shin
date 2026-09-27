# Unit 8: the electronics part-number exclusion, and why it is not shipped on

Read `docs/catalogue-build-plan-2026-09-26.md`, unit 8, first. His ruling tonight
was to run the plan without coming back to him, so the default it names --
**keep part-number rows reachable by barcode, exclude them from the typed word
search** -- was the decision to execute. It was built, measured, and its own
falsifier fired on real queries. **It ships with the exclusion flag off.**

## The numbers, recounted after tonight's dedupe

The catalogue lost 1,375,443 duplicate rows tonight (`docs/catalogue-build-plan-2026-09-26.md`,
unit 13). Re-read from the live database (`catalogue/data/catalogue.db`), read-only,
against `sold_in_canada = 1 AND source = 'icecat'`:

| Figure | Before tonight's dedupe | Counted now |
| --- | --- | --- |
| Canadian electronics rows | 494,511 | **296,416** |
| Name 12 characters or fewer | 312,324 | **188,758** |
| Bare part number (this predicate) | 267,073 | **163,119** |

296,416 is exactly 494,511 minus 198,095 -- the Canadian half of the 1,375,443
pairs the dedupe removed (unit 13's own number). The electronics loader wrote
most of those pairs, so electronics absorbed almost all of that drop; that is
corroboration, not coincidence.

The bare-part-number figure is **not** the same predicate the original 267,073
used -- that predicate was never written down, so it cannot be reproduced. It
is this session's own definition, described below, applied to the same
population.

## The predicate

```ts
export function isBarePartNumber(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false; // multi-word: a real name, not a code
  return /\d/.test(trimmed); // single word with a digit: a code, not a word
}
```

**A row is a bare part number when its display name is a single token (no
whitespace) that contains at least one digit.** Nothing else. The full
reasoning is the comment above this function in `catalogue/src/part-number.ts`.
In one line: a space means real, describable words are present and the row is
findable; a single token with a digit and no space is a code, because no
dictionary word contains a digit.

Checked against the five names the unit named:

| Name | Predicate says | Right? |
| --- | --- | --- |
| `LV-7545` | bare | yes -- unfindable by any word |
| `AP9520T` | bare | yes -- unfindable by any word |
| `Z-Slip Label` | not bare | yes -- "Z-Slip Label" is two words |
| `3 Year Extended Warranty (Renewal/High Volume)` | not bare | yes -- many real words |
| `1GB 266MHz DDR ECC Registered CL2.5 DIMM, x4` | not bare | yes -- many real words |
| `Milk 2%` (deliberate trap) | not bare | yes -- two words |
| `Tylenol 500` (deliberate trap) | not bare | yes -- two words |

## Where it was wired, and where it had to be wired twice

`catalogue/src/search.ts`'s typed-word path is hybrid, not one retriever: `search()`
fuses `#runFts` (SQLite FTS5, exact tokens) and `#vectorSearch` (a KNN over
`product_vec`) by Reciprocal Rank Fusion. The exclusion was first written as a
SQL clause (`barePartNumberSqlClause`, `part-number.ts`) appended to `#runFts`'s
`MATCH` query, scoped to `source = 'icecat'` because that is the only
population this predicate was measured against.

**Running this unit's own acceptance test caught a defect in that first
version.** With only the SQL clause in place, "asus rt-n66u" still returned the
bare row "RT-N66U" as the #1 fused result. The vector arm has no WHERE clause
-- `vec0` cannot take one -- so the embedding model's own closeness between the
query and the bare token was still winning a slot the SQL exclusion could not
reach. The fix, `isBarePartNumberRow` in `part-number.ts`, filters the vector
arm's hits in JS with the same predicate and the same `icecat` scope before
fusion, called from `search()` right after `#vectorSearch` returns. One flag,
`EXCLUDE_BARE_PART_NUMBERS_FROM_TEXT_SEARCH` in `catalogue/src/part-number.ts`,
gates both call sites, so it is still one line to reverse in either direction.

`byGtin` (`search.ts`, "Exact barcode lookup") was never touched. It matches on
`code`, reads nothing this predicate looks at, and is not called from anywhere
this predicate's flag reaches.

## The acceptance test, run exactly as specified

Read-only against the live catalogue (`openCatalogueReadOnly`,
`PRAGMA busy_timeout = 120000`), local embedder, `limit: 5`. "Before" is the
flag forced `false` (both call sites become no-ops); "after" is the flag `true`
(both call sites active, the fixed version). `[BARE]` marks a result this
predicate classifies as a bare part number.

| # | Query | Top 5 before | Top 5 after |
| - | --- | --- | --- |
| 1 | logitech mouse | MOUSE PILOT; POP Mouse; MOUSEMAN TRAVELER; Performance Mouse MX; Logitech Bluetooth Mouse | identical |
| 2 | hdmi cable | HDMI Cable; HDMI Cable; **[BARE]** HD2AP-15M-HDMI-CABLE; HDMI TO HDMI CABLE 1.8 METER (6FT); **[BARE]** 8K-A-15M-HDMI-CABLE | HDMI TO HDMI CABLE 1.8 METER (6FT); HDMI Cable; HDMI Cable; 8ft. HDMI m/m; HDMI M/M, 15 ft |
| 3 | wireless keyboard | Wireless Keyboard; Stream Wireless; MK250 Compact Bluetooth Wireless Combo; 655 Wireless Keyboard and Mouse Combo; Touch Keyboard K400 | identical |
| 4 | usb flash drive | USB Flash Drive; Store 'n' Click; DataBar; **[BARE]** MUF-256BE; **[BARE]** MUF-256BE4 | USB Flash Drive; Store 'n' Click; DataBar; Store 'n' Go; Defender F150 MXAB1A008G4001FIPS |
| 5 | external hard drive | Shuri; HUB; Starfield Special Edition; DriveStation external Hard Drive - 250GB; HD 3000DV 60GB FWire 7200rpm ext Ret | identical |
| 6 | laptop charger | 110W USB-C Laptop Charger; 140W USB-C Laptop Charger; Laptop Travel Charger...; 65W USB-C Laptop Charger; Compact Laptop Charger | identical |
| 7 | network switch | **[BARE]** GSM4210PD-100NAS; **[BARE]** JGS516PE-100NAS; M4500-48XF8C MGD SWCH; **[BARE]** GS308P-100NAS; **[BARE]** GS724TPP-300NAS | M4500-48XF8C MGD SWCH; AV M4250-8G2XF-POE+ FULL MNGD SWCH; 8-port Ultra60 PoE++...; 2nd Generation ProSafe 48-Port...; AV LINE M4250-10G2XF-POE++... |
| 8 | toner cartridge | TONER CARTRIDGE; Black Toner Toner Cartridge; 210/220/230 Instant Ink Toner Welcome Kit; Toner Cartridge; Toner cartridge | identical |
| 9 | bluetooth speaker | musical stoil bluetooth speaker; Bluetooth Speaker; **[BARE]** 4XD1B84406; CP900 + BT50; **[BARE]** 4XD0H34183 | musical stoil bluetooth speaker; Bluetooth Speaker; CP900 + BT50; ThinkSmart Bar XL; Roar Blue Wireless Speaker |
| 10 | sd card reader | SD Card Reader; Workflow SD Reader; SD 4 Card Reader Zx G4; SD UHS-I Card Reader; Card Reader+Writer USB ext f CF SD+MMC | identical |
| 11 | logitech z523 | **[BARE]** Z523; **[BARE]** M525; Speaker System Z523 | Speaker System Z523 |
| 12 | asus rt-n66u | **[BARE]** RT-N66U; **[BARE]** RT-AC66U; RT-N66U C1 | RT-N300 B1; RT-N66U C1; RT-N12 B1; RT-N10 C1; RT-N12 C1 |
| 13 | tp-link tl-wn821n | **[BARE]** TL-WN821N; **[BARE]** TL-WN821NC; **[BARE]** TL-WN8200ND; **[BARE]** TL-WN851ND | JetStream TL-SG3424; TL-SF1048 v6; TL-POE150S v3; TL-POE10R v4; TL-WR1043ND V3 |
| 14 | brother mfc-j4610dw | MFC Server; **[BARE]** MFC-J4610DW; **[BARE]** MFC-J4620DW; **[BARE]** MFC-J4420DW; **[BARE]** MFC-J1010DWRE1 | MFC Server; MFC 3240C; Black Laser Toner - Brother TN04BK...; Cyan Laser Toner - Brother TN04C...; Magenta Laser Toner - Brother TN04M... |
| 15 | hp laserjet toner | LaserJet Toner Collection Unit; LaserJet Black Toner Crtg; LaserJet Cyan Toner Crtg; LaserJet Yellow Toner Crtg; LaserJet 3WT90A Toner Collection Unit | identical |
| 16 | ddr3 ram | 16GB RDIMM DDR3; GA-H170M-D3H DDR3; 4GB DDR3-1333; 8GB DDR3 1333MHz DIMM; 2GB (1x2GB) DDR3-1866 MHz ECC RAM | identical |
| 17 | milk 2% | Milk 2%; Milk 1%; Milk 2%; 1% milk; Milk 2% | identical (grocery, source != icecat, exclusion never applies) |
| 18 | tylenol | tylenol; Tylenol Paracetamol; childrens tylenol; tylenol kirkland; tylenol complete | identical |
| 19 | dell laptop | **[BARE]** 15; Dell G15 5510; Dell Latitude 7420 Laptop; Dell Latitude 5590 Laptop; Dell - Latitude 5490 Laptop | Dell G15 5510; Dell Latitude 7420 Laptop; Dell Latitude 5590 Laptop; Dell - Latitude 5490 Laptop; DELL-DFNCH |
| 20 | seagate hard drive | Skyhawk; 320GB SATA 6Gb/s 2.5"; 1TB SATA 3.5" 7200rpm 64MB; Hard Drives 300GB; Pro 8TB 3.5", Serial ATA III | identical |

**No result that was useful before disappeared, except for two.** Queries 1,
3, 5, 6, 8, 10, 15, 16, 17, 18, 20 (11 of 20, including all five plain-word
electronics controls and the two grocery controls) are byte-identical
before and after -- the rule never touches them, which it should not, since
none of their top five was ever a bare row. Queries 2, 4, 7, 9, 11, 19 lost
only bare, unreadable rows and kept or gained readable ones -- **7 is worth
naming on its own**: the "before" top five was 80% unreadable codes
(`GSM4210PD-100NAS`, `JGS516PE-100NAS`, `GS308P-100NAS`, `GS724TPP-300NAS`)
and the "after" top five is five actual switch descriptions. That is the
fix working as designed.

## The falsifier fired, on queries 13 and 14

**Query 13, "tp-link tl-wn821n":** before the exclusion, `TL-WN821N` -- the
exact adapter the query names -- was the #1 result. After, no `TL-WN821N`
row appears anywhere in the top five; the results are a JetStream switch and
four unrelated TP-Link routers.

**Query 14, "brother mfc-j4610dw":** before, `MFC-J4610DW` -- the exact printer
the query names -- was the #2 result. After, no `MFC-J4610DW` row appears
anywhere in the top five; the results are an unrelated MFC unit, an old MFC
3240C, and three toner cartridges.

Both are the unit's own falsifier, verbatim: *"A typed search that used to
return the right product no longer does, which means the exclusion rule
caught real names too."* `TL-WN821N` and `MFC-J4610DW` are not internal SKUs
nobody types -- they are the manufacturer's own marketed model numbers,
printed on the box and typed by name into every retailer's search bar the
same way "logitech mouse" is. The predicate's rule (single token, contains a
digit) cannot tell that class of name apart from a code like `LV-7545` or
`AP9520T`, because syntactically they are the same shape. This was visible
before the search-level test, in the 200-row sample below, and the search
test is what turned it from a suspicion into a fired falsifier.

## The 200-row sample: 24 of 200 misclassified by reading the name

100 rows the predicate catches, 100 it lets through, sampled by striding
through the full Canadian-electronics row set (not the first N rows, which
cluster by supplier load batch) so the sample is not hand-picked. Full lists
were read by name, one at a time, against real-world knowledge of what a
shopper would type.

- **Caught, wrongly (21 of 100).** Marketed model numbers that fit the same
  single-token-plus-digit shape as a true SKU but are the actual product name
  a shopper types: `TL-WN821N`, `TL-WR841N`, `CS1308`, `Z523`, `DFX-9000`,
  `RT-N66U`, `GS2200-8`, `QL-720NW`, `MFC-J4610DW`, `LT2013p`, `DGS-1100-08P`,
  `SL-C460FW`, `DS-720D`, `M73` (twice in the sample), `M93z`, `M680dn`,
  `GL2760H`, `DCS-820L`, `SE-208GB`, `M605n`. Every clearly-internal SKU in
  the sample (ink/toner cartridge codes, battery and lamp replacement
  numbers, cable and adapter codes -- `PA03209-0551`, `108R00816`, `0B47090`,
  `NP24LP`, and 75 others) was caught correctly.
- **Let through, wrongly (3 of 100).** `PSBUB`, `PRG-EXA`, `TBT-UDM`: single
  tokens that read as meaningless codes but carry no digit, so the predicate's
  digit requirement lets them pass. A smaller, second-order gap, not the one
  that fired the falsifier.
- **176 of 200 were judged correct.**

21% of the caught sample being real marketed names is the same defect the
search-level falsifier found on two of twenty live queries -- the sample and
the acceptance test agree with each other, which is why this is reported as
a real finding rather than a fluke of query choice.

## The barcode path: untouched, and checked

20 barcodes of rows this predicate calls bare part numbers, looked up through
`Catalogue.byGtin` (the same function the app calls, not a copy of it): **all
20 found, by their own code**, e.g. `5397184217931` -> `ES1520P`,
`3660619407491` -> `STEA5000402`, `6935364094874` -> `TL-WR941HP`. `byGtin`
reads nothing this predicate touches and was not edited.

## What ships, and the one line either way

`catalogue/src/part-number.ts` exports `EXCLUDE_BARE_PART_NUMBERS_FROM_TEXT_SEARCH`,
currently **`false`**. `catalogue/src/search.ts` reads it in exactly two
places (`#runFts`'s SQL clause, and the vector-arm filter inside `search()`);
both are already written, tested (`catalogue/test/part-number.test.ts`), and
inert while the flag is off. Turning the exclusion on is one line in
`part-number.ts`; turning it back off is the same line. Nothing else in this
unit's code needs to change either way.

**Recommendation, not a decision: do not turn it on as written.** The
predicate needs a way to tell a manufacturer's marketed model number apart
from an internal SKU before it is safe -- for example, a name that also
appears, word-for-word, in the row's own `brands` field paired with a
recognizable letter-prefix pattern, or a source-specific allow-list of known
model-number families. That is unmeasured and is not built tonight.

**Reopens on:** the predicate is changed to separate marketed model numbers
from internal SKUs, and the same twenty-query test (plus the two that fired
the falsifier) is re-run and passes clean.
