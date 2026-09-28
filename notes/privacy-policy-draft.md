FINISHED AND PUBLISHED. Hosted at `app/public/legal/privacy.html` (English) and
`app/public/legal/privacy-fr.html` (French), served by the app's own server; the founder still
reviews before any store submission links to it, but the pages are live, not a stub. This file is
the same content in Markdown, kept here so it can be diffed and edited without opening HTML.

Checked directly against the code on 2026-09-28: `app/src/consent.ts`, `app/src/events.ts`,
`app/src/scans.ts`, `app/src/photos.ts`, `app/src/shelf.ts`, `app/public/js/geocell.js`,
`app/public/js/track.js`, `identify/src/providers/gemini*.ts`, and `RULINGS.md`'s "Privacy,
recording and consent" section. Photos default to **off**, not on: from 2026-09-19 to the
2026-09-28 ruling ("Location and photo consent default off until answered") they defaulted on,
and this file was written during that window; `consent.ts`'s `DEFAULT_CONSENT` now reads
`{ photos: false, location: false }` again, matching location, which was off by default the whole
time. There is also no 90-day photo deletion running by default (`SHIN_PHOTO_RETENTION_DAYS`
defaults to null, meaning keep-forever, per `settings/src/index.ts`), so this no longer promises a
fixed window that is not actually enforced.

# Shin - Privacy Policy

Last updated: 2026-09-28 (beta).

## Who we are

Shin is a beta grocery and retail price-checking app. This policy covers Shin's mobile app and
its server. Contact us at useshinapp@gmail.com.

## No account, no name, no email

Shin does not ask for your name, email address, or an account. The first time you open Shin, your
device creates a random identifier for itself and sends it back on every scan afterward. That
identifier tells us it is the same device asking again; it does not tell us who you are.

## What we collect every time you use Shin

Every scan you make (a barcode, a photo, or a name you typed) is recorded: what you scanned, what
we told you, whether we answered, refused, or you corrected us, and when. We also record how you
use the app itself: screens you open, buttons you tap, and text you type into a search box,
including text you type and then delete without sending. If you rate an answer or flag it wrong,
that is recorded too. None of this requires a name, an email, or a sign-up.

## Photos: off until you turn them on, and what happens either way

Photo saving is **off by default**. Either way, if you take a photo to identify a product, it is
sent once to Google's Gemini AI model to produce an answer.

- **Photo saving off (the default):** the photo is read once to produce that one answer and is not
  kept.
- **Photo saving on:** the photo is kept, tied to that scan, for human review of a wrong answer and
  for Shin to learn from. No automatic deletion schedule runs by default; a kept photo stays until
  you ask us to delete it, or until we turn on an automatic deletion window in the future, at which
  point this page will say so with the number of days.

You can turn photo saving on at any time from the You screen; turning it off afterward does not
retroactively delete a photo already kept.

## Location: off until you turn it on, and only ever a rough area

Location saving is **off by default**. If you turn it on:

- Your phone asks the OS for the exact GPS position and snaps it, on the phone, to a grid cell
  about one kilometre wide.
- The exact reading is sent to our server alongside the rough cell (so the server can re-check
  the snap), and our server discards the exact reading immediately; only the rough,
  kilometre-wide cell is ever written to our database.
- We use the rough area to suggest nearby stores; the store you pick is saved with that scan.

If location saving is off, your phone is never asked for a location reading at all.

## Why we collect this

To answer your scans, count your free scans, decide what to look up next, and notice when a
nearby shopper already checked the same price. We also use collected scan data, including kept
photos, to train and improve Shin's own price-answering system and to answer other shoppers
scanning the same or similar products. A correction you send is used to fix future answers.

## When Shin asks an AI model

A photo is sent once to Google's Gemini AI model, kept or not. When Shin has no price of its own,
we may ask an AI model for a general, typical price range from the product's name or category
only, never your photo, exact location, or device identifier tied to anything else about you.

## Who sees this data

Nobody outside Shin's own server, except the AI model providers named above, and only for what
this page says they receive.

## How long we keep it

Scan and event records are kept for the life of the beta. A kept photo stays until you ask us to
delete it (see "Photos" above); no automatic deletion schedule runs by default today.

## How to see or delete your data

During the beta there is no in-app delete button. Email useshinapp@gmail.com and we will delete
your device's scan records, saved photos, and saved location or store choices by hand.

## Children

Shin is not directed at children and we do not knowingly collect information from a child under
13. Email us if you believe a child has used Shin.

## Changes to this policy

This policy may change during the beta. The hosted page is always the current version, and it is
kept to match the app's own consent screen.

## Contact

useshinapp@gmail.com
