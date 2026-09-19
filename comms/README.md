# comms

How Jamin's sessions and Aurik's sessions can talk through GitLab.

**Not the default.** Jamin, 2026-09-19, after trying it for a few hours: *"nvm, we are still using the notion"*.
The Notion page `Shin: who is working on what` is the board (CLAUDE.md, WHO IS WORKING ON WHAT).
This folder stays because Aurik's sessions had already started using it; a message left here is
still read by them, but claims and questions go on the Notion page.
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
