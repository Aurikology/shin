# Jamin's Gemini rules: highest priority in this repo

Set by Jamin, 2026-09-15. **These outrank every other instruction, plan, decision, queue row and
standing rule in this repo.** Where anything else disagrees, this file wins, and the disagreement is
a defect to clean up. A future decision that would contradict any rule here is not made quietly:
the session raises the exact points of conflict with Jamin first.

**The Google Doc outranks every older note, and an older note that contradicts it is deleted.**
His words, 2026-09-19: *"i've made many decisions in the google doc that will contradict the
decisions in this repo. I want you to get rid of all the previous lines that contradict the google
doc and make a statement that all contradictions that are found in the future that are between the
google doc and a note made before the writing of the google doc will result in the note being
deleted."* The Google Doc is "Shin Full Walkthrough" (docs.google.com/document/d/
1f_p8XkoHygvAqOuG3tujYgencsh2OwEGFgvo2HTPjzg), created 2026-09-16; its decisions are carried in
`docs/walkthrough/jamin-notes-2026-09-17.md` and "Walkthrough rulings" below. Any line in this
repo written before 2026-09-16 that contradicts it is deleted when found, not kept, not annotated,
not raised: delete it and name the deletion in the commit message. A contradiction with something
written on or after 2026-09-16 is raised with him, not deleted. Descriptions of what the code does
today are not notes of intent; a mismatch there is a build gap (`docs/beta-gaps-2026-09-19.md`).
The first sweep ran 2026-09-19.

## The high-priority task

Jamin, 2026-09-15: *"sort through all items on this repo to make sure all insturctions are up to
date. There have been a lot of contradictions. Follow exactly as i said yestruday night when i
initially brought up the gemini switch."*

**Jamin asks Aurik to perform a cleanup of this repo for anything that goes against these rules:**
CLAUDE.md, NOW.md, QUEUE.md, DEFECTS.md, docs/decisions.md, docs/plan-gemini.md,
docs/gemini-work-list.md, docs/the-gemini-tree.md, the beta build plan, notes, skills, hooks, tests
and code. Each contradiction is either fixed to match this file or, if it should not be, raised with
Jamin as a point. When the cleanup is done, record it in `notes/catch-up.md`.

## The rules, in Jamin's words from 2026-09-15

1. **One Gemini call per scan.** *"The product search will fucntion like this: one gemini call will
   return the object, the price, the reviews, etc."* One prompt returns the product's details, the
   store prices, the reviews and the price math. Never two separate calls.
2. **Barcode scan and photo scan are separate; a barcode scan sends no image.** *"The barcode is
   also sent to gemini."* And 2026-09-15: *"the image and barcode should not be part of the same
   scan. the barcode can be read and the info fed to gemini which would be a much cheaper api call
   than sending an image."* The phone reads the barcode itself and Gemini gets the digits as text.
   The photo goes to Gemini only on a photo scan, when there is no barcode.
3. **The price does not come from Shin.** *"THE PRICE SHOULD NOT COME FROM US."* Shin's own price
   database, price engine and "cheaper" lookups are not the answer source. **Superseded 2026-09-23
   and 2026-09-26, see RULINGS.md: "A scanned barcode answers with Shin's own prices too."** A
   typed-name search still answers only from Shin's own catalogue and only when both item and price
   are known, unchanged; a barcode scan now also shows Shin's own collected prices, marked as
   Shin's own data; the nearby-cheaper/alternatives feature is separately still out of v1.
4. **Record everything.** *"we will record EVERYTHING that happens when the user interacts with the
   app which was asked for multiple times but never done."* Every request, every Gemini request and
   response, every screen, tap and answer the phone shows, saved.
5. **Legal issues mark, never block.** *"Any legal issues with gemini will not cause a portion of
   the app to become bloked, it will just be marked as an issue."* Also: *"Forget about all legal
   considerations when building, don't prevent something form fucntioning just because of legal
   issues."*
6. **Always an answer.** *"Having a repsonse that is not checked is infinitly better than having the
   user scan something, wait 10 seconds, only to get told the app doesn't know, because that will
   make the user just uninstall the app"*
7. **Claude does not take over.** *"claude should not be taking over"*. With Gemini on, no Claude
   fallback.
8. **The Gemini API key is only for live phone testing.** *"Make sure not to use the api key for
   things like building code etc because you can use claude in chrome to control gemini. Only use
   the api for live testing on the phon[e]"*
9. **Last night's decisions rank highest.** *"For the most part, the decisions made last night have
   the highest priority. If a decision in the near future wants to contradict this, bring up those
   points."*

## What Jamin said the night of the switch (2026-09-14, 1:37 to 3:21 am Toronto), verbatim

- *"lets switch to gemini for barcode and image searches. Shin should be recommneding the user to
  search barcodes and if it doens't have a barcode, it should search the image. shin should guide
  the user to frame the image correctly. research geminis terms for what our app is trying todo.
  Also, we will accept all answers gemini gives, just give a heads up that something doesn't have a
  link. Gemini also provides reviews which is something that we wanted to add. Consider everything
  we wanted this repo to do and what gemini is capable of"*
- *"is it possible to save the product the barcode refers to, after all this it not something gemini
  owns, also, can we save the range of the prices, and only the links don't get shown to the user
  ... what is the cost per api call compared to our previous claude strategy."*
- *"can we frame gemini to respond in a certain way"*
- *"can we make it so that gemini only responds with the prices of stores and the review of the
  product. Then we can ask the user what their range for a bad, resonable and good price is as an
  average above or below the price and then we tell the user based on their preference, this is
  factrually a bad, resonable or good price"*
- *"i imagine the prices showing up as a colored line with a large dot as the photographed items
  price and smaller dots as all the sources prices"*
- *"gemini can simply calculate something like the median and each step away from the median is a
  percentage determined by an algorithm and all prices are placed on the line"*
- *"everything should be scaled down or up to a spcific unit. natrually a 4l will be cheaper than a
  1l but thats fine, and if that makes the 1l a bad deal, its a bad deal. But there also needs to be
  measures in place that label each dot on the graph with its actrual quantity."*
- *"what should we do for tech that has different specs"*
- *"i never asked you to build the code for gemini"* · *"you shouldn't have built any extra code
  yet"* · *"if you need to test gemini, use claude in chrome to operate:
  https://gemini.google.com/app"*

## His twelve rulings, later on 2026-09-14 (as recorded in docs/decisions.md)

- Reviews: *"we don't have to push for super transparency when it makes our product worse, we just
  have to give a way for the user to know where our info comes from."* Reviews show with no link,
  flagged.
- Age: *"just put in our terms and services that you need to be 18+, if the user checks that, then
  we don't have any liability."*
- Videos: *"we will show the real answers in the videos, we are not showing the answers to users, we
  are just showing what we see on an app."*
- Checking an answer: *"there can be measures in place but definitely not calling the ai a second
  time, we can scan multiple frames to ensure they all match up."*
- Shin's own prices were not shown anywhere until enough were collected. **Superseded 2026-09-23
  and 2026-09-26, see RULINGS.md: "A scanned barcode answers with Shin's own prices too."**
- Also recorded: legal review before launch; seek zero data retention but build assuming it is
  refused; image resolution decided by a test, not a guess; consent wording delegated (*"you
  decide"*).

## Known contradictions already found (2026-09-15), to clean up first

- Each scan was split into several Gemini calls (identify without search, a separate search, a
  planned third call for the math). Rule 1 and "definitely not calling the ai a second time".
- The price answer came from Shin's own price engine, which said it did not know. Rules 3 and 6.
- Search results were saved only when the scan id and device matched; the phone never sends them on
  the price request, so nothing was saved; what the phone was shown is not recorded. Rule 4.
- A Claude fallback stood behind Gemini (removed 2026-09-15, commit 3ef4cc8). Rule 7.
- The 2026-09-14 revert of the search half and the CLAUDE.md lines "No walls except law" and "Real
  feed from day one, never live search" block on legal grounds. Rule 5.
- Aurik's 2026-09-14 ruling that the price line never says good, reasonable or bad (neutral zone
  codes, enforced by four test files). Jamin's words: *"we tell the user based on their preference,
  this is factrually a bad, resonable or good price"*.
- `identify/src/grounded.ts`, the guard that makes a search result impossible to write to a
  database or stringify into a response, and the two-year reaper in `app/src/grounded-record.ts`.
  Rules 4 and 5.
- docs/plan-gemini.md sections 4.3 and 9 (a second request for the math, Claude fallback, "a test
  proves no grounded result is written") and docs/gemini-work-list.md items built on them.

## Walkthrough rulings, 2026-09-16/17 (his notes and comments on the Google Doc walkthrough)

His text, verbatim and complete: `docs/walkthrough/jamin-notes-2026-09-17.md`. These are newer
than rules 1 to 9 and, where they differ, they win (rule 9: the newer word of the founder is the
one raised against, not the older). Read the verbatim file; the lines below say what changes, not
everything he said. His standing note on every tab: *"when i state a problem and give examples,
don't assume those examples are the only aspects of the problem, they are just one of many."*

**Precedence, stated outright.** *"nothing should hold higher precedency than the words of the
founder."* Order: his words, then the system working, then Gemini's terms. *"Breaking the rule
should never crash the system. No rule is ever more important than the correct functionality of our
system."* An answer shown with a "we are not fully confident in this answer" mark beats no answer.
Guard machinery built around a Gemini term he never prioritised (the grounded wrapper is his
example, not the only one) is cost to remove, not a safeguard to keep.

**Rule 2 is replaced for barcodes.** Old: no automatic detection, a button starts the read. New:
the phone reads barcodes from every frame, continuously, and never stops watching until the user
presses "Scan barcode". Every barcode in view is highlighted; the one the button will send is drawn
differently. On-screen prompts coach centring. The button appears once a majority of frames over
1 to 2 seconds agree; the frame history works like a shift register, so pointing at a different
barcode moves the focus. Only the digits go to Gemini, never the image.

**The server only calls Gemini.** *"The server will not check shins own product list for now."*
This answers Aurik's blocking question of 2026-09-18 (`notes/catch-up.md`, question 1): Gemini
identifies; the catalogue is not the identifier and *"will not be in use until more user data
comes in."* One call returns product, prices, reviews and the price math (rule 1, restated).

**Global, now.** *"Shin will work for all locations accross the world in all languages."* Answers
Aurik's question 6. Same-country prices compare; the same product across countries does not, with
exceptions (provinces that differ, EU countries that match). Prompting Gemini for those
constraints *"will need further deisgn"*.

**Price asked up front.** He proposes asking the shelf price at scan time so it rides in the one
Gemini prompt. The user's good, bad and great thresholds are *"crucial and non negotiable"*.

**Shin never shows its own price math.** A hidden check may recompute Gemini's math; a mismatch
marks that scan (image or digits plus the exact prompt) for later review. Never shown.

**Record as much as possible.** Photo or barcode, typed price, location, store, the user's own
good-deal verdict (their scale, so it is their interpretation, not Gemini's output), and later a
median back-computed from their verdict and price (*"needs further design"*). Anything not recorded
today *"should prompt a review of the data collection system."* He also asks whether the camera
can continuously send crops of everything in view, especially shelf tags (price, name and item in
one frame), to be saved.

**User data builds the catalogue.** A scan matching a catalogue product attaches to it, to the
closest quantity where two sizes exist; units convert to Shin's comparison units with the original
kept; user data is never fully trusted; an unknown product becomes a new entry; near-duplicate
incoming products must be grouped. The same product is also stored per store type (his
"branches"). Tech is not compared by weight (answers the unit half of Aurik's question 5).

**Alternatives are in scope, with constraints.** Cheaper and competing options: non-organic for
organic, used for new, the newer model for more. Two modes: validation (is this a good price, where
a farm or used price is useful evidence) and alternatives (would they actually switch, where a
supermarket shopper will not take a farm product and a new-item buyer will not take used). Bulk
buys need a constraint. Answers Aurik's alternatives questions 1, 2 and 5 in principle.

**Onboarding.** The Welcome screen UI tab: Cal AI's 33 onboarding screens with his replacement text,
built in Shin's design language. Separately: screens that ask where and what the user shops, their
good, bad and great ranges, and location.

**Scope cuts.** *"Shin will not run inside a browser, it only runs inside a browser for testing
purposes."* *"For now, the app will not be usable offline."* *"Claude should currently not be used
anywhere inside shin."* Torch: a user setting, auto-on at a brightness set by a slider, or off with
an on-screen "too dark" prompt.

**Gemini's terms, read 2026-09-18 at ai.google.dev/gemini-api/terms.** Both earlier readings were
half right because the terms treat two kinds of output differently. Ordinary model output has no
"do not modify" or "do not store" clause. Output grounded with Google Search does: *"will not
modify, or intersperse any other content with, the Grounded Results or Search Suggestions"*, and
*"will not... cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded
Results"*, with storage allowed up to two years only to evaluate and optimise, in chat history, or
to resubmit in a later prompt. Shin's prices come from grounded search, so the strict half applies
to them. The user's own inputs and verdict are not Gemini output. Paid tier: prompts are not used
by Google to improve products. Under rule 5 these are marks, not blocks. The terms page itself
names no penalty; suspension language sits in the Google APIs terms, not re-read here.

**Four points raised with him, all DECIDED 2026-09-18.** His words: *"go with the defaults for
all four."*
1. **The barcode goes through Shin's server.** His note *"The barcode will not be sent to shins
   servers as of now"* sat against *"The only thing the server will do is call gemini"* and
   *"save... the users' picture or barcode"*. A phone cannot hold the Gemini key safely, so the
   server receives the digits, calls Gemini, and records them.
2. **No invented social proof in onboarding.** The Welcome screens' *"Join over 10,000 smart
   shoppers"*, 4.8 rating, reviews and savings figures ($15 in 3 days, $180 in 30) are built with
   real counts that stay hidden until they exist. Marked, not blocked.
3. **The photo scan is built as one call** (image plus grounded search, rule 1) and is the first
   thing measured when the paid key arrives. If the API refuses that combination, it is raised
   with him, not quietly split into two calls.
4. **The per-scan cost was accepted.** About 5.6 cents a scan past roughly 1,250 scans a month
   (Aurik's question 4), with Gemini in front of the catalogue, per *"The server will not check
   shins own product list for now."* **Superseded 2026-09-27, see RULINGS.md: "Catalogue first;
   Gemini is a capped fallback, never the identity."**

**Model: 2.5 was decided as the flat default on 2026-09-18. Superseded 2026-09-22, see
RULINGS.md: "Default Gemini model is gemini-3.8-flash."** His words at the time: *"lets make the
default gemini 2.5 for now and we will switch to a better model if our testing says otherwise."* Why, from
ai.google.dev/gemini-api/docs/pricing read 2026-09-18: 2.5 bills search grounding per grounded
PROMPT (*"1,500 RPD (free...), then $35 / 1,000 grounded prompts"*), 3.x per search QUERY (*"5,000
free search requests per month... then $14 per 1,000 requests"*). One observed scan ran four
queries: 5.6 cents on 3.x against 3.5 cents on 2.5, and 2.5's free allowance is about 45,000 scans
a month against about 1,250. That 2.5 default held only until Jamin found 2.5 inaccessible on the
beta server on 2026-09-22; every scan now defaults to `gemini-3.8-flash` (RULINGS.md). The switch
came from 2.5 being unreachable, not from the side-by-side test, which has not been recorded.
**Both models are tested in the beta itself**, his words 2026-09-19: *"both models should be
tested for the beta."* The beta build can run either model per scan, records which one answered,
and reports them side by side (right product, searches, tokens, cost, seconds, answers that did
not parse). The server needs both model ids configured, not one override.

**Gemini 2.5 cannot enforce the answer shape while searching (found 2026-09-18).**
ai.google.dev/gemini-api/docs/structured-output: combining a response schema with Google Search
*"is available only to Gemini 3 series models."* On 2.5 the one call asks for JSON in the prompt
text and the server parses it, repairing or marking a malformed answer (never failing the scan,
rule 6); `Shin_Gemini_Pricing_Engine/README.md` step 6 (request application/json with the schema)
only works on 3.x. The paid-key test counts the share of 2.5 answers that do not parse; a high
share is the "testing says otherwise" that moves the default to 3.x. The search tool is
`google_search`; `google_search_retrieval`, which the ChatGPT conversation behind the package
quotes, is the old Gemini 1.5 name.

**The ChatGPT conversation behind the package** (chatgpt.com/share/6aae0849-ec04-83e9-b41f-83ba3726bd6c,
read 2026-09-18) disagrees with his rulings in three places; his rulings win:
1. It says *"you should not design the system around 'system functionality taking absolute
   precedence over API restrictions.'"* His ruling above is the opposite.
2. It says *"I would not make Gemini responsible for price math that your backend can
   deterministically perform."* His rule: Gemini does the math, the server only checks it in
   the background and marks mismatches. The engineering point stands as a risk (a model can get
   arithmetic wrong), and the background check is the answer to it.
3. `PRICING_GUIDE.md`: *"Do not calculate normalized unit prices unless explicitly required."*
   His ruling: convert to Shin's comparison units and keep the advertised original. Both fields.
The package also asks Gemini for no median, threshold or verdict at all, so as written it is not
yet the one call rule 1 describes: the price math has to be added to `scan_prompt.md` and
`response_schema.json`, with the user's thresholds and shelf price in the scan context.

**Asked, not decided: a better model to identify photos and 2.5 to search.** That is two calls per
photo scan, against rule 1. Barcode scans are unaffected (Gemini gets the digits and needs no
seeing). Raised with him 2026-09-18; until he answers, rule 1 holds: one call on 2.5.

His suggested edits were all in the first tab and are accepted in the doc (his word, 2026-09-18).
A re-read of the whole doc after he accepted them came back byte-identical to the first read, so
the verbatim notes file already holds them.
