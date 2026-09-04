# Trademark search on "Shin", Canadian register, 2026-09-04

The search hard rule 1 in `CLAUDE.md` asks for, run against the Canadian Trademarks Database
(database dated 2026-09-02). This is a search record, not legal advice; nobody here is a lawyer.
The name is his call, and the plan already says trademark exposure is a risk carried, not a
search result.

## What was searched, re-runnable

Two queries, both read in full (every result row, not a sample).

1. Trademark text contains the word "shin", all classes, all statuses. **57 results.**
   `https://ised-isde.canada.ca/cipo/trademark-search/srch?lang=eng&payload=` with
   `searchfield1=tm`, `textfield1=shin`.
2. The database's own "TM lookup" on "shin", which also returns prefix and sound-alike marks
   (SHINCO, SHINDIGZ, GENSHIN, SHINTANI). **151 results, 94 live** (not expunged, abandoned,
   withdrawn, cancelled or refused). Same URL with `searchfield1=tmlookup_ext`, page length
   set to 1000 so all 151 were on one page.

The Nice-class filter in the URL payload did not narrow the first query (results in class 25
and 30 still came back), so classes were read off every row instead of trusted from the filter.

## Findings

**No live mark is the plain word SHIN, in any class.** The closest, "shin to shin", is a
class 25 clothing mark. Nongshim's live SHIN marks (SHIN RAMYUN & DESIGN 0601960, NONG SHIM
SHIN CUP 1099132, SHIN CUP 1096419, SHIN & Chinese & Korean Characters 1096418) are all
**class 30 only**, instant noodles. None touches 9, 35 or 42.

**Live marks in the software classes (9, 35, 42) that contain "shin" as a word of their own:**

| Application | Mark | Status | Classes | What it is |
|---|---|---|---|---|
| 2059085 | SHIN MEGAMI TENSEI | Registered | 9, 41 | Video game series (Atlus). Two sibling marks, 2059084 and 2324934, same classes. |
| 2274426 | u-shin | Registered, design | 6, 7, 9, 11, 12 | Automotive locks and access systems. |
| 1756075 | Sensei Masaru Shintani & Design | Registered | 9, 14, 16, 18, 25, 26, 27, 28, 35, 41, 42 | Karate organisation; "Shintani" is a surname, not "Shin". |
| 0599850 | SHIN-ETSU & DESIGN | Registered | 1, 2, 4, 5, 6, 9, 10, 17 | Chemicals and silicone maker. |

The remaining live 9/35/42 hits are prefix or sound-alike compounds where "shin" is not a
separate word: SHINRA Logo (9), SHINDENGEN x4 (7, 9, 11), SHINDIGGER x2 (9, 42), SHINDIGZ
(35, 42), Shinco (9), SHINPO DESIGN (9), ShinPonSol (9), Shinwin & design (7, 9, 12, 35, 42),
SHINSEKAI Into the Depths (9, 41), GENSHIN IMPACT x2 (9, 42), SHINMACS, SHINCOM and SHINPADS
(advertised, all 45 classes, one applicant), SHIN YEH & Design (17, 35, 43, a restaurant),
plus five design marks whose text is Chinese characters or geometry and matched on
transliteration only.

**Nothing found in class 42 that is "Shin" alone or "Shin" plus a price or shopping word.** No
live mark pairs "shin" with price, scan, deal, shop, or grocery in any class.

## What this does and does not clear

- It clears the narrow question the hard rule asks: there is no registered or pending SHIN
  mark in the software classes in Canada.
- It does not clear the association with Nongshim. Their SHIN marks are food marks, and the
  app is pointed at grocery shelves where their product sits. Canada's Trademarks Act s.22
  (depreciation of goodwill) does not need the same class. Whether a price-scanner named Shin
  that shows a Nongshim noodle price is a problem is a judgment a trademark agent gives, not
  a database.
- It does not cover the United States or the app stores. The USPTO register and the Apple
  and Google store name checks were not run. If the app ships outside Canada, they are next.
- It does not cover unregistered use. A Canadian business trading as "Shin" without a
  registration would not appear here.

## Reverses if

A trademark agent reads s.22 the other way, or a USPTO or store search turns up a live
software mark that this register does not hold.
