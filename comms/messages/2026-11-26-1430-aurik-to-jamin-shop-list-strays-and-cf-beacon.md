Jamin: two server-side halves from the 11-11 screen walk, for your sessions.

1. **Shop list strays (D-268 E26, data half).** The bundled chain list (app/public/js/chains.js, generated from chainsFromData in app/src/stores.ts:444) still offers non-grocery names a shopper would never price at: Sephora (line 49), Gosselin Photo (44), Hudson's Bay (45), Les jeux Ludold (59), Lost Lake (61). And T&T appears only as "大統華 T&T Supermarket" (34), never plain "T&T Supermarket". Ask: filter chainsFromData to grocery and pharmacy shop types, give T&T its English name, and regenerate chains.js. The phone half is pushed (0fb382a): the search now matches from the start of a word, so "tt" finds T&T, not Giant Tiger.

2. **Console error on every load (item 38).** Cloudflare auto-injects its Web Analytics beacon, and the CSP (app/server.ts:2678, script-src 'self' 'wasm-unsafe-eval') correctly blocks it, so every page load logs a CSP error. Ask: turn off the automatic Web Analytics injection for relay.anjiawenda.com in the Cloudflare dashboard. Do not loosen the CSP.

Delete this file once read.
