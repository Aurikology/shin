# Setup, consent, and the legal and market screens

Checked directly against the running frontend and server code during the session that wrote
this (2026-09-15). Where a claim rests on a decision record or a quoted instruction rather than
code, that source is named. Nothing below is carried over from an earlier pass without
re-opening the file it describes.

## 1. Picking a Shin and setting two price lines: the first screen after install

1. On a phone that has never opened the app, this is the very first thing drawn, before the
   camera is ever asked to turn on. A comment in the file says why camera permission is
   deliberately not requested here: it is asked the moment the person actually presses the
   shutter, "the only moment the request makes sense to them," not up front on a blank screen.
2. The screen asks exactly two things, and nothing else. First, which of three voices Shin should
   use when it talks: a flat, factual one that states a number and stops; a warm one that reads as
   on the shopper's side; and a blunt one that is short and a bit rude. Each of the three buttons
   plays its own sample line in its own voice so a person can hear the difference before picking,
   and picking one repaints only that choice, never the price maths, the app's fine print says so
   directly: "The attitude changes the words and never the number."
3. Second, and added later than the attitude picker (2026-09-14), two questions with four possible
   answers each, laid out as two rows of buttons reading "5%", "10%", "15%", "20%": how far below
   the usual price counts as under the shopper's own line, and how far above counts as over it.
   Both default to 10% if nothing is tapped, and the screen says so: "Ten and ten to start. Both
   changeable any time on the You page."
4. **Why these are asked at all, sourced from the founder's own words.** The feature exists
   because of an instruction recorded verbatim in this repo's own notes: *"can we make it so that
   gemini only responds with the prices of stores and the review of the product. Then we can ask
   the user what their range for a bad, resonable and good price is as an average above or below
   the price and then we tell the user based on their preference, this is factrually a bad,
   resonable or good price."* What shipped is not quite that. A later, dated decision in this
   repo's decision log records that a build once did exactly this, labelling a shelf price good,
   reasonable or bad against the median of Gemini's search results, and that this was reverted
   because of a hard rule that cannot be changed by chat conversation alone: a Canadian law,
   Competition Act section 74.01(1)(b), forbids making a performance or savings claim to a
   consumer without adequate and proper testing behind it first, and Gemini's search-found prices
   are not tested or dated the way this app's own verified price records are. The zones the shopper eventually sees are
   worded "under your line," "in the middle" and "over your line," never "good," "bad," "cheap,"
   "reasonable" or any translation of those words, and four separate test files in this codebase
   exist specifically to catch a banned word like that leaking back in.
5. The two questions are the exact same interaction pattern as the attitude picker one section up:
   a set of buttons behaving as a single choice, reachable and changeable with the arrow keys
   after landing on it with the keyboard, the chosen one visually marked and announced as chosen to
   a screen reader. The file's own comment explains why this was worth doing at all rather than
   reusing whatever came free from the browser: "A second interaction pattern on the one screen the
   user meets first is a cost with nothing on the other side of it," meaning the extra questions
   had to feel like the same control the person had just used, not a new one to learn.
6. The one state this screen can honestly be in besides "waiting for a tap" is a save failure.
   Nothing on this screen is fetched from anywhere, so there is no loading state to show; the only
   way it can fail is that the phone's browser refuses to remember anything at all (private
   browsing, or storage turned off), in which case a line appears saying, in the flat voice for
   example, "This browser is not letting me keep anything. It works until you close the tab, then
   it is gone." Before this line existed, a person in that situation would pick an attitude and two
   percentages, watch them highlight correctly, and lose the choice the moment they left the
   screen, with nothing on screen ever telling them that had happened.
7. Tapping "Start scanning" does three things: if no attitude was ever chosen, the flat voice is
   set as the default rather than leaving the choice empty; the screen records that this
   introduction has now been seen once; and the app moves on. Where it moves to depends on whether
   the consent screen (the next section here) has ever been shown on this device: the very first
   time, it goes there; on every run after that, consent has already been seen and the app goes
   straight to the camera. The same two flags and the same branch are checked again, independently,
   the next time the app is opened cold, so a person who quit mid-onboarding is sent back to
   whichever of the two screens they had not yet finished, not back to the very start.

## 2. What happens to the two price lines after they are set

This is the direct answer to where a shopper's personal good/bad price threshold is set, and
whether it does anything once set.

8. The two numbers are set in exactly two places on the phone, nowhere else: the setup screen just
   described, and a matching pair of the same four-button rows on the "You" settings screen, under
   the same two questions, which is what makes the setup screen's own promise ("changeable any time
   on the You page") true. Both screens read and write the same two stored numbers, so a change
   made in either place is immediately reflected in the other the next time it is opened.
9. Downstream, the code that is actually meant to use these two numbers exists and is well
   documented. The function that lays out the price line's zones takes two percentages as its third
   and fourth arguments, and its own comment names them precisely: "The shopper's own two
   percentages; the gauge's defaults when absent." A second, separate copy of the same maths, built
   for a different delivery path, repeats the same framing word for word: "`underPct` and `overPct`
   are the two percentages the USER set." Both pieces of code default the two numbers to 10 only
   when nothing is supplied, exactly mirroring the setup screen's own "ten and ten to start"
   language, which is a strong signal of intent: the code was written expecting a caller to hand it
   whatever the shopper actually chose, and to fall back to the same default the screen shows only
   when a caller genuinely has nothing else to send.
10. **Tracing that value forward, step by step, from the button tap to the network call that would
    need to carry it.** The screen where a shopper types the price on the shelf and asks for a
    verdict sends one request to Shin's own server. That request is built, by hand, as a plain
    object literal in the code, naming every field it includes one by one: the product's text
    description, its barcode if known, its category, the typed price, and which store it was typed
    against. The two personal percentages are not one of the named fields. They are not read out of
    the local store anywhere near where this request is built, and they are not appended to it by
    anything else before it goes out.
11. The function on the client that is allowed to make network requests at all forwards whatever
    object it is handed, unchanged, to the server; it adds nothing of its own. So whatever is
    missing at step 10 is still missing by the time anything reaches the network.
12. On the server, the incoming request body is read field by field into a plain object that is
    passed into Shin's own pricing engine: again, only text, barcode, category, the typed price, the
    named seller, and a date. There is no field here either for the shopper's two percentages, so
    even a request that had somehow carried them this far would have them dropped at this point,
    silently, because the code that reads the request body simply never looks for them.
13. Separately, and independently of that step, the same request handler builds a second, smaller
    object specifically for the Gemini-grounded price lookup (the one that eventually reaches the
    zone-drawing function from step 9): product text, barcode, the typed price, and the product's
    size. The two personal percentages are absent from this object too, for the same reason: the
    code building it does not read them from anywhere and does not pass them on.
14. The result: by the time execution reaches the function that was written to accept "the
    shopper's own two percentages," it has never actually received them on any path that was
    checked. The optional field is always missing, and the function's own fallback of 10 and 10
    fires every single time, for every shopper, regardless of what either of them picked on the
    setup screen or the You page.
15. **Direct contradiction, verified in the code on every step of the path above.** The setup screen
    and the You screen both tell the shopper, in plain words, that these two numbers are theirs to
    set and that the app's zones are drawn around them ("Both changeable any time on the You page";
    the zone-drawing code's own comment, superseded 2026-09-30 when the verdict took his words
    great / good / reasonable / bad). The dated decision that created this feature exists specifically so that a real,
    Competition-Act-compliant version of the founder's original ask ("we tell the user based on
    their preference") could ship. But no code on the path from the setup screen to the price-line
    calculation actually carries the chosen numbers anywhere; they are written to the phone's local
    storage and read back by the two settings screens themselves, and never leave the device. Every
    shopper, whatever they pick, is shown a price line drawn with the fixed 10 percent boundaries on
    both sides. This is not a partially-built feature still missing its last connection; it is two
    working, correctly wired settings screens sitting in front of a calculation that was written to
    accept their answer and is never handed it.
16. Separately from the Gemini-grounded price line, Shin's own pricing engine (the one described in
    the barcode-to-verdict section as the source of "the verdict as shown," never Gemini's) has no
    reference anywhere in its own code to either percentage. Whatever tiers that engine uses to call
    a price good, fair or high, it is not comparing against the shopper's own chosen range either.

## 3. The consent screen, and what it actually withdraws

17. This is a separate screen from setup, on purpose, and the file that draws it explains why in
    its own words: the attitude and price-line questions are preferences with no consequence either
    way, camera access is the operating system's own permission prompt asked at the moment it means
    something, and this third thing is neither of those. It is "Shin's own promise about what it
    does with what it is handed," and it is shown once, ever, gated by its own separate flag so that
    a phone that already finished the old, shorter setup still gets routed here the first time it
    opens after this screen was added.
18. It offers exactly two independent switches, both starting off: keeping the photo taken during a
    photo-based scan, and keeping a rough, kilometre-wide location. Each switch sits directly beside
    its own explanation in full sentences, not a shared paragraph above both. The photo explanation
    states what turning it on keeps (the picture, tied to the scan, so a wrong answer can be
    checked later) and what leaving it off means (the picture is read once to answer the scan and
    then is not kept), plus the stated risk in both cases (a kept photo can show what else was in
    the shot). The location explanation adds a detail unique to it: the phone also remembers which
    shop was confirmed in each rough area so it stops asking every time, and that memory "never
    leaves the phone" and is deleted the moment the switch is turned back off.
19. There is deliberately no "Allow" button and no "Not now" button. There is only one button,
    "Continue," and pressing it changes neither switch; it only marks the screen as seen and moves
    on to the camera. The file's own comment names the pattern this was built to avoid: a screen
    with a bright "Allow" and a quieter dismiss button frames leaving both off as a lesser choice
    someone has to opt out of, and this screen is built so that leaving both off is "a correct
    outcome of a screen that worked, not a state to be argued out of."
20. Flipping either switch runs the same function regardless of which screen it is tapped on (this
    screen, or the mirrored pair on the You screen described next), so the two places a person can
    change these flags cannot answer differently. It writes the new value to the phone first, then
    separately and without waiting, tells the server the new values and logs a "consent change"
    event carrying both flags' new state. The write to the phone happens first and the network call
    is not waited on, specifically because every other check in the app that asks "may I keep this"
    reads the value stored on the phone, immediately, and must never pause for a round trip to the
    server to know the answer.
21. Turning the location switch on also asks the phone's operating system for a position
    immediately, in the background, rather than waiting for the next scan to ask; the intent, stated
    in the code, is that the very next scan already has a location ready to attach instead of
    working with a stale or missing one.
22. Turning the location switch back off does more than stop new collection: it also deletes the
    phone's own list of which shop was confirmed in each area. The reasoning is stated directly:
    "Leaving that on the device after somebody has switched location off would mean the toggle
    stopped the collecting and kept the collection, which is not what the word off means on the
    screen it is written on."
23. **This promise is checked on the server too, not only asserted on the screen.** The server holds
    two small functions that answer, per device, "may this device's photo be kept?" and "may this
    device's rough location be kept onto a scan record?", each reading back exactly the flag that
    screen last wrote. Those two functions are called at the exact points where a photo would be
    written to disk and where a location would be written onto a scan row, and each of those writes
    is skipped outright when the answer is no. A photo scan whose consent flag is off is read once
    to answer the question and the picture itself never reaches the disk; a scan from a device with
    location off has null written into the location fields regardless of what the phone sent. This
    is a built control, not only a stated intention, and it is enforced from the server side rather
    than only trusted to the app to behave.
24. **A decision recorded in this repo's own decision log, both sides quoted.** On 2026-09-14 the
    two founders gave opposite instructions on the same day: one said, in his own words, to "build
    everything for collecting EVERYTHING," and a commit briefly shipped both switches on by default
    with an exact GPS position stored beside the rough area. The other founder, asked which should
    stand for the beta that testers would actually use, chose off-until-answered with only the rough
    area, no exact position ever stored. The reason recorded for that choice: a privacy notice on a
    consent screen that says "off unless you turn them on" over a build that was actually collecting
    everything by default is exactly the gap that Quebec's private-sector privacy law (Law 25) is
    written to catch, and privacy-by-default was already a stated requirement for launch. What
    shipped, and what this session verified is still what runs: both switches default to off, the
    exact position columns stay in the database schema but are always written as empty regardless of
    what a client sends, and the consent screen's own wording ("never your exact spot") is true of
    the code that runs behind it.

## 4. The same switches, plus the state of the app's legal pages, on the You screen

25. The You screen, reached at any time after onboarding, repeats the exact same two photo and
    location switches, using the exact same explanation sentences (shared from the same source
    rather than duplicated and free to drift) and the exact same write function described above.
    Nothing about what a switch does differs by which screen it was flipped on.
26. Directly below those two switches sits one plain-language sentence stating what the app has no
    page for: "There is no privacy policy page and no terms page. When there is something legal
    worth reading, it will be here; until then the two paragraphs above are the whole of it." This
    session confirmed there is no privacy-policy screen, no terms-of-use screen, and no age
    confirmation of any kind anywhere in the onboarding flow, the consent screen, or the You screen.
27. **Planned, and not built at all, verified against this repo's own recorded instruction.** One of
    the founder's dated rulings on how the app should handle a specific legal exposure (showing
    reviews and other people's content without asking permission from whoever posted them) was: "we
    will show the real answers in the videos, we are not showing the answers to users, we are just
    showing what we see on an app," a different question and answered elsewhere. A separate, later
    ruling from the same recorded session addresses the exposure that matters here directly: *"just
    put in our terms and services that you need to be 18+, if the user checks that, then we don't
    have any liability."* That describes an actual terms-of-service page with an age checkbox on it.
    No such page, checkbox, or age question exists anywhere in the app today; the sentence quoted in
    the previous item is the entire content of what a person is shown in place of it, and it says
    outright that there is nothing there yet.
28. Also on this screen, the way a person asks for their data to be deleted is a single row that
    opens an email addressed to a placeholder inbox, with the device's own random identifier already
    filled into the body so whoever answers can find the right records without asking the person to
    go find an id themselves. The file that builds this link states plainly, as its own comment, that
    this address is a placeholder: a repo-wide search for any real delete-request mailbox address
    turned up nothing in this app's own documentation, so a real address has to replace it before
    this is shown to anyone past the small group of family testers it ships to today.
29. Also on this screen, directly under the same section, one more line states a related fact rather
    than leaving it implied: scans are not limited or metered in this version of the app at all, and
    if that changes, the promise is that the allowance will be "one number, written once, shown
    wherever it applies," rather than the app hinting at a limit without ever stating it.
30. There is no loading state for any of this: the switches, the two paragraphs, and the delete-data
    link are all drawn from what is already sitting in the phone's own storage, not fetched from
    anywhere, so the screen is complete the instant it is drawn.

## 5. The market screen

31. Reached from a settings row on the You screen, this screen offers exactly three choices: Canada,
    the United States, and the United Kingdom, with Canada pre-selected by default. Each option is
    stored as a plain country name in English regardless of which language the app's interface is
    set to, and the file explains why directly: translating the stored value "would silently fork
    the data on the language the person happened to be using when they picked," since the stored
    value is meant to be read back later by the app itself and eventually compared on the server,
    not only displayed.
32. Picking a country repaints the whole list of three options to show the new tick mark, and the
    code specifically preserves keyboard focus across that repaint: without this fix, arrowing from
    one country to the next moved the selection correctly but dropped keyboard focus off the list
    entirely, so a person using only a keyboard could select the first alternate country but not
    reach the third one with another arrow press.
33. The screen's own caption, printed directly under the three choices, is a plainly honest
    statement of what this setting currently does: "Does not change a verdict yet. Recorded for
    when it does." The file that renders the screen repeats the same fact in its own header comment,
    calling the market pick something that is "stored and shown, even though it changes nothing in
    the engine today."
34. **A caption on a different screen says the opposite thing about the same setting, and this is a
    direct contradiction inside the app's own shipped wording, independent of what the code does.**
    The You screen shows the chosen country next to a caption of its own: "Price verdicts are judged
    against typical prices in this market." That sentence, read plainly, tells a shopper that
    picking the United States or the United Kingdom changes what their verdicts are judged against.
    The market screen's own caption, one tap away, says the setting "does not change a verdict yet."
    Both captions describe the exact same stored value on the exact same screen family, and they
    disagree about whether it is live.
35. **The code settles which of those two captions is currently true, and it agrees with the market
    screen, not the You screen.** The two written instructions that Gemini receives on every price
    search this app makes (quoted in full in the barcode-to-verdict section of this walkthrough) are
    built by a function that takes only one argument: which language the phone is set to. There is
    no country or currency argument anywhere in that function's signature. Both of its two possible
    outputs, the English version and the French version, are hard-coded to the same fixed sentence:
    "Canadian retailers only, prices in Canadian dollars (CAD) only." Choosing the United States or
    the United Kingdom on the market screen does not change this sentence in any way; every price
    search Gemini is asked to run stays restricted to Canadian retailers and Canadian dollars
    regardless of what a shopper picked. Two other places in this app read the stored country purely
    to put its name into a sentence a person reads (a range of prices "in Canada," for example), and
    nothing else; that is the entire effect the setting has anywhere this session could find it used.
36. A single line under the three country options leads to the legal and licences screen described
    next. Its wording states plainly what it is for: "Prices and product details come from open
    data. See the sources and licences." Unlike the row above it, this line carries no entrance
    animation, and the reason given in the file's own comment is that this line is seen on every
    single visit to this screen, while the screen it leads to is rarely opened, "the rare one."

## 6. The legal and licences screen

37. This screen exists because, before it did, nothing in the app credited any of the datasets it is
    built from anywhere at all; the file's own header states that a search of every screen, every
    client script, and the server for any of the licence names or the word "contributors" found
    nothing before this screen shipped. Nearly every product name, size, price and store name this
    app shows comes from outside open data published under terms that require exactly this kind of
    credit, so the file frames this as a licensing requirement, not a courtesy.
38. The list of sources is never written into this file itself. It is fetched from the server, where
    it is kept as a small, fixed list a person edits by hand rather than something generated
    automatically from whatever happens to be loaded that day. Confirmed directly in the server's
    own source: it currently holds five entries, all reachable through one request: the open food,
    beauty, pet-food and general-product databases that supply product names and sizes; the open
    prices database that supplies almost all of the actual price observations in the app;
    OpenStreetMap, which supplies the store names and cities attached to those prices; and a
    separate open electronics catalogue, called out on its own because its terms are its own and not
    the same licence as the other four.
39. Three states are drawn, never silently skipped past each other: while the list is being fetched,
    a line in Shin's own voice says so, marked so a screen reader announces it as an in-progress
    status rather than an interruption; if the fetch fails, or if it technically succeeds but comes
    back with an empty list, the screen treats that as a failure rather than truthfully reporting
    "nothing to credit," because the server's own list is never actually empty, and shows a line
    saying the credits failed to load, a fixed fallback sentence naming the same open sources by
    name so a person still sees who this app owes credit to even when the live list could not be
    reached, and a button to try again; once the list arrives and is not empty, each source is drawn
    as its own row with its name, what it supplies, its licence, and a link.
40. Each source's row animates in once when the list first loads successfully: a 200-millisecond
    lift with each row's own eased curve, staggered forty milliseconds after the row before it, so
    the rows arrive in a short cascade rather than all at once. Confirmed directly in the stylesheet.
    For a person whose device asks for reduced motion, the same rows still arrive with the same
    stagger and timing but fade into place rather than lifting, rather than the animation being
    removed outright. The file's own comment states why this screen gets an entrance animation at
    all when most of the rest of the app does not: it is normally seen once, "which is the only
    reason it animates at all."

## Open items

- The two personal price-threshold settings are fully built, wired to the same stored values on
  both screens that offer them, and never transmitted anywhere past the phone's own local storage.
  Nothing found this session sends them to the server, and nothing on the server reads them out of
  a request even where a request happens to include extra fields. Every verdict currently shown
  is drawn against the fixed 10 percent default on both sides, for every shopper, regardless of
  what either screen displays as selected. This needs a decision: whether the two request-building
  points identified above (the client's price request, and the server's two places that construct
  a smaller object to hand to the pricing code) should be extended to carry these two numbers
  through, given that the function meant to receive them already exists and already falls back
  correctly when they are absent.
- The market screen's own caption and the You screen's caption for the same stored country
  disagree about whether the setting currently affects a verdict. The market screen and the actual
  Gemini request-building code agree with each other (it does not); the You screen's caption is the
  one instance in the app's own wording that currently overstates what a setting does. This needs a
  decision: whether to correct the You screen's caption to match the market screen's honest one, or
  to finish wiring the country choice into the price-search instructions so the You screen's
  caption becomes true instead.
- No terms-of-service page and no age gate exist anywhere in the app, despite a recorded ruling
  from the founder that names exactly this as the intended way to handle liability for who is
  allowed to use the app. This is not a contradiction between a rule and code that runs against it;
  it is an unbuilt piece of a plan, and the You screen's own wording already says as much to
  whoever reads it. It is listed here because it sits squarely inside the screens this section
  covers and because the gap is between a specific, quoted instruction and a specific, checked
  absence, not a general observation.
- The delete-my-data email address on the You screen is a named placeholder, by the admission of
  the file that builds it, and this session found no real address for it anywhere in this repo's
  documentation. Whether a beta tester has ever actually used this link, and what would happen to
  a message sent to that placeholder address today, was not checked and would need its own look at
  wherever incoming mail for this project is actually read, which is outside what this session had
  open.
