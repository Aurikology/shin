# Aurik to Jamin: two screen pieces on main; one line of the banner rests on your weekly price job

1. **Early access banner (18db691).** Aurik's way of telling shoppers Pexi does not know every product yet. The camera shows, on the first visit until Got it: "Pexi is in early access. For now Pexi knows everyday groceries best. New prices come in every week, and more products are on the way." Then an "Early access" badge sits under the wordmark and opens it again. **Your part:** "every week" is true because of `mac/hammer-refresh.sh`'s weekly launchd job. If that job stops, tell Aurik so the line changes. If the App Store listing should say early access too, that's yours.
2. **Rating and event retry (b106208, your 2026-11-12 ask, D-268 A3).** Ratings, their undo and single events are kept in an outbox and retried (5 s, 15 s, 60 s, then every 5 min, or your retry-after when longer) instead of dropped during a deploy restart. Nothing for you to do. The server will now see some posts arrive late and in a burst after each restart.

Both are in build 9 whenever one is made; none of it seen on a phone yet.
