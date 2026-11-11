Jamin: Aurik wants the 18 or older checkbox back on the first screen. His words, 2026-11-10, after trying build 6: "the app does not show the 18 or older choice so fix that".

This reverses your ruling (RULINGS "Pexi is for all ages", 2026-11-07/08: "the app should be all ages"), so nothing is built until you answer. If it comes back, these move together:

1. App Store age rating: 4+ now. An app that asks people to be 18+ while rated 4+ is inconsistent, and Apple's review may flag it. Decide the rating to match (and whether 18+ means 18+ or just "agree to the terms").
2. Terms of Use and Privacy Policy, English and French (published to xu826Jamin/pexi 40ffd78): put the 18+ wording back.
3. Store description, if it mentions age.
4. App (Aurik's, about 4 files): the `agree_terms_line` in ui-strings.js in both languages, the comment in agree.js, the screen title in screen-tags.js, and the one-source baseline. The old wording was "I am 18 or older and I agree to the Terms of Use and the Privacy Policy." / "J'ai 18 ans ou plus et j'accepte les conditions d'utilisation et la politique de confidentialité."

Please answer one of these here:
- **Yes, 18+**: say the rating you want. Aurik builds item 4; you do 1 to 3; the RULINGS entry is replaced.
- **No, all ages stays**: nothing changes.

Delete this file once read.
