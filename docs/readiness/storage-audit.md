# Storage audit (R79): what the phone app keeps, and what happens if iOS wipes the web view

Scope: every string literal shaped like a `shin` key under `app/public/js/`, plus the other storage keys the code uses (the `pexi.*` ones, and IndexedDB and Cache Storage names). Read from the code on 2026-11-19; nothing here was run on a phone.

How to read the fates:

- **backed up**: copied into the Keychain by `storage-backup.js` (item `shin.setupBackup`) and put back when the app finds itself blank (`restoreSetupIfWiped`, called from main.js before the first screen).
- **keychain**: lives in the Keychain directly (device.js).
- **server keeps**: the server can give it back by device id.
- **recomputed**: rebuilt on the next run with no loss to the shopper.
- **accepted loss**: gone after a wipe; the Why column says what the shopper notices.
- **not storage**: the string looks like a key but is something else.

The `shin.v1` store is one localStorage value (written by `persist()` at store.js:383). Its fields have their own rows, named `shin.v1.<field>`. The "backed up" list is the `FIELDS` table in storage-backup.js, plus the newest watchlist entries and Past scans that fit their byte bounds, plus the two non-store keys `shin.theme` and `shin.locale` (updated 2026-11-20).

| Key | Written at (file:line) | What it holds | Fate | Why |
|---|---|---|---|---|
| `shin.deviceId` | device.js:32 (localStorage), device.js:144 (Keychain) | The anonymous device id | keychain | Reinstall or wipe: `reconcile` (device.js:137) reads the Keychain first and copies it back into localStorage. The free-scan count and purchases hang off this id, so they survive. |
| `shin.deviceSecret` | device.js:69 (localStorage), device.js:145 (Keychain) | The per-device secret that signs requests | keychain | Same path as the id. Without it the server would treat the phone as new. |
| `shin.setupBackup` | storage-backup.js:114 (Keychain only) | JSON copy of the setup choices, version 1 | keychain | It is the backup itself. It never sits in localStorage, so a web wipe cannot touch it. |
| `shin.v1` | store.js:383 | The whole app state as one JSON object (fields below) | backed up | Only the fields marked as backed up below come back. Everything else in it is lost with the blob. |
| `shin.v1.unreadable` | store.js:373 (written as `${KEY}.unreadable`) | A raw copy of a `shin.v1` blob that failed to parse, kept so a bad byte does not destroy it | accepted loss | A safety copy for a human to inspect. A wipe removes it with the rest; the shopper never sees it. |
| `shin.v1.city` | store.js:22 | The optional city | backed up | In `FIELDS`. |
| `shin.v1.seenIntro` | store.js:23 | Whether the intro was seen | backed up | In `FIELDS`. Also one of the "is the app blank" tests. |
| `shin.v1.personality` | store.js:30 | Which Pexi the shopper picked | backed up | In `FIELDS`. |
| `shin.v1.lineUnderPct` | store.js:53 | Good range, percent under | backed up | In `FIELDS`. |
| `shin.v1.lineOverPct` | store.js:54 | Bad range, percent over | backed up | In `FIELDS`. |
| `shin.v1.lineGreatPct` | store.js:64 | Great range, percent under | backed up | In `FIELDS`. |
| `shin.v1.linesSet` | store.js:66 | Whether the shopper set a range | backed up | In `FIELDS`. |
| `shin.v1.lineUnit` | store.js:67 | Percent or dollar choice | backed up | In `FIELDS`. |
| `shin.v1.lineAmounts` | store.js:68 | The dollar-amount ranges | backed up | In `FIELDS`. |
| `shin.v1.alertStyle` | store.js:74 | Deal-alert style (conservative, recommended, aggressive) | backed up | In `FIELDS`. |
| `shin.v1.alertMinPct` | store.js:75 | Alert threshold in percent | backed up | In `FIELDS`. |
| `shin.v1.torchMode` | store.js:85 | Torch auto or off | backed up | In `FIELDS`. |
| `shin.v1.torchThreshold` | store.js:86 | Darkness level that lights the torch | backed up | In `FIELDS`. |
| `shin.v1.watchlist` | store.js:88 | Items the shopper saved and watches | backed up | The newest (first) entries whose JSON fits in 12,000 bytes (`MAX_WATCHLIST_BYTES`). A list under the bound comes back whole; a larger one comes back as its newest entries, so the loss is the oldest entries rather than the whole list. |
| `shin.v1.history` | store.js:90 | Every verdict shown (the Past scans list, newest first, up to 100) | backed up | The newest scans whose JSON fits in 24,000 bytes (`MAX_HISTORY_BYTES`), with the 96px photo thumbnails (`data:` URLs) left out and any single row over 3,000 bytes skipped; about 24 to 70 scans for normal rows. Restore takes only rows with a string id and date. The server keeps only scan totals by device id (`/api/scans` returns summaries), so this copy is the only way the list comes back. Scans older than the bound, and thumbnails, are lost. |
| `shin.v1.corrections` | store.js:103 | Corrections the shopper made, with sent flags | server keeps | Sent corrections are on the server and feed later verdicts. A correction not yet sent is lost, and the shopper would not notice. |
| `shin.v1.drops` | store.js:105 | Fake price drops the demo can fire | accepted loss | Demo data. The shopper notices nothing. |
| `shin.v1.scanCount` | store.js:106 | Local scan counter | server keeps | The free-scan allowance is counted per device id on the server, and the id survives. Only the local tally restarts. |
| `shin.v1.shareCount` | store.js:107 | Local share counter | accepted loss | A counter only; the shopper notices nothing. |
| `shin.v1.interruptions` | store.js:113 | Timestamps of times Pexi spoke unasked | recomputed | Pruned to the last day on every read, so an empty list costs nothing. |
| `shin.v1.proUntil` | store.js:115 | Old local Plus expiry date | accepted loss | Dead state: only isPro() (store.js:643) reads it and nothing calls isPro(). Losing it changes nothing. |
| `shin.v1.market` | store.js:124 | Country, currency, code, region the verdict is judged against | backed up | In `FIELDS`. |
| `shin.v1.removed` | store.js:131 | Deleted scans and unwatched items kept 30 days for undo | accepted loss | The shopper loses the undo bin; anything deleted in the last 30 days cannot be restored. |
| `shin.v1.buzz` | store.js:138 | Buzz on verdicts toggle | backed up | In `FIELDS`. |
| `shin.v1.consent` | store.js:161 | Photo and location consent with `updatedAt` | backed up | In `FIELDS`. The server also holds a consent row by device id. |
| `shin.v1.consentSeen` | store.js:169 | Whether the consent screen was shown | backed up | In `FIELDS`. |
| `shin.v1.agreement` | store.js:171 | The accepted agreement record | backed up | In `FIELDS`. |
| `shin.v1.permissionsSeen` | store.js:179 | Whether the permissions primer was shown | backed up | In `FIELDS`. |
| `shin.v1.ratings` | store.js:187 | The shopper's own verdict ratings | accepted loss | The "Your ratings" section on You resets to zero. Ratings already posted are on the server. |
| `shin.v1.shops` | store.js:212 | Known shops and last shop by map cell | accepted loss | Shop suggestions start over; the shopper has to pick shops again. |
| `shin.v1.named` | store.js:219 | Names the shopper gave unknown barcodes | accepted loss | A barcode named before shows as unknown again. |
| `shin.theme` | you.js:677 (read at main.js:82 and you.js:179) | Light, dark or system | backed up | Copied as `theme` when it is light or dark (absent means system, so nothing is copied). On restore a valid value is written back and `data-theme` is set on that launch, so the look shows at once; junk is never written back. The You screen fires `shin:theme` so a theme-only change refreshes the copy. |
| `shin.locale` | lib/locale.js:121 via persistence.js:85 (key at lib/locale.js:49) | Chosen language (English or French) | backed up | Copied as `locale` when it is one of `LOCALES`; written back on restore only if valid. `setLocale` fires `shin:locale`, which refreshes the copy. The choice survives while the build is pinned to English, so switching the flag back on restores it. |
| `shin.plus` | purchases.js:60 via persistence.js:85 | Cached "Plus was last seen active" flag | recomputed | Native app only: refreshPlus() (main.js:153, purchases.js:228-236) rewrites it from RevenueCat on launch; in a browser it stays the cached value. After a wipe, plusActive() reads false until getCustomerInfo resolves, so the first requests go without x-shin-plus; the server checks RevenueCat itself (scan-quota.ts), so the loss is a short window. Not verified on a device. |
| `shin.camera.granted` | camera-session.js:85 | Remembers the camera was granted, to count a repeat prompt | recomputed | After a wipe the flag is set again on the next grant. Worst case one repeat prompt is not counted in analytics. |
| `shin.appStatus` | remote-status.js:217 (key at remote-status.js:30) | Last app-status reply (minimum version, feature flags) | recomputed | Fetched again on the next launch; the cache only covers being offline. |
| `shin.probe` | lib/persistence.js:43 | A throwaway write to test whether storage works; removed at once | recomputed | Never holds data. |
| `shin.track.queue` | track.js:73 (key at track.js:48) | Analytics events not yet sent | accepted loss | A few unsent events vanish. The shopper notices nothing. |
| `shin.tags` | screen-tag-badge.js:75 | Dev flag: show screen tags | accepted loss | Developer switch, off for shoppers. |
| `shin.dev` | dev-mode.js:25 | Dev mode switch | accepted loss | Developer switch, off for shoppers. |
| `shin.dev.packRead` | dev-mode.js:55 | Dev flag: show where the pack was read from | accepted loss | Developer switch, off for shoppers. |
| `shin-invite` | api.js:143 (also read at pack.js:255) | Beta invite code taken from the `#invite=` link | accepted loss | Browser beta only. The native app never reads this key: it gets the code from `window.SHIN_INVITE_CODE`, injected into index.html by native/scripts/sync-web.mjs, so a wipe does not lose it there. In a browser, after a wipe, requests are refused at the beta gate until the shopper opens the invite link again. See Gaps. |
| `shin-pack` | pack.js:37, writes at pack.js:292-293 | IndexedDB database holding the offline product pack (stores `blob` and `meta`) | recomputed | Downloaded again; until then lookups fall through to the network. Pack.js says it treats an empty cache as normal. |
| `shin-eye` | eye.js:3699 (puts at eye.js:3728, 3745) | IndexedDB database, store `pending`: captures taken offline and not yet sent | accepted loss | A shelf capture taken with no signal and not yet uploaded is gone. The shopper would need to rescan. |
| `shin-say` | shin.js:553, shin.js:615 | CSS class name on the speech bubble | not storage | Markup only. |
| `shin.js` | face-art.js:5, 118, 874, 929 | A file name mentioned in comments | not storage | The string is a source file name, not a key. |
| `shin-text-frame.jpg` | native-text-reader.js:44 | Temporary file name for a frame handed to the native text reader | not storage | A file name passed to the native plugin, not a storage key. |
| `shin:locale` | lib/locale.js:115, 123 | A DOM event fired after the language changes | not storage | An event name, not a key. |
| `shin:theme` | screens/you.js:679 | A DOM event fired after the theme changes, so storage-backup.js refreshes its copy | not storage | An event name, not a key (added 2026-11-20). |
| `shin:navigated` | router.js:402, track.js:188, 197 | A DOM event fired after every screen change | not storage | An event name, not a key. |
| `shin_own_data` | grounded.js:117 | Value of `block.source` meaning the server answered from Pexi's own data | not storage | A field value in a server reply, not a key. |
| `shin-shell-v4` (name given in sw.js:34, outside `app/public/js/`) | sw.js:34 | Cache Storage name for the offline app shell | recomputed | Browser only: main.js:179 registers the service worker only when window.SHIN_API_BASE is unset, so the native app never uses this cache. In a browser it refills on the next online load. |
| `pexi.outbox` | lib/outbox.js:65 | Ratings, undos and single events waiting to be posted | accepted loss | Posts made offline and not yet sent are lost. The shopper would not see an error. |
| `pexi.review.v1` | review-prompt.js:80 | Counters used to decide when to ask for an App Store review | accepted loss | The counters restart, so the review prompt comes later. Harmless. |
| `pexi.earlyAccess.seen` | early-access.js:23 | The early-access banner was dismissed | accepted loss | The banner shows once more until dismissed again. |
| `pexi.tip.firstScanSeen` | scan-notes.js:47 | The first-scan tip was seen | accepted loss | The tip shows once more. |

## Two spellings: `shin:locale` and `shin.locale`

Both exist, and it is not a bug. `shin.locale` (a dot) is the localStorage key that holds the chosen language (lib/locale.js:49). `shin:locale` (a colon) is the name of a DOM event that `setLocale` fires so painted screens can repaint (lib/locale.js:123). Nothing writes the event name to storage or reads the key as an event, so they are two different things that happen to look alike. The same applies to `shin:navigated`, which is an event only. `shin_own_data` is a value in a server reply, not a key.

## Cache Storage and IndexedDB

- Cache Storage: only `shin-shell-v4`, in sw.js. Nothing under `app/public/js/` opens a cache.
- IndexedDB: two databases, `shin-pack` (pack.js) and `shin-eye` (eye.js, queue code bundled in).
- Not verified: whether iOS clears Cache Storage and IndexedDB at the same moment as localStorage. The code treats all three as possibly gone independently, which is the safe reading.

## Gaps

Values whose loss the shopper would notice and that are not backed up. Updated 2026-11-20: the theme, the language, a watchlist over 12,000 bytes and Past scans are now backed up (rows above), so they are no longer gaps. Fixes below are suggestions only; none are implemented here.

1. **`shin-invite` (beta invite code), browser beta only.** The native app carries the code itself (`window.SHIN_INVITE_CODE`, injected by native/scripts/sync-web.mjs), so a wipe on the phone app loses nothing. In a browser, loss means every request is refused at the beta gate until the shopper reopens their invite link. A browser has no Keychain, so the fix is to resend the link.
2. **Partial losses in what is backed up.** Watchlist entries past the newest 12,000 bytes, Past scans past the newest 24,000 bytes, and every scan thumbnail. Accepted: the newest entries are the ones most likely to matter.
3. **`shin.v1.removed`, `shin.v1.ratings`, `shin.v1.named`, `shin.v1.shops`.** Small losses (undo bin, own ratings count, barcode names, shop suggestions). Smallest fix for the likely most noticed one, barcode names: add `named` to `FIELDS` as `isObj`, since it is capped at 100 entries.
4. **`shin-eye` and `pexi.outbox` unsent items.** Work done offline and not yet uploaded is lost. No cheap fix: the Keychain is the wrong place for photos. Accept it and rely on uploads draining quickly.
