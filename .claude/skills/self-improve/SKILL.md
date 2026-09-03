---
name: self-improve
description: Capture what this session learned into its permanent home. Run immediately when he corrects something, repeats an instruction, or says "remember this", and at the end of any non-trivial task. The enforcement arm of CLAUDE.md's Self-Iteration Protocol.
---

# self-improve

## When to run

- He gave a correction or an instruction that could apply again → **immediately, same turn**.
  Do not wait for the end of the session; long sessions are where captures get skipped.
- End of any non-trivial task → the reflection checklist below.
- He says "remember this" or "from now on".

## Procedure

1. **Identify each learning.** A correction, an instruction given twice, a convention that
   solidified, a mistake worth preventing, a missing skill.

2. **Sweep the silent re-asks, not just the complaints.** The corrections that matter most are
   the ones he did not think were worth a sentence: he asked, the answer missed, he asked again
   in blunter words. Three shapes recur and each routes differently:
   - **"tell me what this prompt is asking for"** → a question was answered that he had not
     asked. The capture is a procedure, so it goes in a skill, not in CLAUDE.md.
   - **He restates his own request in shorter words** → over-elaboration or an answer around the
     ask. This is a disposition, not an act, and prose will not hold it. Build a check or record
     it as unenforced. Do not re-encode it as another paragraph.
   - **He asks the same question in plainer language** → register, not content. Goes to his
     cross-project context, not here.

3. **Ask whether the learning has a mechanical trigger BEFORE writing prose.** A rule that gates
   a reflex, meaning something about how a command gets typed or a file gets touched, needs a
   hook or a deny rule. A rule that gates a rare deliberate act can survive as prose. Measured in
   his other repo: a prose rule was violated 892 times with the violation rate rising 82% after
   the rule was written, while a path deny list took 14 attempts and let zero through. Homes are
   `.claude/hooks/*.mjs` for anything checkable on a tool call, and `permissions.deny` in
   `.claude/settings.json` for anything expressible as a path.

4. **If you touch a hook: run `node .claude/hooks/selftest.mjs`, then fire it live the same
   session.** One command that must be blocked, one that must pass. Not optional and not
   replaceable by more selftest cases: a suite once read 39/39 green while the hook it covered
   was wrongly blocking legitimate work, because the failing case was not in the suite. Add the
   live case to the selftest once it has fired, so the suite grows from what happened.

5. **Route it.**

   | What it is | Where it goes |
   |---|---|
   | Something that went wrong, first time | `memory/lessons.md` |
   | Something that went wrong, second time, with a cost | `CLAUDE.md` → STANDING INSTRUCTIONS, quoting his words and citing both incidents |
   | A reflex | a hook, or the deny list |
   | Procedural know-how | the relevant `.claude/skills/*/SKILL.md` |
   | A product or strategy call | `docs/decisions.md`, with its reversing condition |
   | Something true of him across projects | the cross-project auto-memory |
   | A hard rule | him only. Never add one. |

6. **Dedupe first.** Search the target for existing coverage and update it rather than appending
   a near-duplicate. Delete entries that turned out wrong.

7. **Confirm in one line per learning**: what was captured and where, in words that mean
   something to someone who has read none of these files. If nothing was worth capturing, say
   nothing. An empty capture is a legitimate ending; performing the ritual is worse than skipping
   it, because it fills the standing list with rules nothing earned.

## Reflection checklist

- Did he correct me or re-explain something? → capture.
- Did he ask for the same thing twice without complaining? → that is the correction he did not
  think was worth a sentence. It counts double, not half.
- Did I redo work or re-derive context an earlier session already had? → that session failed to
  capture. Fix it now.
- Did a convention solidify? → into the relevant skill.
- Are the repo map and skills list in `CLAUDE.md` still accurate after my changes? → sync them.

## Quality bar

Written so a session with zero context can act on it: the why included, dated, his words
verbatim where they exist, one learning per entry. An entry without a why is a rule nobody can
apply or retire.

## Learnings log

- 2026-09-03 — Created with the repo. Adapted from ACT's `self-improve`, with the promotion bar
  from the agent repo's audit added at step 3 and step 5, because ACT's version captures without
  a bar and generated 28 standing instructions in 22 days.
