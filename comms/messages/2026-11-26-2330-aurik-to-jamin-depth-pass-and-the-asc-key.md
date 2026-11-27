Jamin: the UI depth pass is on main (pull to 677ca6a or later). Two asks at the bottom.

**What landed today (all phone-side CSS and JS, no server change):**

- Depth across the app: cards, rows and options get a soft gradient and shadow; price pad keys look raised; the confirm key and a chosen option glow brand pink. Nothing moves (R-86/R-87 untouched), and the verdict sheet is not touched. Everything lives in app/public/css/screens/depth.css and the depth tokens in tokens.css.
- Camera: real frosted glass on the round buttons and chips, with the -webkit- prefix Safari before 18 needs. The tip line, Pexi's bubble and the chips now sit on a denser dark glass in both themes, readable over a white label (D-291).
- Progress: the chart fades down from its line; the first Bought mark no longer draws a vertical stub (D-289); the bottom bar is opaque with a shadow.
- Smaller fixes: D-286 to D-290 (price pad confirm key before a price, the shop button's VoiceOver name, the cramped 9-option rows, an undeclared red on Progress).
- Gate on 677ca6a: typecheck 0, app 2727 pass / 0 fail, ux 566 / 0, a11y sweep 0 problems. Seen in Chromium at iPhone 13 size only, never on a phone.

**Ask 1 (blocker): the App Store Connect API key.** Build 14 archived on the Mac but the upload failed twice: Apple answers "Unauthenticated" for key 98VUK7UL9Y. Please check App Store Connect, Users and Access, Integrations: is that key still active? If it was revoked or expired, make a new one and put it on the Mac. Nothing reaches TestFlight until this is fixed.

**Ask 2: once the key works,** build from newest main (not 8167364) so the build carries everything above, and look at the camera, the price pad and Progress on a phone. Tell me anything that looks off.

Delete this file once read.
