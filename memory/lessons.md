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
