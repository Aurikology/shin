# Store consoles: launch readiness (read-only check, 2026-11-26)

Method: live read of the consoles through Chrome, nothing clicked that changes state.
Status: Google Play read in full except where marked UNREAD. App Store Connect: see the section at the bottom.

## Google Play Console (personal developer account, com.getpexi.app)

| Console | Page | What is missing or incomplete | Blocks production | Who |
|---|---|---|---|---|
| Play | Test and release > Closed testing (track "Alpha") | Track is Inactive. No countries selected, no testers selected, no release created. Dashboard: "0 testers currently opted in". | YES | Console click by Jamin (needs his yes) plus 12 real testers |
| Play | Dashboard > Production | "Apply for access to production" is disabled until a closed test runs with at least 12 opted-in testers for at least 14 days. Production status: Inactive. | YES | Time (14 days) after testers opt in |
| Play | Publishing overview | "Submit 8 changes for review" not yet sent: store listing, content rating, target audience, privacy policy, ads, data safety, health apps, app category. Update status: "Not yet sent for review". | YES | Console click by Jamin (needs his yes) |
| Play | App content | All 10 declarations show "Ready to send for review" (data safety, content ratings, health, financial features, government apps, advertising ID, target audience, ads, sign-in details, privacy policy), last edited 24 Nov. "Need attention" tab is empty. Nothing missing, but none is approved until sent. | No (needs sending) | Included in the 8-change submit |
| Play | Store listing (default, en-US) | Filled: name, short and full description, icon, feature graphic, 4 phone screenshots. Warning on short description: "may not be promoted" because it uses a price or promotion keyword. Only English (US) exists; French not added (publishing overview offers "Add language"). | Warning no; French not a blocker | Short description edit needs Jamin's yes. French is an asset/text task |
| Play | Monetise > Subscriptions | pexi_plus_monthly and pexi_plus_yearly each have 1 active base plan, 175 countries. Monthly: CAD 3.99, USD 2.79. Yearly: CAD 29.99, USD 20.99 (US has 7 location overrides). Nothing missing seen. Subscriptions only sell once a build with billing is on a track. | No | none |
| Play | Payments profile / merchant account | UNREAD (direct URL redirected home). Needed to charge subscriptions. | Likely YES for paid subs | Jamin checks, no bank details opened |
| Play | Inbox / policy messages | UNREAD (direct URL redirected home). Account home shows 0 policy tasks. | Unknown | Read-only recheck |
| Play | Internal testing track | Release 2 (1.0.0) live to internal testers since 25 Nov 16:10, shown "Not reviewed". Fine for testing only. | No | none |
| Play | Production track and countries | Production inactive, no countries chosen. Closed track also has no countries. | YES | Console click by Jamin (needs his yes), after production access is granted |

## App Store Connect

Read live 2026-11-26 after Jamin signed in. App id 6821190920, iOS version 1.0, status "Prepare for Submission" (never submitted).

| Console | Page | What is missing | Blocks production | Who |
|---|---|---|---|---|
| ASC | iOS version 1.0 > Build | No build attached to the version ("Add Build"). Builds 8 to 13 exist in TestFlight, build 13 is processed and "Ready to Submit" (so export compliance is answered), expires in 90 days. | YES | Console click by Jamin (needs his yes): attach build 13 |
| ASC | iOS version 1.0 > App Review Information | "Sign-in required" is unticked; the app has accounts, so review may need a demo login or a note. Contact fields filled. Notes filled (2,361 characters). | Probably no, review risk | Jamin decides |
| ASC | iOS version 1.0 > Product Page | Filled: promo text, description (1,931), keywords, support URL, copyright, version string, iPhone screenshots present (Dynamic Island set seen). Marketing URL empty (optional). Only English (Canada) seen. | No | none |
| ASC | Version page banners | China mainland Security Assessment and AIGC declaration notices (apply only if distributing in China mainland). New Age Rating questions to review (location sharing, dating). | Age rating review: probably YES (Apple asks for updated answers) | Console click by Jamin (needs his yes) |
| ASC | TestFlight | Internal group "Family and team", 2 testers; build 13 has 1 install. No external groups exist. | No (Apple has no tester minimum for release) | none |
| ASC | Pricing and Availability | Base country United States (USD). Availability: 1 country only, Canada ("Available on App Release"). United States is "Not Available", plus 173 others. | YES for the US | Console click by Jamin (needs his yes): add United States |
| ASC | Subscriptions (group "Pexi Plus") | pexi_plus_monthly (level 3) and pexi_plus_yearly (level 4) both "Prepare for Submission" (not Missing Metadata), never submitted. Localization only English (Canada). Monthly detail page has a Review Information block with a screenshot field (could not confirm filled). Prices CA/US not read. Subscriptions must be submitted together with the app version. | YES (attach to the version submission) | Console click by Jamin (needs his yes) |
| ASC | App Privacy | Published 21 days ago by Jamin. 8 data types declared. Privacy policy URL set. Check it still matches the shipping build. | No | none |
| ASC | App Information / age rating | Age rating set: 4+ (172 countries, regional exceptions). Banner says new age-rating questions (location sharing, dating) need review. Category chosen. App Encryption Documentation section present. | Age-rating questions probably YES | Console click by Jamin (needs his yes) |
| ASC | App Compliance (new page) | China mainland Security Assessment and AIGC declaration: only needed if selling in China mainland (not in scope for CA/US). | No | none |
| ASC | Agreements, Tax, Banking | Free Apps Agreement Active. Paid Apps Agreement Active (Oct 27, 2026 to Oct 4, 2027). Bank account Active. Tax forms Active (Canada GST/HST 506, W-8BEN, certificate of foreign status). Digital Services Act compliance Active. Nothing opened beyond status words. | No | none |
| ASC | App Review / Resolution Center | No submissions yet ("Items you submit to App Review will appear here"). No messages. | No | none |
| ASC | Localizations | Product page and subscriptions are English (Canada) only. No English (U.S.) or French (Canada) localization. | No for launch | Asset/text task |
