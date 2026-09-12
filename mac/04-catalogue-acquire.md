# 1d. The catalogue: 4+ GB, not in git, and a live-write trap

Not run. Cannot be run from the Mac alone or from Windows alone: the
checksum half runs on Windows, the transfer needs both, and the verify
half runs on the Mac.

## Why this is its own document and not just a copy command

The repo clone on the Mac measures 10 MB total (392 tracked files, per the
Mac inventory). The catalogue is not tracked in git at all. Measured on
this Windows laptop directly, moments before this was written:

    catalogue/data/catalogue.db        4,140,003,328 bytes
    catalogue/data/catalogue.db-wal      241,188,952 bytes (changing -- another lane is writing right now)
    catalogue/data/catalogue.db-shm          491,520 bytes

Those byte counts are a snapshot, not a fixed fact -- they will be
different, possibly very different, by the time the Mac session actually
runs this. What does not change is the shape of the trap: `catalogue/src/schema.ts`
and `catalogue/src/gaps.ts` open the database in WAL mode
(`PRAGMA journal_mode = WAL`), which means recent writes can sit in
`catalogue.db-wal` instead of inside `catalogue.db` itself. Copying
`catalogue.db` alone while a nonzero `-wal` file sits next to it produces
a database that opens cleanly, reports a plausible row count, and is
silently missing whatever the log still held. It does not error. It does
not warn. It looks like success. That is worse than the checksum
incident this same item already carries (a download reaching the right
size and still failing to decompress), because that one at least fails
loudly.

## The decision: checkpoint-then-copy, or copy-the-set

Two ways to make the copy safe, and they are not interchangeable:

**(a) Checkpoint first, then copy one file.** Close every writer, run
`PRAGMA wal_checkpoint(TRUNCATE)` against `catalogue.db` (this repo's
`mac/checkpoint-wal.mjs` does exactly this), confirm the `-wal` file has
shrunk to 0 bytes, then checksum and copy `catalogue.db` alone. Cleanest
result -- one file, one hash -- but it requires that nothing is writing
at the moment the checkpoint runs, and a truncate against a database with
an active writer either fails or immediately starts refilling the log,
which defeats the point.

**(b) Copy the set.** Checksum and copy `catalogue.db`, `catalogue.db-wal`
and `catalogue.db-shm` together, as one unit, never one without the
others. Works even while another lane is actively writing, because it
does not require the writer to stop. The database opened from this set on
the Mac will run its own recovery from the WAL on first open (this is
what WAL mode is for), so nothing is lost.

**Pick based on the actual situation at run time, not on which is
"cleaner":** ask in chat (or on whatever channel this repo's parallel
lanes coordinate on) whether the catalogue lane is still writing. If the
answer is no, or the answer is silence and `catalogue.db-wal`'s size is
observed to be identical across two checks a few seconds apart, use (a).
If the answer is yes, or the size is still moving, use (b) -- do not wait
for the writer to finish if there is no way to know when that will be; a
correct copy of a database mid-use is still correct, a checkpoint run
against an active writer is the actual risk.

Given the state measured while this was written (a lane actively writing,
per the boss directly), **(b) is the one to reach for first.** (a) is kept
and documented because the catalogue will eventually stop needing daily
rewrites once the beta is live, at which point re-running (a) once,
un-hurried, shrinks the footprint back to a single file for any later
re-copy.

## Which files the server actually needs -- read this before copying 16 GB

`catalogue/data/` on this Windows laptop holds roughly 16 GB total,
almost all of it source material for REBUILDING the catalogue, not
anything the running beta server reads. Copying all of it wastes hours
over a LAN for no benefit. What the server actually opens at runtime,
confirmed by reading the code paths directly rather than guessing:

**Needed:**
- `catalogue.db` (+ `-wal` and `-shm` if option (b) was chosen) -- opened
  through `SHIN_CATALOGUE`, so it can live anywhere (this runbook's
  `mac/config.env.example` puts it in `$SHIN_DATA_DIR`, outside the repo
  clone).
- `pack-grocery.bin.br` (about 1.5 MB) and `pack-canada.bin.br` (about
  6.5 MB) -- `app/src/pack-route.ts` resolves these with a path built from
  its own file location (`../../catalogue/data/pack-*.bin.br`), NOT from
  any environment variable. These two files MUST end up inside the repo
  clone itself, at `$SHIN_REPO_DIR/catalogue/data/`, regardless of where
  `SHIN_CATALOGUE` points the big database -- putting them in
  `$SHIN_DATA_DIR` instead would leave the server unable to find them.

**NOT needed for the beta, do not copy:**
- `food.parquet` (7.8 GB) and `canada.parquet` -- rebuild sources for the
  catalogue loader, read by `catalogue/src/load.ts` offline, never by the
  running server.
- `off.csv.gz` (1.27 GB), `openbeautyfacts.jsonl.gz`,
  `openpetfoodfacts.jsonl.gz`, `openproductsfacts.jsonl.gz`, the
  `icecat-*.xml.gz` files, `rows*.jsonl` -- all offline ingestion sources,
  same reasoning.
- `gaps.db` -- do NOT copy this one either, for a different reason: it is
  not read-only source material, it is a live log, but `catalogue/src/gaps.ts`'s
  `openGapLog` creates its schema on first open if the file is missing
  (`mkdirSync` + `CREATE TABLE IF NOT EXISTS`), so the Mac should start
  with its own empty gap log rather than inheriting Windows's development
  history of misses. `SHIN_GAPS` in `mac/config.env` points at a fresh
  path for exactly this reason.
- `catalogue.db-shm` if it is 0 bytes and `catalogue.db-wal` is also 0
  bytes at copy time (option (a) was successfully completed) -- nothing
  to carry, `scripts/mac-catalogue-checksum.ps1` already skips zero-byte
  WAL/SHM files on its own.

## Steps

### On Windows

1. Decide (a) or (b) per the section above.

2. If (a): checkpoint first.

       node mac/checkpoint-wal.mjs C:\shin\catalogue\data\catalogue.db

   Expected output: `checkpoint done, wal file size after: 0` (or a very
   small number, which is normal). If it errors, something still has the
   database open; that is itself the sign to switch to (b) rather than
   forcing the checkpoint.

3. Either way, checksum whatever is actually there right now:

       powershell -File scripts\mac-catalogue-checksum.ps1 -DataDir C:\shin\catalogue\data

   Expected output: one line per file present, and a manifest written to
   `catalogue\data\catalogue.manifest.sha256`. Run this AS LATE AS
   POSSIBLE before the transfer in step 4 starts -- if a write lands
   between this hash and the copy, the hash is stale and the Mac-side
   verify in the next section will correctly fail, which is the check
   working, not a bug.

### Transfer, Windows to Mac

**READ THIS BEFORE STEP 4. The pull direction below does not work today, and
the reason is a measurement, not a guess.** Checked on the Windows laptop
2026-09-11:

- Its LAN address is `192.168.2.16` on Wi-Fi.
- **It is running no SSH server at all.** `Get-Service sshd` reports the
  service is not present. OpenSSH Server is a Windows optional feature and it
  is off. So every `rsync ... user@windows:` line below has nothing to connect
  to, and would fail with a connection refused that names nothing useful.
- It is on a Tailscale tailnet as `jamin` / `100.87.254.73`, but **the Mac is
  not on that tailnet**. The only other devices on it belong to someone else
  and have all been offline for over 50 days.

So pick one of these three before step 4, in this order of preference:

**(a) Push from Windows instead of pulling from the Mac.** This needs no new
software on the Windows laptop, only Remote Login switched on on the Mac
(System Settings, General, Sharing, Remote Login). Check it first with
`sudo systemsetup -getremotelogin`. Then the transfer runs FROM Windows and
the direction of every rsync line below reverses: source becomes the local
`catalogue\data` path and destination becomes `user@mac:...`. Both machines
must be on the same network; confirm with `ipconfig getifaddr en0` on the Mac
and check it is also on `192.168.2.x`.

**(b) An external drive.** Slower to set up, needs no network and no service
enabled on either machine, and the checksum verify in the next section works
identically against the drive-copied files. This is the fallback the rest of
this document already anticipates.

**(c) Put the Mac on the same tailnet.** Then either direction works from
anywhere, not only on the home network, which also helps later when the Mac
is the beta server and the laptop is not beside it. This is an account action
and therefore his, not a session's.

**Do not solve this by installing OpenSSH Server on the Windows laptop
unprompted.** It opens a listening service on a personal machine, which is a
persistent change to how that machine is exposed, and it is his call whether
that is worth saving one step.

4. Confirm `WINDOWS_SOURCE_HOST` in `mac/config.env` is actually filled in
   (it ships empty on purpose, see that file's own comment) before running
   this, or fail loudly rather than guessing. The address is `192.168.2.16`
   if and only if route (a) is reversed into a pull, which today it cannot be:

       if [ -z "$WINDOWS_SOURCE_HOST" ]; then echo "WINDOWS_SOURCE_HOST is not set. Fill it in in mac/config.env (ipconfig on Windows, IPv4 Address of the active adapter) before running this transfer." >&2; exit 1; fi

5. Two destinations, because the pack files and the database do not go to
   the same place (see the file list above for why):

       mkdir -p "$SHIN_DATA_DIR"
       mkdir -p "$SHIN_REPO_DIR/catalogue/data"

       rsync -avz --progress \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/catalogue.db" \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/catalogue.db-wal" \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/catalogue.db-shm" \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/catalogue.manifest.sha256" \
         "$SHIN_DATA_DIR/"

       rsync -avz --progress \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/pack-grocery.bin.br" \
         "${WINDOWS_SOURCE_USER}@${WINDOWS_SOURCE_HOST}:${WINDOWS_CATALOGUE_DATA_PATH}/pack-canada.bin.br" \
         "$SHIN_REPO_DIR/catalogue/data/"

   (If option (a) was used and `catalogue.db-wal` / `catalogue.db-shm` are
   both 0 bytes or absent, the first rsync's reference to them will either
   copy two empty files or error "no such file" depending on the rsync
   build -- either outcome is harmless; if it errors, drop those two
   filenames from the command and continue with just `catalogue.db` and
   the manifest.)

   Expected output: two rsync summaries, each with a nonzero "Number of
   files transferred" and a total size matching the multi-gigabyte
   catalogue for the first one. This is the single longest-running step in
   the whole setup; over even a fast LAN, 4+ GB is real minutes, and if no
   usable LAN path exists between the two machines, fall back to an
   external drive for this step specifically and skip straight to the
   Mac-side verify below once the drive-copied files are in place.

### On the Mac

6. Run `mac/04-verify-catalogue-checksum.sh`. It recomputes hashes over
   whatever landed in `$SHIN_DATA_DIR` and `$SHIN_REPO_DIR/catalogue/data/`
   and compares every line against `catalogue.manifest.sha256`. Do not
   proceed to pointing the server at this catalogue, and do not run the
   Node test gate that depends on it, until this passes clean.
