DRAFT ONLY. Not submitted to the App Store or Play Store. The founder reviews, finalizes, and
submits (plan item 42). The name "Shin" below is not a placeholder: RULINGS.md ("Shin name: risk
carried knowingly," 2026-09-22) has the store listing going out under "Shin," risk carried
knowingly rather than cleared -- the app id is `com.useshinapp.shin`. This is not the same as
cleared; see that ruling before any wider public use (a handle, a posted video) beyond the store
listing itself.

## Age rating

**Recommended starting point: 4+ (Apple) / Everyone (Google Play).** The app photographs and
identifies grocery and retail products; it has no user-generated content shown to other users,
no chat, no in-app purchases in the beta, and no material meant for adults. Camera and coarse
location permissions are used, which some raters flag for a slightly higher default; if either
store's automated questionnaire pushes it to a higher tier because of camera/location use, take
that result rather than argue it down, since the questionnaire is the actual determination, not
this draft's guess.

## Target API level

**Android: target the latest API level Google Play currently requires for new app submissions
at the time of upload**, not a number fixed today, because Play's minimum required target level
moves roughly yearly and a number written into this draft in September would likely be stale by
the time of submission. The Wrapper lane should read Google Play's current requirement at build
time and confirm it here before submission, not trust this file.

**iOS: build with the Xcode/SDK version current at build time**, same reasoning; Apple ties this
to the Xcode version used, not a standalone number to pre-select.

## Listing text (draft copy, to be swapped once the name clears)

**Short description (Play, 80 characters):**
"Point your phone at a price. Know if it's fair before you buy it."

**Subtitle (Apple, 30 characters):**
"Know a price before you pay"

**Full description:**

Scan a barcode or take a photo of anything on a shelf and get an instant read: is this price
good, fair, or high, compared to what else is out there. No searching, no guessing, no waiting
in the aisle wondering if you're being overcharged.

- Scan barcodes or photograph products directly.
- Get a straight verdict, not a maze of listings to compare yourself.
- See what real shoppers nearby have seen for this exact item.
- Your location stays off until you turn it on, and it's only ever a rough area, never your
  exact spot; you choose what to share, and you can change your mind any time.

This is a beta. Expect rough edges, and tell us what's wrong when you find it.

**What NOT to say, and why:** no dollar-savings claim ("saves you $X a year" or similar) appears
anywhere above, and none should be added before a real measurement exists, per hard rule 2. No
claim that the app is faster or cheaper than a named competitor without a source. The aggressive
language stays pointed at the price and the shelf, never at the shopper's own choices or a
named store by name unless a specific, sourced comparison is being made.

## Screenshots

Two phone sizes required by both stores' current guidelines (a standard/large iPhone size and a
6.5 to 6.7 inch class Android device, or whatever each store's submission form currently
specifies at upload time; check at submission, since required sizes have changed store-side
before). Content: the scan-in-progress camera view, a verdict screen showing good/fair/high, the
consent screen from `notes/consent-screen-wording-2026-09-11.md`, and the You screen. Do not
mock up a screenshot with fabricated prices or a fabricated verdict; use a real scan from a real
test session, per hard rule 3 (no fabricated evidence) applied here even though these are
screenshots rather than records.
