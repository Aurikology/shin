---
name: wire-check
description: Prove a finished piece is reachable by a person before recording it as built. Use before closing any item that added a module, a route, an adapter, or an exported entry point, and before writing a commit line that claims a feature works.
---

# wire-check

Build standard 2 says a piece nothing calls is not built. It has been true and unenforced since it
was written, and it is the most expensive habit in this repo: eight finished, tested pieces sat
unreachable at once. Four of the twelve commits before this file existed were the repair, not the
feature.

**The failure is quiet by design.** Every one of these passed its own tests, typechecked, and read
correctly. Nothing goes red when a module has no importer.

## The check

Run all six. Steps 1 to 4 take a minute and catch the mechanical cases; step 5 is the one that
actually decides.

1. **Importers.** For each exported symbol the change adds:

   ```
   grep -rn "<symbol>" --include=*.ts --include=*.mjs --include=*.js . | grep -v node_modules | grep -v /test/
   ```

   Discard the file's own references. Zero non-test importers means not built.

2. **Routes against calls.** A new server route is not reachable because it exists. List what the
   client actually calls and what the server actually registers, and compare both directions:

   ```
   grep -rn "/api/" app/public/js | grep -v node_modules
   grep -n "url.pathname === '/api" app/server.ts
   ```

   A route with no client call is unwired. A client call with no route is broken. D-025 was found
   this way and nothing else would have found it.

3. **Lists, not just imports.** Some things join an array rather than being imported by a caller.
   Open the array itself and confirm the entry is in it: `defaultSources()` in
   `spine/src/sources/registry.ts`, the screen list in `app/public/js/main.js`, the content-type
   map in `app/server.ts`, the copy tables in `app/public/js/voice.js`. D-047's adapter was
   imported by nothing **and** in no list, and no test anywhere could tell.

4. **Empty by construction.** If the new code takes an injectable dependency with a default, read
   what the default returns. A reader that defaults to empty makes the whole feature answer nothing
   while looking healthy — `nextToPrice`'s scan reader did that from the day it was written, so its
   own stated main result was empty by construction and running it proved nothing. Confirm a real
   caller passes a real one.

5. **Name the path a person takes, in one sentence, and walk it.** Not the endpoint by hand, not the
   unit test, not the export. If the sentence cannot be written, the piece is not built: open a
   `DEFECTS.md` row saying so instead of claiming it. Use `screen-walk` for the walking.

6. **Write down which path was walked and what appeared on the screen**, in the commit or the row.
   A walk not written down did not happen, and the next person cannot tell your claim from a guess.

## What counts as reachable

By a person, through the app, without a debugger. An endpoint answering `curl` is the producer
working; it says nothing about whether anything calls it. That distinction is the whole of build
standard 2 and every row below was a case of getting it wrong.

## Learnings log

- 2026-09-08 — Written after the fifth instance. D-023 (offline aisle, both halves finished, no
  screen imported it), D-024 (identification chain and vision read, zero importers), D-025 (two live
  endpoints, no caller), D-026 (four finished pieces at once), D-047 (adapter in no list). Step 3
  exists because D-047 was invisible to a grep for importers, which is what step 1 would have run.
  Step 4 exists because `nextToPrice` was worse than uncalled: callable, and mute.
