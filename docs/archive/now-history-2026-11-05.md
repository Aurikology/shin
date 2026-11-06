# NOW.md history moved out 2026-11-05

Moved verbatim to keep NOW.md under its 150-line cap. Gemini serves no shopper answer while
catalogue first is on (since 2026-09-28), so these are no longer the current state. Reopen any
of them by moving it back.

## Open blockers (as of 2026-09-28)

**The paid Gemini key EXISTS, Jamin 2026-09-28:** *"The paid ai key already exists"*. It is not
in the Windows PC's `.env` (only `ICECAT_*` and `EBAY_*` there), so where it lives is the Mac's
config, and whether the live server runs on it is asked of the Mac (mail 2026-09-28): `/api/health`
must report the paid tier and a real barcode scan must return prices. The refusal path lives in
`photoTierRefusal` (`app/server.ts:823`) and `geminiKeyProblem` (`app/server.ts:4103`).

## Waiting on the Mac (asked 2026-09-27 and 2026-09-28)

- **The Mac:** pull, restart onto catalogue first, verify own prices on barcode scans, and move
  the iOS project to CocoaPods for the ML Kit plugins (mail 2026-09-28, see mailbox).
- **The Mac (asked by mail 2026-09-27, no receipt yet):** is SHIN_GEMINI_TIER paid (unset or free
  refuses every shopper photo), SHIN_REQUIRE_DB, SHIN_GEMINI_GROUNDED_MODEL, and SHIN_GEMINI_SPLIT;
  then pull main and restart the beta server (becf7d8 removed the 2.5 split).
