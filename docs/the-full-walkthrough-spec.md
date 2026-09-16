# The full walkthrough: what was asked, and what it has to follow

Written 2026-09-15, from a chat in which he corrected four separate drafts of one sample
section before accepting the grain. Every rule below is one of those corrections, not an
inference. This document is read by future sessions and by agents doing the actual walkthrough
work; it is not a document he needs to open.

## What he asked for

A complete walkthrough of every tool, mechanism and surface of Shin, covering what is built and
what is only planned. The model for the grain: a live camera running splits into a barcode
tracker always working, splits into a barcode being identified, splits into the barcode needing
a search, splits into calling the server, splits into the server searching for the barcode, and
each of those splits again. Every decision that shaped a mechanism is named explicitly with the
real reason behind it: for example, Gemini is asked to compute a percent-from-median figure
itself, inside its own second request, because Shin's own server computing that figure from
Gemini's search-backed data would itself count as the "analyze" Google's terms forbid. This
applies across the whole app, not just what has shipped. Confirmed later in the same chat: the
frontend is in scope too, screens, states, navigation, what each screen renders and from what
data, loading and animated states.

## Who reads it, and what that rules out

He reads the finished walkthrough cold, having read none of this repo's code or documentation.
Consequences, each one a correction he gave directly:

- No file paths, line numbers, function or class names, or any other identifier from the
  codebase in the text he reads. A quoted line like "camera.ts:83,155" was rejected outright:
  "this means nothing to me."
- A mechanism is described by what it does, never by where it lives or what it is called
  internally.
- A step is never called out as contradicting a rule without the rule itself being stated in
  plain words in the same sentence or the one next to it. Naming the contradiction without
  naming the rule was rejected as saying "absolutely nothing."
- The target reading level is a systems designer reading a plain-English account precise enough
  to be pseudocode in substance, never actual code syntax, and never a summary that quietly
  drops a mechanism's internal steps.

## The evidentiary bar

This was the single most repeated correction, and it came both from him directly and from an
automated check partway through the chat that caught a reply written from memory instead of
from the files.

- Every claim has to come from a source actually opened while producing it. Not recalled, not
  guessed from a plausible pattern, not carried forward from an earlier pass without
  re-checking.
- "Reported but not personally verified" is not an acceptable resting state in a finished
  section. Open the file. If something genuinely cannot be verified from this machine, say so in
  those exact terms and say what verifying it would require, rather than leaving it as an
  unchecked flag and moving on.
- This applies recursively. A step that reuses a mechanism explained earlier in the walkthrough
  (a second Gemini call, another server request) still gets its own full explanation at the
  point it happens. "The same as before" is not sufficient; he asked for this explicitly after a
  draft skipped a repeated Gemini call's own detail because an earlier call had already been
  explained.

## What "broken down" means for any step that calls a model

Given directly, twice, after two drafts summarized this in one line each:

For every step where the app calls, or is planned to call, Gemini, the walkthrough states:

1. **Exactly what is sent.** The literal request text, quoted in full, not paraphrased as "asks
   Gemini to identify the product." Where the request is built from more than one piece (a tone
   instruction, a market restriction, the actual question, a length limit), each piece is quoted.
2. **Exactly how it is sent.** That it goes out as an ordinary network request, what is attached
   to it, and which modes are switched on for that specific request (live web search, code
   execution, a fixed answer shape).
3. **Exactly what comes back.** The literal shape of the reply: which named fields it must
   contain. Where an algorithm or function is handed to the model to execute rather than asked
   for in prose, the literal content of that algorithm, walked through step by step in plain
   language, not merely named or described as "the math function."
4. **Exactly how the reply is read.** What the app actually pulls out of the response, what it
   discards, and what it does with the result next.

## What a decision entry requires

- What was decided, and the real reason, sourced from something that actually exists: his own
  words, a written decision record, a measured incident with its actual numbers, or a legal or
  contractual term quoted directly. An invented or assumed rationale is not acceptable, matching
  the hard rule against fabricated evidence that already governs this repo.
- Where a written rule and the code that actually runs disagree, both sides are stated in plain
  words, and this is flagged as a decision point for him, never silently resolved in the
  document's own voice either way.
- Every step is labeled by its real state: built and matching the stated rules, built but
  contradicting a stated rule (with the rule quoted), or planned and not built at all.

## Carried-over style rules

- No em dashes anywhere in the output.
- No hedging inserted to get past a check; genuine uncertainty is stated plainly along with what
  would resolve it.
- Because he will not be available to answer questions while this runs, nothing in the finished
  document is phrased as a question to him. Every open decision point is written in as a named,
  flagged item inside the document itself.

## Scope

The full application: capture (the camera feed, barcode reading, photo capture), identification
(the catalogue lookup and both the built and the planned Gemini-based lookups), pricing and the
verdict (Shin's own price engine, the Gemini grounded price and verdict path, and the real,
verified relationship between the two, including any place they currently disagree), the
recording and logging layer, the frontend (every screen, its states, what triggers moving into
and out of it, what it renders and from which data, animated and loading behavior), the native
app wrapper, the catalogue data pipeline, the price history spine, and the mac-hosted beta
server and relay.

## Worked example already produced

The barcode-scan-to-verdict pipeline was walked through at this grain earlier in the same
session that produced this document, across several corrected drafts. It is the reference
example for grain and format; a new section is done when it reads at the same level of detail
and evidentiary rigor as that one, not before.
