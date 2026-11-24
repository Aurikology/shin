# Someone asks to see or delete their Pexi data

For: Jamin Xu, person in charge of privacy (the privacy policy names him and `usepexiapp@gmail.com`).
Written for 2am. Every legal requirement below names the exact section it comes from. What is a fact
from the code says which file and line. What is a guess says **ASSUMED**.

## The short version

1. A request arrives by email (almost always from the You screen, "Delete my data").
2. **Start the clock.** Write the date received in the request log (bottom of this page). You have **30 days** to answer.
3. **Check it is really their phone** (section 3). No check, no export, no delete.
4. On the Mac, in the repo folder, run the script. Export first, then delete (section 4).
5. Delete the customer in RevenueCat if they ever paid (section 5).
6. Reply to them. Fill in the log. Done, except that backups hold the data for up to 15 more days (section 6).

## 1. How a request reaches you

- **From the app.** You screen, "Delete my data" opens an email to `usepexiapp@gmail.com` with the subject
  "Delete my Pexi data" and the phone's device id already in the body (`app/public/js/screens/you.js:119-129`,
  `ui-strings.js:785-789`). This is the normal route.
- **By email without the id.** The privacy policy lets people write to the address themselves
  (`docs/store/privacy.html:97`). Reply and ask them to use the You screen button, so the id arrives with the request.
- **From a parent.** The policy says a parent or guardian can ask for a child's records to be deleted
  (`docs/store/privacy.html:105`). Same steps; the check in section 3 is done with whoever holds the phone.
- **A request for a copy ("show me what you have") is an access request.** Same clock, same check, the `export` command.

The law wants the request **in writing** (PIPEDA s. 8(1); Quebec private-sector Act s. 30). Email is writing.
A phone call or a message in an app store review is not; ask them to email.

## 1b. A request by a child, or for a child

Pexi is rated 4+ and open to all ages, so some requests will come from a child or a parent (R53; reasoning in
`docs/privacy/children-record.md` and `docs/security-check/legal-review-2026-11-17.md` questions 2, 4 and 5).

- **Same steps, same clock, same check (sections 2 to 4).** Whoever holds the phone can answer the two-products check. A child
  can pass it as well as an adult.
- **Do not ask for the child's age, name, birth date or a parent's ID.** Pexi holds none of these, and asking for them would
  collect more about a child than Pexi ever has. The device id plus the check is the whole test.
- **A delete request from a parent or guardian is never refused.** The policy promises it (`docs/store/privacy.html:105`).
  A delete request from the child is treated the same way: deleting harms only the person whose data it is.
- **An export goes to the address that wrote, after the strict two-answer check.** If the sender says they are the parent, the
  export still goes only when the answers match the scans; the sender may then pass it to the child.
- **Reply plainly, in short sentences,** with no legal wording, and say that Pexi keeps no name or email for anyone.
- **If a parent complains the child bought Plus:** that is a refund question, not a data question. Apple handles refunds
  (the Apple reply is in `docs/readiness/TEMPLATES.md`, "Refund or purchase by a child"). Still run the delete if they ask for it.
- **If a regulator or a school writes about children's data,** send them `docs/privacy/children-record.md` and tell Jamin the same day.

## 2. The deadline

| Rule | Source |
|---|---|
| Answer within **30 days** after you receive the request. | PIPEDA s. 8(3), https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html |
| You may extend by **up to 30 more days** in two cases (it would unreasonably get in the way of running Pexi, or you need to consult someone), but only if you send them a notice of extension **before day 30** saying the new date, why, and that they can complain to the Privacy Commissioner. | PIPEDA s. 8(4) (same page) |
| In Quebec, answer **in writing, promptly, and within 30 days**. Silence after 30 days **counts as a refusal**. | Quebec Act respecting the protection of personal information in the private sector (P-39.1), s. 32, https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1 |
| Access is **free**. A fee is allowed only for copying or sending, and only if you told them the amount first. | P-39.1 s. 33; PIPEDA Schedule 1 clause 4.9.4 ("minimal or no cost") |
| If you hold information that is the subject of an **access** request, keep it as long as they might still complain to the Commissioner. | PIPEDA s. 8(8) |

**Our own target is 7 days** (our choice, not law). Nobody asked us to pick a number; it keeps you far from day 30.

PIPEDA has no sentence giving a general right to erasure. We delete because the privacy policy promises it
(`docs/store/privacy.html:97`, `:105`), and because the policies both laws describe say personal information should
be destroyed or made anonymous when no longer needed (PIPEDA Schedule 1 clause 4.5.3; P-39.1 s. 23). So: do not
refuse a deletion request.

## 3. Check it is really their phone

The privacy policy says Pexi collects no name, email or account, so **we have nothing to match an email sender
against**. What a shopper can show us:

- **What the app gave them.** The device id arrives inside the email the You screen prepares. The app does not show
  the id anywhere else a shopper can copy it (the only other place is the developer-only line, `you.js:525`).
  The phone's secret (the thing that proves requests come from the same phone) is never shown or copyable, so we
  cannot ask for it. **ASSUMED:** an id that came inside the app's own prepared email was most likely sent from
  that phone's mail app.
- **What only the owner knows.** Their scans.

The law lets us ask for enough information to find the records and requires proof the person is the one concerned:
PIPEDA Schedule 1 clause 4.9.2 ("An individual may be required to provide sufficient information to permit an
organization to provide an account of the existence, use, and disclosure of personal information. The information
provided shall only be used for this purpose."); P-39.1 s. 30 (the request must come from "a person who proves that he
is the person concerned").

**The check (two questions, answered in a reply email):**

1. Run `export` (section 4, step 2) and read the scans in it: `query_text`, `resolved_label`, `scanned_at`.
2. Reply: "To make sure this is your phone, tell us two products you scanned or searched for, and about when."
   - **Export request:** both answers must match the scans. An impostor who learns an id gets someone's shopping
     history from a wrong answer, so this one is strict.
   - **Delete request:** one answer must match. Deleting harms only the person whose data it is, so it is lighter.
   - A phone with no scans at all (they only opened the app) has nothing to match. Treat the id arriving in the
     app's own email as enough for a **delete**, and refuse an **export** (there is nothing to export but their id).
3. Use the answers only for this check. Do not copy them into the log (PIPEDA 4.9.2 above).

**Do not** accept a screenshot of the id, an id typed from memory, or a request from an email address someone says
belongs to the shopper. The id appears in URLs and in the Mac's logs, so it is not a secret.

## 4. The steps

Run these on the Mac that runs the server, in the repo folder. Do not paste device ids into chat, git commits or
a document that is committed.

```
cd ~/shin
set -a; . ./mac/config.env; set +a          # the same settings the server runs with
ID=<the device id from the email>
```

1. **Look first (nothing changes):**
   `node scripts/privacy/device-data.mjs delete "$ID"` prints a count per table and "DRY RUN". If every count is 0, say so and stop:
   the id is wrong, the data was already removed, or it is older than 24 months (section 7).
2. **Export (an access request, and the check in section 3):**
   `node scripts/privacy/device-data.mjs export "$ID" --out ~/shin-privacy/export-$(date +%F).json`
   Send the file to the person yourself, by reply email to the address that wrote to us. It lists photos by file name;
   attach the files named under `photos` if there are any. Exports contain their shopping history, so delete the file
   after you send it.
3. **Delete:**
   `node scripts/privacy/device-data.mjs delete "$ID" --yes`
   Exit code 0 and a count for every table. The script checks itself afterwards and exits 1 with "still present
   after delete" if any row, file or log line remains. **If it exits 1, the request is not done**; read the message.
4. **RevenueCat**, if the export shows any purchase, or you are not sure (section 5).
5. **Reply** to the person (a person sends it; the system does not). Say: what was deleted, that backups age out
   in at most about 15 days, and that if they keep using the app on that phone it creates a new record the next time it runs.
   **Do not say that deleting the app and reinstalling gives a new id.** Since build 9 (2026-11-17) the id and the phone's
   secret are also kept in the iPhone Keychain (`app/public/js/device.js:79-140`), which survives a reinstall, so the same id
   comes back. There is no reset-id button yet. A shopper who wants a clean start can only ask for deletion here and then keep
   using the app under the same id. (The privacy page says the same, `docs/store/privacy.html:47`.) Deleting a phone's scans also
   restarts its free weekly allowance (the weekly count reads the scan rows, `app/src/scan-quota.ts:109`); that is a side effect,
   not a reason to refuse.
6. **Fill in the log** (section 8), including the date backups will have aged out.

The script finds every table with a `device_id` column on its own, so a table added later is covered without an edit.
It only touches rows with exactly that id; a test checks that another phone's rows, photos and log lines stay.

## 5. RevenueCat (purchases)

RevenueCat calls the phone by its device id (`app/public/js/purchases.js:82`, `appUserID: getDeviceId().id`), and
the policy says RevenueCat receives the device identifier (`docs/store/privacy.html:73`).

Deleting happens in RevenueCat, not here:

- **Dashboard:** open the customer by that id, "Manage" card at the bottom, "Delete Customer".
  Source: https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile
  ("Deleting customers through the RevenueCat dashboard or API clears out all of their data and is sufficient for GDPR erasure requests.")
- **API (same result):** `DELETE /v1/subscribers/{app_user_id}` ("Permanently deletes a customer. Deletion is queued
  asynchronously. After a 200, treat a 404 as confirmation that the customer no longer exists."),
  https://www.revenuecat.com/docs/api-v1/customers
- **Does not cancel the subscription.** RevenueCat's page says deleting a customer does not cancel an Apple subscription
  and that you cannot cancel one for them. Tell the person to cancel in iPhone Settings, Subscriptions, or they keep paying.
- Deleting a customer with live purchases can change RevenueCat's charts. That is expected.

## 6. The truth about backups

- The Mac backs up every night at **04:00** (`mac/launchd/com.shin.backup.plist`), one folder per night, copying every database
  (`mac/07-backup.sh`).
- It keeps the **newest 7** folders and deletes older ones (`mac/07-backup.sh`, KEEP; 14 until 2026-11-24).
- So after you delete someone, the nights before the delete still hold them. The last such backup is deleted once 14 newer ones
  exist: **about 14 nights, so within 15 days of the delete.** The policy's wording, "Backups ... can hold a copy for longer until
  they are replaced" (`docs/store/privacy.html:91`), is true.
- **If backups stop running, nothing ages out.** The count is of folders, not days. Check the newest folder is from last night.
- **If `SHIN_BACKUP_DIR` is inside Dropbox** (the example config puts it at `/Users/worker/Dropbox/shin-backup`,
  `mac/config.env.example:197`; the real value is in your `mac/config.env`), Dropbox keeps deleted files for a further period
  (**ASSUMED: 30 days; check your Dropbox plan's "deleted files" setting**). Then the data is gone about 45 days after the delete.
- **A restore brings deleted people back.** After any restore (`mac/07-restore.sh`), run the delete again for every request
  in the log that is less than 45 days old. That is why the log keeps the device id for 45 days.

## 6b. Everywhere one phone's data can live

"Read from code" means the file and line named. "ASSUMED" means not seen in code or not checked on the Mac.
Paths are found the way the server finds them (`settings/src/index.ts`, `app/src/admin.ts:50-54`, `app/server.ts:1032-1038`).

| Where | Which setting / folder | Keyed by | What is in it | Script deletes it? | Basis |
|---|---|---|---|---|---|
| `scans.db`, table `scan` | `SHIN_SCANS` | `device_id` | Each scan or search: typed text, resolved product, price seen, answer, store, rough area, model output | Yes | Read from code: `app/src/scans.ts:73` |
| `scans.db`, `scan_rating`, `scan_rating_history` | same | `device_id` | Thumbs up/down on answers, with the reason | Yes | `app/src/migrations.ts:168`, `:449` |
| `scans.db`, `scan_pick`, `scan_later_answer` | same | `device_id` | Which match the shopper picked; answers that arrived later | Yes | `migrations.ts:753`, `:772` |
| `scans.db`, `gemini_call` | same | `device_id` | The full request and answer for each model call | Yes | `migrations.ts:497` |
| `scans.db`, `scan_act_outcome` | same | `device_id` (may be empty) or its scan | What the shopper did after an answer | Yes | `app/src/scan-quota.ts:294` |
| `scans.db`, `event` | same | `device_id` | Usage: opens, screens, taps, errors, sent searches | Yes | `migrations.ts:195` |
| `scans.db`, `consent`, `device_preference`, `device_user` | same | `device_id` | Photo and location choices; price-verdict settings; a linked user id | Yes | `migrations.ts:230`, `:374`, `:278` |
| `scans.db`, `device_key` | same | `device_id` | A one-way hash of the phone's secret, and the date it was first seen. Withheld from exports. | Yes | `app/src/device-key.ts:70` |
| `corrections.db`, `correction` | `SHIN_CORRECTIONS` | `device_id` | Prices the shopper reported | Yes | `price/src/corrections.ts:126` |
| `corrections.db`, `shopper_price` | same | `device_id` | Prices the shopper typed for a product | Yes | `price/src/shopper-prices.ts:34` |
| `user-catalogue.db`, `user_observation`, `user_offer`, `user_review` | `SHIN_USER_CATALOGUE` | one-way key of the id, and `scan_id` | Prices and offers learned from that phone's scans | Yes | `catalogue/src/user-catalogue.ts:105`, `:404` |
| `people.db`, `device_person` | `SHIN_PEOPLE_DB` | `device_id` | Which named tester (if any) a phone belongs to | Yes | `app/src/admin.ts:76` |
| Access log `access.log` | `SHIN_ACCESS_LOG` | id inside `url` / `referer` | One JSON line per request, with IP, country, browser | Lines that name the id | `app/src/access-log.ts:77-107` |
| Server output logs `mac/logs/*.log` | `SHIN_LOG_DIR` (script only) or `mac/logs` | `deviceId` in error lines | Server errors and stdout | Lines that name the id | `app/src/errlog.ts:69`; plist `:46`, `:49` |
| Photos folder | `SHIN_PHOTOS` | file named in `scan.photo_path`; folder `shelf/<day>/<id>/` | Scan photos, shelf photos | Yes | `app/src/photos.ts:102`, `app/src/shelf.ts:141`. ASSUMED: empty on the live Mac (policy says no upload) |
| Shutter log folders | `SHIN_SHUTTER_DIR` (only when `SHIN_SHUTTER_LOG=on`) | id inside the folder's `.json` files | Camera test captures | Yes | `app/src/shutter-log.ts:59-60`. ASSUMED: off in production |
| Nightly backups | `SHIN_BACKUP_DIR` | all of the above | A copy of every database | **No** (section 6) | `mac/07-backup.sh` |
| RevenueCat | their dashboard | the device id as customer id | Purchase and subscription history | **No** (section 5) | `purchases.js:82`; policy `:73` |
| Cloudflare | their dashboard | the request | Carries every request | **No** | Policy `:73`. ASSUMED: nothing for us to delete there |
| Typed-name cache for price ranges | `SHIN_RANGE_ASK_STORE_PATH` (`identify/data/range-ask.json`) | name and brand, not a device | A 90-day cache and counts | No (no device id in it) | `identify/src/range-ask.ts:13`; not otherwise checked |
| Gap list `gaps.db` | `SHIN_GAPS` | none | Searches nobody could answer | No (no device id) | `catalogue/src/gaps.ts:41` |

## 7. Things the script cannot find or reach

| What | Why |
|---|---|
| Rows older than **24 months** | The nightly sweep already replaced the device id with `removed:<row number>` (`app/src/retention.ts:36`, `:75-90`). We cannot tell whose they are; they are no longer tied to the phone. |
| Server log lines that do not contain the device id | The request log lines carry the id only inside the URL or the referer. Other lines carry an IP address and a browser string (`app/src/access-log.ts:81-107`). We cannot tie them to a phone. |
| Backups | Section 6. |
| RevenueCat | Section 5. |
| Cloudflare (carries every request) | **ASSUMED:** Cloudflare keeps its own traffic logs on its terms; we hold nothing to delete there. **Not checked.** |
| Anthropic / Google (model answers) | The policy says they do not receive the device id (`docs/store/privacy.html:73`). A typed product name sent to a model is not tied to the phone. **Not checked** beyond the policy text. |
| The shared price catalogue and gap list | The catalogue holds only a one-way key (first 16 hex characters of a SHA-256 of the id: `catalogue/src/user-catalogue.ts:404`). The script deletes catalogue rows with that key and rows tied to that phone's scans. The gap list (`catalogue/src/gaps.ts:41`) holds typed text with no device id; it cannot be tied to a person. |

## 8. The request log

Keep it **outside git**, in `~/shin-privacy/request-log.csv` on the Mac. The log holds device ids, and a committed file
would keep them for ever, which defeats the delete. Never commit it, never paste a row into chat.

One row per request. Minimum fields:

| Field | What goes in it |
|---|---|
| `received` | Date the request reached you (the day the 30 days start). |
| `from` | The email address that sent it (so you can reply). |
| `kind` | `access`, `delete`, or `both`. |
| `device_id` | The id. **Blank this field 45 days after the delete date** (section 6). |
| `check` | `passed` or `failed`, and the date. Not the answers. |
| `export_sent` | Date, or `no`. |
| `deleted_on` | Date the `--yes` run exited 0. |
| `revenuecat` | `deleted <date>`, `no purchases`, or `not needed`. |
| `answered_on` | Date you replied. Must be 30 days or fewer after `received` (or 60 with a written extension notice). |
| `backups_clear_on` | `deleted_on` plus 15 days (plus 30 more if the backup folder is in Dropbox). |
| `notes` | Anything odd. |

Keep the log for **2 years** after `answered_on` (our choice, so that you can show you answered within 30 days if
someone complains; no statute names a period for this log).

## 9. Retention the privacy policy promises that no code enforces

Checked by reading the policy lines against the code. "Promised" is what `docs/store/privacy.html` says.
(The French policy repeats the same periods, which `app/test/retention.test.ts` holds to the same constants.)

| Promised | Where | What code does instead | Fixed? |
|---|---|---|---|
| "Deletes what it records on a stated schedule" (all of it) | `privacy.html:41` | Only the three periods below have a sweep (`app/src/retention.ts:32-34`, called from `app/server.ts:4532-4539`). Everything not listed here has **no period at all**: `consent` (`app/src/migrations.ts:230`), `device_key` (`app/src/device-key.ts:70`), `device_preference` (`migrations.ts:374`), `device_user` (`migrations.ts:278`), and `device_person` in `people.db` (`app/src/admin.ts:76`). Each is one row per phone and keeps its device id for ever. | **No.** A sweep by age would delete the settings of a phone still in use (these rows are dated by last change, not last use), and `device_key` would let a stranger claim an id. Needs a "last seen" date first. Left for you. |
| Request logs: 90 days | `privacy.html:87` | Enforced for `access.log` (`retention.ts:123-172`). **Bug found and fixed:** a damaged first line stopped the sweep for good (the early return, now `retention.ts:146-149`). | **Yes**, with a test (`app/test/retention.test.ts`). |
| Request logs: 90 days | `privacy.html:87` | The server's own output logs `mac/logs/server.out.log` and `server.err.log` (`mac/launchd/com.shin.server.plist:46,49`) carry device ids (`app/src/errlog.ts:69`) and are never rotated or trimmed. The code says so itself (`retention.ts:17-18`). | **No.** Needs a rotation job on the Mac and a call on the daily timer in `app/server.ts`, which is outside this lane. The script removes lines by id on request. |
| Scans, ratings, prices: device id removed after 24 months | `privacy.html:89` | Enforced for the scan tables (`retention.ts:46-54`), corrections and shopper prices (`retention.ts:95-105`). **Not** the catalogue's `user_observation.device_key` (`catalogue/src/user-catalogue.ts:124`), a one-way key that still links a shopper's typed prices to each other and survives 24 months. | **No.** Needs a call from the daily timer in `app/server.ts`, which is outside this lane. |
| Backups hold a copy "until they are replaced" | `privacy.html:91` | True only while backups run (section 6). It is by count (7), not by days (`mac/07-backup.sh` KEEP). A Dropbox folder keeps more (ASSUMED). | No code change needed; documented in section 6. |
| "This version of Pexi does not upload photos or camera images" | `privacy.html:39,58` | The server has code to store photos with no end date by default (`app/src/photos.ts:87`, `SHIN_PHOTO_RETENTION_DAYS` unset = keep for ever) and shelf photos in a folder named after the phone (`app/src/shelf.ts:141`). **ASSUMED:** the live app does not send them; not checked. If it ever does, the policy sentence is wrong and there is no retention period for them. | **No.** Flag to you. |

## Sources

- PIPEDA, https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html: s. 8(1), 8(3), 8(4), 8(8); Schedule 1 clauses 4.5.3, 4.9.1 to 4.9.4.
- Quebec Act respecting the protection of personal information in the private sector (P-39.1), https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1: ss. 23, 27, 28, 30, 32, 33.
- RevenueCat, https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile and https://www.revenuecat.com/docs/api-v1/customers (Customers, Delete a customer).
- Code and configuration: the file and line numbers given above, as of the commit this file was written in.
