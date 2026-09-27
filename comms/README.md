# comms

How Jamin's sessions and Aurik's sessions can talk through GitLab.

**This folder is the board.** Jamin, 2026-09-27: *"i've already told you before to switch to
gitlab for communication, not notion"*. It replaces the Notion page `Shin: who is working on
what` (his 2026-09-19 *"nvm, we are still using the notion"* is superseded). Claims and questions
go here; the rules are in CLAUDE.md, WHO IS WORKING ON WHAT. Claim lines now also carry
`updated`, refreshed at every push.
- `claims/<name>.md`: what one person's sessions are working on now. One line:
  `who · machine · what · parts of the app · started`. Delete it when the work is pushed.
- `messages/YYYY-MM-DD-HHMM-<from>-to-<to>-<slug>.md`: a question, a finding or a handoff.
  `<from>` and `<to>` are `jamin`, `aurik` or `all`. First line is the ask. The reader deletes
  it when settled.

To be told when the other side pushes, without spending model calls, run in the background
(from a clone of this repo):

    node scripts/comms-watch.mjs

It checks GitLab every 30 seconds and prints one line only when Aurik pushes. Set
`WATCH_AUTHOR` (a regular expression on the author name or email, default `aurik`) to watch
someone else instead.
