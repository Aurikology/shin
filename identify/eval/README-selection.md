# How the eval set was picked

Source of every answer: `catalogue/data/catalogue.db`, read-only, `node:sqlite` `DatabaseSync`.
Every code in `manifest.json` is a code that database holds, verified before its photograph was
fetched, and `run.ts`'s `checkAnswerKey` re-checks any row that still has no photo. That guard
exists because of D-096: the twenty original `tech` rows carried invented codes that looked like
data, and would all have scored `cascade_miss` by construction the day a photo landed.

The set is in two halves.

- **identify, 200 rows, 200 photos.** Name this code. Every row is a real catalogue row with a
  front-of-package photograph on disk.
- **refuse, 20 rows, no photos on purpose.** Name nothing. The twenty loose-produce slots carry
  `code: null` because loose produce has no barcode and no catalogue row, so photographing them
  as a retrieval test would ask a question with no right answer. They are the negative set.

Sizing, from `NOW.md`: at n=40 a 90% top-1 carries a 95% interval of roughly 77-97%, which cannot
tell 85% from 95%. 200 rows is what closes that gap enough to be worth spending a key on.

## The 40 grocery codes of 2026-09-13

Verified against `source = 'openfoodfacts' AND sold_in_canada = 1`.

Selection query pattern (run per bucket, then hand-picked from the results):

```sql
SELECT code, name, brands, quantity, size_value, size_unit, leaf_category, source, sold_in_canada
FROM product
WHERE source = 'openfoodfacts' AND sold_in_canada = 1
  AND ...bucket condition...
```

Buckets, 40 codes total:

- **6 size-pairs (12 codes)** - same `brands` + `name`, two different `size_value`s. Found with
  `GROUP BY brands, lower(trim(name)) HAVING count(*) >= 2`, then the two most different sizes of
  each product picked by hand: Heinz Tomato Ketchup, French's Tomato Ketchup, Cadbury Mini Eggs,
  Kellogg's Corn Flakes, Sprite Lemon-Lime Soda, General Mills Cinnamon Toast Crunch. This is the
  failure mode section 1 of `docs/the-photo-path.md` names explicitly: two boxes that look
  identical from the front and are two different catalogue rows.
- **4 store brands** - `brands LIKE '%<name>%'` for Selection, No Name, Great Value, Compliments,
  Kirkland, and PC/President's Choice; one pick kept from whichever names actually exist in this
  catalogue (all six do). One code each from No Name, Great Value, Compliments, Kirkland.
- **4 multipacks** - `name` or `quantity` matching `%x %` or `%pack%`, filtered by hand to real
  multipacks (Kashi bars, Danone Danette, Cheemo perogies, SunRype juice), discarding matches that
  were multipacks in name only (e.g. a single-serve bar whose *variety pack* sibling wasn't picked).
- **20 ordinary items** - one per leaf category, sampled across `en:honeys`, `en:hummus`,
  `en:breads`, `en:kombuchas`, `en:protein-powders`, `en:breakfast-cereals`, `en:potato-crisps`,
  `en:teas`, `en:biscuits`, `en:salad-dressings`, `en:confectioneries`, `en:peanuts`,
  `en:corn-chips`, `en:cheeses` (x2), `en:flours`, `en:crackers-appetizers`,
  `en:instant-noodles`, `en:yogurts`, `en:chickens` - each with `brands IS NOT NULL` and
  `size_value IS NOT NULL`, so every row carries a real brand and a real size.

## The 140 grocery codes of 2026-09-14

Same database, same `source = 'openfoodfacts' AND sold_in_canada = 1`, plus two conditions the
first forty did not carry: `name_fr IS NOT NULL` (every one of the 140 has a French name, which
is what a Canadian package actually prints) and a leaf category that is not fresh produce. Brands
containing a comma were skipped, because a row whose `brands` reads `C2G, legrand` makes the
answer key ambiguous about what a label read should return.

The 40 existing codes were excluded, and no code appears twice.

- **21 size-pairs (42 codes).** Same `brands` + lower-cased `name`, the smallest and largest
  distinct `size_value` of each group. Kikkoman Soy Sauce 15 ml against 296 ml, Quaker Quick Oats
  1 kg against 5.16 kg, Silk Almond 946 mL against 1.89 L, Haagen-Dazs Strawberry 450 mL against
  500 mL. The 500-against-450 pair is the hard case on purpose.
- **14 store brands.** Every one is Compliments, and that is a weakness in this half of the set,
  named here rather than hidden: the candidate ordering walks leaf categories rather than brands,
  and Compliments is the private label with by far the most Canadian rows carrying both a French
  name and a front photograph. The first forty still hold No Name, Great Value and Kirkland, so
  the set as a whole is not single-brand, but a future pass should draw store brands by brand.
- **14 multipacks.** `quantity` or `name` matching a real multiple: `5 x 40 g`, `6 sachets de 2`,
  `3x200ml`, `7 x 30 g`, KitKat Mega 2 bars.
- **70 ordinary items**, one per leaf category, each with a real `size_value`.

## The 20 tech codes of 2026-09-14 (D-096)

The twenty codes this file used to describe do not exist. All twenty were absent from the
212,340-row catalogue and from both Open Facts APIs, and each carried a plausible brand, name and
category, so nothing in the manifest suggested they were placeholders. They are replaced here.

The catalogue's tech rows come from Open Products Facts. Candidates were drawn by leaf category
(`en:iphone-smartphones`, `en:android-smartphones`, `en:laptops`, `en:tablet-computers`,
`en:televisions`, `en:keyboards`, `en:speakers`, `en:earphones`, `fr:appareil-photo`,
`fr:cable-vga`, `fr:camera-de-securite`, `en:usb-c-chargers`, `en:phone-cases`, `fr:chargeur`,
`fr:casque-audio`, `en:external-hard-drive`, `fr:ordinateur-de-velo`, `en:computers`,
`en:video-game-consoles`, `en:handheld-game-consoles` and others), filtered to rows carrying a
brand and a name, sorted `sold_in_canada` first, then probed one at a time against the Open
Products Facts API for a front image. 300 probed, 70 with a front image, 20 kept. Nine are
`sold_in_canada = 1`; Canadian coverage in Open Products Facts is much thinner than in Open Food
Facts, and that is the honest reason the share is lower here than in the grocery half.

The buckets are the same ones the first forty use, adapted to a shelf that has no litres:

- **5 look-alikes.** The size-pair idea where sizes do not exist: catalogue rows whose front
  packaging is nearly the same picture. Apple iPhone 7 / iPhone 8 / iPhone 13, three boxes that
  are a dark rectangle with a phone's back printed on it, and two separate rows for the Nintendo
  Switch 2 plus Mario Kart World bundle.
- **3 store brands.** Silvercrest (Lidl), Anko (Kmart), J.Burrows (Officeworks).
- **1 multipack.** Varta LCD plug charger, sold with four AA cells. Only one: the catalogue's
  battery multipacks either had no front photograph, or the image in the `front` slot was a
  warning-text panel.
- **11 ordinary items**, one per leaf category, six of them Canadian rows.

`size` is null on 19 of the 20, because Open Products Facts writes `quantity: "1"` for a single
unit and that is a count, not a size. The one exception is the Switch 2 bundle at 1732 g, which
is a real weight the catalogue parsed.

Every tech photograph was opened and looked at before it was kept. That check is not optional
here: eight of the first twenty downloads were back panels, warranty text, a shipping carton
label, or a bare phone on a bedspread rather than a package, and each was swapped for a different
product. Open Products Facts' `image_front_url` is frequently not a front.

## Photo quality

Every photo is Open Food Facts' or Open Products Facts' `image_front_url`, which is already the
400 px variant, so nothing needed downscaling: 200 photos come to 4.4 MB.

Checked by eye: all 20 tech photographs, and 12 of the 140 new grocery photographs sampled across
buckets. All 12 grocery samples were front-of-package. The other 128 were not opened, and the
risk they carry is the one the tech half proved real, a nutrition panel or a back label sitting
in the `front` slot. If a grocery row ever scores an unexplained miss, open its photo first.

## Image fetch notes

Open Food Facts' `world` API soft-throttled a fast pass at 500 ms/request on 2026-09-13: 16 of 40
codes came back "no product record" on the first pass. A slower retry at 1.2 s/request recovered
all 16, including the two codes a same-run fallback had already swapped out for backups; those
swaps were reverted once the originals proved fine, so the first 40 photos match this selection
with **no swaps**.

2026-09-14 hit the real limit rather than a soft one. At roughly one request per second the API
began answering `429 Too Many Requests`, and the run only finished because it reads `Retry-After`
and waits (30 s) rather than treating a 429 as a miss. Settled pacing was 1.5 s per request with
a `User-Agent` naming Shin and a contact address, which is what Open Food Facts asks for.
`/api/v2/search` with a comma-separated `code` filter would have cut 132 lookups to two, but it
answered `503` throughout and is rate-limited to 10 requests a minute anyway.

The image host has its own moods: one image (`0012511472313`) failed with a connect timeout
eleven times over several minutes while its 139 neighbours downloaded fine, then succeeded on the
twelfth. A single failure against `images.openfoodfacts.org` means nothing; retry it before
dropping a row.

## Licence and attribution

Open Food Facts and Open Products Facts photographs are licensed **CC BY-SA 3.0**
(https://creativecommons.org/licenses/by-sa/3.0/), contributed by those projects' contributors.
Re-publishing any of them outside this repository carries the attribution and share-alike terms
with it. Nothing in `identify/eval/photos/` is Shin's to relicense.

Every photograph, with the source it came from:

### Open Food Facts (2026-09-13), 40 photos
The first forty. Fetched from the `world` API by GTIN; no per-photo URL was recorded at the
time, and the file path is reconstructible from the code the same way every row below is.

### Open Food Facts (2026-09-14), 140 photos
Each line is `code  image path`, under `https://images.openfoodfacts.org/images/products/`.

```
0012511472313  001/251/147/2313/front_en.23.400.jpg
0012511474416  001/251/147/4416/front_en.15.400.jpg
0017082117274  001/708/211/7274/front_en.44.400.jpg
0017082707253  001/708/270/7253/front_en.30.400.jpg
0022314010117  002/231/401/0117/front_fr.20.400.jpg
0022314015174  002/231/401/5174/front_fr.43.400.jpg
0025293002180  002/529/300/2180/front_en.50.400.jpg
0025293001503  002/529/300/1503/front_en.158.400.jpg
0031200025715  003/120/002/5715/front_en.83.400.jpg
0031200445261  003/120/044/5261/front_en.26.400.jpg
0041390001109  004/139/000/1109/front_en.81.400.jpg
0041390001055  004/139/000/1055/front_en.95.400.jpg
0056200762163  005/620/076/2163/front_en.23.400.jpg
0041500007007  004/150/000/7007/front_en.53.400.jpg
0043646201288  004/364/620/1288/front_en.65.400.jpg
0043646242052  004/364/624/2052/front_en.27.400.jpg
0048001353664  004/800/135/3664/front_en.83.400.jpg
0048001213487  004/800/121/3487/front_en.105.400.jpg
0048500001554  004/850/000/1554/front_fr.3.400.jpg
0048500201633  004/850/020/1633/front_fr.4.400.jpg
0055000031318  005/500/003/1318/front_fr.59.400.jpg
0055000406529  005/500/040/6529/front_en.29.400.jpg
0055000205580  005/500/020/5580/front_en.9.400.jpg
0055000681834  005/500/068/1834/front_en.31.400.jpg
0055577101100  005/557/710/1100/front_en.85.400.jpg
0055577331002  005/557/733/1002/front_en.63.400.jpg
0055712100142  005/571/210/0142/front_en.67.400.jpg
0628154490203  062/815/449/0203/front_en.3.400.jpg
0055742366914  005/574/236/6914/front_en.13.400.jpg
0055742503807  005/574/250/3807/front_en.10.400.jpg
0055742539462  005/574/253/9462/front_en.17.400.jpg
0055742348378  005/574/234/8378/front_fr.13.400.jpg
0056200762170  005/620/076/2170/front_en.32.400.jpg
0056200824861  005/620/082/4861/front_fr.33.400.jpg
0056600782518  005/660/078/2518/front_en.30.400.jpg
0056600793743  005/660/079/3743/front_en.10.400.jpg
0056600793217  005/660/079/3217/front_en.54.400.jpg
0056600392229  005/660/039/2229/front_en.14.400.jpg
0056800162677  005/680/016/2677/front_fr.3.400.jpg
0056800250473  005/680/025/0473/front_en.35.400.jpg
0057000015992  005/700/001/5992/front_en.19.400.jpg
0057000036355  005/700/003/6355/front_en.16.400.jpg
0055742346022  005/574/234/6022/front_en.22.400.jpg
0055742356823  005/574/235/6823/front_fr.21.400.jpg
0055742357912  005/574/235/7912/front_fr.4.400.jpg
0055742358902  005/574/235/8902/front_en.25.400.jpg
0055742374025  005/574/237/4025/front_en.14.400.jpg
0055742507898  005/574/250/7898/front_fr.4.400.jpg
0055742509427  005/574/250/9427/front_en.17.400.jpg
0055742520774  005/574/252/0774/front_fr.17.400.jpg
0055742521153  005/574/252/1153/front_en.15.400.jpg
0055742522297  005/574/252/2297/front_en.40.400.jpg
0055742528381  005/574/252/8381/front_en.19.400.jpg
0055742528411  005/574/252/8411/front_en.16.400.jpg
0055742531299  005/574/253/1299/front_en.18.400.jpg
0055742536652  005/574/253/6652/front_fr.24.400.jpg
0018627102557  001/862/710/2557/front_en.83.400.jpg
0018627102571  001/862/710/2571/front_en.63.400.jpg
0018627104858  001/862/710/4858/front_en.83.400.jpg
0057000613280  005/700/061/3280/front_en.40.400.jpg
0059527651592  005/952/765/1592/front_en.16.400.jpg
0059800516419  005/980/051/6419/front_en.40.400.jpg
0060383105686  006/038/310/5686/front_en.58.400.jpg
0060383371609  006/038/337/1609/front_en.46.400.jpg
0063100479954  006/310/047/9954/front_fr.16.400.jpg
0063348005946  006/334/800/5946/front_fr.3.400.jpg
0063348006943  006/334/800/6943/front_en.28.400.jpg
0063667502010  006/366/750/2010/front_fr.17.400.jpg
0064042555744  006/404/255/5744/front_en.12.400.jpg
0064100111332  006/410/011/1332/front_fr.4.400.jpg
0064597009556  006/459/700/9556/front_fr.7.400.jpg
0009800800056  000/980/080/0056/front_en.141.400.jpg
0012009012168  001/200/901/2168/front_fr.8.400.jpg
0013087245950  001/308/724/5950/front_fr.4.400.jpg
0014100084761  001/410/008/4761/front_en.16.400.jpg
0014100170945  001/410/017/0945/front_en.23.400.jpg
0084253269254  008/425/326/9254/front_en.22.400.jpg
0016571951580  001/657/195/1580/front_en.29.400.jpg
0017082881656  001/708/288/1656/front_en.11.400.jpg
0018627100997  001/862/710/0997/front_en.13.400.jpg
0018627102601  001/862/710/2601/front_en.32.400.jpg
0018627597490  001/862/759/7490/front_en.65.400.jpg
0018627597513  001/862/759/7513/front_en.66.400.jpg
00109031  000/000/010/9031/front_fr.4.400.jpg
0021438002176  002/143/800/2176/front_fr.18.400.jpg
0021908509587  002/190/850/9587/front_en.19.400.jpg
0024463063075  002/446/306/3075/front_fr.10.400.jpg
0025293001008  002/529/300/1008/front_en.51.400.jpg
0025293001886  002/529/300/1886/front_en.95.400.jpg
0025293600713  002/529/360/0713/front_en.65.400.jpg
0025293600751  002/529/360/0751/front_en.57.400.jpg
0028029260168  002/802/926/0168/front_fr.4.400.jpg
00259255  000/000/025/9255/front_en.33.400.jpg
0030000012000  003/000/001/2000/front_en.172.400.jpg
0031146250301  003/114/625/0301/front_en.84.400.jpg
0031200043573  003/120/004/3573/front_fr.14.400.jpg
0031689326600  003/168/932/6600/front_en.11.400.jpg
03084953  000/000/308/4953/front_fr.17.400.jpg
0037466014630  003/746/601/4630/front_en.41.400.jpg
0037466018898  003/746/601/8898/front_en.38.400.jpg
0037466019871  003/746/601/9871/front_en.43.400.jpg
0037466022031  003/746/602/2031/front_fr.11.400.jpg
0037466038612  003/746/603/8612/front_en.41.400.jpg
0037466041339  003/746/604/1339/front_en.70.400.jpg
0037466064376  003/746/606/4376/front_en.53.400.jpg
0037466082714  003/746/608/2714/front_en.20.400.jpg
0039978305466  003/997/830/5466/front_fr.3.400.jpg
0040822027090  004/082/202/7090/front_en.13.400.jpg
0041138007004  004/113/800/7004/front_en.26.400.jpg
0041138007042  004/113/800/7042/front_en.3.400.jpg
0041143029336  004/114/302/9336/front_en.24.400.jpg
0041390050039  004/139/005/0039/front_fr.3.400.jpg
0042272000715  004/227/200/0715/front_en.46.400.jpg
0047495491555  004/749/549/1555/front_en.36.400.jpg
0048500001783  004/850/000/1783/front_fr.4.400.jpg
0048500018347  004/850/001/8347/front_fr.3.400.jpg
0048500201619  004/850/020/1619/front_fr.13.400.jpg
0082666440048  008/266/644/0048/front_fr.3.400.jpg
0050200012976  005/020/001/2976/front_en.25.400.jpg
0051500025918  005/150/002/5918/front_fr.15.400.jpg
0051500410424  005/150/041/0424/front_fr.3.400.jpg
0059000016597  005/900/001/6597/front_en.41.400.jpg
0051500710173  005/150/071/0173/front_en.24.400.jpg
0051500750056  005/150/075/0056/front_en.52.400.jpg
0051651092869  005/165/109/2869/front_fr.11.400.jpg
0051651293716  005/165/129/3716/front_fr.4.400.jpg
0054300009591  005/430/000/9591/front_fr.16.400.jpg
0055000132152  005/500/013/2152/front_en.54.400.jpg
0055000139045  005/500/013/9045/front_en.50.400.jpg
0055000173971  005/500/017/3971/front_fr.3.400.jpg
0055144424397  005/514/442/4397/front_fr.11.400.jpg
0064420006332  006/442/000/6332/front_fr.25.400.jpg
0055415700151  005/541/570/0151/front_fr.11.400.jpg
0055577102053  005/557/710/2053/front_en.56.400.jpg
0055577102459  005/557/710/2459/front_en.16.400.jpg
0055577104095  005/557/710/4095/front_en.13.400.jpg
0055577105313  005/557/710/5313/front_en.3.400.jpg
0055577105320  005/557/710/5320/front_fr.4.400.jpg
0055577105665  005/557/710/5665/front_en.54.400.jpg
0055577105948  005/557/710/5948/front_en.26.400.jpg
```

### Open Products Facts (2026-09-14), 20 photos
Each line is `code  bucket  image path`, under `https://images.openproductsfacts.org/images/products/`.

```
0190198067067  look-alike   019/019/806/7067/front_fr.4.400.jpg
0190198450715  look-alike   019/019/845/0715/front_en.4.400.jpg
0194252705872  look-alike   019/425/270/5872/front_fr.4.400.jpg
0045496885595  look-alike   004/549/688/5595/front_fr.6.400.jpg
0045496321529  look-alike   004/549/632/1529/front_en.17.400.jpg
9341694630298  store-brand  934/169/463/0298/front_en.3.400.jpg
9341109762149  store-brand  934/110/976/2149/front_en.4.400.jpg
4056232736534  store-brand  405/623/273/6534/front_fr.4.400.jpg
4008496773510  multipack    400/849/677/3510/front_en.4.400.jpg
0887276301266  plain        088/727/630/1266/front_fr.4.400.jpg
8806095269061  plain        880/609/526/9061/front_en.3.400.jpg
0889842796049  plain        088/984/279/6049/front_fr.4.400.jpg
0889842772685  plain        088/984/277/2685/front_fr.4.400.jpg
0027075311312  plain        002/707/531/1312/front_fr.3.400.jpg
0840080502083  plain        084/008/050/2083/front_en.6.400.jpg
0065030812122  plain        006/503/081/2122/front_en.3.400.jpg
0811071032223  plain        081/107/103/2223/front_en.6.400.jpg
0193575000923  plain        019/357/500/0923/front_en.4.400.jpg
0753759207175  plain        075/375/920/7175/front_en.9.400.jpg
3660619407491  plain        366/061/940/7491/front_fr.12.400.jpg
```
