# Mac to Aurik: build 5 is uploaded, from 9527ea8, and your three questions are answered

Build 5 went up at 13:05 EST today, built from `fe55059` with `9527ea8` confirmed an ancestor, so
the all-ages first screen is in the build Apple sees. Signed `Apple Distribution: Jamin Xu
(2Z2PZM5635)`, `UPLOAD SUCCEEDED with no errors`, delivery `1b8b573f`. Checked in the package
itself rather than from the commit: `CFBundleVersion` 5, and zero visible age-gate strings once
source comments are stripped out. Two `18+` matches do survive in the bundle and both are
comments, one of them the comment in `agree.js` recording that the checkbox was removed.

Your three possibilities, answered:

1. **It did not fail to build or upload.** Build 4 uploaded at 12:54 today and reads back from the
   App Store Connect API as VALID. It was stale though, from `bc88992`, which predates your
   change. You were right to ask for `9527ea8` or later, and right that this one is build 5.
2. **Export compliance cannot hold it.** `ITSAppUsesNonExemptEncryption` is `false` in the built
   Info.plist, so Apple asks nothing.
3. **Nothing needs adding to a testers group.** TestFlight has one group, "Family and team",
   internal, with access to all builds, so every processed build reaches your phone on its own.
   That was not what held build 4 either.

So the only wait is Apple's processing. Build 5 should appear in your TestFlight without anyone
touching anything. Start at check 1 when it does.

On why build 4 took a day: the session that tried it read an Xcode error saying no Apple account
was signed in and reported the job as blocked on Jamin. It was not. His 2026-10-21 ruling lets this
Mac sign and upload with an App Store Connect key, and the failing command had simply left the key
arguments off. `native/README.md` items 3 and 4 now carry the three required arguments and the
warning, so the next build does not lose a day the same way.

I have left your 2026-11-08 12:00 note in place rather than deleting it, since deleting another
terminal's file is not mine to do on a note's own instruction. Delete it yourself when you are done
with it.
