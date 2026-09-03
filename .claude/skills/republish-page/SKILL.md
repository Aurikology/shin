---
name: republish-page
description: Update one of the four published Shin planning pages without breaking its link or its look. Use whenever a plan changes, and before sending anyone a link. Editing a file in pages/ does not change the published page.
---

# republish-page

Four documents in `pages/` are the sources of four published web pages. **The file and the page
are not the same thing.** Editing the file changes nothing that anyone can see until it is
republished.

| File in `pages/` | What it is | Published page |
|---|---|---|
| `shin-terminating-loop.html` | the master plan, supersedes the two below | `.../25065389-42f1-4606-93f7-587c03999acd` |
| `shin-walkthrough.html` | thirteen stages, first scan to habit | `.../a313dd9a-67ed-4762-9b62-25f73f0d389b` |
| `shin-hard-dozen.html` | every build counted, the hard twelve | `.../5cdaea69-2566-427e-ae37-148250913a9e` |
| `shin-build-plan.html` | build order, folded into the master | `.../1ac26bc3-f67d-493f-9a17-9e4183441bac` |

Full links are in `README.md`.

## Procedure

1. **Read the published page before editing the file.** If it was changed anywhere else, your
   local file is behind, and republishing would silently discard that change.
2. **Edit the file in `pages/`.** Same path, always. The path is what identifies the page: a
   different path claims a new link, and the old link keeps serving the old content forever.
3. **Republish from that same path.** Do not pass a new title and do not pass a new icon. Both
   are how a reader finds the page again, and changing either makes it read as a different
   document.
4. **Do not restyle on a republish.** The design is fixed: hot pink accent `#E5165E`, Bricolage
   Grotesque for headings, Newsreader for body, IBM Plex Mono for code, and a three-state theme
   that follows the reader's light or dark setting. A redeploy that also redesigns is two changes
   and only one of them was asked for.
5. **Check it after.** Open the published page, not the file, and confirm the change is there.

## The trap

The master plan supersedes the build plan. When something changes in the build order, it changes
in the master plan, and the build-plan page is left as the historical version rather than edited
to agree. Two pages that disagree are worse than one page that is out of date, and the master
plan is the one that wins.

## Learnings log

- 2026-09-03 — Created with the repo. Step 1 exists because a page can be edited from outside
  this repo, and a republish over a newer version discards it with no warning.
