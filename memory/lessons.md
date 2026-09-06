# Lessons — what went wrong, and the change it would make

*One line per lesson: date · what happened · his words verbatim · what it would change.*

**Consumer:** nothing reads this file at session start, deliberately. It is read on purpose, by
the `self-improve` skill when capturing, and by hand before repeating work that has already gone
wrong once. A lesson that needs to bind a reflex does not belong here, it belongs in a hook.

**Promotion bar:** a lesson becomes a standing instruction in `CLAUDE.md` only after ignoring it
has cost something recorded twice. One incident is a lesson. Two is a rule.

---

- **2026-09-03 · A catch-all stage in a shared tree committed another session's half-written
  code.** Two sessions were working in this repo at once. One ran `git add -A` to commit four
  documents and swept in thirteen TypeScript files from the other, mid-write, pushed them to the
  shared remote under a message that said "operating docs", and missed two more files that landed
  seconds later. His words on the repair: *"never `--force` without asking"*, so it stands as
  written. **Changed:** promoted straight to a hook rather than prose, because it gates a reflex
  (how a command gets typed) and prose does not hold those. `.claude/hooks/no-blind-git-add.mjs`,
  fired live both ways 2026-09-03. Recorded as one incident, not two.

- **2026-09-03 · "Set up everything" left four scope decisions to the agent, and one of them went
  wrong.** His words: *"read my other repos and set up everything for the shin repo. tell me what
  this prompt is asking for."* The unnamed scope pushed toward a catch-all action, which is what
  selected `git add -A` above. **Changed:** nothing encoded yet. This is a lesson about how the
  work is asked for, not about how it is done, and it has cost something once. If a second
  unscoped ask produces a second wrong-sized deliverable, the capture is a procedure (name the
  model repo, or name the output list, before building) and it goes in a skill.

- **2026-09-03 · A search engine was mistaken for the source class a built app would query.** The
  hand pilot reported that new tech, new furniture and produce had no usable price data. His
  question: *"why does it not work for new tech, furniture and produce"*. Two of the three were
  the method: new tech turned out to be the best-served category of the five once a price tracker
  and a retailer API were opened instead of a search engine. **Changed:** written into the
  `price-by-hand` skill as the first step, and into `CLAUDE.md` as "real feed from day one, never
  live search". Second time this shape has appeared across his repos, the first being a job
  search reported as empty. Cross-repo, so it lives in the auto-memory too.

- **2026-09-03 · The design brief was approved with one correction on borrowing.** His words: *"rememebr
  we are not trying to copy duolingo or any other app, we are taking inspiration that applies to
  us."* **Changed:** written into the brief as a rule for every phase: a mechanic taken from OLMA or
  Duolingo carries the reason it applies to a person holding a phone in a store aisle, or it is
  not taken. Not yet a standing instruction; one occurrence, no cost recorded.

- **2026-09-04 · An analysis he asked for changed the documents and not the product.** He opened the
  app after a full day of passes and said: *"how come basically nothing in the app changed even
  after i told you to analyse duolingo and olma"*. The OLMA audit marked 58 rows take or adapt and
  the owl note mapped 24; five reached the running app, the rest became 27 drawn screens and a
  54-row face contract. The build pass was sequenced by the previous night's plan (redraws, then
  drawings, then the placeholder face) and I followed that order instead of calling it out.
  **Changed:** when he asks for an analysis of a product, the deliverable is the app changed by
  it; drawings and contracts are intermediate and ship in the same pass as the code or not at
  all. Cost: one day of his and one turn. One occurrence.

- **2026-09-04 · "Analyse the prompt" was answered as a scorecard of what shipped against it.** His
  words: *"i didn't ask you to tell me what it got. I just asked you to analyse it which you did,
  but only on a surface level. I want you to analyse in depth what the intentions of each are."*
  **Changed:** when he asks what a prompt is asking, the deliverable is the intent behind each
  sentence (the motive, the assumption it reveals, the expectation it sets), and nothing about
  delivery unless he asks for the diff. One turn lost. One occurrence.

- **2026-09-05 · A performance question was answered with a diagnosis and four subagent reports
  instead of a fix.** His words: *"also, you are not fixing this issue, you are just diagnosing
  the problem, and brainstorming solutions"*, and before it *"consider that this is a phone app
  and having multiple gbs of data is impossible"*. **Changed:** when he asks how something will
  work, the deliverable is the working thing with a measurement before and after; the diagnosis
  is the first paragraph of the report, not the report. Research agents run alongside the build,
  never in front of it. One turn lost. One occurrence.

- **2026-09-05 · One negative test was written into a plan as a verdict on the mechanism.** The
  vector arm lost on 40 French queries and I recorded "it lost" as the reason it is off, in a
  document describing what to build. His words: *"even thouse meaning search failed at one test
  doesn't mean it shouldn't be used in the product at all. The test could have been a false
  positive, or even if the test was correct, meaning search can be integrated in other aspects."*
  The test used clean catalogue names against rows carrying both language names, which is the one
  query shape word search handles best; the four shapes that matter (a model's paraphrase of a
  photo, an English-only row queried in French, a user typing what they want, deduping across
  source databases) were never run. **Changed:** a measurement goes in a plan with the shape it
  was run on attached, and a negative result retires a *version* until the untested cases are
  named and run. **This is the second incident of an existing standing instruction**, `agent`'s
  08-28 line *"a failed system is not a bad idea until the test is shown valid"*, which until now
  rested on one conversation and no incident. It now has one.

- **2026-09-05 · A green check is only evidence about the files it actually opened.** I built the
  camera guidance system, ran `npm run typecheck` in `app`, got a clean result, and reported the
  new `src/eye/framing.ts` as typechecking. It was never compiled. The tsconfig `include` was
  `["server.ts", "scripts/**/*.mjs"]`, so a file in `src` was only reached if `server.ts` imported
  it, and nothing imports the eye. The `database` terminal hit the identical hole the same
  afternoon with `src/pack-route.ts`, widened the include to add `src/**/*.ts`, and told me. Both
  files then compiled clean, so the claim survived, by luck rather than because the check ran.
  Their line for the record: an include written as a list of entry points is not a list of what to
  check. **Changed:** before reporting a check as passed, confirm the check's own configuration
  reaches the file in question, because `CLAUDE.md`'s *"a check that did not run never passed"*
  fails silently exactly here: the command exits zero and prints nothing about what it skipped.
  Cheapest confirmation is to break the file on purpose once and watch the check go red.
  **Second incident of the same shape as `agent`'s 08-06 line**, nothing is done on its own
  artifact's word.

- **2026-09-05 · A sentence written to be honest about a missing mechanism goes false the moment
  somebody builds the mechanism, and nothing points at it.** The correction screen said "Counts
  once a second tag agrees", written carefully so it could not claim to have changed a verdict
  while corrections went nowhere. Two changes landed the same day from two directions: the
  thresholds came out of the spine (one price now answers) and the corrections got wired. Between
  them the line became false in the *understating* direction, telling a person their contribution
  was waiting when it was already being used, which is the version that makes people stop
  bothering. It was caught only because a test asserted the old sentence's claim and failed, and
  the failure looked at first like the code being wrong rather than the copy. **Changed:** when a
  comment or a user-facing line is written as a hedge about something not yet built, the thing
  that builds it has to go looking for the hedge. Grepping the feature's own vocabulary across
  the client is the cheap version and it is what worked here. Related but not the same as
  `agent`'s 08-06 line: nothing was wrong with the artifact's own word, the world moved
  underneath a true sentence.

- **2026-09-05 · A test written to describe intended behaviour found the real behaviour instead,
  and the real behaviour was the more interesting fact.** Two spine tests asserted that one price
  point refuses and two produce a verdict, straight from the category rule's `minPoints: 2`. Both
  failed: `minPoints` stopped being a gate when the thresholds came out and is now a shortfall
  sentence appended to the confidence. **Changed:** nothing about the code, and that is the point.
  A failing test is a question about which side is out of date, and reading the failure before
  editing either side is what turned a two-minute test fix into finding a false line in the
  product's own voice.

- **2026-09-06 · A Claude-written rule was cited to him as his own, and a what-if in his question
  was carried as his decision.** The constitution's "no fabricated price data, a price the app
  cannot source is absent, not estimated" and the priority "a wrong verdict is worse than no
  verdict" were both written by Claude on 2026-09-03 under a header that says "added only by
  him"; a critique then quoted the rule back to him as "your rule". Separately, "if 10 in 100
  users buy the subscription for 20 dollars a year" was a hypothetical inside a question, and two
  later answers called $20 "your number". His words: *"this is not created by me its assumed by
  claude"* and *"$20 is not my number, i never stated it."* **Changed:** the rule is removed and
  the priority rewritten in his words; the one decision that cited them now stands on its own
  reason. Before attributing anything to him, find the message; a number inside a what-if is an
  input to that calculation and nothing else. Of the four hard rules left, two rest on law and
  two (aggression never at the user; name the paths in a commit) carry no words of his either.

- **2026-09-06 · A tree drawn from the moonshot had no node for the app itself, and cited one of
  its four stated sources nowhere.** The first skeleton pass carried sixty-eight nodes across nine
  branches, every one sourced and every one about machinery: identity, supply, verdict, purchases,
  money, reach, permission, instruments, infrastructure. No screen, no flow, no card, no mascot,
  so two thirds of his stated purpose (*"useful to the user, easy to use, and visually
  appealling"*, 2026-09-04) and the avatar he calls *"one of our most important features"*
  (2026-09-03) had no home. The header claimed the four documents as sources and the shipping
  design was cited by zero lines, which is why the whole shipping shape (the viewfinder that
  waits, the shutter, the typed asking price) was absent and the moonshot's end state was drawn as
  if it were the next build. **Changed:** the tree gained a branch for the app a person opens, and
  the redraw named where the shipping design and the end state differ. Two mechanical checks worth
  keeping for any document that lists its own sources: grep each source's name in the finished
  document before delivering, and ask of every plan whether the thing the user touches is in it.
  A fresh reader with none of the session's conversation found both; the artifact read as complete
  on its own word.
