# If Pexi's data gets out: the breach plan

For: Jamin Xu, person in charge of privacy (the policy names him, `useshinapp@gmail.com`). Under the Quebec Act the
person with the highest authority holds this role unless they hand it to someone in writing (P-39.1 s. 3.1,
https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1%20.pdf), and nobody else is named in this repo, so it is you.
Written for 2am. No secret value is written here, only where each one lives and how to replace it.

**What counts.** A "breach of security safeguards" (PIPEDA) or "confidentiality incident" (Quebec) is any access,
use or sharing of personal information that the law does not allow, or any loss of it (P-39.1 s. 3.6: "access not
authorized by law ... use not authorized by law ... communication not authorized by law ... loss of personal information
or any other breach of the protection of such information"). Examples here: a leaked key, a stolen or sold Mac,
a backup folder shared by link, a bug that shows one phone another phone's scans. **If in doubt, treat it as one.
Every breach goes in the register (section 4), reportable or not** (PIPEDA s. 10.3(1);
https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html).

## 0. First 15 minutes, in this order

1. Write down the time you found out and what you saw. Do not fix anything yet. (Section 4 needs this time.)
2. **Copy the evidence** before the 90-day sweep or a rotation destroys it. On the Mac:
   `mkdir -p ~/shin-privacy/incident-$(date +%F) && cp "${SHIN_ACCESS_LOG:-$SHIN_DATA_DIR/access.log}" mac/logs/*.log ~/shin-privacy/incident-$(date +%F)/`
   (load `mac/config.env` first, as in data-requests.md section 4). These files hold device ids; keep them private and delete them
   when the incident is closed and its register entry is finished.
3. **Contain** (section 1).
4. **Assess** (section 2).
5. **Notify** if it passes the test (section 3), "as soon as feasible".
6. **Write the register entry** (section 4), even if you decide not to notify.

## 1. Contain: every secret, and how to replace it

Where the values live: `mac/config.env` on the Mac (the filled copy of `mac/config.env.example`; the example holds only
placeholders). Never paste a value into chat, a commit or a document. After changing any of them:
`launchctl kickstart -k gui/$(id -u)/com.shin.server` (`mac/DEPLOY.md:161`).

| Secret | What it opens | Replace it | Source |
|---|---|---|---|
| `SHIN_ADMIN_TOKEN` | A read-only SQL window onto the databases (`app/src/admin.ts`): **a leak reads everything**. Unset, every `/api/admin/*` path answers 404. | **Fastest contain for any suspected leak:** delete the line from `mac/config.env` and restart. Later set a new random value (for example `openssl rand -hex 32`). | `settings/src/index.ts:106` |
| `REVENUECAT_SECRET_KEY` | Reading and deleting customers in RevenueCat; tells the server who has Plus. | Create a new secret key in the RevenueCat dashboard's API keys page, revoke the old, update the config. (**ASSUMED** menu name; not checked.) | `settings/src/index.ts:101`; `app/src/scan-quota.ts:185` |
| `ANTHROPIC_API_KEY` | Spending on the Anthropic account; the model sees what we send. | Create a new key in the Anthropic console, delete the old, update the config. | `mac/config.env.example:146` |
| `GEMINI_API_KEY` | Same, on the Google account. | New key at https://aistudio.google.com/apikey, delete the old. | `mac/config.env.example:209-212` |
| `SHIN_INVITE_CODE` | The beta gate: without it, strangers are let in. | Choose a new code in the config; give it to testers again. | `mac/config.env.example:156` |
| `VOYAGE_API_KEY`, `BESTBUY_API_KEY`, `EBAY_APP_ID` / `EBAY_CERT_ID` (and the `EBAY_CLIENT_*` names), `SOLDCOMPS_API_KEY` | Paid price sources. They do not hold shopper data, so a leak costs money, not privacy. | Rotate in each provider's console. | `settings/src/index.ts:114-123` |
| Cloudflare tunnel login `~/.cloudflared/cert.pem` and tunnel credentials `~/.cloudflared/<id>.json` | Serving traffic as `anjiawenda.com`'s Pexi address, and whatever passes through. | Delete the tunnel and make a new one with the steps in `mac/01-cloudflare-tunnel.md`; run `cloudflared tunnel login` again and remove the old authorisation in the Cloudflare dashboard. | `mac/01-cloudflare-tunnel.md:50` |
| The Mac login, SSH keys, the Dropbox account that holds backups (if `SHIN_BACKUP_DIR` is in Dropbox, `mac/config.env.example:197`) | Everything: the databases and every backup. | Change the passwords, sign the lost device out of Dropbox and Apple ID. | n/a |
| The phones' own secrets | They prove a request comes from the same phone. The server keeps only a hash (`app/src/device-key.ts:70`). | **Nothing to rotate.** If a database leaks, the hashes of 64-character random secrets are not usable as logins. The device ids in it are, however, no longer private (the id is also in URLs and logs). | Read from code |

**Other quick stops:**

- **Stop the server** (the safest contain if data is still flowing out): `launchctl bootout gui/$(id -u)/com.shin.server`
  (same form as the checker and backup commands in `mac/DEPLOY.md:149`, `:185`). Start it again with
  `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.server.plist`.
- **A bug showing one phone another's data:** stop the server, and keep the database files as they are.
- **A backup folder shared or exposed:** remove the share link first, then see section 3 for how many people are in it.
- **Stolen or lost Mac:** the databases are on it unencrypted (**ASSUMED**; check FileVault). Rotate every row above.

## 2. Assess: is it serious enough to report?

Two tests, because two laws apply. You must answer both; a "no" needs its reason written in the register.

### Canada-wide: PIPEDA, "real risk of significant harm" (RROSH)

You must report to the Privacy Commissioner **and** tell the people **if it is reasonable to believe the breach creates a
real risk of significant harm** (PIPEDA s. 10.1(1), 10.1(3)).

- "Significant harm" includes "bodily harm, humiliation, damage to reputation or relationships, loss of employment, business
  or professional opportunities, financial loss, identity theft, negative effects on the credit record and damage to or loss of
  property" (s. 10.1(7)).
- The factors are "(a) the sensitivity of the personal information involved in the breach; (b) the probability that the personal
  information has been, is being or will be misused" (s. 10.1(8)).
- The Commissioner's own questionnaire is a help: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/privacy-breaches-at-your-business/rrosh-tool/
  and the guidance https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/privacy-breaches-at-your-business/gd_pb_201810/.

### Quebec: "risk of serious injury"

If there is "a risk of serious injury", you must **promptly** tell the Commission d'accès à l'information and the people
(P-39.1 s. 3.5). To judge it, weigh "the sensitivity of the information concerned, the anticipated consequences of its use and
the likelihood that such information will be used for injurious purposes", and **consult the person in charge of privacy**
(P-39.1 s. 3.7). That person is you; write down that you did.
This applies to the personal information of people in Quebec. Pexi has no way to tell who is in Quebec (no address or
account), so **assume it covers everyone** when the breach is large.

### What this means for Pexi's data (judgement, not law)

- **What Pexi holds:** a random device id; scans and searches, including any text a shopper typed; prices they entered;
  a rough one-kilometre area if they turned location on; the answers shown; whether they pay for Plus. No name, email,
  address, birth date or account (privacy policy, `docs/store/privacy.html:47-60`). The app is for all ages
  (`privacy.html:105`); treat children's data as more sensitive.
- **Lower risk:** only a price-source key leaked and was rotated before use; one phone's scans were shown to one other
  phone for a moment and nobody copied it.
- **Higher risk:** the databases, a backup, an access log (it holds IP addresses and the device id) or the admin token left
  Pexi's control; typed text can contain names or addresses; scans plus rough areas over time can show where someone lives
  or shops. **Assume reportable** if any database file, backup or access log left your control and you cannot show nobody read it.
- **When unsure, report.** Late reporting is the larger risk. It is an offence to knowingly fail to report or to fail to keep
  the record: fine up to $10,000 on summary conviction or $100,000 if prosecuted by indictment (PIPEDA s. 28).

## 3. Notify

"As soon as feasible after the organization determines that the breach has occurred" (PIPEDA s. 10.1(2), 10.1(6));
"promptly" (P-39.1 s. 3.5). The clock starts when you decide it is a breach, so write that time down.

### 3a. The Privacy Commissioner of Canada (OPC)

Use the secure online breach report form: https://www.priv.gc.ca/en/report-a-concern/report-a-privacy-breach-at-your-organization/report-a-privacy-breach-at-your-business/
It emails you a link to a form (enter your email and name, upload the report, submit).
The report must be in writing and contain (Breach of Security Safeguards Regulations s. 2(1),
https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-64/FullText.html):

1. what happened, and the cause if known;
2. the day, or period, it happened (or roughly);
3. what personal information was involved, as far as known;
4. how many people, or roughly;
5. what you did to reduce the harm;
6. what you have done or will do to tell the people;
7. a name and contact details of the person who can answer the Commissioner's questions (you, `useshinapp@gmail.com`).

New facts later can be sent in (s. 2(2)).

### 3b. The Commission d'accès à l'information du Québec (CAI)

Only if the Quebec test (section 2) is met. Use the CAI's notice form: https://formulaire.cai.gouv.qc.ca/ (linked from
https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/incidents-confidentialite-mesures-securite-entreprises).
In writing, containing (Regulation respecting confidentiality incidents, CQLR c. A-2.1, r. 3.1, s. 3,
https://www.legisquebec.gouv.qc.ca/en/document/rc/A-2.1,%20r.%203.1):

1. the name of the organisation and its Quebec business number if it has one;
2. the contact person for the incident;
3. the personal information involved, or why it is unknown;
4. a short description of the circumstances and cause;
5. the date or period it happened;
6. the date or period you found out;
7. how many people, and how many live in Quebec (or approximate numbers);
8. why you concluded there is a risk of serious injury;
9. how and when you notified the people (or will);
10. what you did or will do to reduce the risk and to prevent a repeat, with dates;
11. whether a regulator outside Quebec (for example the OPC) was told.

Send anything new you learn afterwards "promptly" (s. 4).

### 3c. The affected people

Contents (both laws agree on the substance; PIPEDA regulations s. 3, Quebec regulation s. 5):

1. what happened and the circumstances;
2. when;
3. what information of theirs was involved;
4. what you have done to reduce the risk;
5. what they can do to protect themselves (for Pexi: stop using the old id by deleting and reinstalling the app, cancel and
   re-check any subscription, ignore messages that quote their scans);
6. who to contact for more (`useshinapp@gmail.com`).

How: the notice must be conspicuous and given directly (PIPEDA s. 10.1(5)), by "email or any other form of communication that
a reasonable person would consider appropriate" (PIPEDA regs s. 4). **Pexi holds no email or phone number for its users, so
direct notice is impossible.** In that case the law requires **indirect notice**: "public communication or similar measure
that could reasonably be expected to reach the affected individuals" (PIPEDA regs s. 5(1)(c) and 5(2); Quebec regulation s. 6,
third case, same wording: a public notice when "the body does not have the contact information for the person concerned").
Practical options, **ASSUMED to meet that test, none checked with the regulators**:

- a dated notice at the top of the privacy policy page and the Pexi site;
- the App Store "What's New" text of the next release, and the in-app You screen if a release can carry it;
- an email to everyone who has written to `useshinapp@gmail.com` (they gave an address).

Hold the notice back **only** if giving it would hamper a criminal investigation (P-39.1 s. 3.5, the part about investigations; PIPEDA s. 10.1(3)
"unless otherwise prohibited by law").

### 3d. Others who can help

If you tell the people, also tell any other organisation or government body that could reduce the harm: for example the police
for a theft, Apple or RevenueCat for a payment problem (PIPEDA s. 10.2(1)). In Quebec you may do the same and **must record
that communication** (P-39.1 s. 3.5).

## 4. The incident register

The law requires a record of **every** breach, with enough detail that the Commissioner can check you applied the "real risk of
significant harm" test properly (PIPEDA s. 10.3(1), 10.3(2); Breach of Security Safeguards Regulations s. 6(2); OPC guidance
Part 3). Quebec requires a register of every confidentiality incident, and a copy goes to the CAI **on request**
(P-39.1 s. 3.8). The CAI's list of contents is the longer one (Regulation A-2.1 r. 3.1, s. 7), so the register uses it plus the
OPC's.

**Where:** `~/shin-privacy/incident-register.csv` on the Mac, outside git. Put **no device ids and no names** in it, only counts
and descriptions. Keep a second copy off the Mac (for example email yourself the file after each entry).
**Add a row even when you decide the breach is not reportable.**

| Field | What goes in it |
|---|---|
| `id` | A running number. |
| `occurred` | Date or period it happened (or "unknown, about ..."). |
| `discovered` | Date and time you found out. This is when the PIPEDA clock starts. |
| `what_happened` | Short description of the circumstances and the cause. |
| `information` | What personal information was involved, or why unknown. |
| `people` | How many people, and how many in Quebec (or estimates). |
| `canada_rrosh` | Yes or no, **and the reason**: sensitivity, probability of misuse. |
| `quebec_serious_injury` | Yes or no, **and the reason** (sensitivity, anticipated consequences, likelihood of injurious use), and that you consulted the person in charge. |
| `opc_reported` | Date, or "not required" with the reason. |
| `cai_notified` | Date, or "not required" with the reason. |
| `people_notified` | Dates and how (direct or public notice), or why not. If public, say why direct was not possible. |
| `others_told` | Anyone else you told and what you sent (Quebec requires this record). |
| `steps_taken` | What you did to reduce the harm, with dates. |
| `prevention` | What changes you made so it does not repeat. |
| `closed` | Date, and who wrote the entry. |

**How long to keep each entry:** the federal rule is **24 months** after the day you decided it was a breach
(Breach of Security Safeguards Regulations s. 6(1)); Quebec's is **at least 5 years** after the day you became aware
(Regulation A-2.1 r. 3.1, s. 8). Keep every entry **5 years**, which covers both, and keep it up to date until closed.

## Sources

- PIPEDA: https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html (ss. 10.1, 10.2, 10.3, 28).
- Breach of Security Safeguards Regulations (SOR/2018-64): https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-64/FullText.html (ss. 2 to 6).
- Quebec Act respecting the protection of personal information in the private sector (P-39.1): https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1%20.pdf (ss. 3.1, 3.5 to 3.8).
- Regulation respecting confidentiality incidents (CQLR c. A-2.1, r. 3.1): https://www.legisquebec.gouv.qc.ca/en/document/rc/A-2.1,%20r.%203.1 (ss. 3 to 8).
- OPC guidance: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/privacy-breaches-at-your-business/gd_pb_201810/ ; how to file: https://www.priv.gc.ca/en/report-a-concern/report-a-privacy-breach-at-your-organization/report-a-privacy-breach-at-your-business/
- CAI page for businesses: https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/incidents-confidentialite-mesures-securite-entreprises
- Cloudflare, Dropbox and RevenueCat menu names above are not checked against the live dashboards.
