---
name: decision
description: Write a decision into docs/decisions.md in the form this project requires, including the condition that reverses it. Use whenever something is chosen, killed, or parked, and whenever a past decision is being revisited.
---

# decision

`docs/decisions.md` is the record. Newest last. **A decision here is not a wall.** The only walls
in this project are legal ones.

## The form

```
## <Title, describing the thing to someone who has read nothing>
**Date:** YYYY-MM-DD · **Status:** active | superseded | reversed

<Why. The evidence, not the feeling. Where a number appears, where it came from.>

**Reverses if:** <the condition, outside this repo, that would make this wrong>
```

## Rules

1. **The reversing condition is mandatory and it must be falsifiable.** "Reverses if we learn
   more" is not a condition. "Reverses if a trademark search clears the software classes" is. If
   you cannot write one, you do not have a decision, you have a preference, and it does not go in
   this file.
2. **The title describes the thing, not a code.** No identifiers, no band numbers. He will never
   open this file, and anything read to him has to survive being said out loud.
3. **Kills go in here too**, and they are the more valuable half. A killed item with no reversing
   condition cannot be revisited safely, so it will be revisited unsafely.
4. **Parked is a real state and needs a promoting condition**, written the same way. Parked
   without one is just killed with extra hope.
5. **Revisiting is re-derivation, never citation.** When a past decision comes up again, do not
   cite it and stop. Check whether its reversing condition has fired. If it has, write a new
   entry that supersedes it and mark the old one superseded. If it has not, say which condition
   is still unmet, because that is the answer he can act on.
6. **Re-entry costs new evidence, never a new opinion.** Wanting something again is not evidence
   that it changed.
7. **No unsourced number.** A figure without a source is an assumption and must be labelled one.

## When a decision is really a hard rule

If it constrains what may be published or shipped for legal reasons, it is a hard rule and only
he adds those. Write it as a decision, then tell him in one line that it looks like a rule and
let him make the call.

## Learnings log

- 2026-09-03 — Created with the repo, seeded with eleven decisions from the 2026-09-03 session.
  Rule 5 exists because "nothing is final" and "we already decided this" are the two ways this
  file can fail, and citation is the second one.
