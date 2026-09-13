# Item 40: the client-side parsing route — does the Karma/Honey posture transfer to Shin?

*Written 2026-09-13 by a research lane, on Aurik's ask to "look into the client side parsing route"
after `research/price-sources/39-canadian-scraping-law.md` reported that Karma and Honey
"avoid centralized server-side scraping liability by executing the extraction client-side on the
consumer's local machine."*

**Every claim below carries a URL and a date. Where the answer is unknown, it says unknown rather
than guessing. This is not legal advice, and nothing here reopens the killed scraping row in
`QUEUE.md` — that row is referenced, not re-litigated.**

---

## The answer in three lines

1. **The analogy does not hold, and it fails on a fact about the product rather than a point of
   law.** Karma and Honey read a DOM the user's own browser already fetched, on a page the user
   chose to open, with a real gesture behind it. Shin's user is standing in an aisle, on no page at
   all, wanting prices from retailers they are not visiting.
2. **"Client-side" for Shin would mean the app fetching other retailers' pages from the user's
   device with no user gesture.** That is automation with a residential IP, not the Karma posture.
   Under `Century 21` an automated agent is the agent of the party who commands it, so the
   contracting party is still Shin, and the residential IP changes the blocking behaviour, not the
   contract.
3. **Store policy kills it before the law gets a turn.** Apple 5.2.2 requires that you be
   "specifically permitted" by a third-party service's terms to display its content, and every
   Canadian retailer's terms in file 39 expressly forbid exactly this. Google Play's Spam policy
   names an app that wraps a shopping site it does not own as its own worked example of a violation.

---

## 1. What Karma, Honey and similar actually do

### 1.1 Karma (formerly Shoptagr)

**Shape: a browser extension, plus a mobile app that is itself a browser.** The extension is
distributed on the Chrome Web Store
(https://chromewebstore.google.com/detail/karma-online-shopping-but/emalgedpdlghbkikiaeocoblajamonoh,
read 2026-09-13), on AMO
(https://addons.mozilla.org/en-US/firefox/addon/karma-shopping-assistance/), and as a Safari
extension on the Mac App Store (https://apps.apple.com/us/app/karma-new-browser-extension/id6499579047).
The mobile product is a separate iOS app (https://apps.apple.com/us/app/karma-play-earn-shop-repeat/id1086670571).

**What Karma says it reads, verbatim, from its own Chrome Web Store listing (read 2026-09-13):**

> "Karma accesses the current page's URL only to identify supported merchants and enable shopping
> features such as cashback, coupons, price comparison, and item saving."

The listing's own data-practice disclosure declares collection of personally identifiable
information, location, and **website content**, alongside the statement "We do not collect browsing
history."

**Karma's privacy notice** (https://www.karmanow.com/privacy, effective September 2026) is broader
than the store listing and, read against it, the two are in tension. It states Karma collects
"browsing history and any information regarding your viewing and purchase history on our Services"
and "web pages visited, clicked stream data and information about the content you viewed," and that
"in case you are a user of our browser extensions we may collect data regarding web browsing data."

**The load-bearing question — does the extension fetch OTHER retailers' pages in the background? —
is UNKNOWN from Karma's own documents.** Neither the privacy notice nor the store listing describes
the mechanism by which a competing store's price is obtained. File 39's Gemini output asserts
"Client-Side DOM Parsing & Affiliate APIs … the user's own browser session extracts price points
directly from the DOM," but that is model output with no citation behind it, and the repo's standard
is that a claim carries a source somebody checked. **Mark it unverified.**

What IS verifiable is the posture of the *reading* half: "the current page's URL" is the page the
user opened. The *comparison* half is separately attributed by Karma itself to "affiliate network
API integrations" in the same breath — and an affiliate API is a licensed feed, not scraping. The
Karma mobile app resolves the gesture question in Karma's favour even more plainly: it ships a
built-in browser, marketed as letting you "browse and shop at [50,000 retailers] directly within the
app" (https://www.karmanow.com/, read 2026-09-13). That is still a page the user navigated to.

### 1.2 Honey (PayPal)

**Shape: a browser extension** (https://chromewebstore.google.com/detail/honey-automatic-price-che/ameiecilbnfgicanmpkhblmmjpledpii)
plus a mobile app. Honey's own privacy statement was **not retrievable** at
https://www.joinhoney.com/privacy on 2026-09-13 (the fetch returned a shell with no policy text), so
**no verbatim first-party quotation is available in this file.** That is a gap, not a finding.

**What commentators say, clearly labelled as commentary, not as Honey's own statement:** reviews
describe Honey as searching "more than 30,000 retail sites to find the lowest prices" and
maintaining Amazon price history over 30/60/90/120-day windows via its Droplist feature
(https://www.moneycrashers.com/honey-browser-extension-review/;
https://www.thewaystowealth.com/honey-review/, both read 2026-09-13).

**That description, if accurate, contradicts file 39's characterisation of Honey.** A 30,000-site
price index with 120 days of history is a *server-side corpus*. A browser extension's content script
cannot build price history for items the user never visited, and it cannot cover 30,000 sites from
one user's session. The client-side content script is the *display surface and the coupon-applier*;
the index behind it is Honey's own infrastructure plus merchant/affiliate arrangements. File 39's
row — "Extracts coupon codes and prices via consumer browser sessions" — describes half the system
and calls it the whole. **Treat file 39's Karma/Honey row as unverified and, for Honey, as likely
incomplete.**

### 1.3 The 2025 Honey controversy — what it was actually about

It was **affiliate-commission attribution, not scraping.** In December 2024 the YouTube channel
MegaLag published an investigation alleging that when a user clicked Honey's "apply coupon" button,
Honey replaced the last-click affiliate cookie with its own, so the commission that would have gone
to the creator who referred the sale went to Honey instead
(https://www.classlawgroup.com/honey-browser-extension-scam-lawsuit;
https://techcrunch.com/2025/01/05/youtuber-legaleagle-sues-paypal-over-sleeping-leech-honey-extension,
2025-01-05). LegalEagle's Devin Stone filed a class action within about a week; the consolidated
matter is *In re PayPal Honey Browser Extension Litigation*
(https://www.cohenmilstein.com/case-study/in-re-paypal-honey-browser-extension-litigation/). Claims
pleaded across the actions include wiretapping, unfair competition, tortious interference and unjust
enrichment.

**The regulatory consequence landed on extensions, and it is the one that matters for shape (c)
below.** Google amended Chrome Web Store program policy on affiliate ads in March 2025, enforcing
from **10 June 2025**
(https://developer.chrome.com/blog/cws-policy-update-affiliate-ads-2025;
https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads). The rule is that an
extension must not add, modify or replace affiliate links unless the program is disclosed on the
listing and in the UI before install, a user action triggers it, and the link is tied to a benefit
delivered to the user *at that moment*.

**Do not carry this into the scraping analysis.** No part of the Honey litigation turns on reading
retailer DOMs. It is cited here so the repo does not later mistake a commission dispute for a
scraping precedent.

---

## 2. Does the liability position transfer? Three shapes, analysed separately

The governing Canadian frame is `research/price-sources/39-canadian-scraping-law.md` §5 and §12 and
`research/price-sources/37-google-lens-legal-position.md`. Both rest partly on unverified Gemini
output; the `Century 21` holdings below are quoted from file 39 and carry its caveat — they are
**leads pending a CanLII read**, and the spot-check list at the top of file 39 has not been worked.

The two hinges are:

- **Agency.** Per file 39's quotation of *Century 21 Canada LP v Rogers Communications Inc*, 2011
  BCSC 1196 at paras 129–135: *"The defendant cannot avoid the consequences of the contract by
  utilizing automated software to bypass the visual notice given to human users. The software
  operates as the agent of the person who commands it."*
- **Notice.** Browse-wrap binds only on reasonable notice before or at the time of access (file 39,
  quoting paras 108–117); the operative remedy in `Century 21` was a **permanent injunction**, with
  contract damages of $1,000 and $32,000 in statutory copyright damages for photographs.

### Shape (a) — extraction from a page the USER deliberately opened (the Karma posture)

| Question | Answer |
| --- | --- |
| Who is the contracting party under the browse-wrap? | **The user.** They navigated, they were shown the footer link, they are the party with notice. |
| Does `Century 21` reach the publisher? | **Not directly.** There is no automated agent commanded by the publisher; the fetch was a human act. |
| Authorization / inducement of breach? | **The live theory, and it is a real one.** Retailer terms forbid commercial use and automated extraction; an extension that tells the user's browser to harvest and transmit the page is at least arguably procuring the user's breach. But the retailer must first show the *user* breached, and a human reading a page they were served is the hardest breach to make out. |
| s.41.1 TPM engagement? | **Essentially none.** No bot wall fires: the request is an ordinary human page load with the user's own cookies and session. |

This is the shape that actually earns the "avoids centralized server-side scraping liability"
sentence — and it earns it because **a human did the fetching**, not because the parsing happened on
a laptop. The location of the parser is not the legally operative fact. **The gesture is.**

### Shape (b) — the app silently fetching retailer pages in a hidden WebView on the user's device

| Question | Answer |
| --- | --- |
| Who is the contracting party? | **Shin.** The user did not navigate anywhere; Shin's code decided which URLs to fetch, when, and why. Under the `Century 21` agency line the software "operates as the agent of the person who commands it," and the commander is the publisher. |
| Does `Century 21` reach Shin? | **Yes — this is squarely the `Century 21` fact pattern**, with the sole difference that the packets leave a phone instead of a server. Nothing in the quoted reasoning turns on where the crawler runs. |
| Inducement of user breach? | **Worse than that: the user is not the breaching party at all.** The app is. Shifting execution to the device does not move the contractual actor; it only moves the IP address. |
| s.41.1? | **Engaged the moment bot detection is worked around.** File 39 puts "circumventing CAPTCHAs, bot blocks or TPMs" in the **DO NOT ATTEMPT** band (Copyright Act ss. 2.4(1.1), 38.1, 41.1). And this is not hypothetical for Shin: `DEFECTS.md` D-049 records walmart.ca's PerimeterX issuing 7,535-byte challenge pages to Aurik's residential address and holding the lockout past thirteen hours. Any design that makes the phone get past that is in the prohibited band, not the contract band. |

**Say the quiet part: (b) still automates.** It is server-side scraping wearing a residential IP.
The only thing "client-side" buys is a better IP reputation score — and IP reputation is one signal
among many. PerimeterX/HUMAN combines TLS (JA3) and HTTP/2 fingerprinting, injected-JS behavioural
timing, and navigator-property checks; plain HTTP clients "never execute these scripts, which makes
their requests look incomplete"
(https://www.trickster.dev/post/how-does-perimeterx-bot-defender-work/;
https://scrapfly.io/blog/posts/how-to-bypass-perimeterx-human-anti-scraping, read 2026-09-13). This
matters concretely for a Capacitor app: `CapacitorHttp` patches `fetch`/`XHR` to native
URLSession/HttpURLConnection to bypass CORS (https://capacitorjs.com/docs/apis/http, read
2026-09-13) — which means **the easy implementation is a headless native HTTP client with no JS
engine and its own user agent, the single most detectable shape there is.** The alternative, a real
hidden WebView, executes the JS and looks more human but costs the full page load (see §5).

**The residential IP does not fix the contract. It only changes who gets blocked (see §3).**

### Shape (c) — a browser extension Shin ships as a second product

| Question | Answer |
| --- | --- |
| Contracting party | **The user**, as in (a), provided the extension only reads pages the user opened. |
| `Century 21` | Does not reach Shin on a pure read-what-is-open design. |
| Inducement | Same residual theory as (a). |
| s.41.1 | Not engaged; no wall fires. |
| **But:** | It solves the wrong problem. An extension helps a person shopping **online, at a desk**. Shin exists for a person holding a cart in an aisle. |

If Shin ever ships an extension, the Chrome Web Store affiliate-ads policy above is a hard
constraint on monetisation: affiliate links need pre-install disclosure, a user action, and a
same-moment user benefit. Shin has no affiliate relationships today, so this is a note for later,
not a blocker now.

---

## 3. The consequence nobody wants to say out loud

**Under (b), when bot detection fires, it is the SHOPPER's IP that gets blocked, and the shopper did
nothing except photograph a jar of peanut butter.**

D-049 is the measurement: address-level, for `/en/ip/`, surviving a thirteen-hour idle. Transposed
to a shipped app, the failure looks like this — a Shin user takes four photos in a Loblaws, Shin's
hidden WebView quietly hits walmart.ca eleven times, and that evening the user cannot open
walmart.ca on their own phone to check something for themselves. They will not attribute it to Shin.
They will think Walmart is broken, or that their phone is.

Three consequences, ranked:

- **Product.** Shin will have degraded a service the user relies on, invisibly, as a side effect of
  a feature they did not ask for. On carrier-grade NAT — normal on Canadian mobile networks — the
  block can reach **other subscribers sharing the egress address**, which extends the harm to people
  who never installed Shin.
- **Reputational.** This is a one-tweet story with a screenshot, and it is the exact story Honey's
  critics told: an extension doing something in the background that the user did not know about and
  would not have consented to. Shin would be handing a hostile reviewer the same frame.
- **Legal, and this is the part that is not merely embarrassing.** Making the app quieter to avoid
  the block is TPM circumvention and lands in file 39's DO NOT ATTEMPT band. And Google Play's
  Device and Network Abuse policy forbids apps that "interfere with, disrupt, damage, or access in
  an unauthorized manner the user's device, other devices or computers, servers, networks,
  [APIs], or services" (https://support.google.com/googleplay/android-developer/answer/9888379, read
  2026-09-13). Getting a user's address blocked from a major retailer is, on its face, the thing
  that policy describes.

There is no consent form that makes this acceptable, because the harm partly lands on third parties
who never saw the form.

---

## 4. Store policy — and this is the real blocker

### Apple, App Review Guidelines (https://developer.apple.com/app-store/review/guidelines/, read 2026-09-13)

**5.2.2 Third-Party Sites/Services — the operative rule, verbatim:**

> "If your app uses, accesses, monetizes access to, or displays content from a third-party service,
> ensure that you are specifically permitted to do so under the service's terms of use.
> Authorization must be provided upon request."

**Read that last sentence against file 39 §11.** Loblaws' terms forbid use of "any robot, spider,
scraper, deep link or other automated data gathering or extraction tool … without Loblaw's express
written consent." Walmart Canada's forbid "any robot, spider, crawler, scraper, or other automated
means or interface not provided by us to access the Services or to extract data" and separately
"Use the Services for any commercial purpose." Best Buy's forbid automated access "without the prior
express written permission of Best Buy." **Apple can demand the authorization, and there is none to
provide.** Shape (b) fails 5.2.2 on the face of the retailers' own terms — before any Canadian court
is asked anything.

**5.2.1**, verbatim: *"Don't use protected third-party material such as trademarks, copyrighted
works, or patented ideas in your app without permission…"* Rendering a retailer's page inside Shin
displays their trade dress and logos; file 39 already flags retailer logos as passing-off exposure
under Trademarks Act s.7(b).

**4.2 Minimum Functionality**, verbatim: *"Your app should include features, content, and UI that
elevate it beyond a repackaged website."* **4.2.2:** *"Other than catalogs, apps shouldn't primarily
be marketing materials, advertisements, web clippings, content aggregators, or a collection of
links."* Shin's camera-and-verdict core is genuinely app-like, so 4.2 is survivable — **it is 5.2.2
that does not bend.**

**4.7** (mini apps, plug-ins, HTML5/JS payloads) is often cited in WebView discussions but is
**not** the operative rule here: it governs software you *offer* inside your app. Shin would not be
offering third-party software; it would be fetching third-party content. Cite 5.2.2, not 4.7.

### Google Play

**Spam policy — "Webviews and Affiliate Spam"**
(https://support.google.com/googleplay/android-developer/answer/9899034, read 2026-09-13), verbatim
prohibitions:

> "An app whose primary purpose is to drive referral traffic to a website to receive credit for user
> sign-ups or purchases on that website."

> "Apps whose primary purpose is to provide a webview of a website without permission."

Google's own worked example in that policy is an app called **"Ted's Shopping Deals" that wraps
Google Shopping** — a shopping-comparison wrapper, which is close enough to shape (b) that it should
be read as on point rather than as an analogy.

**Device and Network Abuse** (https://support.google.com/googleplay/android-developer/answer/9888379,
read 2026-09-13): prohibits apps that "interfere with, disrupt, damage, or access in an unauthorized
manner … servers, networks, [APIs], or services," and apps "that access or use a service or API in a
manner that violates its terms of service." **That second clause converts a retailer's browse-wrap
into a Play policy violation directly** — Play does not require the retailer to sue; it requires
only that the terms say no.

**WebView JavaScript-interface guidance**
(https://support.google.com/googleplay/android-developer/answer/10768383, read 2026-09-13):
"Ensure that only strictly scoped URLs and content owned by the app developer is loaded into the
WebView." Injecting an extraction script into a retailer's page is the inverse of that instruction.

**A caveat on shape, honestly stated.** Shin already loads its own web app in a Capacitor WebView,
and that is fine — a wrapper around *your own* content is a normal, approved pattern on both stores.
The violations above are all triggered by loading and parsing **someone else's** site.

**What is UNKNOWN:** whether either store has actually rejected a price-comparison app for this. No
first-party rejection record was found; the developer-forum threads surfaced by search are
third-party anecdote and are not relied on here.

---

## 5. Does it even work, in a store, on a phone?

`docs/the-photo-path.md` sets the budget: `BUDGET_MS.photo` moves to **7,000 ms** inside a
`CALL_CAP_MS` of 8,000, with extract ≤ 3,500 ms and pick ≤ 3,000 ms already spending nearly all of
it. **The identity pipeline consumes the budget before a single price is fetched.** Anything in this
section is additive to 6,500 ms of vision calls.

Against that, one retailer page:

- **Median mobile home page in 2025: 2.56 MB, of which 697 KB is JavaScript**
  (Web Almanac 2025, Page Weight, https://almanac.httparchive.org/en/2025/page-weight). A retailer
  product page behind a bot wall is at the heavy end, not the median. A WebView must download,
  parse, execute and settle before the price node exists in the DOM.
- **Multiply by "several other retailers," in parallel, over LTE in a concrete-and-steel grocery
  store** — the worst RF environment a shopper stands in.
- **Cold start.** A WebView instance is created, a JS engine warms, TLS is negotiated per origin,
  and none of it is amortised because the app killed the WebView after the last scan (and must, for
  memory).
- **Then the bot wall.** D-049's measured outcome for walmart.ca from a residential address is a
  challenge page, not a product page. The challenge response was 7,535 bytes in 565 ms — **fast, and
  worthless.** The fast path here returns nothing.
- **Data.** At ~2.5 MB per retailer page and, say, three retailers per scan, a shopper doing twenty
  scans on a grocery run spends **roughly 150 MB** on one trip. That is a material fraction of a
  Canadian entry-level plan, spent invisibly, for prices that mostly did not arrive.
- **Battery.** Repeated WebView cold starts plus JS execution plus sustained LTE radio is among the
  most expensive things an app can do per unit of useful output.

**Realistic assessment: it does not fit the budget, and the budget is not the binding constraint —
the bot wall is.** Even granting infinite time, the measured answer from D-049 is a challenge page.
A route whose best case is "slow" and whose measured case is "blocked" does not need a stopwatch to
be decided. **Note also that this is the same acceptance test the `QUEUE.md` closed register already
ran and failed on 2026-09-03** (0 prices from 4 attempts; Loblaws, Best Buy Canada and Metro all
403). Moving the fetch to the phone is **a new argument that it ought to work**, which that row's
reopen condition explicitly excludes. It is not a recorded fetch of a retailer serving prices.

---

## 6. What it would compete with

`docs/the-beta-build-plan.md` item 15, "One shopper saw this," is already specified:

> "a. Verdict rule: one typed price with no other source shows 'one shopper saw $X at store, date',
> never a tier.
> b. Corroboration: a typed price counts toward a tier only when a second device or a crawled source
> agrees within a band.
> c. Per-device typed-price rate limit; a reporter reliability score that starts at zero and rises
> with corroborated reports.
> d. Test: a single report never yields a tier."

Item 16 pairs it with a seed: "the 200 items per store the six of you actually buy," gathered by "an
afternoon walk with the app typing prices, which is the beta itself."

**Which reaches a trustworthy second price faster for a Canadian grocery shopper?**

| | Client-side fetch (b) | Typed price (item 15) |
| --- | --- | --- |
| Availability for **grocery** | Grocery is the worst case: Loblaws and Metro both 403'd on 2026-09-03, Walmart challenges the address (D-049). | Works in any store, including the ones with no feed and no API. |
| Latency to a second price | Unbounded, and usually never, because the wall answers first. | Instant for a seeded item; zero for an unseeded one until somebody walks it. |
| Trust model | A number scraped from a page nobody is allowed to scrape. | Rate-limited, reliability-scored, and **structurally honest**: one report is shown as one report and never dressed as a tier. |
| Cost to the user | Their data, their battery, their IP's reputation. | Ten seconds of typing, once. |
| Cold-start problem | None in principle — but the cold start never ends, because the block is permanent. | Real and acknowledged: item 16 is exactly the answer, an afternoon's walk per store. |
| Store and contract exposure | Apple 5.2.2, Play Spam + Device and Network Abuse, retailer browse-wrap, s.41.1 if the wall is worked around. | None. A person reading a shelf tag and typing it is file 39's band 4, "Clearly Lawful." |

**Item 15 wins on grocery, which is the category Shin's shopper is standing in.** Its weakness is
the cold start, and that weakness is *not* cured by (b), because (b) is at its weakest in exactly the
same category. The honest comparison is: item 15 is slow to warm up and then works; (b) never warms
up at all for grocery.

The one thing (b) could in principle add is **breadth** — a long tail of items no tester has walked.
That is a real gap. It is also the gap that a licensed feed or an official API fills without any of
this, which is where `QUEUE.md` rows 1.4 and 1.4b already point.

---

## 7. Recommendation, with its falsifier

**Plain answer: this does not fit Shin. Recommend `killed` for shape (b), `parked` for shape (c),
and note that shape (a) is not available to Shin at all because Shin's user is not on a page.**

Proposed closed-register row, in `QUEUE.md` style — **for the boss to write or discard; this lane
did not touch `QUEUE.md`:**

| Item | State | Acceptance test it would be held to | Falsifier that fires | Reopens on (new observation only) |
| --- | --- | --- | --- | --- |
| **Client-side retailer fetching (hidden WebView on the shopper's device)** | proposed `killed` | Return a second retailer's price for a scanned grocery item, from the user's device, inside the 7,000 ms photo budget, without triggering bot detection and without violating a store guideline. | Fails at three independent points, any one of which is fatal. **(i) Store policy:** Apple 5.2.2 requires authorization "under the service's terms of use," and Loblaws, Walmart Canada and Best Buy Canada all forbid automated extraction in terms (file 39 §11); Play's Spam policy forbids "apps whose primary purpose is to provide a webview of a website without permission" and uses a shopping-comparison wrapper as its example. **(ii) Measurement:** D-049 — walmart.ca challenges Aurik's residential address and holds the block past thirteen hours; the 2026-09-03 pilot got 0 prices from 4 retailers. **(iii) Contract:** `Century 21` makes the automated agent the agent of the party commanding it, so moving execution to the phone does not move the contracting party off Shin. | **All three, together, and each with new evidence.** (1) A named retailer either serving prices to an unauthenticated request or granting written permission — which is the existing scraping row's reopen condition, unchanged, and a residential IP is not new evidence of it. (2) A store-side data point: a shipped, approved app that renders or extracts a third-party retailer's page, identified by name, or written guidance from Apple or Google that it is permitted. (3) A measured fetch from a real device inside the budget. **A design argument reopens nothing.** |

**What would have to be true for it to fit — stated plainly, because the ask deserves it:**

1. **A gesture would have to exist.** If Shin's UI made the shopper *deliberately open* a retailer's
   page — tap "check Walmart," see the real page load in a visible in-app browser, with the
   retailer's own session and cookies — then Shin is in shape (a) and much of this analysis inverts.
   That is what Karma's mobile app actually is. It costs the seven-second budget entirely and turns
   Shin from a verdict into a browser, which is a different product; but it is legally and
   policy-wise a far better position, and it is the honest version of "do what Karma does."
2. **Or the retailer would have to say yes.** Written permission answers Apple 5.2.2, Play's "without
   permission," and the browse-wrap simultaneously. Canadian Tire's developer portal
   (`research/price-sources/28-canadian-tire-developer-portal.md`) is the shape of that yes.
3. **Or the bot wall would have to not be there** — a retailer that serves product pages to
   unauthenticated requests. That is the existing row's reopen condition and nothing here changes it.

**None of those is a "client-side parsing" finding.** (1) is a product redesign, (2) is a licensing
deal, (3) is the row that is already killed. The client-side idea contributes nothing of its own to
any of the three, which is the cleanest statement of why it should not be built.

---

## 8. What this lane could NOT verify

- **Honey's own privacy statement and help documentation.** https://www.joinhoney.com/privacy
  returned no policy text on 2026-09-13. Everything in §1.2 about Honey's mechanism is either
  third-party commentary (labelled) or unknown. **No first-party Honey quotation appears in this
  file.**
- **Whether Karma's extension fetches other retailers' pages in the background.** Not stated in
  Karma's privacy notice or store listing. File 39's assertion that it does client-side DOM parsing
  for comparison is uncited Gemini output and is marked unverified here, not adopted.
- **The `Century 21` quotations.** Taken from file 39, which is itself unverified Gemini Deep
  Research output and carries its own spot-check list. **Nobody has opened 2011 BCSC 1196 on
  CanLII.** Paragraph pin cites (108–117, 129–135, 404–405) are leads.
- **Any first-party store rejection.** No Apple or Google decision record was found rejecting a
  price-comparison app on 5.2.2 or on the webview-spam rule. The guideline text is first-party and
  verbatim; its application to an app like Shin is inference.
- **Play's Spam policy page** was read via a fetch that returned a summary with two verbatim
  prohibitions and a paraphrase of the "Ted's Shopping Deals" example. The two quoted sentences are
  reliable; **the example's exact wording is paraphrase and should be re-read before it is quoted
  anywhere as Google's words.**
- **Real latency numbers.** No retailer page was fetched, from any device — the lane contract
  forbade it, and D-049 makes it a bad idea regardless. §5 reasons from the Web Almanac median and
  from D-049's recorded behaviour; it contains **no measurement taken by this lane.**
- **Carrier-grade NAT blast radius.** The claim in §3 that a block can reach other subscribers on a
  shared mobile egress address is a reasoned inference from how CGNAT and IP-level blocking work,
  **not a measured or sourced observation.**
