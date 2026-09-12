# Consent screen wording, drafted to ship (plan item 6f)

Per the founder's decision of 2026-09-11 (plan item I8): this wording ships without an approval
gate and is shown to him in chat once it is live. This file is that draft, handed to the Client
lane (`app/public/js/screens/*`) to implement; it does not touch code itself.

Grounds every claim in `notes/data-statement-2026-09-11.md`, which was checked against
`app/src/consent.ts`, `app/src/photos.ts`, and `app/src/scans.ts` directly. Two separate
opt-ins, both off by default, matching `consent.ts`'s two independent columns exactly.

## Screen text

**Heading:** Before you start scanning

**Body, shown above both toggles:**

Every scan you make is saved so the app can count your free scans, learn what to look up next,
and tell you when someone already checked a price nearby. That much happens no matter what you
choose below. Neither of the two things below is required to use the scanner.

**Toggle 1: Save my photos**

Off by default.

When this is off: your photo is used once to identify what you scanned, then thrown away. We
never keep a copy.

When this is on: we keep the photo for ninety days, so a wrong answer can be checked by a
person. After ninety days it is deleted automatically.

Risk: a kept photo could show what you or people near you were shopping for, and where you were
standing when you took it.

**Toggle 2: Save my location**

Off by default.

When this is off: we don't know what store you're in, so prices can't be tracked separately by
store for your scans.

When this is on: your phone works out a rough area, about a kilometre wide, never your exact
spot, and we use it to guess nearby stores so you can pick the right one in one tap. That
store choice is saved with the scan.

Risk: even a rough area, over many scans, can suggest your regular routes.

**Footer, shown once, small text:**

Nobody outside this app sees any of this. For the beta, there's no in-app delete button yet;
email us and we'll delete your scans, photos, and location choices by hand. You can change
either choice above any time from the You screen.

**Buttons:** Continue (proceeds regardless of toggle state; both may be left off)

## Notes for the Client lane implementing this

- Both toggles must independently default to unchecked; do not pre-check either.
- "Continue" must be reachable with both toggles off. Nothing here is a gate to using the app.
- The two toggles on the You screen (plan item 6d) must show and edit the same two values this
  screen sets; they are the same server-side flags (`consent.ts`'s `photos` and `location`),
  not a separate on-device setting.
- Remove every existing "stays on the device" string before or alongside shipping this screen
  (plan item 6e); shipping accurate consent wording next to a false claim elsewhere is worse
  than shipping neither.

## What this is not

Not the privacy policy (item 40) and not the store privacy declarations (items 41, 42), both of
which are separate drafts in this same notes folder and must say the same thing this screen
says, not a stricter or looser version of it.
