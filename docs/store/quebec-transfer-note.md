# Pexi: personal information sent outside Quebec

A short assessment for Quebec's privacy law (Law 25), which asks for one before personal information
leaves the province. Drafted 2026-11-06 for Jamin's App Store list, item 11. **Draft, not legal
advice. Jamin Xu, as the person in charge of personal information, has to read and own it; the legal
review should confirm it covers what the law requires.**

**Scope.** Pexi 1.0 for iPhone, Canada only.

| Who receives it | What they receive | Is it personal information? | Where (confirm each) | Why it is needed | Safeguard |
|---|---|---|---|---|---|
| Pexi's own server (Jamin's Mac) | Device id, what is scanned or typed, usage events, IP address, rough 1 km area if on | Yes | Ontario, Canada (Vaughan or Hamilton; Jamin, 2026-11-07) | Runs the app | HTTPS through Cloudflare; retention in `app/src/retention.ts` |
| Cloudflare | Every request in transit, IP address | Yes | Global network | Carries traffic to the server | Encrypted in transit; Cloudflare's own terms |
| Anthropic (Claude) | Product name, brand, size, category, country. Typed words when a typed name is not recognised. No device id, image or location | Normally no. Typed words could contain something personal if a person types it | United States | A typical price when Pexi has none | Only with the shopper's yes on the first screen; changeable on the You screen; "no" still answers with a broad guess |
| RevenueCat | Device id, purchase status | Yes, if subscribed | United States | Subscriptions | Only for Pexi Plus; called by the app |
| Apple | Downloads and purchases, under Apple's own relationship with the shopper | Yes | Global | App Store and payment | Pexi receives no card or Apple ID details |
| Open Food Facts | A barcode number | No | European Union | Product name on a catalogue miss | Nothing about the shopper is sent |
| OpenStreetMap Overpass | The centre of a 1 km square, if location is on | Coarse, not tied to a device | European Union | Nearby shops | Off by default; no device id |

**Assessment.** The sensitive part is small: there is no name, email or payment detail, and exact
position is refused by the server and the database. The main exposure is the Mac and Cloudflare,
which hold the device id alongside what a person scanned. The one flow to a model is opt-in and
carries product facts, not facts about the person. Typed words are the one way something personal
could reach Anthropic, and only if a shopper types it and said yes.

**Open for Jamin, because this note cannot answer them:**

1. ANSWERED 2026-11-07, Jamin: *"the mac is in vaughan ontario or hamilton ontario"*. Both are in
   Ontario, so the policy's "outside Quebec" is true of the server, and the data stays in Canada.
2. Whether the contracts with Anthropic, Cloudflare and RevenueCat give the protection the law expects
   (the note assumes their standard terms; nobody here has read them for this purpose).
3. How long the Mac's nightly backups and the server's stdout log keep data. The policy says backups
   "can hold a copy for longer until they are replaced"; a stated period would be better.
   PARTLY ANSWERED 2026-11-07 (Mac job pexi-backups, reported, not checked from the PC): nightly
   backups keep 14 nights, and the 4 GB product catalogue (no personal information) keeps 3. The
   stdout log's period is still unknown.
