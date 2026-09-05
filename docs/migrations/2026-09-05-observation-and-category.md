# Two migrations, 2026-09-05

Both have already run on the working databases. This file exists so a second machine, or a
restored backup, can be brought to the same state deliberately rather than by rediscovery, and so
the two things that went wrong are not repeated.

Read the whole of a section before running any of it. The order inside a section matters; the two
sections are independent of each other and can be run in either order.

---

## 1. The observation table: stock becomes nullable, the store arrives

### What changes

`price/data/prices.db`, table `observation`:

| column     | before                    | after                                  |
|------------|---------------------------|----------------------------------------|
| `in_stock` | `INTEGER NOT NULL DEFAULT 1` | `INTEGER`, nullable, no default     |
| `store_name` | absent                  | `TEXT`, null where unknown             |
| `store_city` | absent                  | `TEXT`, null where unknown             |
| `store_osm`  | absent                  | `TEXT`, the composite `"WAY/120689533"` |

`NOT NULL DEFAULT 1` is the whole reason a migration is needed rather than three `ALTER TABLE ADD
COLUMN` statements. SQLite cannot drop a NOT NULL constraint in place, so the table is rebuilt.

### Why the stock value cannot simply be carried across

The old column said in-stock on every row, including the 874 rows from Open Prices, whose API
carries no stock field at all. Those values were written by the loader, not observed. Copying them
forward would preserve a fabrication through the migration that was written to remove it.

So the copy is conditional: rows with `seller = 'walmart.ca'` keep their value, because it was read
from a real `availabilityStatus`; every other row gets NULL. That rule is in
`price/src/migrate-observation.ts` and it is the only place it exists. If you rewrite the migration
by hand, keep it.

### Run it

    cd price
    node --experimental-strip-types src/migrate-observation.ts

Set `SHIN_PRICES` first if the database is not at the default path; both the migration and
`src/store.ts` read it.

Expected output ends with the row count unchanged on both sides and the count of nulled rows. On
this database that was `896 -> 896` and `openprices in_stock=NULL: 874`.

The script refuses to run twice. It checks `PRAGMA table_info` for `store_osm` and exits if it is
already there, so a re-run is a no-op rather than a second rebuild.

It also refuses to run if the table has triggers, views or foreign keys pointing at it, checked
against `sqlite_master` and `PRAGMA foreign_key_list`. A table rebuild silently drops those, and a
dropped trigger is invisible afterwards. Neither exists today; the check is there for the day one
does.

### Back up first, and not with a file copy

    sqlite3 price/data/prices.db "VACUUM INTO 'price/data/prices-backup.db'"

**A plain `cp` of `prices.db` is not a backup of this database.** It is in WAL mode, so recent
writes live in `prices.db-wal` and a copy of the main file alone silently under-captures them. This
was actually done wrong here and caught before the migration ran. `VACUUM INTO` writes one
consistent file with no sidecars.

Verify the backup by counting, not by looking at the file size: 896 rows in `observation` and 547
in `crawl_attempt` at the time this was written.

### Then re-pull the store names

The migration adds the columns; it cannot fill them, because the store data was discarded at fetch
time and was never in the database to recover. Re-run the Open Prices pull to populate them.

Expect roughly 791 of 874 rows to end up with a store name, across 82 Canadian chains. If you get
about 635, you are running a version of `openprices.ts` from before the `isRetail` fix: the first
filter allowed only `osm_tag_key === 'shop'`, and OpenStreetMap files a pharmacy under `amenity`,
which withheld 161 rows including 146 from London Drugs alone.

What stays empty stays empty correctly. Somebody has geotagged 56 prices to a bus stop, four to a
railway station, one to a city hall charging point and one to a park. Those are not shops and get
no store name.

---

## 2. The category index: tags fold to lower case

### What changes

`catalogue/data/catalogue.db`, table `product_category`. Every `tag` is stored lower-case.
`rebuildCategories` in `catalogue/src/schema.ts` lowers at write time, and the rebuild re-derives
the whole table from the category paths already stored on each product. No product row changes.

### Run it

    cd catalogue
    node --experimental-strip-types src/rebuild-categories.ts

`SHIN_CATALOGUE` overrides the path. Measured on this catalogue at 5,182,591 products and 17.2
million membership rows, the run took 151.5 seconds and took 20,043 distinct tags down to 19,512.

The script will not report success unless the table verifies: it counts rows where
`tag <> lower(tag)` and fails loudly if that is not zero. A rebuild that quietly kept its old casing
would otherwise log success while every reader carried on splitting membership across spellings.

### Two things it does to a running server

**The neighbour ring returns nothing for the length of the run.** `rebuildCategories` deletes every
row before writing the new ones. A search that would have said "we do not have that one, here are
the other oranges" says nothing instead. It does not error and it does not look broken, it looks
like a catalogue with no neighbours. Barcode lookup and text search are unaffected, because neither
reads this table.

**The search workers must be restarted afterwards.** They memoize category sizes per tag for the
life of the process and never invalidate. A worker that ran through a rebuild holds counts for tags
that no longer exist under that spelling and will hold them until it is killed.

So: announce it, run it, restart the workers.

### Snapshot the catalogue first. This was not done here.

    sqlite3 catalogue/data/catalogue.db "VACUUM INTO 'catalogue/data/catalogue-backup.db'"

The rebuild ran on this machine with no snapshot taken. Nothing was lost, because the table is
fully re-derivable from the stored category paths, but that was luck rather than care: it also made
the before-and-after comparison unrunnable, so the predicted ring changes could only be checked
against the world as it is now, never against the world as it was.

### What the fold actually changed

`catalogue/src/ring-delta.ts` is the evidence and it was written to be doubted: it recomputes the
claimed figures and prints its own answers beside them. Of the 648 products whose neighbour ring is
affected, 295 keep the same ring, 293 get a wider one, 49 lose theirs entirely, and a handful get a
narrower and better one.

That last group was coded as impossible and fired anyway, and it was right: merging can only add
peers, so a level previously skipped for having none can start passing. If you re-run the script on
a fresh catalogue and see the same warning, it is not a bug.

### The reader half is a separate commit

Writing lower-case tags and reading them are split across two commits on purpose. `schema.ts` (the
write) landed in `4d6e2df`; `catalogue/src/search.ts` carries the matching lowered ring probe and
the rewritten `labelForTag`, and lands separately.

Nothing is broken in between: the database is folded, the probe on disk is lowered, and no test
covers the casing in `rebuildCategories` directly. But if you are restoring from a state older than
both, apply them together.

---

## The one failure mode neither script can catch

Both migrations are verified against the tables they wrote, which is the right check and not a
complete one. Neither can tell you whether the application on top still reads what it expects. The
consumer-side checks are the test suites in `price` and `catalogue`, run after the migration and not
before:

    node --test "test/*.test.ts"

The quoted glob is required on Windows.
