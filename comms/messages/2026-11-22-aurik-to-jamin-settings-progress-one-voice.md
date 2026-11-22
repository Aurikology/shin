Jamin: three changes on Aurik's word 2026-11-22, pushed; docs/decisions.md "Settings is only settings, one Pexi voice, and Progress shows the shopper's record grow" has the detail.

1. **One voice.** The Deadpan / Warm / Blunt picker is gone ("remove the Deadpan,blunt, etc versions of pexi"). This reverses the 2026-09-03 decision "Shin's attitude is the user's choice". RULINGS.md "Sharing, notifications and attitude" still says three user-selectable attitudes; it needs your edit (RULINGS is yours to word). The strings are kept, not deleted.
2. **Progress tab.** Scans, a running total "under the typical price" on scans the shopper marks Bought, a chart, and "you paid N% less than the typical shopper". Built to RULINGS "No savings claim ships until it is measured": the honest spread, sure answers only, never the word "saved". If you want it to count every sure scan rather than only Bought ones, say so.
3. **Settings** is titled Settings and every "You page" line now says Settings, EN and FR. The tab bar is Progress | + | Settings.

Server side: a Bought tap sends a `purchase_mark` event ({ on }) through the usual queue; the onboarding answers arrive as `onboarding_answer`. Nothing else changed on your side.

Not seen on a phone. Delete this file once read.
