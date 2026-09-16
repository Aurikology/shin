# Catalogue data acquisition

This is how the reference product table gets built out of outside data, before any query ever
reaches it. Every number below was read directly off the running database or the files that feed
it during this session (2026-09-15), not carried forward from a document's word alone. Where a
number could only be checked against a written record and not re-derived from scratch, that is
said plainly at the point it is used.

The live table, queried directly this session, holds **5,182,591 rows**. That is bigger than
"multi-million": it is five distinct outside sources merged into one SQLite table, with one row
meaning one barcode, not one product.

## The five sources, and what each one actually is

**Open Food Facts, filtered to Canada.** A crowd-maintained, worldwide database of food and drink
products, each one keyed by barcode. Shin pulls it as a single Parquet file, currently 7.8
gigabytes, hosted on Hugging Face, and keeps only the rows tagged as sold in Canada. In the live
table this source contributes 122,158 rows, every one of them marked sold-in-Canada (the filter
did what it says).

**Open Beauty Facts, Open Products Facts, Open Pet Food Facts.** Three sibling projects run by the
same non-profit as Open Food Facts, covering cosmetics, general merchandise, and pet food
respectively. Each is small enough (under 160 megabytes compressed, combined) that the whole
worldwide file is pulled rather than filtered at download time. In the live table they contribute
48,943, 26,947, and 12,294 rows. Of those, only 801, 681, and 214 respectively are marked
sold-in-Canada. Free coverage of these three categories inside Canada is a little over one and a
half thousand products, not the roughly ninety thousand rows the three files add worldwide; anyone
reading the row totals as Canadian coverage would be wrong by two orders of magnitude. This exact
comparison, and the exact percentage, is stated in a decision record dated 2026-09-05 and was not
re-measured from scratch this session, since the source files have not changed since.

**Open Icecat.** A free tier of a commercial electronics datasheet service: consumer electronics
and IT products with brand-approved specifications rather than crowd-entered data. It needs a free
account, and the credentials are read from an environment variable or a settings file that is kept
out of version control, never committed. This is the largest single source: 4,972,249 rows in the live table today, of
which 494,511 are marked sold-in-Canada. Icecat is also the only source that carries a product
photo through to the merged table: 4,149,843 of its rows have an image URL, against zero for every
other source (below). It is also the only source that never carries a French name; its rows are
written with the French-name field empty on every row, relying on the text index's
diacritic-folding to still match a French query against the English name it does carry, rather
than storing a translation that does not exist in the source data.

None of the five sources is the same kind of thing. Open Food Facts and its three siblings are
crowd-entered; Icecat is brand-approved but electronics-only; nothing here is a Canadian retailer's
own catalogue, and nothing here is paid. A separate decision record surveyed the paid options
(UPCitemdb, Barcode Lookup, GS1 Canada, and others) and its recommendation, as written, is to buy
nothing until a real miss rate is measured, which this document did not check because it is not an
acquisition mechanism, it is a plan for one that has not been acted on.

## How each source is turned into rows

Fetching a source and turning it into rows are two separate scripts for every source except one,
deliberately: the fetch step is schema-independent and safe to trust before anyone has looked at
the file, and every judgement about what a row *means* is made in one place that can be read and
argued with on its own.

**Open Food Facts.** The fetch step runs a single query through DuckDB directly against the remote
Parquet file over HTTP, asking it to keep only the columns the next step actually reads and only
the rows the source itself tags as Canadian, and write the result back out as a smaller Parquet
file. The written
reason for reading Parquet at all, rather than Open Food Facts' own CSV export (six times smaller):
the CSV collapses a product's name into one column regardless of language, and a French query has
to be able to reach an English-named row and the reverse, which needs both languages stored
separately. The preparation step then reads that Canadian-only file and, for every row: picks a
display name by checking for an English name first, a French name second, and whatever the
contributor filed as the product's own language third, dropping the row entirely (counted, not
silently) if none exists; works out a size in grams, millilitres, or item count, trusting Open Food
Facts' own normalized quantity field first and falling back to parsing the free-text quantity field
second, and as a last resort pattern-matching a size out of the product name itself, guarded so
that a name like "Cereal 12 Grain" cannot be misread as a twelve-gram package; and carries five
additional fields word for word from the source: a Nutri-Score letter grade, a NOVA processing
group number, a count of additive tags, the ingredients text, and a generic name, treating the
literal values "unknown" and "not-applicable" in the grade column as no grade at all rather than
as a real value, because a hard rule elsewhere in this codebase says an absent fact is never
written as a fabricated one.

**The three sibling Open Facts projects.** One shared preparation script handles all three,
because the size-parsing and unit-conversion logic has to stay byte-identical to the one Open Food
Facts uses (a fix to, say, the ounce-to-gram constant has to reach every source or two products end
up with two different definitions of the same unit) and that logic is imported from the Open Food
Facts preparation file rather than copied. What is genuinely different is the shape the name
arrives in: these three publish their export as JSONL with the bare product name already in
whatever language the contributor used, plus separate optional English and French name fields,
rather than Open Food Facts' single list-of-languages structure. The script reads the export's own
declared language tag to decide which of the two name columns the bare name belongs in, rather than
assuming it is English, specifically because assuming English is how a French-only product ends up
findable by neither language. These three rows do not carry the five Open Food Facts quality
fields at all (see the disagreement noted below); their prepared rows simply have no such keys.

**Open Icecat.** The fetch step downloads one large index file listing every entry Icecat holds,
authenticated with the free account's credentials. A second command, run separately, walks that
file and prints out what element and attribute names it actually contains, with counts, and this
inspection step existed specifically because Icecat's own published manual describes the file
wrongly: the manual lists barcodes as an attribute of an entry, and they are actually nested child
elements several levels down. A parser written against the manual, before this was caught, found
zero barcodes in a file that holds close to five million of them, and raised no error at all,
because looking for an attribute that is not there simply returns nothing.

The preparation step makes three judgements, all stated in the script's own comments and confirmed
against its output: it writes one row per barcode rather than one row per product, so a product
listed under three barcodes becomes three separate rows, because the table is looked up by barcode
and a product reachable through only one of its codes is broken for the other two; it keeps
products that are no longer on the market, because identity and current availability are treated
as two separate questions and a shopper scanning an old item still deserves to be told what it is;
and it rebuilds each product's category path by walking a separate categories reference file up
from Icecat's own category id to the root, writing it in the same broad-to-specific tag format Open
Food Facts uses, so that the two sources can be searched by category without two different code
paths. Brand names and category names both come from two separate small reference files Icecat
also publishes (a supplier list and a category list), and this session found no download script
anywhere in the repository that downloads either of those two files: the script that downloads
Icecat's main index file downloads only that index, nothing else. Both reference files are present
on disk and are read by the preparation step, so they exist, but this session could not find the
mechanism that put them there. That is an open item, not an assumption in either direction.

The comments inside the script that downloads the main index do not state an expected barcode
percentage or cite any outside source; they mention only, in passing, that a parser written
against Icecat's own published manual (rather than against the actual file) found no barcodes at
all in a file where, in the writer's rough words, "a third of the rows" actually carry one. The
precise comparison lives in a separate written decision record dated 2026-09-05, not in this
script: that record states the real count is 36.8%, against roughly 70% claimed by a third-party
article it does not name further. Measured directly against the file this session: 2,826,327 of
7,670,733 entries carry at least one barcode, which is 36.8%, confirming the decision record's
number and not the third-party figure it says it corrected. This session did not re-run the
multi-hour full-file scan to arrive at that count independently; it is taken from the same
decision record and matches what the record states, since the index file has not changed since.

## Merging: one table, keyed on barcode, last load wins

Every prepared source, regardless of which script produced it, is written out as one JSON object
per line, in the same field shape, and a single loader script inserts them into the reference
table, whose primary key is the barcode column. The insert statement is a single
insert-or-update: if a barcode is not yet in the table it is added, and if it already is, every one
of its columns is overwritten with the new row's values, with no per-field comparison and no
memory of what the previous value was. This means the merge across sources is not a designed
priority order (there is no rule anywhere in the code that says, for example, "Icecat's brand data
outranks Open Products Facts' for a shared barcode"); it is simply whichever load ran most recently
for that barcode. A decision record dated 2026-09-05 states this plainly as an observed
consequence, not a chosen policy: when Icecat was loaded, 1,507 rows already in the table were
silently replaced because they shared a barcode with an Icecat entry, 1,478 of them from Open
Products Facts, which the record calls probably an improvement (a brand-approved data sheet against
a crowd-entered one) but flags as something that happened silently and only got noticed because
someone went looking, not because anything surfaced it.

This session confirmed the mechanism runs the other direction too, from the numbers in front of it
rather than from that record's word. The Icecat preparation step's own printed log says it wrote
4,972,274 rows. The live table today holds 4,972,249 rows whose source column identifies them as
coming from Icecat, which is 25 fewer. The only way that number moves down after a load is a later load of a different
source's file overwriting some of those same barcodes, which is exactly what the insert-or-update
statement does by design. This session did not trace which 25 barcodes or which specific later load
did it; that would need a second read of an intermediate file this session did not keep. The
mechanism that explains it is verified; the specific 25 rows are not.

After every load, the loader rebuilds two derived structures from the whole table from scratch,
not incrementally: the full-text search index, and a table that lists every category tag each
product belongs to, expanded from its stored path. Both are described as cheap to redo entirely
each time rather than update piecemeal, and the category rebuild lower-cases every tag as it goes,
specifically because the same tag was found stored under different letter-casings often enough
(over five hundred tags, covering more than a hundred thousand membership rows) that a query for
the common spelling was silently missing them; the fix is applied once when the row is written
rather than at every future read, which keeps a database index usable that would otherwise have to
be scanned in full on a table sized in the tens of millions of rows.

## Where a written rule and the merge code disagree

**The category-source label.** The reference table carries its own priority-source column, and the
comment written directly above its definition states that this column should read "declared" when
the category path came from the outside source itself, "inferred" when Shin filled it in later
from neighbouring products, and be left empty when there is none at all. Checked directly against
every file that writes a row during acquisition: the value "declared" is written nowhere in this
codebase. Only a separate, later enrichment step (outside the acquisition pipeline covered here)
ever writes "inferred", on 7,672 rows. Queried directly against the live table, 5,174,919
of its 5,182,591 rows have that priority-source column set to nothing at all, and the great
majority of those
do carry a real, non-empty category path handed to them by their own source data: only 134,865
rows in the whole table have an empty category path. So the column's own documented purpose,
telling apart a category that came from the source from one Shin guessed, cannot currently be read
off it: a category path that Open Food Facts or Icecat supplied directly is stored exactly the same
way, with the same empty label, as a category with no information behind it at all. This is a
disagreement between the comment describing the column and the code that fills it, not a case
where the intended behaviour is merely unfinished elsewhere; the column exists, the two labels it
promises exist, and one of the two is simply never written by anything in the acquisition path.

**Whether a local copy is actually preferred.** The Open Food Facts fetch script's own comment
states plainly that reading the remote Parquet file over plain HTTP does not work well (the host
answers a flood of small range requests with rate-limit errors), and says: "A local copy is used
when it exists; the URL is the fallback." Read against the code immediately below that comment,
this is not what happens. The script takes a second command-line argument as the file location if
one is given, and falls back to the remote URL only when no second argument is given at all; it
never checks whether a local copy exists on disk and switches to it automatically. In practice a
7.8 gigabyte local copy of the source file does sit on this machine and was almost certainly used
by hand (the smaller, Canada-only file it produces is dated a week after the full file, which is
consistent with a manual run against the local copy), but that is a person remembering to type the
path, not the script doing what its own comment says it does. If that step is ever run again by
someone who has not read the code underneath the comment, the description would lead them to expect
automatic behaviour that is not there.

## The quality fields: a real breakage, and its current state

Five of the columns just described (Nutri-Score grade, NOVA group, additive count, ingredients
text, generic name) were added to the Open Food Facts preparation step, and to the table's own
schema, as one dated piece of planned work. A separate written record of a real incident, checked
directly and not taken on its own word, describes the sequence exactly: the code that reads those
five columns back out for serving was committed on 2026-09-11, two days after the database on this
machine had last been built, on 2026-09-09, and that database had none of those five columns, so it
started raising an error on every single query the moment the new code reached it. The incident was
logged and fixed on 2026-09-13, independently confirmed by the commit history for the breaking
change. The fix applied at the time added the five columns directly to the existing table
(the loader already adds any column present in its schema but missing from an existing database
file, which made this safe) but left every value in them null, and the incident record explicitly
states that populating them for real still required rerunning the loader over freshly prepared Open
Food Facts rows, and names that as still outstanding at the time it was written.

Checked directly against the live table this session, that reload has since happened: 24,693 of the
122,158 Open Food Facts rows now carry a real Nutri-Score letter, 21,912 carry ingredients text, and
1,417 carry a generic name. None of the other four sources carry any of these five fields at all,
in any row, because their own preparation scripts never write those keys into the row they produce;
this is not a bug in the sense of contradicting a stated rule, since nothing written anywhere claims
these fields apply outside Open Food Facts, but it is worth stating plainly rather than letting the
column's presence in every row's schema imply it is populated everywhere.

## Two things that exist on disk with no acquisition mechanism behind them, found rather than assumed

A file named as the CSV export of Open Food Facts (1.27 gigabytes) sits in the same data folder as
everything above it. Nothing in any script that runs today reads it; the Parquet-reading script's
own comment explains at length why the CSV was rejected in favour of the Parquet file. It appears
to be left over from an earlier, abandoned attempt and this session found no code path that still
depends on it.

Separately, the package's own list of run commands includes one named simply for the general
action of fetching, pointing at a file this session could not find anywhere in the source tree.
Whatever it once did, it is not runnable today, and none of the acquisition mechanisms described
above go through it; each source is fetched by its own separately named script instead.

## Open items, written down rather than left as unchecked flags

- **Who or what downloads Icecat's two reference files (brand names and category names) is not
  known from anything in this repository.** They exist on disk and are read by the preparation
  step; no script fetches them. Verifying this would need whoever last ran the Icecat preparation
  step to say how those two files got there, or a check of shell history on this machine.
- **The specific 25 barcodes that moved from Icecat back to another source after Icecat's load are
  not identified**, only the fact that the row count implies it happened. Tracing them would need
  comparing the current table against the Icecat preparation script's own intermediate output file
  by barcode, which this session did not do.
- **Whether the reference table's priority-source column is ever meant to be backfilled to
  "declared" for the five million-plus rows that already carry a real path but no label**, or
  whether the column's written contract is simply stale against a design that changed, is not
  settled by anything read this session.
- **The ODbL share-alike question already raised in a separate decision record** (whether merging
  Open Food Facts rows into one table with rows Shin adds itself creates a legal obligation to
  publish that whole table under the same licence) has not been resolved by a lawyer or by GitLab's
  or Open Food Facts' own terms being read line by line in this session; it is carried here as a
  live open question because it bears directly on whether this acquisition pipeline can keep
  running as designed.
