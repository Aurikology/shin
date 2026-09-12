# The true data statement (plan item 6a)

Checked directly against the code as it stands 2026-09-11: `app/src/scans.ts`, `app/src/consent.ts`,
`app/src/photos.ts`, `app/src/migrations.ts`, and the photo-save call site in `app/server.ts`
(around line 1800). Nothing below is aspirational; every sentence is something a specific
function does or a column that exists. Where the code and the plan text disagreed, the code
wins, per the brief for this file.

## What is stored for every scan, no matter what you choose

Every time you scan something, we save one record: what you scanned (a barcode number, typed
text, or a photo's caption), what we answered, whether we answered, refused, or you corrected
us, and when. We attach a random ID that your phone generated for itself the first time you
opened the app. That ID identifies this app on this phone, not you. We never ask for your name,
your email, or an account to use the scanner, and this record never carries one.

If you take a photo to identify something, that photo is sent once to the identification
service to get an answer, whether or not you have turned on photo storage below. What we keep
either way is the service's written answer (what it read off the label, brand, size, how
confident it was), not the photo itself, unless you have said we can keep the photo too.

## What is stored only with your consent, and it is two separate switches

**Photos.** If you turn this on, the photo behind a scan is saved on our server, named by that
scan's own ID, alongside the scan record above. If you leave it off, or never answer, the photo
is used once to get your answer and then never written to disk. Photos we do keep are deleted
automatically ninety days after the scan; the scan record itself is not deleted with them, only
the photo file and the reference to it.

**Location.** If you turn this on, we record a coarse area, about one kilometre across, computed
on your phone; your phone never sends us your exact coordinates, and we never see them. We use
that area to guess which nearby store you are likely in and offer you a short pick-list; whichever
store you pick is saved on the scan record so prices can be tracked per store. If you leave this
off, or never answer, no location and no store is recorded, ever.

Both switches default to off. If you never open the first-launch screen or never answer it, that
reads exactly the same to us as answering no to both. Nothing is turned on by silence.

## Where it is kept

Everything above lives on one server we operate for the beta, in one database file plus one
folder of photo files. Nothing is sent to a third party for storage; the only outside call is
the one-time trip a photo makes to the identification service to be read, which happens whether
or not you keep a copy.

## What it is for

The scan record is what makes the free scans-per-week counter, the "what to look for next"
queue, and the "one shopper already saw this price" note work; without it those features do not
function. The photo, when you keep it, is what lets a human check a wrong answer later. The
location, when you keep it, is what lets a price be attached to the right store instead of
averaged across every store in the city.

## How to delete it

For the beta: email us and we will delete your device's scan records, any photos, and any saved
location and store choices. There is no in-app delete button yet; that is an honest limit of
the beta, not a hidden one, and it is stated on the consent and settings screens as such.

## What this replaces

Any earlier text in this app or its screens saying data "stays on the device" is false as of the
code above and must be removed everywhere it still appears (plan item 6e); the code has never
kept identifying data only on-device, and now it optionally keeps a photo and a coarse area on
the server too.

## Reverses if

The server or client lanes change what `scans.ts`, `consent.ts`, `photos.ts`, or `migrations.ts`
actually store before ship; this document must be re-read against the code at that point, not
assumed still correct. It was accurate against the working tree at commit time on 2026-09-11.
