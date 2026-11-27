# Pexi answer coverage on the most-scanned products, US and Canada (measured 2026-11-27)

Written by a worker agent for Jamin. Not committed. Probe date 2026-11-27 (server clock), live server https://relay.anjiawenda.com .

## How this was measured, and what it can and cannot say

- **Lists.** Open Food Facts (OFF) `api/v2/search` returned 503 "temporarily unavailable" (probe, 2026-11-27). `https://search.openfoodfacts.org/search` (the OFF search service) was up and sorts by `unique_scans_n`, so the lists come from it: `q=countries:"en:united-states"` / `"en:canada"`, `sort_by=-unique_scans_n`, deduped by code. The earlier 503 on the most-scanned list did not recur on this service.
- **Two lists per country.** (a) RAW: the top 250 by OFF scans whose `countries` tag includes the country, as asked. (b) UPC: the top 250 of that same ranking whose barcode starts with 0 (a UPC-A code, i.e. printed for the North American market), taken from the top 600 (US) and top 400 (CA) of the ranking. (b) exists because the raw lists are mostly European and Moroccan products that OFF users tagged as also sold in the US or Canada.
- **BIAS, stated plainly.** OFF scan counts come from OFF app users, who lean European-diaspora and health-food. A product counts for the US if any OFF contributor tagged it as sold there, so the raw US list is dominated by French, German, Belgian and Moroccan packs (Cristaline water, LU Prince, Sidi Ali). Only 70 of the 250 raw US codes and 155 of the 250 raw CA codes are UPC-A. These are not the products an American or Canadian shopper most scans in a store; they are the most-scanned products OFF tags to that country. Treat the UPC lists as the closer proxy, and neither as a true most-scanned list.
- **How each barcode was asked.** `GET /api/identify?gtin=<code>&preview=1` with no deviceId, no market and no price, 3 parallel workers, one request started at most every 600 ms (under 2 per second), User-Agent `Pexi-coverage-check/1.0 (usepexiapp@gmail.com)`. From the code (app/server.ts lines 3297-3333, read, not tested for stats): `preview=1` writes no scan row, counts no free scan, logs no gap, and asks Claude nothing (`askRange` is not passed, `readFrame` is null). Not verified from the database side (no access to the live data on the Mac).
- **What this CANNOT show (unverified).** The preview returns the name and a yes/no `priceKnown` (any `observation` row for the code in the live price file: ANY currency, ANY age, any store; price/src/shopper-prices.ts `hasShopPrice`) or a shopper price. It does NOT return the price range or its source tier. So: (1) the split "real store prices vs cross_border vs other_size vs category estimate" could not be measured without a full scan, which writes the user scan log and spends a scan; (2) `priceKnown` true on a European pack is probably a EUR or other-currency row (the live answer for a US/CA shopper would then be a cross_border range, or nothing); (3) "named only" rows may still show a category-estimate range or a Claude range in the live app, which this probe cannot see. Figures for "range" below are therefore a ceiling on real-store-price coverage and a floor on all-source range coverage.

## Result per list

Classes: **no result** = not named, no price row. **price, no name** = a price row exists but the preview names nothing. **named only** = named (catalogue, or live OFF lookup) with no price row. **named+price** = named and a price row exists in some currency (ceiling on "range from real store prices").

| List | n | no result | price, no name | named only | named+price | named (all) | scans-weighted no result |
|---|---|---|---|---|---|---|---|
| US raw | 250 | 97 (38.8%) | 10 (4.0%) | 97 (38.8%) | 46 (18.4%) | 143 (57.2%) | 27.2% |
| CA raw | 250 | 2 (0.8%) | 0 (0.0%) | 144 (57.6%) | 104 (41.6%) | 248 (99.2%) | 0.4% |
| US UPC | 250 | 24 (9.6%) | 25 (10.0%) | 51 (20.4%) | 150 (60.0%) | 201 (80.4%) | 11.2% |
| CA UPC | 250 | 1 (0.4%) | 0 (0.0%) | 97 (38.8%) | 152 (60.8%) | 249 (99.6%) | 0.6% |

ERR (non-200) count: 0

Named only via the live Open Food Facts lookup (not in Pexi's catalogue): 97 of 733 distinct barcodes probed.

## By barcode origin (raw lists): where the gaps are

| List | origin | n | no result | named only | named+price |
|---|---|---|---|---|---|
| US raw | UPC-A (0...) | 70 | 16 | 12 | 42 |
| US raw | Morocco (611) | 64 | 31 | 33 | 0 |
| US raw | France (30-37) | 36 | 23 | 13 | 0 |
| US raw | other | 31 | 18 | 11 | 2 |
| US raw | Germany (400-440) | 12 | 6 | 6 | 0 |
| US raw | Belgium (54) | 10 | 3 | 7 | 0 |
| US raw | Italy (80-83) | 8 | 4 | 3 | 1 |
| US raw | Switzerland (76) | 7 | 1 | 5 | 1 |
| US raw | UK (50) | 5 | 1 | 4 | 0 |
| US raw | Spain (84) | 4 | 3 | 1 | 0 |
| US raw | Netherlands (87) | 3 | 1 | 2 | 0 |
| CA raw | UPC-A (0...) | 155 | 1 | 68 | 86 |
| CA raw | France (30-37) | 31 | 0 | 31 | 0 |
| CA raw | other | 22 | 0 | 15 | 7 |
| CA raw | Switzerland (76) | 14 | 0 | 11 | 3 |
| CA raw | Italy (80-83) | 13 | 0 | 8 | 5 |
| CA raw | Morocco (611) | 5 | 0 | 5 | 0 |
| CA raw | Belgium (54) | 4 | 0 | 2 | 2 |
| CA raw | Spain (84) | 2 | 0 | 2 | 0 |
| CA raw | UK (50) | 2 | 0 | 1 | 1 |
| CA raw | Netherlands (87) | 1 | 0 | 1 | 0 |
| CA raw | Germany (400-440) | 1 | 1 | 0 | 0 |

## US raw: the 20 highest-scan barcodes with no result

(no result = not named, no price row; ranked by OFF unique scans)

| OFF rank | barcode | OFF scans | OFF name | OFF brand |
|---|---|---|---|---|
| 6 | 6111242100992 | 913 | Perly | Jaouda, Perly |
| 12 | 13356194 | 663 | SPICY CHICKEN & 'NDUJA PIZZA | SPORTYFEEL |
| 31 | 00007580 | 373 | Bauchspeicheldrüse Salo Ivushka | Lackmann |
| 32 | 6111246721278 | 361 | Cream cheese | Original |
| 47 | 6111099005495 | 252 |  | lilia |
| 49 | 6111128000460 | 236 |  | aïn Saiss |
| 56 | 5449000036872 | 218 | Hawai Tropical | Coca cola, Hawai |
| 58 | 6111035001635 | 217 | Ain Atlas | Ain Atlas |
| 59 | 6111018903161 | 207 | Nescafé Classic | Nescafé |
| 60 | 6111035003523 | 206 |  | BAHIA |
| 61 | 6111242102781 | 204 | Tendre nature | Tendre, jouda |
| 63 | 8425197712024 | 200 | Chocolate con leche y almendras | CHOCOLATES MARUJA S.L. |
| 66 | 6111246722039 | 194 | fromage herbes milky food | milky foof |
| 67 | 8710637105390 | 186 | Wraps Multigrains | Gruma Netherlands B.V., Mission |
| 68 | 6111242100930 | 182 | رايبي جودة | Jaouda |
| 70 | 68922242 | 178 | Maizena | Maizena |
| 72 | 3392780007001 | 178 | Truite Fumée des Pyrénées | Ovive |
| 73 | 6111184004129 | 178 | Mayonnaise recette originale | Star |
| 74 | 8000500037560 | 175 | bueno | kinder |
| 75 | 6111184004730 | 174 | Ketchup star | Star |

Largest brand groups with NO NAME (no result or price-without-name): (no brand) (8), jaouda (3), lilia (2), star (2), amora (2), kirkland signature (2), barilla (2), carrefour-bio (2)

Largest brand groups NAMED BUT NO PRICE ROW: jaouda (8), terra delyssa (5), sidi ali (4), coca-cola (4), ciel (3), aquafina (2), oulmès (2), lu (2)

## CA raw: the 20 highest-scan barcodes with no result

(no result = not named, no price row; ranked by OFF unique scans)

| OFF rank | barcode | OFF scans | OFF name | OFF brand |
|---|---|---|---|---|
| 79 | 0846548085273 | 45 | YOGGIES | Natures Garden Probiotic Strawberry Yoggies |
| 188 | 4050036739800 | 24 |  | Kraft |

Largest brand groups with NO NAME (no result or price-without-name): natures garden probiotic strawberry yoggies (1), kraft (1)

Largest brand groups NAMED BUT NO PRICE ROW: kirkland signature (16), poulain (4), lu (4), nestle (4), kirkland (4), sidi ali (3), milka (3), lindt (2)

## US UPC: the 20 highest-scan barcodes with no result

(no result = not named, no price row; ranked by OFF unique scans)

| OFF rank | barcode | OFF scans | OFF name | OFF brand |
|---|---|---|---|---|
| 1 | 00007580 | 373 | Bauchspeicheldrüse Salo Ivushka | Lackmann |
| 7 | 0096619756803 | 137 | Purified Drinking Water | Kirkland Signature |
| 52 | 0058449770565 | 55 | Pumpkin Seed + Flax Granola | Nature's Path Organic |
| 57 | 0612322000202 | 54 | Fruit & Seed Oatcakes | Nairn's |
| 69 | 0082657500638 | 51 | 100% Natural Spring Water | Deer Park |
| 70 | 0815863021501 | 51 | 100% Whey Native Whey Protein Blend | Ascent |
| 78 | 0083046000135 | 50 | 100% Natural Spring Water | Ice Mountain |
| 94 | 06104696 | 47 | Almonds | Alesto Lidl |
| 110 | 01210806 | 45 | Purified Drinking Water | Aquafina |
| 114 | 0846548085273 | 45 | YOGGIES | Natures Garden Probiotic Strawberry Yoggies |
| 124 | 0034361485756 | 44 | Hippo Fraise | danone |
| 125 | 0708747151930 | 44 | MEGA OMEGA | POWER UP PREMIUM TRAIL MIX |
| 136 | 0073430005044 | 43 | Zephyrhills | Zephyrhills |
| 138 | 0022592007014 | 43 | Bottled Spring Water | Ozarka |
| 145 | 0075720000814 | 42 | poland spring | Poland Spring |
| 165 | 09141209 | 40 | Bourn Vita 500Gram Pauch | Cadbury |
| 171 | 0687456211091 | 40 | Organic Chewy Granola Bar | MADEGOOD |
| 175 | 07831504 | 40 | Dr Pepper | Dr Pepper, Dr Pepper Authentic Blend of 23 Flavores |
| 185 | 0048001265745 | 39 | Real Mayonnaise | best-foods |
| 206 | 0850053892493 | 37 | Crunchy Roasted Edamame Sea Salt | The Only Bean |

Largest brand groups with NO NAME (no result or price-without-name): kirkland signature (4), member's mark (2), nurri (2), lackmann (1), fairlife (1), go raw (1), dave's killer bread (1), organic (1)

Largest brand groups NAMED BUT NO PRICE ROW: kirkland signature (8), kirkland (3), great value (2), skippy (2), iq bar (2), nature's bakery (2), pepperidge farm (2), optimum nutrition (2)

## CA UPC: the 20 highest-scan barcodes with no result

(no result = not named, no price row; ranked by OFF unique scans)

| OFF rank | barcode | OFF scans | OFF name | OFF brand |
|---|---|---|---|---|
| 29 | 0846548085273 | 45 | YOGGIES | Natures Garden Probiotic Strawberry Yoggies |

Largest brand groups with NO NAME (no result or price-without-name): natures garden probiotic strawberry yoggies (1)

Largest brand groups NAMED BUT NO PRICE ROW: kirkland signature (20), kirkland (6), les grains st-méthode (2), crunchmaster (2), ace bakery (2), kellogg-s (2), bon matin (2), leanfit (2)

Largest Pexi categories among US raw named-but-no-price-row barcodes: (no category) (19), Carbonated waters (5), Vegetable & cooking oils (4), Cereal (3), Open beauty facts (3), Nut & seed butters (3), Cheeses (2), Cocoa and hazelnuts spreads (2)

Largest Pexi categories among CA raw named-but-no-price-row barcodes: Unsweetened beverages (4), Sliced breads (4), Crackers appetizers (3), Mayonnaises (3), Cocoa and hazelnuts spreads (2), Chocolate candies (2), Dark chocolate bars (2), Chocolate sandwich cookies (2)

Largest Pexi categories among US UPC named-but-no-price-row barcodes: Water (3), Nut & seed butters (3), Snack, energy & granola bars (3), (no category) (2), Non alcoholic beverages   ready to drink (2), Honeys (2), Candy (2), Popcorn, peanuts, seeds & related snacks (2)

Largest Pexi categories among CA UPC named-but-no-price-row barcodes: Sliced breads (5), Cereal flakes (3), Honeys (3), Greek style yogurts (3), Appetizers (3), Breads (3), Liquid honeys (2), (no category) (2)

## Full table (all 733 distinct barcodes probed)

Lists column: U = in US raw, C = in CA raw, u = in US UPC, c = in CA UPC. Scans are OFF unique scans.

| barcode | lists | OFF scans | OFF name | class | outcome | identity from | Pexi name |
|---|---|---|---|---|---|---|---|
| 3274080005003 | U | 1750 | isabelle | named only | named_outside_catalogue | open_food_facts | isabelle |
| 7622210449283 | UC | 1323 | Prince | named+price | catalogue_hit | catalogue | Prince Goût Chocolat au Blé Complet |
| 6111246721261 | UC | 1074 | Fromage Blanc Nature | named only | catalogue_hit | catalogue | Fromage Blanc Nature |
| 6111035000430 | UC | 966 | sidi ali | named only | catalogue_hit | catalogue | sidi ali |
| 7300400481588 | U | 953 | Fibres | named only | named_outside_catalogue | open_food_facts | Fibres |
| 6111242100992 | U | 913 | Perly | no result | not_in_catalogue |  |  |
| 6111035000058 | UC | 856 | Eau minérale naturelle | named only | named_outside_catalogue | open_food_facts | Eau minérale naturelle |
| 3017620425035 | U | 824 | Nutella | named only | named_outside_catalogue | open_food_facts | Nutella |
| 5449000214799 | U | 777 | Coca-Cola sans sucres | named only | named_outside_catalogue | open_food_facts | Coca-Cola sans sucres |
| 6111035002175 | UC | 720 | Eau minérale naturelle | named only | catalogue_hit | catalogue | Sidi Ali 2 L |
| 6111242106949 | UC | 681 | Jben | named only | catalogue_hit | catalogue | jben |
| 13356194 | U | 663 | SPICY CHICKEN & 'NDUJA PIZZA | no result | not_in_catalogue |  |  |
| 5449000000996 | UC | 570 | Coca-Cola Original | named only | catalogue_hit | catalogue | Coca-Cola |
| 6111242101180 | U | 569 | Lait entier UHT | named only | named_outside_catalogue | open_food_facts | Lait entier UHT |
| 5449000054227 | U | 538 | Coca-Cola Original Taste | named only | named_outside_catalogue | open_food_facts | Coca-Cola Original Taste |
| 3256540000698 | U | 524 | Pains au lait | named only | named_outside_catalogue | open_food_facts | Pains au lait |
| 6111252421568 | U | 521 | اكوافينا | named only | named_outside_catalogue | open_food_facts | اكوافينا |
| 3760049796384 | U | 515 | Tartines céréales & graines 450g | named only | named_outside_catalogue | open_food_facts | Tartines céréales & graines 450g |
| 6111266962187 | U | 515 | Lait frais naturel demi écrémé | named only | named_outside_catalogue | open_food_facts | Lait frais naturel demi écrémé |
| 8000500310427 | U | 503 | Biscuits NUTELLA Biscuits Noisettes et Cacao x22 - 304g | named only | named_outside_catalogue | open_food_facts | Biscuits NUTELLA Biscuits Noisettes et Cacao x22 - 304g |
| 7622210601988 | U | 489 | Granola L'Original | named only | named_outside_catalogue | open_food_facts | Granola L'Original |
| 6111035502828 | U | 475 | Eau minérale naturelle | named only | named_outside_catalogue | open_food_facts | Eau minérale naturelle |
| 6111035003035 | U | 470 | Oulmes natural carbonated water | named only | named_outside_catalogue | open_food_facts | Oulmes natural carbonated water |
| 42104964 | U | 458 | Ciel | named only | named_outside_catalogue | open_food_facts | Ciel |
| 6111035000027 | U | 450 | Eau minérale naturelle | named only | named_outside_catalogue | open_food_facts | Eau minérale naturelle |
| 6111252421582 | U | 418 | اكوافينا | named only | named_outside_catalogue | open_food_facts | اكوافينا |
| 8715700407760 | U | 414 | Tomato Ketchup BIO | named only | named_outside_catalogue | open_food_facts | Tomato Ketchup BIO |
| 5449000147417 | U | 408 | Cappy PULPY | named only | named_outside_catalogue | open_food_facts | Cappy PULPY |
| 5449000000439 | U | 391 | Coca Cola Original Taste 1.5L | named only | named_outside_catalogue | open_food_facts | Coca Cola Original Taste 1.5L |
| 6111242100206 | U | 384 | Le nature | named only | named_outside_catalogue | open_food_facts | Le nature |
| 00007580 | Uu | 373 | Bauchspeicheldrüse Salo Ivushka | no result | not_in_catalogue |  |  |
| 6111246721278 | U | 361 | Cream cheese | no result | not_in_catalogue |  |  |
| 6111031005064 | U | 353 | Tonik | named only | named_outside_catalogue | open_food_facts | Tonik |
| 3664346306027 | C | 352 | 1848 | named only | catalogue_hit | catalogue | Poulain 1848 450 g |
| 6111242100817 | U | 349 | Le Lait demi écrémé | named only | named_outside_catalogue | open_food_facts | Le Lait demi écrémé |
| 6111032009665 | U | 345 | Semi-skimmed milk | named only | named_outside_catalogue | open_food_facts | Semi-skimmed milk |
| 3451790988677 | UC | 343 | Le Beurre Tendre | named only | catalogue_hit | catalogue | Le Beurre Tendre |
| 3046920028004 | C | 332 | Excellence 70% Cocoa Intense Dark | named only | named_outside_catalogue | open_food_facts | Excellence 70% Cocoa Intense Dark |
| 6111128000163 | U | 319 | Ain Saiss Eau Minerale Naturelle | named only | named_outside_catalogue | open_food_facts | Ain Saiss Eau Minerale Naturelle |
| 5410126716016 | C | 319 | Biscoff | named+price | catalogue_hit | catalogue | Biscoff |
| 6111242100305 | U | 313 | jaouda Cremy | named only | named_outside_catalogue | open_food_facts | jaouda Cremy |
| 5025125000006 | U | 302 | White Ciabattin | named only | named_outside_catalogue | open_food_facts | White Ciabattin |
| 6111203006653 | U | 298 | La Hollandaise Cheddar | named only | named_outside_catalogue | open_food_facts | La Hollandaise Cheddar |
| 3175681134904 | U | 290 | Sablé Nature sans sucres | named only | named_outside_catalogue | open_food_facts | Sablé Nature sans sucres |
| 5449000061515 | U | 286 | Ciel | named only | named_outside_catalogue | open_food_facts | Ciel |
| 8712100338694 | C | 284 | Maizena Fleur de Maïs Sans Gluten 400g | named only | catalogue_hit | catalogue | Fleur de Maïs Maizena |
| 6111128000088 | U | 262 | ain saiss 50cl | named only | named_outside_catalogue | open_food_facts | ain saiss 50cl |
| 6111035003004 | U | 255 | Oulmes Eau Gazeuse | named only | named_outside_catalogue | open_food_facts | Oulmes Eau Gazeuse |
| 6111184001562 | U | 253 | Sel de table iodé | named only | named_outside_catalogue | open_food_facts | Sel de table iodé |
| 3664346312936 | C | 253 | Pâte à tartiner aux noisettes et au cacao | named only | catalogue_hit | catalogue | Pâte à tartiner |
| 6111251420166 | U | 252 | Eau | named only | named_outside_catalogue | open_food_facts | Eau |
| 6111099005495 | U | 252 |  | no result | not_in_catalogue |  |  |
| 7622210421968 | C | 251 | Véritable Petit Écolier Chocolat au Lait | named+price | catalogue_hit | catalogue | Petit écolier Chocolat au lait |
| 6111180000231 | U | 239 | levure pâtisserie | named only | named_outside_catalogue | open_food_facts | levure pâtisserie |
| 6111128000460 | U | 236 |  | no result | not_in_catalogue |  |  |
| 5410041010800 | C | 234 | Petit écolier chocolat noir pur beurre de cacao | named only | catalogue_hit | catalogue | Véritable Petit écolier Chocolat noir Pur beurre de cacao |
| 6111032001003 | U | 231 | Assil vanille | named only | named_outside_catalogue | open_food_facts | Assil vanille |
| 20005832 | U | 230 | Dark chocolate 50% Cocoa | named only | catalogue_hit | catalogue | Dark Chocolate |
| 6111259347861 | U | 229 | Pauz | named only | named_outside_catalogue | open_food_facts | Pauz |
| 6111035001673 | U | 226 | Aïn Atlas 50cl | named only | named_outside_catalogue | open_food_facts | Aïn Atlas 50cl |
| 6111242103702 | U | 224 | Yaourt Grec Muesli | named only | named_outside_catalogue | open_food_facts | Yaourt Grec Muesli |
| 7613035040793 | C | 223 | NESTLÉ DESSERT Noir 2x205g | named only | catalogue_hit | catalogue | NESTLÉ DESSERT Noir 2x205g 410 g |
| 6111029000118 | U | 221 | Cosumar Sucre En Lingot Pour Le Thé 1 kg | named only | named_outside_catalogue | open_food_facts | Cosumar Sucre En Lingot Pour Le Thé 1 kg |
| 5449000036872 | U | 218 | Hawai Tropical | no result | not_in_catalogue |  |  |
| 6191509900671 | U | 218 | EXTRA VIRGIN OLIVE OIL | named only | catalogue_hit | catalogue | Extra Virgin Tunisian Olive Oil |
| 6111035001635 | U | 217 | Ain Atlas | no result | not_in_catalogue |  |  |
| 6111018903161 | U | 207 | Nescafé Classic | no result | not_in_catalogue |  |  |
| 6111035003523 | U | 206 |  | no result | not_in_catalogue |  |  |
| 6111242102781 | U | 204 | Tendre nature | no result | not_in_catalogue |  |  |
| 3161711000622 | U | 203 | Caprice des Dieux | named only | named_outside_catalogue | open_food_facts | Caprice des Dieux |
| 8425197712024 | U | 200 | Chocolate con leche y almendras | no result | not_in_catalogue |  |  |
| 6191509905058 | UC | 197 | Huile d'olive vierge extra (Biologique) | named only | catalogue_hit | catalogue | First Cold Pressed Extra Virgin Olive Oil |
| 0078742040370 | Uu | 197 | Purified Drinking Water | named only | catalogue_hit | catalogue | Purified Drinking Water |
| 6111246722039 | U | 194 | fromage herbes milky food | no result | not_in_catalogue |  |  |
| 3046920022705 | C | 189 | Excellence Noir Orange Intense | named only | catalogue_hit | catalogue | Excellence Noir Orange Intense Aux amandes effilées |
| 8710637105390 | U | 186 | Wraps Multigrains | no result | not_in_catalogue |  |  |
| 8402001010873 | C | 185 | Muesli Crunchy | named only | catalogue_hit | catalogue | Muesli CRUNCHY |
| 6111242100930 | U | 182 | رايبي جودة | no result | not_in_catalogue |  |  |
| 0898999000503 | Uu | 182 | Coconut Water | named+price | catalogue_hit | catalogue | Vita Coco Coconut Water 1 L |
| 68922242 | U | 178 | Maizena | no result | preview_unavailable |  |  |
| 3175681072916 | U | 178 | Miel Châtaigne graines de lin | named only | named_outside_catalogue | open_food_facts | Miel Châtaigne graines de lin |
| 3392780007001 | U | 178 | Truite Fumée des Pyrénées | no result | not_in_catalogue |  |  |
| 6111184004129 | U | 178 | Mayonnaise recette originale | no result | not_in_catalogue |  |  |
| 8000500037560 | U | 175 | bueno | no result | not_in_catalogue |  |  |
| 6111184004730 | U | 174 | Ketchup star | no result | not_in_catalogue |  |  |
| 6111242102002 | U | 173 | غلال القمح | named only | named_outside_catalogue | open_food_facts | غلال القمح |
| 8076800376999 | C | 171 | Lasagne all'uovo | named only | catalogue_hit | catalogue | Lasagne all'Uovo n.199 |
| 3608580823452 | U | 169 | Confiture Abricot INTENSE | no result | not_in_catalogue |  |  |
| 7622210450029 | C | 169 | Prince - Goût Lait - Choco Au Blé Compet | named only | catalogue_hit | catalogue | LU Prince - Goût Lait - Choco Au Blé Compet 300 g |
| 3017760038409 | C | 166 | Lulu La Barquette Fraise | named only | catalogue_hit | catalogue | Lulu La Barquette Fraise |
| 3228850006035 | U | 165 | Pain de mie longue conservation | named only | named_outside_catalogue | open_food_facts | Pain de mie longue conservation |
| 0013764027053 | Uu | 163 | Organic Bread 21 Whole Grains and Seeds | named+price | catalogue_hit | catalogue | Dave's Killer Bread, 21 Whole Grains And Seeds Organic Bread |
| 7311870011618 | U | 159 | Cottage Cheese | named only | named_outside_catalogue | open_food_facts | Cottage Cheese |
| 6111162000839 | U | 159 | Confiture de fraise | no result | not_in_catalogue |  |  |
| 6111032002208 | U | 157 | Activia Céréales | no result | not_in_catalogue |  |  |
| 6111259341197 | U | 157 | Momo black | no result | not_in_catalogue |  |  |
| 5449000206770 | U | 156 | Eau de table | named only | named_outside_catalogue | open_food_facts | Eau de table |
| 0811620022118 | Uu | 151 | High Quality Protein | price, no name | not_in_catalogue |  |  |
| 0898999000022 | UCuc | 150 | Coconut Water | named only | catalogue_hit | catalogue | The Original Coconut Water |
| 69565580 | U | 147 | Moutarde amora | no result | preview_unavailable |  |  |
| 90162602 | U | 146 | Red Bull Energy Drink | no result | not_in_catalogue |  |  |
| 7622201126131 | C | 146 | Merenda | named only | catalogue_hit | catalogue | Πραλίνα φουντουκιού με κακάο και γάλα |
| 6111003031107 | U | 144 |  | no result | not_in_catalogue |  |  |
| 20621483 | U | 140 | Special Flakes Bran Flakes | named only | catalogue_hit | catalogue | Bran Flakes Cereal |
| 8076809523509 | U | 139 | Pâtes linguine collezione 500g | no result | not_in_catalogue |  |  |
| 5025125000129 | U | 139 | JASON'S SOURDOUGH | named only | named_outside_catalogue | open_food_facts | JASON'S SOURDOUGH |
| 3270190174356 | U | 137 | Ratatouille | no result | not_in_catalogue |  |  |
| 0096619756803 | Uu | 137 | Purified Drinking Water | no result | not_in_catalogue |  |  |
| 0013764027138 | Uu | 136 | THIN-SLICED | named+price | catalogue_hit | catalogue | Dave's Killer Bread, Organic Thin-Sliced 21 Whole Grains And |
| 3033491451683 | U | 135 | Le petit suisse gervais nature 9,5% 60 g x 6 | no result | not_in_catalogue |  |  |
| 6111180000392 | U | 135 | سكر الفانيلين | no result | not_in_catalogue |  |  |
| 10614594 | U | 135 | Heumilch Emmentaler | no result | not_in_catalogue |  |  |
| 7622210450098 | U | 133 | Prince goût tout Choco au blé complet | named only | named_outside_catalogue | open_food_facts | Prince goût tout Choco au blé complet |
| 6111099005488 | U | 133 | Tartine & Cuisine | no result | not_in_catalogue |  |  |
| 6111162000716 | U | 132 | Confiture d'abricot | no result | not_in_catalogue |  |  |
| 6111242103528 | U | 131 | Croissance réduit en sucre | no result | not_in_catalogue |  |  |
| 7613035833272 | UC | 129 | PERRIER eau minérale naturelle gazeuse 1L | named only | catalogue_hit | catalogue | Perrier |
| 7622300331283 | C | 127 | Вафла МОРЕНИ maxx | named only | catalogue_hit | catalogue | Вафла МОРЕНИ maxx |
| 0096619194261 | UCuc | 125 | Ancient Grains Probiotic Granola | named+price | catalogue_hit | catalogue | Ancient Grains Probiotic Granola |
| 42105220 | U | 124 | Coca Cola | no result | not_in_catalogue |  |  |
| 3245550078674 | U | 123 | SNACK POPPÉ | no result | not_in_catalogue |  |  |
| 0633148100013 | Uu | 121 | Krydder m/Lime og Chili | named+price | catalogue_hit | catalogue | Chili Powder Seasoning |
| 6111252860077 | U | 120 | Trios | named only | named_outside_catalogue | open_food_facts | Trios |
| 06827465 | Uu | 120 | Pure Life | named only | catalogue_hit | catalogue | Pure Life Purified Water, 16.9 FL OZ |
| 0068100084245 | Cc | 119 | Smooth Peanut Butter | named+price | catalogue_hit | catalogue | Smooth Peanut Butter |
| 7640154260283 | U | 117 | gff | named only | catalogue_hit | catalogue | Marlboro gff |
| 20362041 | U | 115 | Olivenöl Extra | named only | catalogue_hit | catalogue | Extra Virgin Olive Oil |
| 3336970711064 | C | 115 | Curly cacahuète l'original | named only | catalogue_hit | catalogue | Curly cacahuète l'original |
| 6111271800054 | U | 114 | العين | no result | not_in_catalogue |  |  |
| 3560070894772 | U | 110 | Sardines de Bretagne | no result | not_in_catalogue |  |  |
| 3261342002108 | U | 110 | Pur Arabica Moulu biologique | no result | not_in_catalogue |  |  |
| 3165440006702 | U | 109 | Couscous sachet cuisson | named only | named_outside_catalogue | open_food_facts | Couscous sachet cuisson |
| 6111250477567 | U | 108 | Peripella | no result | not_in_catalogue |  |  |
| 7622300744663 | C | 107 | Biscotti al cacao magro ripieni di crema al gusto vaniglia | named only | catalogue_hit | catalogue | Mondelēz Original 220 g |
| 6111099000599 | U | 106 | Huile de table | no result | not_in_catalogue |  |  |
| 3036811460259 | U | 103 | Velouté de légumes | no result | not_in_catalogue |  |  |
| 35683862 | U | 103 | Mayonnaise | no result | preview_unavailable |  |  |
| 12562213 | U | 101 | Petits pains grillés au froment | no result | not_in_catalogue |  |  |
| 3166296208869 | U | 99 | Paprika fumé | no result | not_in_catalogue |  |  |
| 3017760306492 | U | 98 | Prince petit dej | named only | named_outside_catalogue | open_food_facts | Prince petit dej |
| 6111252422008 | U | 97 | AQUAFINA | no result | not_in_catalogue |  |  |
| 8402001028823 | U | 97 | Caldo de Pollo Frango | no result | not_in_catalogue |  |  |
| 3175680011480 | U | 97 | Sésame | no result | not_in_catalogue |  |  |
| 0072250037129 | Uu | 95 | 100% Whole Wheat Bread | named+price | catalogue_hit | catalogue | 100% Whole Wheat Bread |
| 69581396 | U | 94 | Moutarde forte AMORA | no result | preview_unavailable |  |  |
| 0096619483556 | Uu | 93 | organic GREEK YOGURT plain | price, no name | not_in_catalogue |  |  |
| 0096619450008 | Cc | 92 | Peanut Butter creamy natural | named only | catalogue_hit | catalogue | Peanut Butter creamy natural |
| 6111035001383 | U | 90 | Eau minerale | no result | not_in_catalogue |  |  |
| 5449000132277 | U | 90 | fanta tops lemon 1.5l | no result | not_in_catalogue |  |  |
| 8712566134144 | U | 90 | Dijon Originale | named only | named_outside_catalogue | open_food_facts | Dijon Originale |
| 3252755150005 | C | 90 | 20 madeleines longues aux œufs frais | named only | catalogue_hit | catalogue | 20 madeleines longues aux œufs frais |
| 0815074022809 | UCuc | 89 | Classic Mayo | named+price | catalogue_hit | catalogue | Classic Mayo |
| 0078742051451 | Uu | 89 | PURIFIED WATER | price, no name | not_in_catalogue |  |  |
| 8002270416972 | U | 89 | SAN PELLEGRINO CIAO boisson gazeuse aromatisée Pêche 33cl | no result | not_in_catalogue |  |  |
| 0068100084665 | Cc | 89 | PEANUT BUTTER | named+price | catalogue_hit | catalogue | Peanut Butter |
| 04963406 | Uu | 88 | Coke Original Taste | named+price | catalogue_hit | catalogue | Coca-Cola Can, 12 fl oz |
| 4032277012819 | U | 88 | Jambon végétal | no result | not_in_catalogue |  |  |
| 7613035587793 | C | 88 | NESTLE DESSERT Lait | named only | catalogue_hit | catalogue | NESTLE DESSERT Lait |
| 6923818881323 | U | 87 | Petits fours financiers | no result | not_in_catalogue |  |  |
| 8410757001090 | U | 87 | Crema Manos | named only | catalogue_hit | catalogue | Crema Manos |
| 3017760595193 | C | 87 | Granola Chocolat Noir | named only | named_outside_catalogue | open_food_facts | Granola Chocolat Noir |
| 0894700010137 | Uu | 86 | Greek Yogurt Nonfat Plain | named+price | catalogue_hit | catalogue | Plain Nonfat Greek Yogurt, Plain |
| 4056489810612 | U | 86 | Pork sausages | named only | named_outside_catalogue | open_food_facts | Pork sausages |
| 8000700000005 | U | 86 |  | named only | catalogue_hit | catalogue | Dove Kremsåpe 100g |
| 6132500711040 | C | 86 | El Mordjene Crème De Noisettes Grillées | named only | catalogue_hit | catalogue | Cebon El Mordjene Crème De Noisettes Grillées 700 g |
| 0068100084276 | Cc | 86 | Smooth Peanut Butter | named+price | catalogue_hit | catalogue | Smooth Peanut Butter |
| 69566745 | U | 85 | Moutarde de Dijon | no result | not_in_catalogue |  |  |
| 7322540548563 | U | 85 | jempo | no result | not_in_catalogue |  |  |
| 0051500255162 | Uu | 85 | Creamy Peanut Butter | named+price | catalogue_hit | catalogue | Creamy Peanut Butter, Creamy |
| 69651888 | U | 85 | Moutarde à l'ancienne | no result | preview_unavailable |  |  |
| 0016000264694 | Uu | 85 | Oats 'N Honey Granola Bars | named+price | catalogue_hit | catalogue | Nature Valley Crunchy Oats 'n Honey Granola Bar |
| 4056489166856 | U | 84 | Olivenöl | named only | named_outside_catalogue | open_food_facts | Olivenöl |
| 3228857001491 | U | 84 | Harrys pain de mie extra moelleux complet sans sucres ajouté | no result | not_in_catalogue |  |  |
| 20004330 | U | 82 | Pepinillo agridulce grande - Freshona | no result | not_in_catalogue |  |  |
| 3179140923061 | C | 82 | Chocolat Noir Pépites | named only | catalogue_hit | catalogue | Vahiné Chocolat Noir Pépites 100 g |
| 3560070854998 | U | 81 | Huile d'olive | no result | not_in_catalogue |  |  |
| 3168930007340 | U | 81 | Bénénuts cacahuètes grillées & salées | no result | not_in_catalogue |  |  |
| 3270190174349 | U | 81 | Ravioli vegetariens | no result | not_in_catalogue |  |  |
| 8076800195019 | U | 80 | 2 x Capellini Nr. 1 | no result | not_in_catalogue |  |  |
| 0096619321841 | Cc | 80 | Natural spring water | named+price | catalogue_hit | catalogue | Natural spring water |
| 0689544083016 | Uu | 79 | Total 0% Milkfat | named+price | catalogue_hit | catalogue | 0% Milkfat All Natural Greek Strained Yogurt |
| 94001129 | C | 79 | Sungold Kiwi | named only | catalogue_hit | catalogue | yellow kiwi |
| 0898999010007 | UCuc | 78 | Coconut Water | named+price | catalogue_hit | catalogue | Coconut Water |
| 3270190136880 | U | 78 | Moutarde de Dijon | named only | named_outside_catalogue | open_food_facts | Moutarde de Dijon |
| 6111128000026 | U | 77 | Sidi Harazem | no result | not_in_catalogue |  |  |
| 0055828910017 | Cc | 77 | Organic Honey | named only | catalogue_hit | catalogue | Organic Honey |
| 5410093179616 | U | 76 | Vegetal | no result | not_in_catalogue |  |  |
| 0832650006008 | UCuc | 75 | Deglet Noor pitted dates | named only | catalogue_hit | catalogue | Organic dates |
| 8801073110502 | U | 75 | Buldak Ramen | named+price | catalogue_hit | catalogue | Samyang Chicken Flavoured Ramen |
| 8008343200059 | U | 75 | Spaghetti grossi - No. 5 | named only | catalogue_hit | catalogue | Lenta Lavorazione Grossi NO 5 Spaghetti |
| 3600900020404 | C | 75 | Fine chapelure de pain | named only | catalogue_hit | catalogue | Chapelure |
| 0096619032938 | Uu | 74 | Organic Raw & Unfiltered Honey | named+price | catalogue_hit | catalogue | Organic Raw Honey |
| 0049000042566 | Uu | 74 | Coca-Cola Zero Sugar | named+price | catalogue_hit | catalogue | Coca-Cola Zero Sugar Can, 12 fl oz |
| 6111260233757 | U | 74 | Viva golden chef Fromage | named only | named_outside_catalogue | open_food_facts | Viva golden chef Fromage |
| 0096619859696 | UCuc | 73 | Beurre D’amandes Crémeux | named only | catalogue_hit | catalogue | Creamy Almond Butter |
| 6111101001361 | U | 73 | Asta | no result | not_in_catalogue |  |  |
| 0810032300463 | Uu | 73 | Organic Sprouted Pumpkin Seeds Sea Salt | price, no name | not_in_catalogue |  |  |
| 0628678617803 | UCuc | 72 | Cinnamon Crisps | named only | catalogue_hit | catalogue | Cinnamon Crisps |
| 0811620021951 | Uu | 72 | Core Power High Protein Milk Shake Chocolate | named+price | catalogue_hit | catalogue | Protein Chocolate Bottle, Chocolate |
| 0815074022915 | UCuc | 72 | Avocado Oil Spray | named+price | catalogue_hit | catalogue | Avocado Oil Spray |
| 6111243860376 | U | 72 | Ice Passion | no result | not_in_catalogue |  |  |
| 4335619453852 | U | 71 | SKYR ICELANDIC STYLE NATURAL | named only | named_outside_catalogue | open_food_facts | SKYR ICELANDIC STYLE NATURAL |
| 6111259733749 | U | 71 | Super dégraissant vaisselle citron | named only | catalogue_hit | catalogue | Oni Super dégraissant vaisselle citron 1,25kg |
| 20000691 | U | 70 | Raspberry conserve | named only | catalogue_hit | catalogue | Raspberry Fruit Spread, Raspberry |
| 3664346305990 | C | 70 | Grand Arôme 32% de Cacao | named only | catalogue_hit | catalogue | Grand Arôme |
| 3245390084422 | C | 70 | Palets Bretons Spécialité de Pont-Aven au beurre | named only | catalogue_hit | catalogue | Reflets de France Palets Bretons Spécialité de Pont-Aven au  |
| 0009800895007 | Uu | 69 | Nutella | named+price | catalogue_hit | catalogue | Nutella Hazelnut Spread 13 oz/371 g |
| 6191509900688 | U | 69 | Extra virgin olive oil | named only | catalogue_hit | catalogue | Extra Virgin Olive Oil |
| 2000000002603 | U | 68 | Big Mac | no result | preview_unavailable |  |  |
| 3067140013113 | C | 68 | Chicorée Nature | named only | catalogue_hit | catalogue | Chicory Original |
| 0815074020003 | UCuc | 67 | Chosen classic Mayo | named+price | catalogue_hit | catalogue | Chosen classic Mayo |
| 20333737 | U | 67 | Roasted Cashew-Peanut-Mix Honey & Salt | no result | not_in_catalogue |  |  |
| 6111242882263 | U | 67 |  | no result | not_in_catalogue |  |  |
| 3800000603242 | U | 67 | Devin active electrolyte | no result | not_in_catalogue |  |  |
| 4810317002002 | U | 66 | True Dent Dentrifrice | named only | catalogue_hit | catalogue | True Dent Dentrifrice |
| 0058449770206 | Uu | 66 | Heritage Flakes | named+price | catalogue_hit | catalogue | Heritage Flakes Cereal, Heritage Flakes |
| 0096619555505 | Uu | 65 | Organic Creamy Peanut Butter | named only | catalogue_hit | catalogue | Organic Creamy Peanut Butter |
| 50046979 | U | 65 | hacendado+proteinas | no result | preview_unavailable |  |  |
| 7501059285118 | U | 65 | COFFEE MATE AVELLANA | no result | not_in_catalogue |  |  |
| 8004030026018 | C | 65 | Rio mare Light tuna salad | named+price | catalogue_hit | catalogue | Mexican Style Light Tuna Salad |
| 3251510551002 | C | 65 | Sorbet Pêche Pomme Framboise | named only | catalogue_hit | catalogue | Sorbet Pêche Pomme Framboise |
| 8004030344938 | UC | 64 | tonno rio mare oliva | named+price | catalogue_hit | catalogue | Rio Mare Solid Light Tuna In Olive Oil 3 x 80 g |
| 5017601038238 | U | 64 | Ecoleaf Jumbo Roll Kitchen Tow | named only | named_outside_catalogue | open_food_facts | Ecoleaf Jumbo Roll Kitchen Tow |
| 3073781141429 | U | 64 | Kiri 7.5g protein creamy cheese with fresh yogurt greek styl | no result | not_in_catalogue |  |  |
| 3083681066852 | C | 64 | Purée Délice Carottes, Potiron, Crème | named only | catalogue_hit | catalogue | Purée Délice |
| 0072250037068 | Uu | 63 | Honey Wheat Bread | named+price | catalogue_hit | catalogue | Honey Wheat Enriched Bread, Honey |
| 6915993304650 | U | 63 | Chinese Sichuan smoked pepper sauce | no result | not_in_catalogue |  |  |
| 0070847012474 | Uu | 63 | Zero Ultra | named+price | catalogue_hit | catalogue | Energy Drink |
| 3497911123350 | U | 63 | Chips Pizza 125G Bret's | no result | not_in_catalogue |  |  |
| 0196633938084 | Cc | 63 | Purée d’oléagineux | named only | catalogue_hit | catalogue | Mixed Nut Butter With Seeds |
| 8410076601445 | U | 62 | Nature valley crunchy | no result | not_in_catalogue |  |  |
| 0051500240946 | Uu | 62 | CREAMY PEANUT BUTTER | named only | catalogue_hit | catalogue | Peanut Butter, Creamy |
| 7622202019265 | U | 62 | BREAKFAST Honey & Nut with choc chips | named only | named_outside_catalogue | open_food_facts | BREAKFAST Honey & Nut with choc chips |
| 0073472001202 | Uu | 62 | EZEKIEL 4:9 FLOURLESS SPROUTED GRAIN BREAD | named+price | catalogue_hit | catalogue | Organic Ezekiel 4:9 Sprouted Whole Grain Loaf, Sesame |
| 04965802 | Uu | 62 | Diet Coke | named only | catalogue_hit | catalogue | Diet Coke Can, 12 fl oz |
| 35592394 | U | 61 | heinz beanz | no result | preview_unavailable |  |  |
| 0096619104574 | UCuc | 61 | Organic Virgin Coconut Oil | named+price | catalogue_hit | catalogue | Organic Virgin Coconut Oil |
| 69588535 | U | 61 | Savora moutarde | no result | preview_unavailable |  |  |
| 3256221848854 | U | 60 | Pain de mie complet sans croute - 21 tranches - 500g | no result | not_in_catalogue |  |  |
| 4067796194807 | U | 60 | Hafer Drink Natur | no result | not_in_catalogue |  |  |
| 0884912004710 | Uu | 60 | grape-nuts cereal | named+price | catalogue_hit | catalogue | The Original Cereal |
| 0078895126396 | Uu | 60 | Premium Soy Sauce | named+price | catalogue_hit | catalogue | Lee Kum Kee Premium Soy Sauce |
| 0051500720011 | Uu | 59 | CREAMY PEANUT BUTTER | named+price | catalogue_hit | catalogue | Creamy Peanut Butter, Creamy |
| 4270000981708 | U | 59 | Energie 1 Protein Shake | named only | named_outside_catalogue | open_food_facts | Energie 1 Protein Shake |
| 0013764027756 | Uu | 59 | 21 Whole Grains And Seeds | price, no name | not_in_catalogue |  |  |
| 3574669907842 | U | 59 | johnsons | named only | catalogue_hit | catalogue | shampo johnsons 300 ml |
| 4305615541693 | U | 58 | Mamas Babydream Stillsaft | no result | not_in_catalogue |  |  |
| 0705599011610 | Uu | 58 | Power Cakes Flapjack & Waffle Mix Buttermilk | named+price | catalogue_hit | catalogue | Buttermilk Flapjack & Waffle Mix Power Cakes, Buttermilk |
| 0671785501008 | Cc | 58 | Eska - Eau de source naturelle | named+price | catalogue_hit | catalogue | Eska Natural Spring Water |
| 8801073113893 | U | 57 | Carboana Buldak Spicy Ramen | named+price | catalogue_hit | catalogue | Samyang Chicken Flavoured Ramen Carbo |
| 0810589032312 | Uu | 57 | Organic Original Salty-sweet Granola | named+price | named_outside_catalogue | open_food_facts | Organic Original Salty-sweet Granola |
| 6111056014522 | U | 57 |  | no result | not_in_catalogue |  |  |
| 6111024004746 | U | 57 | Huile d'olive vierge de Maroc | no result | not_in_catalogue |  |  |
| 3033491917066 | U | 57 | Hipro façon stracciatella | no result | not_in_catalogue |  |  |
| 0013764027121 | Uu | 57 | ORGANIC BREAD GOOD SEED THIN-SLICED | named+price | catalogue_hit | catalogue | Dave's Killer Bread Thin-Sliced Bread 20.5 oz/580 g |
| 0810019600302 | Uu | 56 | crispy coconut rolls | price, no name | not_in_catalogue |  |  |
| 0013764027220 | Uu | 56 | Organic Bread | named+price | catalogue_hit | catalogue | Dave's Killer Bread, White Bread |
| 5057545918777 | U | 56 | Sunflower & Pumpkin Loaf | named only | named_outside_catalogue | open_food_facts | Sunflower & Pumpkin Loaf |
| 3263670166316 | U | 56 | Sardines à l'Ancienne Label rouge | no result | not_in_catalogue |  |  |
| 4335619337794 | U | 56 | Oat Drink plant-based | no result | not_in_catalogue |  |  |
| 0677210091823 | Cc | 56 | Granola Sans Céréales Keto Grain Free Granola | named+price | catalogue_hit | catalogue | Granola Sans Céréales Keto Grain Free Granola |
| 3800102719032 | C | 56 | Plain Wafers Borovec 21PCS 630G | named only | catalogue_hit | catalogue | Plain Wafers Borovec 21PCS 630G |
| 3497917000938 | C | 56 | Chips Brets Saveur Cheddar Oignon de Roscoff | named only | catalogue_hit | catalogue | Chips Brets Saveur Cheddar Oignon de Roscoff 125g |
| 0851770008631 | Uu | 55 | Organic Protein | named+price | catalogue_hit | catalogue | Orgain Organic Plant-Based Protein 42.3 oz/2.64 lbs/1.20 kg |
| 0811620020633 | Uu | 55 | core power - 42 | named+price | catalogue_hit | catalogue | Core Power Protein Chocolate Elite 42G Bottle, 14 fl oz |
| 0037600223324 | Uu | 55 | Creamy Peanut Butter | named only | catalogue_hit | catalogue | Creamy Peanut Butter, Creamy |
| 0898999011288 | Uu | 55 | Coconut Water | named+price | catalogue_hit | catalogue | Extra Coconut, Water |
| 0058449770565 | Uu | 55 | Pumpkin Seed + Flax Granola | no result | not_in_catalogue |  |  |
| 4335619399235 | U | 55 | Walnut halves | named only | named_outside_catalogue | open_food_facts | Walnut halves |
| 3168930000976 | C | 55 | 3D's Bugles goût fromage | named only | catalogue_hit | catalogue | Lay's 3D's Bugles goût fromage 85 g |
| 3297760097051 | U | 54 | Pommes Framboises x2 | no result | not_in_catalogue |  |  |
| 6191509900862 | U | 54 | Organic extra virgin olive oil | named only | catalogue_hit | catalogue | Organic Extra Virgin Olive Oil |
| 0857549004248 | Uu | 54 | heavenly hunks RIDICULOUSLY AMAZING ORGANIC OATMEAL DARK CHO | named+price | catalogue_hit | catalogue | Organic Oatmeal Dark Chocolate Gluten-Free Cookies, Oatmeal  |
| 0612322000202 | Uu | 54 | Fruit & Seed Oatcakes | no result | not_in_catalogue |  |  |
| 0021908120232 | Uu | 54 | Blueberry Almond Crunch Cereal | price, no name | not_in_catalogue |  |  |
| 3245550078704 | U | 54 | Snack poppé saveur paprika | no result | not_in_catalogue |  |  |
| 0857777004232 | Uu | 54 | Chocolate Sea Salt RXBAR | named+price | catalogue_hit | catalogue | Rxbar Chocolate Sea Salt Bar 1.8 oz/52 g |
| 0017077102322 | Uu | 54 | Kefir | named+price | catalogue_hit | catalogue | Probiotic Plain Unsweetened Kefir |
| 0857273008666 | Uu | 53 | Collagen Peptides | named+price | named_outside_catalogue | open_food_facts | Collagen Peptides |
| 0016000147652 | Uu | 53 | Lightly Sweetened Maple Berry Blend Cereal | price, no name | not_in_catalogue |  |  |
| 0819562022791 | Uu | 53 | nut granola blueberry cinnamon sweet & crunchy | named only | catalogue_hit | catalogue | Blueberry Cinnamon Keto Nut Granola, Blueberry Cinnamon |
| 0097339000054 | Uu | 53 | Mexican hot sauce | named+price | catalogue_hit | catalogue | Hot Sauce |
| 0675625371189 | Uu | 52 | Sprouted Rolled Oats | named+price | catalogue_hit | catalogue | Sprouted Rolled Oats |
| 0096619533602 | UCuc | 52 | Organic Quinoa | named+price | catalogue_hit | catalogue | Organic Quinoa |
| 0048001213487 | UCuc | 52 | REAL MAYONNAISE | named+price | catalogue_hit | catalogue | Real Mayonnaise |
| 0850004554869 | Uu | 52 | IQ BAR 18 PROTEIN BAR VARIETY PACK | named only | named_outside_catalogue | open_food_facts | IQ BAR 18 PROTEIN BAR VARIETY PACK |
| 7622202271601 | U | 52 | Lapte alpin | no result | not_in_catalogue |  |  |
| 0811130034083 | Uu | 52 | Vanilla Milk Shake | price, no name | not_in_catalogue |  |  |
| 0018627116011 | Uu | 52 | organic cinnamon harvest | price, no name | not_in_catalogue |  |  |
| 7622210406354 | C | 52 | Galletas Choco Sticks | named only | catalogue_hit | catalogue | Chico Sticks милка |
| 0772643307784 | Cc | 52 | Mayonnaise classique | named only | catalogue_hit | catalogue | Mag Mayonnaise classique 890 ml |
| 0082657500638 | Uu | 51 | 100% Natural Spring Water | no result | not_in_catalogue |  |  |
| 4061459332896 | U | 51 | Almond No Sugars | no result | not_in_catalogue |  |  |
| 0815863021501 | Uu | 51 | 100% Whey Native Whey Protein Blend | no result | not_in_catalogue |  |  |
| 0044000004637 | u | 51 | Honey Maid Graham Crackers | named+price | catalogue_hit | catalogue | Nabisco Honey Maid Graham Crackers 1X14.4 OZ |
| 0028400090858 | u | 51 | Classic Potato Chips | named only | named_outside_catalogue | open_food_facts | Classic Potato Chips |
| 0856312002757 | u | 51 | Fairlife Nonfat Ultra-Filtered Milk | named+price | catalogue_hit | catalogue | Fat Free Ultra-Filtered Milk |
| 0856312002771 | u | 51 | Fairlife 2% Reduced Fat ultra-filtered milk | named+price | catalogue_hit | catalogue | 2% Reduced Fat Ultra-Filtered Milk |
| 0084380957444 | Cuc | 50 | Strawberry Fruit Spread | named+price | catalogue_hit | catalogue | Strawberry Fruit Spread |
| 0030000436073 | u | 50 | SIMPLY GRANOLA OATS, HONEY, RAISINS & ALMONDS | named+price | catalogue_hit | catalogue | Quaker Oats 68.9 oz/1.95 kg |
| 0028400040112 | u | 50 | Crunchy | named only | named_outside_catalogue | open_food_facts | Crunchy |
| 0083046000135 | u | 50 | 100% Natural Spring Water | no result | not_in_catalogue |  |  |
| 0096619656493 | u | 50 | Organic Tortilla Chips | named+price | catalogue_hit | catalogue | Organic Tortilla Chips |
| 0810003781918 | u | 50 | Edamame | price, no name | not_in_catalogue |  |  |
| 8853662056029 | C | 49 | Hot Chilli Sauce | named+price | catalogue_hit | catalogue | Hot Chilli Sauce |
| 0057000002992 | Cc | 49 | Tomato Ketchup | named+price | catalogue_hit | catalogue | Tomato Ketchup |
| 0818290017734 | u | 49 | Mixed Berry Vanilla Protein Shake | named+price | catalogue_hit | catalogue | Mixed Berry Vanilla Lowfat Greek Yogurt Drink, Mixed Berry V |
| 0036632024268 | u | 49 | Protein Shake | named only | catalogue_hit | catalogue | Oikos RTD Shake Van 12OZ SS |
| 0851770007566 | u | 49 | Organic Protein | named+price | catalogue_hit | catalogue | Orgain Organic 50 Superfoods Protein Powder 43.2 oz/2.7 lbs/ |
| 0041789002113 | u | 49 | Ramen Noodle Soup Chicken Flavor | named+price | catalogue_hit | catalogue | Ramen Noodle Soup Chicken Flavor, Chicken |
| 0016000275263 | u | 49 | Cheerios | named+price | catalogue_hit | catalogue | Cheerios Original Gluten Free Breakfast Cereal |
| 0658196001167 | Cuc | 48 | Mānuka Honey - | named only | named_outside_catalogue | open_food_facts | Mānuka Honey - |
| 8410000810004 | C | 48 | Oreo original box | named only | catalogue_hit | catalogue | Oreo original box |
| 0028400147408 | u | 48 | GARDEN SALSA FLAVORED Sun Chips | named+price | catalogue_hit | catalogue | Sunchips Garden Salsa 100% Whole Grain Snacks 7 Ounce Plasti |
| 0074822610631 | u | 48 | 100% Peanuts! Creamy | named+price | catalogue_hit | catalogue | Creamy Natural Peanut Butter, Creamy |
| 0856584004183 | u | 48 | Beef | named+price | catalogue_hit | catalogue | Mild Original Beef Stick, Mild Original Beef |
| 0073420524203 | u | 48 | Cottage Cheese | named+price | catalogue_hit | catalogue | 2% Low Fat Small Curd Cottage Cheese |
| 0894700010014 | u | 48 | Greek Yogurt Nonfat Plain | named+price | catalogue_hit | catalogue | Plain Nonfat Greek Yogurt, Plain |
| 0068200750156 | Cc | 47 | Original Balkan Yogurt Natural Yogurt | named+price | catalogue_hit | catalogue | Original Balkan Yogurt Natural Yogurt |
| 0030000169018 | u | 47 | Quaker Lightly Salted Rice Cakes | named+price | catalogue_hit | catalogue | Quaker Rice Cakes Lightly Salted 4.47 Ounce Plastic Bag |
| 0811620020657 | u | 47 | Core Power | named+price | catalogue_hit | catalogue | Complete Protein 42 G Elite High Protein Milk Shake, Vanilla |
| 06104696 | u | 47 | Almonds | no result | not_in_catalogue |  |  |
| 0767707001067 | u | 47 | PURE IRISH BUTTER SALTED | named+price | catalogue_hit | catalogue | Pure Irish Butter |
| 0036632019448 | u | 47 | Oikos Triple Zero Blended Greek Yogurt Vanilla | named+price | catalogue_hit | catalogue | Oikos Dannon Triple Zero Greek Blended Vanilla Nonfat Yogurt |
| 8076809507110 | C | 46 | Macine con Panna Fresca | named only | catalogue_hit | catalogue | Macine con Panna Fresca 100% Italiana |
| 0096619336753 | Cuc | 46 | Peanut Butter Pretzels | named+price | catalogue_hit | catalogue | Peanut Butter Pretzels |
| 0196633939791 | Cuc | 46 | Dried Mangoes | named only | named_outside_catalogue | open_food_facts | Dried Mangoes |
| 8032523532456 | C | 46 |  | named only | catalogue_hit | catalogue | Pisti pistachio spread |
| 0030000010402 | u | 46 | Old Fashioned Oats | named+price | catalogue_hit | catalogue | Quaker Oats Old Fashioned 42 Oz |
| 0044000031138 | u | 46 | fresh stacks the original | named+price | catalogue_hit | catalogue | The Original Fresh Stacks Crackers, The Original |
| 0036632024275 | u | 46 | Oikos Protein Shake | named+price | named_outside_catalogue | open_food_facts | Oikos Protein Shake |
| 0037600110754 | u | 46 | Creamy Peanut Butter | named+price | catalogue_hit | catalogue | Creamy Peanut Butter |
| 0193908007292 | u | 46 | Protein Bars | price, no name | not_in_catalogue |  |  |
| 0034856008187 | u | 46 | Fruit Snacks | named only | catalogue_hit | catalogue | Mixed Fruit Snacks, Mixed Fruit |
| 0180999001001 | u | 46 | Popcorn Himalayan Pink Salt | named+price | catalogue_hit | catalogue | Lesserevil Himalayan Pink Salt Popcorn 4.6 oz |
| 8004030341562 | C | 45 | Tuňák ve vlastní šťávě | named+price | catalogue_hit | catalogue | Tuna in Water |
| 0846548085273 | Cuc | 45 | YOGGIES | no result | not_in_catalogue |  |  |
| 0049000027624 | u | 45 | Purified Water | named only | named_outside_catalogue | open_food_facts | Purified Water |
| 0073420524401 | u | 45 | Cottage Cheese | named+price | catalogue_hit | catalogue | 4% Small Curd Cottage Cheese |
| 0863699000108 | u | 45 | MAYO Real Mayonnaise made with Avocado Oil | named+price | catalogue_hit | catalogue | Mayo Real Mayonnaise, Mayo |
| 0894700010144 | u | 45 | Greek Yogurt Vanilla | named+price | catalogue_hit | catalogue | Vanilla Nonfat Greek Yogurt, Vanilla |
| 01210806 | u | 45 | Purified Drinking Water | no result | not_in_catalogue |  |  |
| 0716270001660 | u | 45 | Ginger Crystallized In Dark Chocolate | named+price | catalogue_hit | catalogue | Ginger Crystallized IN Dark Chocolate |
| 0047495112900 | u | 45 | Fig Bar Blueberry | named only | catalogue_hit | catalogue | Blueberry Fig Bar, Blueberry |
| 0051500255377 | u | 45 | Extra Crunchy Peanut Butter | named+price | catalogue_hit | catalogue | Extra Crunchy Peanut Butter, Extra Crunchy |
| 0012044038918 | u | 45 | Desodorante | named+price | catalogue_hit | catalogue | Pure Sport |
| 8901491100519 | C | 44 | Kurkure | named only | catalogue_hit | catalogue | Kurkure |
| 8001250016522 | C | 44 | Pesto Alla Genovese | named+price | catalogue_hit | catalogue | PESTO alla GENOVESE |
| 0062020000842 | Cc | 44 | HAZELNUT SPREAD WITH COCOA | named+price | catalogue_hit | catalogue | Hazelnut Spread With Cocoa |
| 0047495013054 | u | 44 | FIG BAR Raspberry | named only | catalogue_hit | catalogue | Fig Bar, Raspberry |
| 0013000006057 | u | 44 | Tomato Ketchup | named+price | catalogue_hit | catalogue | Heinz Tomato Ketchup, 32 OZ Bottle |
| 0073132031112 | u | 44 | Sourdough Bread | named+price | catalogue_hit | catalogue | Sourdough Bread, Sourdough |
| 0051500243213 | u | 44 | Peanut Butter Spread | named+price | catalogue_hit | catalogue | Creamy Peanut Butter Spread, Creamy |
| 0028400516464 | u | 44 | Nacho Cheese Flavored Doritos | named+price | catalogue_hit | catalogue | Nacho Cheese Tortilla Chips, Nacho Cheese |
| 0021000658831 | u | 44 | mac & cheese | named+price | catalogue_hit | catalogue | Original Flavor Macaroni & Cheese Dinner, Original |
| 0850251004940 | u | 44 | ORIGINAL POPCORN | named+price | named_outside_catalogue | open_food_facts | ORIGINAL POPCORN |
| 0850068582013 | u | 44 | Dark Chocolate Pistachio Almond Cranberry Bites | named only | named_outside_catalogue | open_food_facts | Dark Chocolate Pistachio Almond Cranberry Bites |
| 0034361485756 | u | 44 | Hippo Fraise | no result | not_in_catalogue |  |  |
| 0708747151930 | u | 44 | MEGA OMEGA | no result | not_in_catalogue |  |  |
| 0879890002995 | u | 44 | Crunchmaster Multi-Grain 6-Seed Crunchy Baked Rice Crackers | price, no name | not_in_catalogue |  |  |
| 0096619331130 | Cc | 43 | Tartinade de noisette | named only | catalogue_hit | catalogue | Hazelnut Spread with Cocoa |
| 0021000612239 | u | 43 | Cream Cheese | named+price | catalogue_hit | catalogue | Original Cream Cheese |
| 0073410013854 | u | 43 | Whole Grains Healthy Multi-Grain | named only | catalogue_hit | catalogue | Whole Grains Healthy Multi-Grain Bread |
| 0850017468993 | u | 43 | Catalina Crunch Cinnamon Toast Protein Cereal | price, no name | not_in_catalogue |  |  |
| 0072250020756 | u | 43 | Perfectly Crafted Multigrain | named+price | catalogue_hit | catalogue | Thick Sliced Multigrain Bread |
| 0767707001678 | u | 43 | Pure Irish Butter | named+price | catalogue_hit | catalogue | Naturally Softer Pure Irish Butter |
| 0850251004018 | u | 43 | Original Popcorn | named only | catalogue_hit | catalogue | Popcorn |
| 0747479000079 | u | 43 | Marinara | named+price | catalogue_hit | catalogue | Marinara Sauce, Marinara |
| 0855140002175 | u | 43 | ORIGINAL ANCIENT GRAIN GRANOLA | named+price | catalogue_hit | catalogue | Original Organic Ancient Grain Granola, Original |
| 00614207 | u | 43 | Rolled Corn Tortilla Chips Chili & Lime Flavored | named only | named_outside_catalogue | open_food_facts | Rolled Corn Tortilla Chips Chili & Lime Flavored |
| 0073430005044 | u | 43 | Zephyrhills | no result | not_in_catalogue |  |  |
| 0096619222490 | u | 43 | Super Extra Large Peanuts | named only | catalogue_hit | catalogue | Super Extra Large Peanuts, Roasted & Salted |
| 0022592007014 | u | 43 | Bottled Spring Water | no result | not_in_catalogue |  |  |
| 0061148179010 | Cc | 42 | Lentil & Vegetable Soup | named+price | catalogue_hit | catalogue | Lentil & Vegetable Soup |
| 0675625323188 | Cc | 42 | Flocons D'Avoine | named only | catalogue_hit | catalogue | Rolled Oats |
| 8004690612002 | C | 42 | Penne rigate nº 20 | named only | catalogue_hit | catalogue | Penne Rigate N°20 |
| 0068100083293 | Cc | 42 | Smooth | named+price | catalogue_hit | catalogue | Smooth |
| 0196633966339 | Cuc | 42 | Roasted Almonds with Sea Salt | named only | named_outside_catalogue | open_food_facts | Roasted Almonds with Sea Salt |
| 0733739012890 | Cc | 42 | Magnesium Glycinate | named only | catalogue_hit | catalogue | NOW Foods Magnesium Glycinate Nervous System Support Health  |
| 3472860051053 | C | 42 | Les Sablés | named only | catalogue_hit | catalogue | La Mere Poulard - Pure Butter French Biscuits, 125g (4.4oz) |
| 0075720481279 | u | 42 | Light Mayonnaise | named only | named_outside_catalogue | open_food_facts | Light Mayonnaise |
| 0016000507661 | u | 42 | Peanut Butter Dark Chocolate | named only | catalogue_hit | catalogue | Nature Valley Protein Peanut Butter Dark Chocolate Chewy Bar |
| 0857777004195 | u | 42 | Blueberry RXBAR | named+price | catalogue_hit | catalogue | Blueberry Protein Bar, Blueberry |
| 0705599011627 | u | 42 | Power Cakes Flapjack & Waffle Mix | named+price | catalogue_hit | catalogue | Buttermilk Power Cakes Flapjack & Waffle Mix, Buttermilk |
| 0078742351865 | u | 42 | Whole Milk | named+price | catalogue_hit | catalogue | Whole Milk |
| 0044000050986 | u | 42 | original made with sea salt | named+price | catalogue_hit | catalogue | Triscuit Original Crackers 8.5 OZ |
| 0075720000814 | u | 42 | poland spring | no result | not_in_catalogue |  |  |
| 0051500017005 | u | 42 | Natural Creamy Peanut Butter | named+price | catalogue_hit | catalogue | Creamy Natural Peanut Butter, Creamy |
| 0074305001161 | u | 42 | Apple Cider Vinegar | named+price | catalogue_hit | catalogue | Organic Apple Cider Vinegar With The 'mother' |
| 0025293600232 | u | 42 | Organic Unsweetened Soymilk | named+price | catalogue_hit | catalogue | Silk Organic Soymilk Unsweetened 64 OZA |
| 3165432640006 | C | 41 | Sucre de glace | named only | catalogue_hit | catalogue | Sucre de glace |
| 8004030022010 | C | 41 | Light Tuna Salad Corn with peas, carrots and black olives | named+price | catalogue_hit | catalogue | Tuna Salad with Corn |
| 0853807005828 | Cuc | 41 | Avocado Oil | named+price | catalogue_hit | catalogue | Avocado Oil |
| 0096619142453 | Cuc | 41 | Fancy Whole Cashews with Sea Salt | named only | catalogue_hit | catalogue | Fancy Whole Cashews with Sea Salt |
| 0811620021968 | u | 41 | Fairlife Core Power - 26 | named+price | catalogue_hit | catalogue | Complete Protein 26 G High Protein Milk Shake, Vanilla, |
| 0077260062512 | u | 41 | Elegant collection a decadent 16 piece private reserve choco | named only | catalogue_hit | catalogue | Elegant Collection A Decadent 16 Piece Private Reserve Choco |
| 0818290018571 | u | 41 | Greek Yogurt Vanilla Flavored | named+price | catalogue_hit | catalogue | Vanilla Zero Sugar Nonfat Greek Yogurt, Vanilla |
| 0013764027039 | u | 41 | Organic Bread Good Seed | named+price | catalogue_hit | catalogue | Dave's Killer Bread Good Seed Organic Bread, 27 OZ |
| 00414234 | u | 41 | Fettuccine Alfredo | named only | named_outside_catalogue | open_food_facts | Fettuccine Alfredo |
| 0078742016856 | u | 41 | Greek Plain | named only | catalogue_hit | catalogue | Plain Greek Nonfat Yogurt, Plain |
| 0018627115656 | u | 41 | Peanut Butter Crunch | price, no name | not_in_catalogue |  |  |
| 0034361451683 | u | 41 | Gervais le petit suisse | named only | named_outside_catalogue | open_food_facts | Gervais le petit suisse |
| 0811620020169 | u | 41 | Whole ultra-filtered milk | named+price | catalogue_hit | catalogue | Whole Ultra-Filtered Milk |
| 80602316 | C | 40 | mixmax | named only | catalogue_hit | catalogue | MixMax |
| 0096619679133 | Cuc | 40 | Maple Syrup | named only | catalogue_hit | catalogue | Maple Syrup |
| 0096619615162 | Cuc | 40 | Kettle Brand Krinkle Cut Pink Salt Potato Chips | named+price | catalogue_hit | catalogue | Kettle Brand Krinkle Cut Pink Salt Potato Chips |
| 8004690612804 | C | 40 | Fusilli No. 28 Le Integrali | named only | catalogue_hit | catalogue | Fusilli |
| 3450971451856 | C | 40 | Thon entier listao | named only | catalogue_hit | catalogue | Eco+ Thon entier listao 140 g |
| 0024600010030 | u | 40 | Iodized Salt | named+price | catalogue_hit | catalogue | Iodized Salt |
| 0857484006611 | u | 40 | dark chocolate coconut whips | price, no name | not_in_catalogue |  |  |
| 0070303022160 | u | 40 | Season Boneless Sardines in 100% Olive Oil | named+price | catalogue_hit | catalogue | Skinless & Boneless Sardines IN 100% Olive Oil |
| 09141209 | u | 40 | Bourn Vita 500Gram Pauch | no result | not_in_catalogue |  |  |
| 0012044037539 | u | 40 | Swagger Deodorant | named+price | catalogue_hit | catalogue | Swagger Deodorant |
| 0016000170032 | u | 40 | Cheerios | named+price | catalogue_hit | catalogue | Cheerios Original Gluten Free Breakfast Cereal Family Size |
| 0014100074670 | u | 40 | Sourdough | named+price | catalogue_hit | catalogue | Pepperidge Farm Farmhouse Sourdough Bread, 24 Oz Loaf |
| 0096619183074 | u | 40 | Wildflower Honey | named only | named_outside_catalogue | open_food_facts | Wildflower Honey |
| 0748927059113 | u | 40 | Gold Standard 100% Whey Extreme Milk Chocolate | named only | catalogue_hit | catalogue | Extreme Milk Chocolate Flavor 100% Whey Gold Standard Protei |
| 0687456211091 | u | 40 | Organic Chewy Granola Bar | no result | not_in_catalogue |  |  |
| 0014100085980 | u | 40 | Whole Grain 15 Grain Bread | named only | catalogue_hit | catalogue | Pepperidge Farm Whole Grain 15 Grain Bread, 24 Oz Loaf |
| 0072250049191 | u | 40 | Butterbread | named+price | catalogue_hit | catalogue | Butter Enriched Bread, Butter |
| 07831504 | u | 40 | Dr Pepper | no result | not_in_catalogue |  |  |
| 0096619885725 | Cuc | 39 | Extra Fancy Salted Mixed Nuts | named only | catalogue_hit | catalogue | Extra Fancy Salted Mixed Nuts |
| 0731216103987 | Cuc | 39 | Aussie Bites | named only | catalogue_hit | catalogue | Aussie Bites |
| 0096619885718 | Cuc | 39 | UNSALTED MIXED NUTS | named only | catalogue_hit | catalogue | Unsalted Mixed Nuts |
| 0856069005957 | u | 39 | Almond Flour Crackers - Fine Ground Sea Salt | named+price | catalogue_hit | catalogue | Fine Ground Sea Salt Almond Flour Crackers, Fine Ground Sea  |
| 0850036699187 | u | 39 | Sweet Potato Chips Sea Salt | named+price | catalogue_hit | catalogue | Avocado Oil Sea Salt Kettle Cooked Sweet Potato Chips |
| 0044000069230 | u | 39 | Wheat Thins original | named+price | catalogue_hit | catalogue | Original 100% Whole Grain Snacks, Original |
| 0856312002795 | u | 39 | Chocolate Reduced Fat Ultra-filtered Milk | named+price | catalogue_hit | catalogue | Chocolate 2% Reduced Fat Ultra-Filtered Milk, Chocolate |
| 0037600106481 | u | 39 | Skippy | named only | named_outside_catalogue | open_food_facts | Skippy |
| 0014100085478 | u | 39 | Goldfish Cheddar | named+price | catalogue_hit | catalogue | Goldfish Cheddar Crackers, 6.6 Oz Bag |
| 0818290017710 | u | 39 | Strawberries & Cream | named+price | catalogue_hit | catalogue | Strawberry Cream Lowfat Greek Yogurt Drink, Strawberry Cream |
| 0039047001152 | u | 39 | Shortbread Pure Butter | named+price | catalogue_hit | catalogue | All-Butter Shortbread Fingers |
| 0048001265745 | u | 39 | Real Mayonnaise | no result | not_in_catalogue |  |  |
| 0829696000800 | u | 39 | WILD PACIFIC SARDINES | named+price | catalogue_hit | catalogue | Lightly Smoked Wild Sardines IN Extra Virgin Olive Oil, Ligh |
| 0049508250302 | u | 39 | Pretzel Crisps Original Organic | named only | catalogue_hit | catalogue | Snack Factory Snack FactoryPretzel Crisps 28 ONZ |
| 0075140005024 | u | 39 | Alpine Spring Water | named only | named_outside_catalogue | open_food_facts | Alpine Spring Water |
| 0850045947576 | u | 39 | Popcorn | price, no name | not_in_catalogue |  |  |
| 9350271000225 | C | 38 | Organic Raspberry Lemonade Kombucha | named+price | catalogue_hit | catalogue | Organic Raspberry Lemonade Kombucha |
| 7622200007332 | C | 38 | Chocolate de leite dos Alpes Strawberry | named+price | catalogue_hit | catalogue | Chocolate de leite dos Alpes Strawberry |
| 0021000026326 | u | 38 | REAL MAYO Creamy & Smooth | named+price | catalogue_hit | catalogue | Creamy & Smooth Real Mayo |
| 0013764028081 | u | 38 | THIN-SLICED ORGANIC BREAD | named+price | catalogue_hit | catalogue | Thin-Sliced Organic Bread |
| 0028400147392 | u | 38 | Harvest Cheddar | named+price | catalogue_hit | catalogue | Sunchips Harvest Cheddar 100% Whole Grain Snacks 7 Ounce Pla |
| 0051500255650 | u | 38 | PEANUT BUTTER SPREAD | named+price | catalogue_hit | catalogue | Creamy Peanut Butter Spread, Creamy |
| 0071146008274 | u | 38 | Harvest Snaps Lightly Salted Crispy Baked Veggie Snacks | price, no name | not_in_catalogue |  |  |
| 0859480006589 | u | 38 | AHI YELLOWFIN TUNA | named+price | named_outside_catalogue | open_food_facts | AHI YELLOWFIN TUNA |
| 0851769007003 | u | 38 | Grain Free Tortilla Chips | named+price | catalogue_hit | catalogue | Sea Salt Grain Free Tortilla Chips, Sea Salt |
| 0068100084238 | Cc | 37 | Beurre D’arachide Croquant | named+price | catalogue_hit | catalogue | Crunchy Peanut Butter |
| 0014100075233 | u | 37 | Goldfish Baked Snack Crackers Cheddar | named only | catalogue_hit | catalogue | Pepperidge Farm Crackers |
| 0073420000110 | u | 37 | Sour Cream | named+price | catalogue_hit | catalogue | Sour Cream |
| 0813636023356 | u | 37 | Organic Almondmilk Unsweetened | named+price | catalogue_hit | catalogue | Unsweetened Organic Almondmilk, Unsweetened |
| 0034000400126 | u | 37 | Reeses Creamy Peanut Butter | named+price | catalogue_hit | catalogue | Creamy Peanut Butter, Creamy |
| 0044000031930 | u | 37 | Crunchy Breakfast Biscuits | named only | catalogue_hit | catalogue | Nabisco Belvita Cookies Cinnamon Brown Sugar 1X1.76 OZ |
| 0073420516208 | u | 37 | Cottage Cheese Pure & Natural | named+price | catalogue_hit | catalogue | 2% Low Fat Small Curd Cottage Cheese |
| 0708163260933 | u | 37 | Avocado Oil Classic Sea Salt Kettle Style Potato Chips | named+price | named_outside_catalogue | open_food_facts | Avocado Oil Classic Sea Salt Kettle Style Potato Chips |
| 0850053892493 | u | 37 | Crunchy Roasted Edamame Sea Salt | no result | not_in_catalogue |  |  |
| 0070162958709 | u | 37 | Bakery Bread | price, no name | not_in_catalogue |  |  |
| 0850000547568 | u | 37 | MINI FRUIT BARS | price, no name | not_in_catalogue |  |  |
| 0811130033727 | u | 37 | nufri chocolate milk shake | price, no name | not_in_catalogue |  |  |
| 0850004554029 | u | 37 | IQ Bar Chocolate Sea Salt | named only | catalogue_hit | catalogue | Iqbar Chocolate Sea Salt Bar 1.6 oz/45 g |
| 0029000073258 | u | 37 | Dry Roasted Salted Peanuts | named+price | catalogue_hit | catalogue | Dry Roasted Peanuts |
| 0810167392005 | u | 37 | creatinine | price, no name | not_in_catalogue |  |  |
| 6191509903627 | C | 36 | Huile d'olive vierge extra | named+price | catalogue_hit | catalogue | Extra Virgin Olive Oil |
| 0058449890072 | Cuc | 36 | Pumpkin Seed + Flax Granola | named+price | catalogue_hit | catalogue | Pumpkin Seed + Flax Granola |
| 0056800664812 | Cc | 36 | Oikos Yogourt Grec Nature | named only | catalogue_hit | catalogue | Oikos Yogourt Grec Nature 500 g |
| 0894697002184 | u | 36 | NuttZo Organic 7 Nut & Seed Butter POWER FUEL Crunchy | price, no name | not_in_catalogue |  |  |
| 0044000000578 | u | 36 | Premium Original Galletas de Soda | named+price | catalogue_hit | catalogue | Original Premium Saltine Crackers, Original |
| 0024463061163 | u | 36 | SRIRACHA HOT CHILI SAUCE | named+price | catalogue_hit | catalogue | Sriracha Hot Chili Sauce |
| 0196633798237 | u | 36 | Creamy Almond Butter | named only | named_outside_catalogue | open_food_facts | Creamy Almond Butter |
| 0850053830303 | u | 36 | Sunflower Cereal Real Cocoa | no result | not_in_catalogue |  |  |
| 0036632042842 | u | 36 | Oikos Pro Strawberry Banana Cultured Dairy Drink | named+price | catalogue_hit | catalogue | Dann Oikos Pro DRK Straw Ban 7OZ (8CT) |
| 0626394305608 | Cc | 35 | Organic Pumpkin Seeds | named only | catalogue_hit | catalogue | Organic Pumpkin Seeds |
| 0068100084214 | Cc | 35 | Smooth Peanut Butter | named+price | catalogue_hit | catalogue | Smooth Peanut Butter |
| 0037600106740 | u | 35 | Natural Creamy Peanut Butter Spread | named+price | catalogue_hit | catalogue | Peanut Butter Spread, Creamy |
| 0075779311145 | u | 35 | Organic Raw Cane Sugar | named+price | catalogue_hit | catalogue | Organic Raw Cane Sugar |
| 0070200790056 | u | 35 | Sauce | named+price | catalogue_hit | catalogue | Chick-Fil-A Sauce, 16 FL OZ |
| 0052500050054 | u | 35 | Real Mayonnaise | named+price | catalogue_hit | catalogue | Real Mayonnaise |
| 0016000124790 | u | 35 | Honey Nut Cheerios | named+price | catalogue_hit | catalogue | Honey Nut Cheerios Gluten Free Breakfast Cereal |
| 0850000429260 | u | 35 | CHOCOLATE DOUGH | named only | catalogue_hit | catalogue | Chocolate Dough Protein Bar, Chocolate Dough |
| 0747479101998 | u | 35 | Marinara | named+price | named_outside_catalogue | open_food_facts | Marinara |
| 0058449770213 | Cuc | 34 | Heritage Flakes Cereal | named+price | catalogue_hit | catalogue | Heritage Flakes Cereal |
| 0068505110051 | Cc | 34 | Quinoa Bread | named only | catalogue_hit | catalogue | Quinoa Bread |
| 0067800002061 | Cc | 34 | Extra Virgin Olive Oil | named+price | catalogue_hit | catalogue | Extra Virgin Olive Oil |
| 0078895300024 | Cuc | 34 | Panda Brand Oyster Flavoured Sauce | named+price | catalogue_hit | catalogue | 16000160 Panda Brand Oyster Flavoured Sauce |
| 26044064 | C | 34 | Moutarde de Dijon au Vinaigre | named only | catalogue_hit | catalogue | Moutarde de Dijon au Vinaigre |
| 0096619846016 | Cuc | 34 | Almonds | named+price | catalogue_hit | catalogue | Almonds |
| 0830028000832 | Cuc | 34 | Spearmint Gum | named+price | catalogue_hit | catalogue | Aspartame Free Natural Spearmint Flavoured Gum |
| 0013764027282 | u | 34 | Powerseed Organic Bread | named+price | catalogue_hit | catalogue | Organic Bread |
| 0894700010267 | u | 34 | Greek Yogurt Strawberry Blended | named+price | catalogue_hit | catalogue | Strawberry Blended Nonfat Greek Yogurt, Strawberry |
| 0041757025410 | u | 34 | ORIGINAL | named+price | catalogue_hit | catalogue | Creamy Original Spreadable Cheese Wedges |
| 0077013615514 | u | 34 | Lightly Breaded Chicken Breast Chunks | no result | not_in_catalogue |  |  |
| 0602652171864 | u | 34 | Oats & Honey With Toasted Coconut | named+price | catalogue_hit | catalogue | Kind Oats & Honey 11 oz/312 g |
| 0084380957840 | u | 34 | Four Fruits Fruit Spread | named+price | catalogue_hit | catalogue | Four Fruit Spread |
| 0851770008785 | u | 34 | COLLAGEN PEPTIDES + PROBIOTICS | named only | named_outside_catalogue | open_food_facts | COLLAGEN PEPTIDES + PROBIOTICS |
| 0815099021634 | u | 34 | Organic Sea Salt Thin & Crispy Chips | named+price | catalogue_hit | catalogue | Late July Sea Salt Organic Tortilla Chips, 10.1 Oz Bag |
| 0020685000645 | u | 34 | Kettle Cooked Potato Chips | named+price | catalogue_hit | catalogue | Original Less Fat Kettle Cooked Potato Chips With Sea Salt,  |
| 0040600022651 | u | 34 | Lindt Excellence | no result | not_in_catalogue |  |  |
| 0068100890556 | Cc | 33 | Juste des arachides - croquant | named+price | catalogue_hit | catalogue | Crunchy All Natural Peanut Butter |
| 0096619161553 | Cc | 33 | Tortilla Chips | named only | catalogue_hit | catalogue | Tortilla Chips |
| 8901491101844 | C | 33 | Lay's Potato Chips | named only | catalogue_hit | catalogue | Lay's Potato Chips |
| 0715756200023 | Cuc | 33 | Strawberries | named+price | catalogue_hit | catalogue | Strawberries |
| 0628154011323 | Cc | 33 | Shredded Wheat & Bran | named+price | catalogue_hit | catalogue | Shredded Wheat & Bran |
| 0063667511005 | Cc | 33 | Unsweetened Organic Fortified Soy Beverage | named+price | catalogue_hit | catalogue | Unsweetened Organic Fortified Soy Beverage |
| 0066721007469 | Cc | 33 | Low Sodium crackers | named+price | catalogue_hit | catalogue | Low Sodium crackers |
| 0041508800082 | u | 33 | S.PELLEGRINO Sparkling Natural Mineral Water | named+price | catalogue_hit | catalogue | S.Pellegrino Sparkling Natural Mineral Water, 16.9 fl oz pla |
| 0096619117062 | u | 33 | ORGANIC EXTRA VIRGIN OLIVE OIL | price, no name | not_in_catalogue |  |  |
| 0030000410004 | u | 33 | Old Fashioned 100% Whole Grain Rolled Oats | named+price | catalogue_hit | catalogue | Old Fashioned 100% Whole Grain Oats, Old Fashioned |
| 0894700010434 | u | 33 | Greek Yogurt Whole Milk Plain | named+price | catalogue_hit | catalogue | Plain Whole Milk Greek Yogurt, Plain |
| 0016000439627 | u | 33 | Protein Chewy Bar Peanut Butter Dark Chocolate | named+price | catalogue_hit | catalogue | Nature Valley Protein Peanut Butter Dark Chocolate Chewy Bar |
| 0748927065404 | u | 33 | Protein powder | named only | named_outside_catalogue | open_food_facts | Protein powder |
| 0193968327071 | u | 33 | PURE PREMIUM HONEY | no result | not_in_catalogue |  |  |
| 0013764028241 | u | 33 | Organic Burger Buns | named+price | catalogue_hit | catalogue | Soft Artisan-Style Burger Buns, Artisan-Style |
| 0096619555017 | u | 33 | Organic peanut butter count | price, no name | not_in_catalogue |  |  |
| 0055577105405 | Cc | 32 | HARVEST CRUNCH ORIGINAL | named+price | catalogue_hit | catalogue | Harvest Crunch Original |
| 8850620888012 | C | 32 | Fischsauce | named+price | catalogue_hit | catalogue | Fish Sauce |
| 0068200325118 | Cc | 32 | skyr aux ingrédients simples | named+price | catalogue_hit | catalogue | skyr aux ingrédients simples |
| 0096619440498 | Cc | 31 | Cashew Clusters with Almonds and Pumpkin Seeds | named only | named_outside_catalogue | open_food_facts | Kirkland Signature Cashew Clusters 907g |
| 0066721007421 | Cc | 31 | triscuit | named+price | catalogue_hit | catalogue | triscuit |
| 0096619553303 | Cc | 31 | Greek Yogourt | named only | catalogue_hit | catalogue | Greek Yogurt |
| 0096619112487 | Cc | 31 | Organic Saigon Cinnamon Ground | named+price | named_outside_catalogue | open_food_facts | Organic Saigon Cinnamon Ground |
| 8801073114814 | C | 31 | Artificial Spicy Chicken Flavor Stir-Fried Ramen | named+price | catalogue_hit | catalogue | Artificial Spicy Chicken Flavor Stir-Fried Ramen |
| 0096619372379 | Cc | 31 | Honey | named only | catalogue_hit | catalogue | Honey |
| 0096619362851 | Cc | 31 | Walnuts | named only | catalogue_hit | catalogue | Walnuts |
| 0030000012000 | Cc | 31 | Quick 1-Minute Oats | named+price | catalogue_hit | catalogue | Quick 1-Minute Oats |
| 0078895300017 | Cc | 30 | PANDA BRAND OYSTER SAUCE | named+price | catalogue_hit | catalogue | Panda Brand Oyster Sauce |
| 0016229001711 | Cc | 30 | Coconut Milk | named+price | catalogue_hit | catalogue | Coconut Milk |
| 0096619142293 | Cc | 29 | Organic Hemp Hearts | named only | catalogue_hit | catalogue | Organic Hemp Hearts |
| 5201010015083 | C | 29 | Penne rigate | named only | catalogue_hit | catalogue | Misko Penne rigate 500 g |
| 0055653686040 | Cc | 29 | Breton legume du jardin | named+price | catalogue_hit | catalogue | garden vegetable crackers |
| 0060410046678 | Cc | 29 | Original recipe | named+price | catalogue_hit | catalogue | Original Recipe |
| 0096619928910 | Cc | 29 | Fancy Whole Unsalted Cashews | named+price | catalogue_hit | catalogue | Fancy Whole Unsalted Cashews |
| 0877693004499 | Cc | 29 | Oatmeal cookie crunch | named only | catalogue_hit | catalogue | Oatmeal cookie crunch |
| 06731906 | Cc | 29 | Coke Zero | named+price | catalogue_hit | catalogue | Cola Flavoured Soft Drink, Zero Sugar |
| 0096619316212 | Cc | 29 | ORGANIC LOAF | named only | catalogue_hit | catalogue | Organic Loaf |
| 0058449251002 | Cc | 29 | Flocons de son d'avoine | named only | catalogue_hit | catalogue | Oat bran flakes |
| 8004030097001 | C | 28 | Light Tuna Chunks in Olive Oil | named only | catalogue_hit | catalogue | Rio Mare Light Tuna Chunks in Olive Oil |
| 8801052435015 | C | 28 | Gochujang Brown Rice Red Pepper Paste | named+price | catalogue_hit | catalogue | Gochujang Brown Rice Red Pepper Paste |
| 0061077771200 | Cc | 28 | Pain blanc | named only | catalogue_hit | catalogue | Ultra-Moelleux White Sandwich Bread |
| 7622300590970 | C | 27 | Choco Biscuits | named only | catalogue_hit | catalogue | Choco biscuits |
| 0715756100019 | Cc | 27 | Raspberries | named+price | catalogue_hit | catalogue | Raspberries |
| 0062020000743 | Cc | 27 | Hazelnut Spread with Cocoa | named+price | catalogue_hit | catalogue | Hazelnut Spread with Cocoa |
| 26073224 | C | 27 | Brioche tressée | named only | catalogue_hit | catalogue | Les Pâtissades Brioche tressée 600 g |
| 0096619234998 | Cc | 27 | Arachides | named only | catalogue_hit | catalogue | Extra-Large Peanuts |
| 0068400259794 | Cc | 27 | Vraie Mayonnaise | named only | catalogue_hit | catalogue | Mayonnaise |
| 0052302150907 | Cc | 27 | Dark Chocolate 82% | named only | named_outside_catalogue | open_food_facts | Dark Chocolate 82% |
| 0055653632146 | Cc | 27 |  | named+price | catalogue_hit | catalogue | Vinta Original |
| 06407014 | Cc | 27 | All-Bran Buds | named+price | catalogue_hit | catalogue | All Bran All-Bran Buds Cereal |
| 0060885000670 | Cc | 27 | Sourdough Bistro Classic Loaf | named only | catalogue_hit | catalogue | Sourdough Bistro Classic Loaf |
| 3800102719063 | C | 27 | Вафла Боровец портокал | named only | catalogue_hit | catalogue | Вафла Боровец портокал |
| 0096619384730 | Cc | 27 | sea SALT FINE GRAIN | named+price | catalogue_hit | catalogue | sea SALT FINE GRAIN |
| 9300633929169 | C | 27 | Chunk Light Tuna | named only | catalogue_hit | catalogue | Chunk Light Tuna |
| 0055617055127 | Cc | 26 | Harvest Multigrain de Campagne | named+price | catalogue_hit | catalogue | Harvest Multigrain |
| 0036593031206 | Cc | 26 | Craquelins de patate douce | named only | catalogue_hit | catalogue | Sweet Potato Crackers |
| 0064100271913 | Cc | 26 | All Bran Buds | named only | catalogue_hit | catalogue | All-Bran Buds |
| 3664346300148 | C | 26 | Chocolat au lait | named only | catalogue_hit | catalogue | Poulain Chocolat au lait 95 g |
| 0068437389693 | Cc | 26 | Açaí & blueberry flavours | named only | catalogue_hit | catalogue | Açaí & blueberry flavours |
| 7622201521110 | C | 26 | Milka hazelnut creme jar | named only | catalogue_hit | catalogue | Milka hazelnut creme jar 350g |
| 8004690616604 | C | 25 | Farfalle rigate n°66 | named only | catalogue_hit | catalogue | Pasta di semola di grano duro |
| 3179142787104 | C | 25 | Pépites de chocolat au lait | named only | catalogue_hit | catalogue | McCormick Pépites de chocolat au lait 100 g e |
| 0628678617544 | Cc | 25 | Rainbow Hoops | named+price | catalogue_hit | catalogue | Rainbow Hoops Cereal No Sugar |
| 0055653670247 | Cc | 25 | Breton Original | named+price | catalogue_hit | catalogue | Breton |
| 0068100899788 | Cc | 25 | Kraft All Natural Sea Salt Peanut Butter | named+price | catalogue_hit | catalogue | Peanut Butter |
| 0041500007007 | Cc | 25 | Classic Yellow Mustard | named+price | catalogue_hit | catalogue | Classic Yellow Mustard |
| 06782900 | Cc | 25 | Coca-cola Classique | named+price | catalogue_hit | catalogue | Cola Flavoured Soft Drink |
| 3250390001508 | C | 25 | Sirop Menthe bidon 75cl | named only | catalogue_hit | catalogue | Paquito Sirop Menthe bidon 75cl |
| 3497917001928 | C | 25 | Chips Saveur camembert | named only | catalogue_hit | catalogue | Chips Saveur camembert |
| 8850025000026 | C | 25 | Refresh Eau de Noix de Coco | named+price | catalogue_hit | catalogue | Refresh Eau de Noix de Coco |
| 0055577107799 | Cc | 25 | Crispy minis | named+price | catalogue_hit | catalogue | Crispy Minis |
| 0068400662600 | Cc | 25 | Mayonnaise | named+price | catalogue_hit | catalogue | Mayonnaise |
| 26073651 | C | 25 | 10 pains au lait | named only | catalogue_hit | catalogue | 10 pains au lait |
| 0770333222027 | Cc | 25 | Hummus (inferred) | named only | catalogue_hit | catalogue | Hummus (inferred) |
| 0879890003091 | Cc | 25 | Multi-Grain Original Crunchy Baked Rice Crackers | named only | named_outside_catalogue | open_food_facts | Multi-Grain Original Crunchy Baked Rice Crackers |
| 0079813000118 | Cc | 24 | GARLIC & FINE HERBS SPREADABLE GOURMET CHEESE | named+price | catalogue_hit | catalogue | Garlic & Fine Herbs Spreadable Gourmet Cheese |
| 0677210091472 | Cc | 24 | ALMOND FRUIT CRUNCH | named only | catalogue_hit | catalogue | Almond Fruit Crunch |
| 0064420255013 | Cc | 24 | Breuvage Laitier (2% M.G. - Sans Lactose ) | named+price | catalogue_hit | catalogue | Sans Lactose Free Fine-Filtered 2% M.F. Dairy Product made w |
| 0096619199747 | Cc | 24 | Organic Chia Seeds | named only | catalogue_hit | catalogue | Organic Chia Seeds |
| 4050036739800 | C | 24 |  | no result | preview_unavailable |  |  |
| 0853807005033 | Cc | 24 | Huile d'avocat en vaporisateur | named+price | catalogue_hit | catalogue | Avocado Oil Spray |
| 0066721028419 | Cc | 24 | Ritz | named+price | catalogue_hit | catalogue | RITZ original |
| 3365741212592 | C | 24 | Chicorée torréfiée en grains | named only | catalogue_hit | catalogue | Chicory Grains Roasted by Chicoree du Nordic |
| 0853358000495 | Cc | 23 | Multigrains Crackers | named only | catalogue_hit | catalogue | Multigrains Crackers |
| 0061077856334 | Cc | 23 | PROTEIN LOAF | named only | catalogue_hit | catalogue | Protein Loaf |
| 0812827003979 | Cc | 23 | Small Batch Sorbetto - DAIRY FREE RASPBERRY LIME | named+price | catalogue_hit | catalogue | Small Batch Sorbetto - DAIRY FREE RASPBERRY LIME |
| 5213002470060 | C | 23 | Xapakth Kalamata Olives | named only | catalogue_hit | catalogue | Xapakth Kalamata Olives 314 ml |
| 5410126146950 | C | 23 | Biscoff pâte à tartiner aux biscuits | named+price | catalogue_hit | catalogue | Biscoff pâte à tartiner aux biscuits |
| 5201010013188 | C | 23 | whole grain risoni | named only | catalogue_hit | catalogue | Misko whole grain risoni 500 g |
| 0888849006656 | Cc | 23 | Tortilla Style Protein Chips Chili Lime Flavor | named only | catalogue_hit | catalogue | Tortilla Style Protein Chips Chili Lime Flavor |
| 0018627102571 | Cc | 23 | Honey Oat Flax | named+price | catalogue_hit | catalogue | Honey Oat Flax |
| 3179142787203 | C | 23 | Pépites chunk chocolat noir | named only | catalogue_hit | catalogue | Vahiné Pépites chunk chocolat noir 100 g |
| 0804642002442 | Cc | 23 | LeanFit Whey Protein Vanilla | named only | catalogue_hit | catalogue | LeanFit Whey Protein |
| 7613032471842 | C | 23 | NESTLÉ DESSERT Caramel 170g | named only | catalogue_hit | catalogue | NESTLÉ DESSERT Caramel 170g |
| 0096619338696 | Cc | 23 | Farine d'amande blanchie - Mouture ultrafine | named+price | catalogue_hit | catalogue | Almond Flour Blanched |
| 0096619516698 | Cc | 23 | Protein Bar Variety Pack - Chocolate Brownie & Chocolate Chi | named+price | catalogue_hit | catalogue | Protein Bar Variety Pack - Chocolate Brownie & Chocolate Chi |
| 0605388881243 | Cc | 23 | Natural Spring Water | named only | catalogue_hit | catalogue | Natural Spring Water |
| 0889896931687 | Cc | 23 | Figues biologique séchées au soleil | named only | catalogue_hit | catalogue | Sun-Dried Figs |
| 0196633916280 | Cc | 23 | organic Greek yogurt | named only | catalogue_hit | catalogue | organic Greek yogurt |
| 5012035927592 | C | 22 | Starmix | named+price | catalogue_hit | catalogue | Starmix |
| 0031200029836 | Cc | 22 | Craisins | named only | catalogue_hit | catalogue | Whole & Juicy Dried Cranberries |
| 0065633132818 | Cc | 22 | Plain Cheerios | named+price | catalogue_hit | catalogue | Plain Cheerios |
| 0628154020035 | Cc | 22 | Post Shredded Wheat | named+price | catalogue_hit | catalogue | Post Shredded Wheat |
| 0055991040160 | Cc | 22 | The Big 16 | named+price | catalogue_hit | catalogue | The Big 16 |
| 0057379105010 | Cc | 22 | Eau de source naturelle | named only | catalogue_hit | catalogue | Natural Spring Water |
| 0852204000764 | Cc | 22 | CREAMED RAW ORGANIC HONEY | named only | catalogue_hit | catalogue | Creamed Raw Organic Honey |
| 0020685084423 | Cc | 22 | Croustilles cuites en marmite - Sel de mer | named only | catalogue_hit | catalogue | Original Sea Salt Kettle Cooked Potato Chips |
| 3660140929257 | C | 22 | Savane pocket barr' x 7 189g -brossard | named only | catalogue_hit | catalogue | Savane pocket barr' x 7 189g -brossard |
| 0096619034444 | Cc | 22 | Pacanes en moitiés | named only | catalogue_hit | catalogue | Pecans |
| 0687456217062 | Cc | 22 | Pépites de chocolat Barres Granola | named only | catalogue_hit | catalogue | ORGANIC CHEWY GRANOLA BARS chocolate chip |
| 0068505100366 | Cc | 22 | Oat Home Style Bread | named only | catalogue_hit | catalogue | Oat Home Style Bread |
| 0096619845774 | Cc | 22 | Organic Eggs | named+price | catalogue_hit | catalogue | Organic Eggs |
| 0057000243760 | Cc | 22 | TOMATO KETCHUP | named+price | catalogue_hit | catalogue | Tomato Ketchup |
| 0074904100012 | Cc | 22 | Organic Bananas # 94011 | named only | named_outside_catalogue | open_food_facts | Organic Bananas # 94011 |
| 0055000008815 | Cc | 21 |  | named+price | catalogue_hit | catalogue | Instant Coffee |
| 0065633505896 | Cc | 21 | Fibre1 Barres Tendres Avoine et Chocolat | named only | catalogue_hit | catalogue | Fibre 1 Bar Oats & Chocolate |
| 0047495621044 | Cc | 21 | Fig Bar | named only | catalogue_hit | catalogue | Fig Bar |
| 0055712465777 | Cc | 21 | Muesli No Sugar Added | named+price | catalogue_hit | catalogue | Muesli No Sugar Added |
| 0068505100342 | Cc | 21 | Pain style grand-mère | named only | catalogue_hit | catalogue | Pain style grand-mère |
| 0687456211015 | Cc | 21 | MADEGOOD Chocolate Chip Granola Bar | named only | catalogue_hit | catalogue | MADEGOOD Chocolate Chip Granola Bar |
| 0804642002459 | Cc | 21 | Whey Protein | named only | catalogue_hit | catalogue | Whey Protein |
| 3599740007501 | C | 21 | Tranches panées de Cabillaud MSC | named only | catalogue_hit | catalogue | Findus Tranches panées de Cabillaud MSC |
| 0060383758783 | Cc | 21 | Natural Spring Water | named only | catalogue_hit | catalogue | Natural Spring Water |
| 0057000013165 | Cc | 21 | Tomato Ketchup | named+price | catalogue_hit | catalogue | Tomato Ketchup |
| 0060383708825 | Cc | 21 | Peanut butter | named+price | catalogue_hit | catalogue | Peanut butter |
| 0061077315367 | Cc | 21 | 14 Céréales Grains | named only | catalogue_hit | catalogue | 14 Céréales Grains |
| 5000108030539 | C | 21 | Apple & Blueberry Flavour Microwaveable Oats with Apple & Bl | named only | catalogue_hit | catalogue | Apple & Blueberry Flavour Microwaveable Oats with Apple & Bl |
| 3228021950051 | C | 21 | President petit brie 500g | named only | named_outside_catalogue | open_food_facts | President petit brie 500g |
| 0061362434704 | Cc | 21 | Chunk Light Tuna | named+price | catalogue_hit | catalogue | Chunk Light Tuna |
| 0071146012455 | Cc | 21 | HARVEST SNAPS ORIGINAL BAKED VEGGIE SNACKS | named+price | catalogue_hit | catalogue | Harvest Snaps Original Baked Veggie Snacks |
| 0628154380214 | Cc | 21 | Shreddies Original | named+price | catalogue_hit | catalogue | Shreddies Original |
| 5202132074415 | C | 21 | Condito the green line mayo | named only | catalogue_hit | catalogue | Condito the green line mayo |
| 0068100904826 | Cc | 21 | Kraft Dinner original | named+price | catalogue_hit | catalogue | Macaroni and Cheese |
| 0022796976116 | Cc | 21 | ogx argan | named only | catalogue_hit | catalogue | Argan oil of Morocco |
| 0041390001055 | Cc | 20 | Soy Sauce | named+price | catalogue_hit | catalogue | Soy Sauce |
| 3222110025149 | C | 20 | Saint Agur (format familial) (33% MG) | named only | catalogue_hit | catalogue | Saint Agur format familial) 250 g |
| 0643843714811 | Cc | 20 | Chocolate Protein Shake | named only | catalogue_hit | catalogue | Chocolate Protein Shake |
| 0041790002102 | Cc | 20 | Extra Virgin Olive Oil | named+price | catalogue_hit | catalogue | Extra Virgin Olive Oil |
| 0039978001290 | Cc | 20 | Tvp a | named+price | catalogue_hit | catalogue | Tvp a |
| 0096619673247 | Cc | 20 | Organic Fortified Soy Beverage Original | named only | catalogue_hit | catalogue | Organic Fortified Soy Beverage Original |
| 0018627597612 | Cc | 20 | Honey Almond Flax, GO LEAN Crunch. | named+price | catalogue_hit | catalogue | Honey Almond Flax, GO LEAN Crunch |
| 0069000004258 | Cc | 20 | Pepsi | named+price | catalogue_hit | catalogue | Pepsi |
| 0064100144507 | c | 20 | Rice Krispies | named+price | catalogue_hit | catalogue | Rice Krispies |
| 0061362434308 | c | 20 | Flaked Light Tuna Skipjack in Water | named+price | catalogue_hit | catalogue | Flaked Light Tuna, Skip Jack In Water |
| 0667888106127 | c | 20 | Plantain Chips | named only | catalogue_hit | catalogue | Plantain Chips |
| 0775075110243 | c | 20 | Yogourt grec | named only | catalogue_hit | catalogue | Greek Yogurt |
| 0063400138711 | c | 20 | 14 Grains | named+price | catalogue_hit | catalogue | 14 Grains |
| 0041508800129 | c | 20 | Carbonated Natural Mineral Water | named+price | catalogue_hit | catalogue | Carbonated Natural Mineral Water |
| 0049508006923 | c | 19 | Pretzel Crisps Original | named only | catalogue_hit | catalogue | Pretzel Crisps Original |
| 0064144043156 | c | 19 | Beef Ravioli in Pasta Sauce | named+price | catalogue_hit | catalogue | Beef Ravioli in Pasta Sauce |
| 0041271025644 | c | 19 | Coffee Enhancer French Vanilla International Delight | named+price | catalogue_hit | catalogue | Coffee Enhancer French Vanilla International Delight |
| 0018627102557 | c | 19 | Chocolate Chip Chia 7-Grain & Quinoa bars. Made in 🇨🇦 from | named+price | catalogue_hit | catalogue | Chocolate Chip Chia 7-Grain & Quinoa bars. Made in from dome |
| 0626027700039 | c | 19 | Almond | named+price | catalogue_hit | catalogue | Almond |
| 0096619237432 | c | 19 | Oat | named only | catalogue_hit | catalogue | Oat |
| 0068110030768 | c | 19 | Amandes Tamari | named only | catalogue_hit | catalogue | Tamari Almonds |
| 0811620024129 | c | 19 | Core power | named+price | catalogue_hit | catalogue | Core Power Elite High Protein Milk Shake |
| 0737282363010 | c | 19 |  | named+price | catalogue_hit | catalogue | Morning Crisp Granola Dark Chocolate |
| 0818849020017 | c | 19 | Sungold kiwi | named+price | catalogue_hit | catalogue | Gold Kiwi Pack |
| 0096619165049 | c | 19 | Organic No-Salt Seasoning | named+price | catalogue_hit | catalogue | Organic No-Salt Seasoning |
| 0715756200115 | c | 19 | Fraises Biologique | named+price | catalogue_hit | catalogue | Strawberries |
| 0055577105665 | c | 19 | Oatmeal Squares | named+price | catalogue_hit | catalogue | Oatmeal Squares |
| 06792800 | c | 19 | Diet Coke | named+price | catalogue_hit | catalogue | Cola Flavoured Soft Drink |
| 0190569100508 | c | 19 | Niblets | named+price | catalogue_hit | catalogue | Niblets |
| 0041570055311 | c | 18 | Almond Breeze Unsweetened Original | named+price | catalogue_hit | catalogue | Almond Breeze Unsweetened Original |
| 0059749876957 | c | 18 | Bouteille d'eau | named+price | catalogue_hit | catalogue | Natural Spring Water |
| 0063400138803 | c | 18 | Ancient Grains with Quinoa | named+price | catalogue_hit | catalogue | Ancient Grains with Quinoa |
| 0742812700616 | c | 18 | Hoisin Sauce | named+price | catalogue_hit | catalogue | Hoisin Sauce |
| 0193908007926 | c | 18 | Protein Bar | named only | catalogue_hit | catalogue | Protein Bar |
| 0084380957741 | c | 18 | Red Raspberry Spread | named+price | catalogue_hit | catalogue | Red Raspberry Spread |
| 0064100236189 | c | 18 | VECTOR | named only | catalogue_hit | catalogue | Vector |
| 0065254724515 | c | 18 | Sugar Free Syrup | named+price | catalogue_hit | catalogue | Sugar Free Syrup |
| 0055653684503 | c | 18 | Breton Bouchées Légumes | named+price | catalogue_hit | catalogue | Breton Bouchées Légumes |
| 0068400662808 | c | 18 | Mayonnaise à l'huile d'olive | named+price | catalogue_hit | catalogue | Mayonnaise |
| 0065684005109 | c | 18 | Greek Plain | named+price | catalogue_hit | catalogue | Greek Plain |
| 0056200926466 | c | 18 | Tomato Ketchup | named+price | catalogue_hit | catalogue | Tomato Ketchup |
| 0057000013424 | c | 18 | Tomato Ketchup | named only | catalogue_hit | catalogue | Tomato Ketchup |
| 0018627114833 | c | 18 | Kashi GO LEAN Original Cereal | named+price | catalogue_hit | catalogue | Kashi GO LEAN Original Cereal |
| 0060410053942 | c | 18 | Sun Chips Multigrain Chips | named+price | catalogue_hit | catalogue | Sun Chips Multigrain Chips |
| 0687456213019 | c | 18 | ORGANIC CHEWY GRANOLA BARS chocolate chip | named+price | catalogue_hit | catalogue | ORGANIC CHEWY GRANOLA BARS chocolate chip |
| 0897580000595 | c | 18 | Mary's organic crackers | named only | catalogue_hit | catalogue | Original Crackers |
| 0068400142157 | c | 18 | Real Mayonnaise | named+price | catalogue_hit | catalogue | Real Mayonnaise |
| 0068892324819 | c | 18 | Organic Peanut Butter Smooth | named+price | catalogue_hit | catalogue | Organic Peanut Butter Smooth |
| 0805509998595 | c | 18 | Noix de cajous crues | named only | catalogue_hit | catalogue | raw cashews |
| 0893594001962 | c | 18 | Pita Chips | named only | catalogue_hit | catalogue | Pita Chips |
| 0626027811025 | c | 18 | Oat Original | named+price | catalogue_hit | catalogue | Oat Original |
| 0063667201012 | c | 18 | Organic Gluten-Free Oat Beverage | named only | catalogue_hit | catalogue | Organic Gluten-Free Oat Beverage |
| 0055577101100 | c | 17 | Quick Oats | named+price | catalogue_hit | catalogue | Quick Oats |
| 0030100111764 | c | 17 | Snack Stacks Original | named+price | catalogue_hit | catalogue | Snack Stacks Original |
| 0066581001041 | c | 17 | Beurre D'arachide Naturel Crémeux | named+price | catalogue_hit | catalogue | Creamy Peanut Butter / Beurre D'arachide Crémeux |
| 0056800634211 | c | 17 | Yogourt grec nature | named+price | catalogue_hit | catalogue | Yogourt grec nature |
| 0060410047019 | c | 17 | Classic | named+price | catalogue_hit | catalogue | Classic |
| 0016229914578 | c | 17 | Coconut Water | named+price | catalogue_hit | catalogue | Coconut Water |
| 0068100083095 | c | 17 | Extra Creamy Peanut Butter | named+price | catalogue_hit | catalogue | Extra Creamy Velouté |
| 0078355570004 | c | 17 | Greek Style Yogurt | named+price | catalogue_hit | catalogue | Honey Greek Style Yogurt, Honey |
| 0066721028433 | c | 17 | Wheat thins multigrain | named+price | catalogue_hit | catalogue | Wheat Thins multigrain |
| 0068200325095 | c | 17 | creamy skyr plain | named+price | catalogue_hit | catalogue | creamy skyr plain |
| 0025293000735 | c | 17 | Protein Soy Unsweetened | named+price | catalogue_hit | catalogue | Protein Soy Unsweetened |
| 0829515321109 | c | 17 | Garden Veggie Straws | named only | catalogue_hit | catalogue | Garden Veggie Straws |
| 0096619897001 | c | 17 | Maple Syrup | named only | catalogue_hit | catalogue | Maple Syrup |
| 0674491111752 | c | 17 | Soya cuisine | named only | catalogue_hit | catalogue | Cuisine Bio Organic |
| 0804642003791 | c | 17 | Creatine Monohydrate | named only | catalogue_hit | catalogue | Creatine Monohydrate |
| 0060885000519 | c | 17 | Canada's Grain Bread | named+price | catalogue_hit | catalogue | Canada's Grain Bread |
| 0890497000764 | c | 17 | Sourdough Bistro Multigrain Loaf | named only | catalogue_hit | catalogue | Sourdough Bistro Multigrain Loaf |
| 0065633132948 | c | 17 | Honey Nut Cheerios | named+price | catalogue_hit | catalogue | Honey Nut Cheerios |
| 0190569102601 | c | 17 | Cream Style Corn | named+price | catalogue_hit | catalogue | Cream Style Corn |
| 0096619332731 | c | 17 | Macadamia Nuts | named only | catalogue_hit | catalogue | Macadamia Nuts |
| 0024463063167 | c | 17 | SRIRACHA HOT CHILI SAUCE | named+price | catalogue_hit | catalogue | Sriracha Hot Chili Sauce |
| 0056800510522 | c | 17 | Oikos Pro Strawberry-Banana | named+price | catalogue_hit | catalogue | Oikos Pro Strawberry-Banana |
| 0065172939503 | c | 17 | Variety Pack | named only | catalogue_hit | catalogue | Variety Pack |
| 0055577105597 | c | 17 | HARVEST CRUNCH FIBRE & LOW SUGAR OATS & ALMOND GRANOLA CEREA | named+price | catalogue_hit | catalogue | Harvest Crunch Fibre & Low Sugar - Oats & Almond Cereal |
| 0856481003180 | c | 17 | Dark Chocolate Style Baking Chips | named+price | catalogue_hit | catalogue | Dark Chocolate Style Baking Chips |
| 0811620024044 | c | 17 | Chocolate Natural Flavour Nutrition Shake | named only | catalogue_hit | catalogue | Chocolate Natural Flavour Nutrition Shake |
| 0096619762644 | c | 16 | Costco Honey | named only | catalogue_hit | catalogue | Costco Honey |
| 0696685120029 | c | 16 | Seeded Multigrain Bread | named only | catalogue_hit | catalogue | Seeded Multigrain Bread |
| 0055577107904 | c | 16 | Rice Cake - Savoury Tomato & Basil | named+price | catalogue_hit | catalogue | Rice Cake - Savoury Tomato & Basil |
| 0096619523900 | c | 16 | Thon pâle entier | named only | catalogue_hit | catalogue | Thon pâle entier |
| 0715756100033 | c | 16 | Framboises | named+price | catalogue_hit | catalogue | Raspberries, 12 oz |
| 0055577312551 | c | 16 | HARVEST CRUNCH ORIGINAL Granola Cereal | named only | catalogue_hit | catalogue | HARVEST CRUNCH ORIGINAL Granola Cereal |
| 0068505102292 | c | 16 | Pain de blé blanc 9 grains / 9 grains white bread | named only | catalogue_hit | catalogue | Pain de blé blanc 9 grains / 9 grains white bread |
| 0065684116157 | c | 16 | Kefir | named+price | catalogue_hit | catalogue | Kefir |
| 0065333001100 | c | 16 | Baking Soda | named+price | catalogue_hit | catalogue | Baking Soda |
| 0064420320148 | c | 16 | Milk protein shake made with ultrafiltered partly skimmed mi | named+price | catalogue_hit | catalogue | Natrel Milk protein shake 2 L |
| 0068505101325 | c | 16 | les grains st-methode | named only | catalogue_hit | catalogue | Whole grain Loaf with sprouted wheat |
| 0037466014630 | c | 16 | Intense Dark Chocolate | named+price | catalogue_hit | catalogue | Intense Dark Chocolate |
| 0037466041339 | c | 16 | SUPREME DARK 90% CACAO | named+price | catalogue_hit | catalogue | Supreme Dark 90% Cacao |
| 0815074022922 | c | 16 | Avocado Oil Spray - 100% Pure, Refined | named+price | named_outside_catalogue | open_food_facts | Avocado Oil Spray - 100% Pure, Refined |
| 0066721028426 | c | 16 | Wheat Thins original | named+price | catalogue_hit | catalogue | Wheat Thins original |
| 0014100170952 | c | 16 | CHEDDAR | named+price | catalogue_hit | catalogue | Cheddar |
| 0059749894449 | c | 16 | Smooth Peanut Butter | named+price | catalogue_hit | catalogue | Smooth Peanut Butter |
| 0056200762170 | c | 16 | Classic Yellow Prepared Mustard | named+price | catalogue_hit | catalogue | Classic Yellow Prepared Mustard |
| 0063211000115 | c | 16 | Tomato | named+price | catalogue_hit | catalogue | Tomato |
| 0196633965301 | c | 16 | Omega 3 | named only | catalogue_hit | catalogue | Omega 3 |
| 0621879007503 | c | 16 | Le petit crémeux | named only | catalogue_hit | catalogue | Le petit Crèmeux |
| 0068200010120 | c | 16 | PūrFiltre 2% Milk | named+price | catalogue_hit | catalogue | PūrFiltre 2% Milk |
| 0056600004269 | c | 16 | Cocoa powder | named+price | catalogue_hit | catalogue | Natural Cocoa |
| 0810059620438 | c | 16 | PICKLE-LICIOUS PICKLE FLAVORED CUCUMBER CRISPS Original | named only | catalogue_hit | catalogue | PICKLE-LICIOUS PICKLE FLAVORED CUCUMBER CRISPS Original |
| 0066721007476 | c | 15 | Triscuit Thin Crisps Original | named+price | catalogue_hit | catalogue | Triscuit Thin Crisps Original |
