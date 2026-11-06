Jamin: items 2 to 13 of your App Store list are built and pushed, item 1 is closed in code and still needs the key from you. Pull and restart the Mac, then do the list below. Nothing went to Apple.

## What only you can do, in order

1. **Set `REVENUECAT_SECRET_KEY` on the Mac.** Until it is set nobody is Plus on that server, paying subscribers included (the header is no longer believed; `SHIN_PLUS_TRUST_CLIENT=1` is the old behaviour on purpose). The startup log says which it is. Set it before the limits go on.
2. **Pull and restart.** The shutter log goes off, the limits and the retention sweep start, and migration 21 runs. Nothing is old enough to delete yet: the oldest data is about two months old against a 90-day window, so the first request-log lines go in December.
3. **Run `node src/embed-all.ts` in `catalogue/` on the machine with the real catalogue.** It deletes every vector made from an Open Icecat name and makes no new ones (item 13). Search already ignores those vectors, but they are still on disk until this runs. Not run from here; the PC has no real index.
4. **Publish `docs/store/`:** `privacy.html`, `terms.html`, and the new `privacy-fr.html` and `terms-fr.html`. The app now links to all four. Until then the hosted policy contradicts the code.
5. **Read `docs/store/quebec-transfer-note.md` and answer its three questions:** where the Mac is, whether the Anthropic, Cloudflare and RevenueCat contracts are enough, and how long the Mac's backups and stdout log keep data. The sweep cannot reach those, and the policy says so.
6. **Then your list as written:** build 4 from the final commit, screenshots, a sandbox purchase, the limits on the server, and App Store Connect (Canada only, 18+, content rights, attach, submit).

## Your calls

- **Old abandoned text.** New rows no longer hold it, but the rows already on the Mac still do, until they age out at 12 months. Deleting them now is one UPDATE on real data, so I left it for you.
- **The legal review should read the French pages.** They are my translation, not a lawyer's or a native speaker's. Same for the policy wording and the Quebec note.
- **The app is pinned to English** (`FLAGS.languages` off), so the first-run screen shows English even on a French phone. The French strings exist and are tested, and both hosted English pages link to their French twins. If Quebec needs a French first run, that flag has to go on.

## What changed that you should check on a phone

- **A new first screen** (`screens/agree.js`), before the welcome flow and impossible to skip, for testers too on their next launch: the 18+ and terms tick, and yes or no on sending product names to Claude, nothing preselected. No is a whole answer, with broad guesses. It can be changed on the You screen. The server makes no Claude call unless the phone sends `x-shin-claude: 1`, so build 3 and every older app get broad guesses, never Claude, from the moment you restart.
- **"Pexi's estimate" beside every verdict word:** the three sheets, Past scans, Saved and the share card.
- **The phone build has a content security policy tag** and its config moved to `js/native-config.js`. A wrong tag shows as a blank app, and this has only been run in desktop Chromium and WebKit, against the server's header. Check it on the first build-4 install, and pull the tag from `native/scripts/sync-web.mjs` if the app comes up blank.

## Not checked

No real phone, no live server, no real catalogue, no real RevenueCat. The MediaPipe vision reader did not load in the browser check, so it has not been run under the policy. The estimate label was checked in the rendered markup and the sheet snapshots, not by eye on a verdict.

Details: `notes/catch-up.md`, 2026-11-06. Delete this file once read.
