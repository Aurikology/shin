---
name: beta-data
description: Read what beta testers did (scans, events, ratings, who came through which invite link, request log, shutter captures, photos) from any machine, through the read-only admin routes on the beta server. Use whenever a question needs real tester data rather than a guess.
---

# beta-data

Moved out of CLAUDE.md on 2026-09-21, unchanged, so the instruction file only carries what every
session needs.

The beta server runs on Jamin's worker Mac behind `https://relay.anjiawenda.com`. Everything
testers do lands there: `scans.db` (tables `scan`, `event`, ratings, consent), `people.db`
(`device_person`: which device came through whose invite link, `jamin` / `aurik` / `family`),
`access.log` (every request, with `who`), `shutter/<press id>/` (the full camera frame and every
request and answer that press caused), and photos. Read it through the read-only admin routes
with the token in your own shell as `SHIN_ADMIN_TOKEN` (never in the repo, never in a commit):

```
H="x-shin-admin: $SHIN_ADMIN_TOKEN"; B=https://relay.anjiawenda.com/api/admin
curl -s -H "$H" $B/tables                                   # every table and column
curl -s -H "$H" $B/sql --data "SELECT * FROM scan ORDER BY id DESC LIMIT 20"
curl -s -H "$H" $B/sql --data "SELECT s.*, p.person FROM scan s LEFT JOIN people.device_person p USING (device_id)"
curl -s -H "$H" $B/people                                   # device -> person
curl -s -H "$H" "$B/access?since=2026-09-14T00:00&limit=200"
curl -s -H "$H" $B/shutter?limit=20                         # presses, newest first
curl -s -H "$H" "$B/file?path=shutter/<id>/frame.jpg" -o frame.jpg
```

The SQL route opens the database read-only; writes fail in SQLite. Up to 5,000 rows per query.
Code: `app/src/admin.ts`. Named links: `SHIN_INVITES` in `mac/config.env` on the Mac.
