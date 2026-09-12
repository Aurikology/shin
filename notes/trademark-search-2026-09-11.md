# Trademark search on "Shin", Canadian and US registers, 2026-09-11

Successor to `notes/trademark-search-2026-09-04.md`. That file did the Canadian search in full
and said the US register and the store name checks were not run yet. This file: (1) re-confirms
the Canadian result against a newer database snapshot, (2) runs the US register, which was the
open gap. This is a search record, not legal advice; nobody here is a lawyer. The name is the
founder's call.

## Which of the 2026-09-04 conclusions still stand

**All of them, re-verified against the 2026-09-09 database (five days newer than the 09-02
snapshot that file used).** Re-ran the same query it used, Trademark field contains "shin",
all classes, all statuses:
`https://ised-isde.canada.ca/cipo/trademark-search/srch?payload=%7B%22domIntlFilter%22%3A%221%22%2C%22searchfield1%22%3A%22tm%22%2C%22textfield1%22%3A%22shin%22%2C%22display%22%3A%22list%22%2C%22maxReturn%22%3A%221000%22%2C%22nicetextfield1%22%3Anull%2C%22cipotextfield1%22%3Anull%7D`
Result: **57 hits, identical count to the 09-04 run.** No new "shin" mark was filed or changed
status in Canada in the intervening week. The 09-04 file's table (SHIN MEGAMI TENSEI in 9/41,
u-shin in 6/7/9/11/12, Sensei Masaru Shintani & Design, SHIN-ETSU & DESIGN) and its finding that
**no live Canadian mark is the plain word SHIN in any class, and none of the software-class hits
is "Shin" alone or "Shin" plus a price/shopping word**, stand unchanged. Nothing here reverses
or narrows that file; this file only adds the US side it had marked as not yet done.

The control the 09-04 file already established still holds: the same search returns Nongshim's
own live SHIN marks correctly (SHIN RAMYUN & DESIGN 0601960, class 30, REGISTERED), which proves
the search engine finds real hits, not just zeros.

## US register: USPTO Trademark Search (the successor to TESS; TESS itself has been retired and
now redirects to `tmsearch.uspto.gov`), 2026-09-11

Two queries, both read to completion, not sampled.

**1. Wordmark search "shin", all classes, all statuses.** 592 results. This confirms the search
engine works and finds known marks (SHIN-ETSU, SEGA's SHIN MEGAMI TENSEI series, Nongshim's own
dead SHIN'S NOODLES, serial 74728091, CANCELLED) before any class filter was applied, which is
this session's control query.
`https://tmsearch.uspto.gov/search/search-results` (query "shin", Wordmark field)

**2. Same query filtered to classes 009 and 042 (unioned, not coordinated-class expansion),
all statuses.** **80 results, read across both result pages.** URL used the class-filter UI on
the same search; classes selected individually with "Coordinated" off so the count is exactly
009 + 042, no adjacent classes pulled in.

Note on why the count is bigger than a literal substring match would give: USPTO's new search
tool matches on more than the literal wordmark string (it also pulls in owner-name matches and
phonetic/design-transliteration matches), which is why marks like "SC" (owner SHIN CHIN
INDUSTRIAL) or a blank-wordmark design mark that transliterates to "Shin" appear. That is a
feature for a clearance search, not noise: it is exactly the kind of near-miss a literal-only
search would produce a false negative on.

### Live hits in class 9 or 42 that touch the word "Shin" directly

| Serial / Reg | Mark | Status | Class | Owner | What it is | Source |
|---|---|---|---|---|---|---|
| 76602126 | SHIN MEGAMI TENSEI | LIVE, REGISTERED | 009 | SEGA CORPORATION (Japan) | Computer/video game software | tmsearch.uspto.gov, query "shin" |
| 79296312 / 88106758 / 79394757 | SHIN MEGAMI TENSEI NOCTURNE / LIBERATION / V VENGEANCE | LIVE, REGISTERED | 009 (+041) | SEGA CORPORATION | Same game series, sibling registrations | same |
| 75367162 / 87281616 / 75101586 / 98470357 (pending) | SHIN#ETSU / SHIN-ETSU QUARTZ / SHIN-ETSU INTER-CONNECTOR / (unnamed) | LIVE | 009 | Shin-Etsu Chemical Co. (Japan) | Semiconductor and lab equipment maker | same |
| 77978953 / 77978957 | SHIN CHAN | LIVE, REGISTERED | 009 (+014,024,025,026,028,041) | TV Asahi Corporation (Japan) | Anime character media | same |
| 75599961 | U-SHIN | LIVE, REGISTERED | 006, 009, 012 | U-SHIN LTD. (Japan) | Automotive locks | same |
| **90731118 / 98384979 (pending)** | **3D-SHIN** | LIVE | 010 (adjacent, not 9/42) | Terumo Kabushiki Kaisha | Surgical instruments | same, cross-checked, not counted in the 80 |
| Various (SHINMAX, SHINRAY, SHINLAND, SHINJU, SHINFLY, CATSHIN, GRINSHIN, SHINCOSMOS, SHINHERTECH, WELL SHIN) | compound marks | LIVE | 009 | Small Chinese/Taiwanese hardware makers | Cameras, cables, alarms, batteries, sensors | same |
| **88781740 / Reg. 6140486** | **(design mark, no literal word; disclaimed text: "the non-Latin characters that transliterate to 'SHIN'")** | **LIVE, REGISTERED** | **042** | Bazooka Inc. (Japan) | "Providing temporary use of a web-based software application that allows users to create, publish and/or take various tests and quizzes for a jokey diagnosis" (a quiz-app SaaS). Transliteration note on file: "the non-Latin characters in the mark transliterate to 'Shin' and this means 'diagnosis' in English." | tsdr.uspto.gov, serial 88781740, read in full (Mark Information + Goods and Services sections) |
| **85430441 / Reg. 5082432** | **(design mark: five colored circles around a kanji character; disclaimed/transliteration: "SHIN," meaning "HEART")** | **LIVE, REGISTERED** (Sections 8 and 15 combined declaration accepted 2023-05-17, i.e. incontestable) | **042 (+045)** | Colgan, Michael A. (individual, USA) | "Providing online, non-downloadable computer application software... for understanding, evaluating, reviewing, rating, and networking about people, businesses, and products" plus related groupware/database/multimedia software | tsdr.uspto.gov, serial 85430441, read in full |

### Dead hits worth naming (no longer a bar, but named because a rename search should not silently drop them)

- 77005750 SHIN (bare word), class 008, CANCELLED, Seattle Tool Corp.
- 77005827 SHIN (bare word), class 006, CANCELLED, Seattle Tool Corp.
- 85875351 SHIN (bare word), class 044, CANCELLED, Shin An LLC
- 90836907 SHIN (bare word), class 035, ABANDONED, Shed Holdings LLC
- 74728091 SHIN'S NOODLES, class 030, CANCELLED, Nong Shim Co. (Nongshim's own dead US filing,
  consistent with the 09-04 file's "Shin Ramen is dead" note, now confirmed on the US side too)
- 75798407 / 75139662 SHIN YEH, class 042, CANCELLED, restaurant operator

**No bare "SHIN" mark exists in US class 9 or 42, live or dead.** The only bare-word "SHIN"
registrations found anywhere are in classes 6, 8, 35 and 44, all dead.

## Verdict: at risk, not dead, not clear

Plain "Shin" for a price-scanning app (software, class 9 for the app itself and/or 42 for the
hosted service) is **not blocked by an identical live mark** in either register: nobody holds
"SHIN" alone, live, in a software class in Canada or the US. That much is clear.

It is **at risk, not clear**, for two separate reasons, one already known and one new:

1. **Known (carried from 09-04): Nongshim's SHIN food marks and s.22 goodwill-depreciation
   exposure.** Unchanged by this run.
2. **New, US-side: two live, registered US service marks in class 42 that legally mean or
   transliterate to "Shin," one of them incontestable, and one of them (Reg. 5082432) covers
   software for "evaluating, reviewing, rating... products," which sits close to what a
   price-verdict app does.** These are design marks, not the literal word "Shin," and a design
   mark's protection normally centers on the design, not an English rendering of a disclaimed
   foreign-character transliteration. Whether a US trademark examiner or Colgan/Bazooka would
   treat "Shin" (the English word) as confusingly similar to their Japanese-character marks in
   the same class is a judgment call a trademark attorney makes, not this search. It is a real
   fact on the register, not a maybe: I read it directly off the USPTO's own status page for
   each serial number, not a summary.

## What this does and does not clear

- Clears: no identical live "SHIN" wordmark exists in the software classes in Canada or the US.
- Does not clear: the Nongshim association (unchanged from 09-04).
- Does not clear: the two live US class-42 marks above; a US filing under "Shin" risks an
  office action citing one or both, or a dispute from either owner, and that risk was invisible
  to a literal-string-only search.
- Does not cover: the Apple App Store and Google Play name/handle checks (still not run; a
  store can reject or later force a rename independent of trademark law).
- Does not cover: unregistered ("common law") use of "Shin" in the US or Canada, which would
  not appear in either register.
- Does not decide the name. That is the founder's call per hard rule 1.

## Reverses if

A trademark agent reads the class-42 design-mark exposure differently than stated above, or a
store name check turns up a live conflict neither register holds.
