# Jamin's Gemini rules: highest priority in this repo

Set by Jamin, 2026-09-15. **These outrank every other instruction, plan, decision, queue row and
standing rule in this repo.** Where anything else disagrees, this file wins, and the disagreement is
a defect to clean up. A future decision that would contradict any rule here is not made quietly:
the session raises the exact points of conflict with Jamin first.

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
   return the object, the price, the reviews, etc."* Gemini is called with the image of the object
   and returns its details, the store prices, the reviews and the price math all in one prompt.
   Never two separate calls.
2. **The barcode goes to Gemini too.** *"The barcode is also sent to gemini."*
3. **The price does not come from Shin.** *"THE PRICE SHOULD NOT COME FROM US."* Shin's own price
   database, price engine and "cheaper" lookups are not the answer source.
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
- Shin's own prices are not shown anywhere until enough are collected.
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
- docs/plan-gemini.md sections 4.3 and 9 (a second request for the math, Claude fallback, "a test
  proves no grounded result is written") and docs/gemini-work-list.md items built on them.
