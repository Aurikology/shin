# CLAUDE.md — Shin

A mascot-led price scanner. Point a phone at a thing, get told whether the price is fair.
Read `NOW.md` first, this file second. Auto-loaded every session, never `Read` it.

**WHAT WINS, Jamin 2026-09-27: one list of current rulings, `RULINGS.md`, outranks every other
file here, the rules file and the Google Doc included** (`docs/decisions.md`, "One list of current
rulings outranks every other file"). Read it before acting on any product question. A new ruling
of his goes there the same turn (old text to `docs/decisions.md`); every push fails while a live
file still repeats wording it retired (`scripts/one-source.mjs`, with a baseline that only shrinks).

**Set by Jamin 2026-09-15: read `docs/jamin-gemini-rules.md` before anything else.** One Gemini
call per scan (a barcode scan sends only the
digits as text, a photo scan sends the image; product, prices, reviews and price math out); Shin's own prices only where a later ruling puts them (typed searches 2026-09-23, barcode answers beside Gemini's 2026-09-26); record everything a user does;
legal issues are marked, never blocking; always an answer; no Claude fallback. **If your human is
Aurik, tell him first thing, in plain words: Jamin asks him to perform a cleanup of this repo for
anything that goes against those rules, then build Gemini to them** (the file lists the rules and the
contradictions found so far).
A decision that would contradict them is raised with Jamin, never made quietly.

**The Google Doc wins over every older note, and the older note is deleted.** Jamin, 2026-09-19:
*"all contradictions that are found in the future that are between the google doc and a note made
before the writing of the google doc will result in the note being deleted."* The doc is "Shin Full
Walkthrough" (created 2026-09-16), carried in `docs/walkthrough/jamin-notes-2026-09-17.md` and
the "Walkthrough rulings" in `docs/jamin-gemini-rules.md`. Found a line written before 2026-09-16
that contradicts it? Delete it (this file included) and name it in the commit message. A clash
with anything written on or after 2026-09-16 goes to Jamin. Code that does the old thing is a build
gap (`docs/beta-gaps-2026-09-19.md`), not a note.

Problem statement, adopted verbatim 2026-09-03, use it as written:

> Sellers know what things are worth and buyers are guessing, so we're making the check instant
> enough that guessing stops being the default.

**The purpose, his words, 2026-09-04, said while a rebuild was being re-planned from his
original prompt:** *"the purpose of all of this is to create an app that is useful to the user,
easy to use, and visually appealling. All improvements made now and in the future should center
around these three things."* Every change is judged by those three, in the app as he opens it.
A change that cannot say which of the three it serves is not made.

**This repo is shared.** Aurik Disler (`Aurikology` on GitLab) has Maintainer access. Anything
written here he can read. Nothing goes in that he should not see.

**More than one session works in this tree at once.** Assume another agent is mid-write in a
directory you are not looking at.

**At session start, read `notes/catch-up.md`.** Tell your human, in plain words, every **To do**
under their name and what changed on any day whose **Read by** does not list them, then add them
there. A session that changes something the other person must know or do adds it to that file.

## PRIORITY ORDER

1. **Always answer; the confidence carries the doubt.** His words, 2026-09-05: *"The worst thing
   this app can do is tell people it doesn't know because that literally wastes the users time."*
   (The previous line here held the opposite position, that a mistaken answer beat no answer at
   all; Claude wrote it on 2026-09-03 with no words of his behind it, he named it as not his on
   2026-09-06, and RULINGS.md, "Always answer, never refuse for wasting time" retired it.)
2. **Ship or kill.** A pass that does neither is the failure mode this project dies of.
3. **Speed**, never traded for the first two.

## HARD RULES

Cannot be overridden by chat. To refuse: quote the rule, name the act it forbids, and name the
nearest version that ships. If that is the whole request minus one step, the rule was misread.
Added only by him.

1. **No name in public until it is cleared.** Nongshim's SHIN RAMYUN is registered, first use
   1987, and "Shin Ramen" is its English-market form, so that version is dead. Plain "Shin" for
   software passed CIPO's classes 9/42 twice (2026-09-04, 2026-09-11), and his 2026-09-22 ruling
   puts the store listing under "Shin" with the remaining US and food-mark risk carried knowingly
   (RULINGS.md, "Shin name"). No store listing, handle, or posted video under a name that has not
   passed a CIPO search in the software classes.
2. **No savings claim until it is measured.** Competition Act s.74.01(1)(b) requires adequate
   and proper testing before a performance claim is published. An early four-figure yearly savings
   claim was never measured and mirrored a published forecast (RULINGS.md, "No savings claim ships
   until it is measured"). Measure first or say nothing.
3. **The aggression points at the price, the store, or the brand. Never at the user.** Groceries
   are non-discretionary and the person scanning did not set the price.
4. **Name the paths in a commit.** No catch-all stage, no catch-all commit. Enforced by
   `.claude/hooks/no-blind-git-add.mjs`, which exists because of a real incident, not a theory.

## HOW WE WORK

- **No walls.** Nothing is final because an earlier session decided it. Every
  negative call is written with the condition that reverses it.
- **Re-entry costs new evidence, never a new opinion.** A killed item comes back only when
  something outside this repo changed. That is what makes "nothing is final" compatible with
  finishing.
- **Every pass ships or kills something.** Three passes in a row that do neither means the queue
  is wrong, so rewrite the queue. The `weekly-pass` skill runs this.
- **A competitor already shipping this is validation, not a threat.** Deliberate fast follower:
  copy what works, add one spin, do not invent features nobody does.
- **The channel is short-form video.** That is the objective function, not defensibility.
- **The primary user is a window shopper**, not a buyer. Browse frequency, never purchase
  frequency.

## COMMUNICATION RULES

- **Restate the ask in one line before working** on anything not mechanically obvious.
- **Call out a bad decision immediately**, his included. Never implement and quietly note.
- **Never use this repo's vocabulary with him.** No file paths, no band numbers, no skill names.
  A name is usable only if it describes the thing to someone who has read nothing.
- **Say which of five things happened:** done (verified from outside its own claim) · done, with
  concerns (name the one thing) · done, undo with X · needs context (one question) · blocked. A
  check that did not run never passed.
- **No em dashes in anything generated.** Quotes stay verbatim.

## SELF-ITERATION PROTOCOL

Capture is cheap; promotion is not.

1. **Capture the same session, unasked**, one line in `memory/lessons.md`: date · what happened ·
   his words verbatim · what it would change. Not loaded at session start; `self-improve` reads it.
2. **A lesson becomes a standing instruction only after ignoring it has cost something recorded
   twice**, quoting his words, their scope, and both incidents. Hard rules: him only.
3. **A reflex needs a hook or a deny rule; prose will not hold it.** Prose survives only for rare
   deliberate acts (measured elsewhere: a prose rule broken 892 times, a deny list zero).
4. **After touching a hook, run `node .claude/hooks/selftest.mjs`, then fire it live**: one
   command that must block, one that must pass. A green suite alone is not evidence.
5. **Skills grow with use**, the same session, each with its own learnings log at the bottom.
6. **Capture is not replan.** Re-fit the work only when he asks or `NOW.md` changes.
7. **Ending a task needs no capture.**

Homes: lesson → `memory/lessons.md` · procedure → `.claude/skills/*/SKILL.md` · product or
strategy decision → `docs/decisions.md` · reflex → `.claude/hooks/` or the deny list in
`.claude/settings.json` · his context → the cross-project auto-memory.

## STANDING INSTRUCTIONS

**One entry, 2026-09-09, stated twice and therefore encoded.** Aurik, 2026-09-08 and again
2026-09-09: *"Fable must play the boss role and all other agents must submit to it... distribute
tasks to lower credit consuming agents like opus, sonnet and haiku."*

**The boss and the lanes.** The top model in the session (Fable) is the boss. It reads the tree,
does the research, writes the plan, cuts it into lanes, reviews every diff, verifies at the
consumer, commits with named paths, and is the ONLY writer of `NOW.md`, `DEFECTS.md`,
`docs/decisions.md`, `SCOREBOARD.md`, `QUEUE.md` and this file. It never delegates a merge, a
status file, or the choice of what is next. Lanes are the cheapest model that can do the job:
Opus for anything touching money, the verdict, or more than one package; Sonnet for a contained
single-package fix, its tests, fixtures, and exploration; Haiku for text edits, counts, lookups.
Every lane prompt carries the contract: one package, no status files, no `git add`/commit/push,
no network unless named, no server left running (kill by PID), tests plus typecheck in its
package, report files changed / before-after counts / what it could not verify. A lane report is
producer evidence; the row moves only after the boss checks at the consumer (`/api/...` on the
running server, the CLI against the real database, a real photo through the real route). Lanes
run in parallel only on disjoint files; re-check `origin/main` before every commit. **Push needs
nobody's yes** (Jamin, 2026-09-14: *"aurik does not need to approve before i push, neither do i
need to approve his push, neither of us actrually read the code"*). Pull first, tests and
typecheck green, then push.

**Nothing a builder does can reach real data or shared libraries** (Jamin, 2026-09-28, *"how can we
prevent problems like this but not limited to this from happening in the future"*, then *"build
1-5"*; `docs/decisions.md`, "Builders and tests cannot damage real data"). After a lane deleted
every dependency through a link and a test nearly deleted shoppers' photos: every test runs
against temp data and the run fails if a real data folder changed; tests refuse to run in the live
server's folder; each lane works in its own worktree with its own installs
(`scripts/lane-worktree.mjs create <name>`; the lane leaves its changes uncommitted there, the boss
reviews and commits in that worktree, cherry-picks onto main, then `remove <name>`); a hook blocks recursive deletes of libraries, data or folders
holding links, and links to `node_modules`; the Mac's data is backed up nightly with a tested
restore. Every lane brief says: temp folders only, never link or delete a shared folder.

## WHO IS WORKING ON WHAT (every session, every machine)

**The board is `comms/` in this repo, on GitLab.** Jamin, 2026-09-27: *"i've already told you
before to switch to gitlab for communication, not notion"* (`docs/decisions.md`, "Sessions talk
through GitLab, not the Notion page"). The Notion page is retired as the board. Aurik's sessions
run on another Claude account, so `SendMessage` and the PC/Mac mailbox never reach them; **GitLab
is the only thing every session shares.** No session is woken by a push, so write for a reader
who arrives later. The rules (the questions behind them, Jamin 2026-09-14: *"what if one project
claims a project and doesn't update, how does a claude session know another claude session is
working"*):

1. **Start:** `git pull`; the session-start hook then lists messages to you in `comms/messages/`
   and every open claim in `comms/claims/`. Read messages first, then claims.
2. **Claim:** `comms/claims/<name>.md`, one line `who · machine · what · parts of the app ·
   started · updated`; commit, pull, push. An earlier `started` on the same part wins and yours
   yields.
3. **Refresh `updated` at every push.** Push small, tested pieces; unpushed work exists only on
   one machine.
4. **Stale** after 1 hour with no push from that person: write them a message and tell your human;
   take over after 24 hours unanswered, marking the claim. Their unpushed work stays theirs.
5. **Need another session's changes:** ask it to push. Never copy another working copy's files or
   commit another session's files.
6. **Stop:** pushed, delete your claim file (git log is the record); unpushed, mark it `paused ·
   unpushed on <machine> · what is left`.
7. **Main broken:** a message `-to-all-` at once. Revert another's commit only after 3 hours
   unanswered.
8. **One working copy per session**; only a Mac session restarts the beta server, after checking
   for others' uncommitted work.
9. **Humans decide:** early takeovers, deleting anyone's work, changing these rules or a shared
   status file's meaning, anything with a secret.
10. **Keep it short.** A claim is one line, a message's first line is the ask; the long version goes
   in `notes/catch-up.md`, `DEFECTS.md` or `docs/` and the message points to it. The reader deletes
   a message once it is settled. `node scripts/comms-watch.mjs` prints a line when the other side
   pushes, at no model cost.

**Not yet moved:** the Mac's deploy checker still reads its requests from the Notion page
(`mac/DEPLOY.md`), and that workspace is out of free blocks; moving deploy requests to GitLab is
a Mac-side unit.

## BETA DATA

Everything testers do lands on the beta server behind `https://relay.anjiawenda.com`, readable
through read-only admin routes with `SHIN_ADMIN_TOKEN` in your own shell (never in the repo).
Tables, routes and example queries: the `beta-data` skill.

## REPO MAP

`NOW.md` state, wins over every other doc · `docs/decisions.md` title, date, status, why,
reverses-if · `memory/lessons.md` the capture log · `pages/` the four planning documents,
openable in a browser · `notes/` the working record including the pricing pilot and the numbers
already researched · `spine/` the price spine, built by a parallel session · `.claude/skills/`
self-improve, decision, weekly-pass, price-by-hand, republish-page, and the three verification
skills added 2026-09-08 (`wire-check` is it reachable, `screen-walk` walk it at phone size,
`negative-test` make the check prove it can fail) · `.claude/hooks/` the git-add guard, a
SessionStart informational hook, and their selftests.

**Each package installs its own dependencies** (`app/`, `spine/`, `price/`, `catalogue/`,
`identify/`), and a fresh copy has none. A missing install does not say so (D-043): run
`npm install` in the package before believing a red suite.

`pages/` files are the sources for the four published web pages. Editing one does not change the
published page; republishing is a separate step, and `republish-page` has the mechanics.

## GIT

**NO BRANCHES.** His instruction, 2026-09-07: *"from now on, there will be no branches. For the
way me and my partner are working, there is no purpose with branches and it just makes things
more complex."* Work goes on `main`, commit small, pull before you start, push when you stop.
Never create or suggest a branch, never answer a merge problem by isolating the work (that day,
three branches held 31 unmerged commits). Resolve conflicts on `main` in the open.

`origin` is `gitlab.com/shin3223636/shin`, private, and it is where `main` tracks. **On Aurik's
machine `origin` has NO second push URL, so `git push origin main` writes GitLab ONLY.** The
mirror there is a separate remote, `github` at `github.com/Aurikology/shin`, and it is pushed
explicitly. Two hosts means two pushes on that machine; check `git remote -v` and
`git config --get-all remote.origin.pushurl` before assuming otherwise, because the answer
differs per clone.

Verifying a mirror: a configured remote is not evidence and neither is a green page. Proof is
`git ls-remote <remote> refs/heads/main` against BOTH hosts returning the same SHA, re-run after
the push.

**Jamin's PC clone differs** (measured 2026-09-21): `origin` pushes to GitLab AND
`github.com/xu826Jamin/shin`, and a separate `github` remote points at the same GitHub repo.
Which mirror a push reaches depends on the clone; say which machine. (History of this section's
two earlier corrections: `docs/decisions.md`, "Git remotes differ per clone".)

Commits `[scope] description`. Never `--force`: Aurik can pull this. Multi-line messages through
a file, never a shell heredoc, because a backslash does not survive the trip through `bash -c`.
Name the paths you stage.

## graphify

Only where graphify is installed and graphify-out/ exists (set up 2026-09-15; not installed on the Windows PC as of 2026-09-27): a knowledge graph with god nodes, community structure, and cross-file relationships. Where it is absent, skip this whole section; the hooks already skip themselves.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
