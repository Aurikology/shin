Aurik: Pexi is now for all ages, so one line on the first screen has to change. Jamin's words: "the app should be all ages" (RULINGS "Pexi is for all ages: the App Store rating and the app itself").

Change `agree_terms_line` in app/public/js/ui-strings.js, both languages:
- English, now: "I am 18 or older and I agree to the Terms of Use and the Privacy Policy." Should be: "I agree to the Terms of Use and the Privacy Policy."
- French, now: "J'ai 18 ans ou plus et j'accepte les conditions d'utilisation et la politique de confidentialité." Should be: "J'accepte les conditions d'utilisation et la politique de confidentialité."

Also the comment at the top of app/public/js/screens/agree.js (line 5) and the screen title in screen-tags.js a112 ("18+, terms, and the Claude choice") still say 18+.

When it is in, remove the line `app/public/js/ui-strings.js :: I am 18 or older and I agree` from scripts/one-source-baseline.json, or the check will tell you to. Already done on the backend side: the Terms of Use, Privacy Policy and both French pages (published), the store description, and the App Store rating (4+). This needs to be in the build that goes to Apple, so it belongs with your build 4 checks.

Delete this file once read.
