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

NOT READ. The Chrome profile is signed out of App Store Connect (login page, authResult FAILED). Jamin must sign in (password and 2FA are his); then a read-only pass covers App Information, Pricing and Availability, App Privacy, Age Rating, build 13, TestFlight, version page fields, subscriptions status, Agreements/Tax/Banking, App Review messages.

| Console | Page | What is missing | Blocks production | Who |
|---|---|---|---|---|
| App Store Connect | all | Not readable until signed in | Unknown | Jamin signs in |
