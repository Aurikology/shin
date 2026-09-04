# Decisions

Newest last. Each one: title, date, status, why, and the condition that reverses it. A decision
here is not a wall. It is reversed by new evidence, never by a new opinion.

---

## The problem statement is fixed
**Date:** 2026-09-03 · **Status:** active

"Sellers know what things are worth and buyers are guessing, so we're making the check instant
enough that guessing stops being the default." Adopted verbatim. Every feature argument gets
checked against this sentence, and the sentence deliberately does not require live photo
recognition, which is why that feature is out of v1.

**Reverses if:** the pricing work shows the check cannot be made instant for any category, in
which case the promise, not the feature list, is what was wrong.

## The hook is a capability plus a villain
**Date:** 2026-09-03 · **Status:** active

"Scan anything. Shin tells you if you're getting ripped off." A neutral framing like "is this
price right" has no antagonist. Yuka reached 80M users by threatening brands, not by being
informative.

**Reverses if:** the video test shows the accusatory framing depresses completion rather than
sharing.

## The verdict output is a face, not a number
**Date:** 2026-09-03 · **Status:** active

One Shin face per verdict tier. Yuka's real asset is the score people screenshot, not the scan
itself. A face is the same asset and is ours.

**Reverses if:** users cannot tell two adjacent tiers apart in testing.

## The button after the verdict is save, not buy
**Date:** 2026-09-03 · **Status:** active

The primary user is a window shopper. 70.22% of carts are abandoned and 58.6% of that is people
who were just browsing. Optimizing for a purchase optimizes for the smaller half.

**Reverses if:** watched-item costs make saving the thing that kills the margin, since re-pricing
cost scales with saves rather than users.

## The v1 floor is six systems
**Date:** 2026-09-03 · **Status:** active

One category, barcode and screenshot input only, three faces, save and watch, a still share
card, and a branch for when the user disagrees. Live photo recognition is cut: it is the weakest
input and the problem statement does not require it.

**Reverses if:** the pricing work shows barcode plus screenshot cannot cover the chosen
category, which would make recognition load-bearing rather than optional.

## Share exports carry no download link
**Date:** 2026-09-03 · **Status:** active

Wardle left the link out of Wordle's share grid deliberately and it spread anyway. A link makes
the export read as an ad.

**Reverses if:** measured shares are high and installs from them are near zero.

## Real feed from day one, never live search
**Date:** 2026-09-03 · **Status:** active

The 2026-09-03 pilot asked search engines for live prices and got one usable range out of seven
items, with all four direct retailer fetches blocked. Same day correction: two of the three
category failures were method. New tech has an official retailer API and multiple Canadian
trackers, and new furniture has trackers plus the fact that a single seller means the verdict is
price against its own history rather than against other stores.

**Reverses if:** feed costs at real volume exceed what the product can carry, which is a live
risk since cost scales with watched items forever.

## Produce is out of v1
**Date:** 2026-09-03 · **Status:** active

Three stacked problems and no clean fix: a PLU names a category rather than a product, package
formats break unit comparison, and the public price movement is underlying inflation rather than
promotional. Shopper-reported shelf prices are the only source here, not a supplement.

**Reverses if:** crowdsourced shelf prices reach volume, at which point produce is the category
the asset unlocks rather than the one it cannot serve.

## "Shin Ramen" is dead as a name
**Date:** 2026-09-03 · **Status:** active

Nongshim's SHIN RAMYUN is registered, first use 1987, and "Shin Ramen" is the English-market
form of it.

**Reverses if:** a CIPO search clears the software classes, which would only ever revive plain
"Shin", not the two-word version.

## The video test runs on borrowed audiences
**Date:** 2026-09-03 · **Status:** active

TikTok seeds new posts to existing followers first, so a cold handle can return near zero views.
A new account cannot produce a trustworthy negative. Three to five micro creators, or Reddit.

**Reverses if:** a borrowed-audience test proves impossible to arrange, in which case a cold
account with a stated floor on what counts as a signal is better than no test.

## The repo lives on GitLab, private, with Aurik on it
**Date:** 2026-09-03 · **Status:** active

`gitlab.com/jaminke/shin`, private, Aurik Disler (`Aurikology`) at Maintainer. A top-level
GitLab group was asked for and could not be created: the account creates projects fine but
`POST /groups` is refused for every path, which is gitlab.com's identity check on new top-level
groups. The project sits in the personal namespace until a group is made by hand and the project
transferred into it. Membership survives a transfer.

**Reverses if:** Shin stops being shared work, in which case Aurik comes off the member list.

## Shin's attitude is the user's choice, not ours
**Date:** 2026-09-03 · **Status:** active

Picked by him when the redesign forced the question. `NOW.md` had this open and called it the
most underestimated decision in the plan, because it triples every string in the product forever.
It still does: every user-facing string now exists three times and the face system carries three
variants of six expressions. What changed is that the cost buys something. The riskiest tone call
stops being a guess, and which Shin someone has is itself worth screenshotting, which feeds the
borrowed-audience video test. Three personalities: Deadpan, Warm, Blunt. Default at first run is
Deadpan, because a price tool that is wrong while being cute is worse than one that is wrong
while being flat. The attitude changes the words and never the number.

**Reverses if:** the string count starts costing more than the picker returns, measured as
personalities nobody switches to. Then the two least used are cut and the default stands alone.

## The app is camera-first, and a refusal is a designed state
**Date:** 2026-09-03 · **Status:** active

The built walkthrough app was thirteen stages as thirteen pages, with no camera anywhere and a
home screen that described a camera in prose instead of showing one. The redesign makes the live
viewfinder the default route, collapses scan, identify and verdict into one surface over the
frozen frame, and gives the refusal its own colour, face and action. Refusal is not an edge case:
five of the seven known items refuse, so it is the most common outcome of the primary action.
Hue carries the verdict, saturation carries the confidence, and grey means no data so that red
keeps meaning the price is bad. Spec in `docs/design/DESIGN.md`, which wins over any screen.

**Reverses if:** the camera turns out not to be how people reach for this, which would show up as
scans per session near zero against watchlist opens. Then the list becomes the default and the
camera becomes a button on it.
