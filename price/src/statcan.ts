/**
 * STATISTICS CANADA AVERAGE RETAIL PRICES as a rung of the verdict ladder.
 *
 * Table 18-10-0245-01, "Monthly average retail prices for selected products":
 * 110 everyday products (milk 4 L, peanut butter 1 kg, eggs 1 dozen, ...), one
 * average price per month for Canada, each province, Whitehorse and Yellowknife.
 * Jamin, 2026-11-08: "wire in statistics canada".
 *
 * WHERE IT SITS. price/src/estimate.ts runs it after Pexi's own data (own prices,
 * other sizes, the leaf and parent pools, the brand markup) and BEFORE the paid
 * Claude ask: a staple that Pexi holds no store price for gets the government's
 * average for the shopper's province instead of a model's guess, and no call is
 * spent.
 *
 * HOW AN ITEM IS RECOGNISED. By its name, against the table below: each product
 * has a pattern that must match and a pattern of words that rule it out
 * ("peanut butter" but not "peanut butter cups"). Then by size: the item's size
 * must be in the same family (mass, volume, count) as the product's, and inside
 * its band. A product sold by weight ("per kilogram") or by the unit scales in
 * proportion to any size from a tenth to ten times its own; a packaged product
 * ("Bacon, 500 grams") only from half to double, the same pack-size band the
 * rest of the ladder uses, because small packs cost more per gram. When two of
 * the table's products match (milk 1 L, 2 L and 4 L), the nearest size wins.
 * An item with no size, or none in band, does not use this rung.
 *
 * WHAT IT ANSWERS. The average, scaled to the item's size, for the shopper's
 * province (Canada when the province is unknown or the table has no value for
 * it), from the newest month with a value. The spread is `STATCAN_SIGMA`,
 * measured (see its comment), not chosen.
 *
 * THE DATA FILE. `price/statcan-averages.json`, committed, built from the
 * StatCan download by `node price/src/statcan.ts build <18100245.csv>`. It keeps
 * the newest value per product and place, so it is small and the server needs
 * no network. The table is published monthly; a rebuild picks up the new month.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CsvReader } from './hammer.ts';
import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';

export const TABLE_ID = '18-10-0245-01';
export const TABLE_URL = 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501';
export const DEFAULT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'statcan-averages.json');

/*
 * THE SPREAD is measured, not chosen: `calibrate` takes Project Hammer's latest
 * regular Toronto prices, every product this file recognises, scales each to
 * the StatCan size, and stores the robust spread (1.4826 x median absolute
 * deviation) of log(shelf / (average x shelf factor)) in the data file as
 * `calibration.sigma`. The rung reads it from there.
 */
/** Months older than this (newest value for a product and place) are not used. */
export const MAX_AGE_MONTHS = 24;
/** Band for products sold by weight or by the unit: the price scales in proportion. */
export const LINEAR_BAND = [0.1, 10] as const;
/** Band for packaged products: the ladder's own pack-size band. */
export const PACK_BAND = [0.5, 2] as const;

export interface StatcanItem {
  /** The table's own product name, exactly as it prints it (trimmed). */
  readonly product: string;
  /** The product's size, as the table states it. */
  readonly value: number;
  readonly unit: 'g' | 'kg' | 'ml' | 'l' | 'ea';
  /** Sold by weight or by the unit: scales in proportion across `LINEAR_BAND`. */
  readonly linear?: boolean;
  /** Grams and millilitres are read as one (density 1): jars and tubs are labelled either way. */
  readonly dense?: boolean;
  /** Must match the item's name (lower case). */
  readonly match: RegExp;
  /** Rules the item out when it matches the name. */
  readonly not?: RegExp;
}

// Words that make a fresh ingredient something else: a prepared, flavoured or processed product.
const PREPARED = 'chips?|crisps?|bars?|cookies?|candy|candies|chocolate|cakes?|pies?|muffins?|loaf|sandwich(es)?|wraps?|kits?|meals?|dinners?|soups?|sauces?|seasonings?|flavou?r(ed|s)?|snacks?|bites|dips?|spreads?|pouch(es)?|baby|pet|dogs?|cats?|treats?|ice cream|pudding|dessert|gumm(y|ies)|juices?|drinks?|beverages?|smoothies?|yogh?urts?|cereals?|granola|crackers?|dried|dehydrated|freeze[- ]dried|powder(ed)?|jam|jelly|syrup|vinegar|frozen|canned|tinned|pickled|cups?';
const re = (s: string) => new RegExp(s, 'i');
const notPrepared = (extra = '') => re(`\\b(${PREPARED}${extra ? '|' + extra : ''})\\b`);

export const ITEMS: readonly StatcanItem[] = [
  // Meat and fish, sold by weight.
  { product: 'Beef stewing cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bstewing beef\\b|\\bbeef\\b.*\\bstew(ing)?\\b|\\bstew(ing)? (meat|cubes)\\b'), not: notPrepared('cooked|chunky|irish') },
  { product: 'Beef striploin cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bstrip ?loin\\b|\\bnew york strip\\b'), not: notPrepared('pork|cooked') },
  { product: 'Beef top sirloin cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bsirloin\\b'), not: notPrepared('pork|burgers?|patt(y|ies)|cooked|ground') },
  { product: 'Beef rib cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\brib ?eye\\b|\\bprime rib\\b|\\bbeef\\b.*\\bribs?\\b|\\bribs?\\b.*\\bbeef\\b'), not: notPrepared('pork|cooked|bbq|smoked') },
  { product: 'Ground beef, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bground beef\\b|\\bbeef,? ground\\b|\\bminced beef\\b|\\blean ground\\b(?!.*\\b(pork|chicken|turkey|veal|lamb)\\b)'), not: notPrepared('burgers?|patt(y|ies)|meatballs?|lasagna|cooked|chili|tacos?') },
  { product: 'Pork loin cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bpork\\b.*\\b(loin|chops?|tenderloin)\\b'), not: notPrepared('bacon|peameal|cooked|smoked|cured|ham|back') },
  { product: 'Pork rib cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bpork\\b.*\\bribs?\\b|\\b(back|spare|side) ?ribs?\\b'), not: notPrepared('beef|cooked|bbq|smoked') },
  { product: 'Pork shoulder cuts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bpork\\b.*\\b(shoulder|butt|blade)\\b'), not: notPrepared('cooked|pulled|smoked|ham') },
  { product: 'Whole chicken, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bwhole (fresh |young |grade a )*chickens?\\b|\\bchicken,? whole\\b'), not: notPrepared('roast(ed)?|rotisserie|cooked|bbq|smoked|cornish|wings?|breasts?|legs?|thighs?') },
  { product: 'Chicken breasts, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bchicken\\b.*\\bbreasts?\\b'), not: notPrepared('cooked|roast(ed)?|breaded|nuggets?|strips?|tenders?|fingers?|slices?|sliced|deli|grilled|smoked|fried|burgers?|patt(y|ies)|seasoned|marinated|stuffed|kiev|cordon') },
  { product: 'Chicken thigh, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bchicken\\b.*\\bthighs?\\b'), not: notPrepared('cooked|roast(ed)?|breaded|grilled|smoked|fried|seasoned|marinated|bbq|souvlaki|skewers?') },
  { product: 'Chicken drumsticks, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bchicken\\b.*\\bdrumsticks?\\b|\\bdrumsticks?\\b.*\\bchicken\\b'), not: notPrepared('cooked|roast(ed)?|breaded|grilled|smoked|fried|seasoned|marinated|bbq') },
  { product: 'Salmon, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bsalmon\\b.*\\b(fillets?|steaks?|portions?|sides?|whole|fresh)\\b|\\b(fresh|atlantic|sockeye|coho|pink|chinook|keta) salmon\\b(?!.*\\b(can|canned|tin)\\b)'), not: notPrepared('can|smoked|lox|cooked|candied|jerky|burgers?|cakes?|sushi|in water|in oil|flaked|pate|oil') },
  // Packaged meat and fish.
  { product: 'Bacon, 500 grams', value: 500, unit: 'g', match: re('\\bbacon\\b'), not: notPrepared('bits|back|peameal|turkey|chicken|wrapped|precooked|pre-cooked|cooked|ready|cheddar|burgers?|bacon[ -]and|&|bake') },
  { product: 'Wieners, 400 grams', value: 400, unit: 'g', match: re('\\bwieners?\\b|\\bhot ?dogs?\\b|\\bfranks?\\b|\\bfrankfurters?\\b'), not: re('\\b(buns?|veggie|vegetarian|vegan|plant|meatless|relish|mustard|sauce|chips|kits?)\\b') },
  { product: 'Shrimp, 300 grams', value: 300, unit: 'g', match: re('\\bshrimps?\\b|\\bprawns?\\b'), not: notPrepared('noodles?|ramen|paste|dumplings?|gyoza|har gow|wontons?|sushi|tempura|rings?|cocktail|cakes?|dim sum|fried rice|spring rolls?|shu mai|siu mai|balls?') },
  { product: 'Canned salmon, 213 grams', value: 213, unit: 'g', dense: true, match: re('\\bsalmon\\b.*\\b(can|canned|tin|in water|in brine)\\b|\\b(canned|tinned)\\b.*\\bsalmon\\b|^(wild )?(pink|red|sockeye) salmon$'), not: re('\\b(smoked|cat|pet|pate|spread|fillets?|steaks?|portions?|fresh|frozen)\\b') },
  { product: 'Canned tuna, 170 grams', value: 170, unit: 'g', dense: true, match: re('\\btuna\\b'), not: re('\\b(fresh|steaks?|sushi|sashimi|kits?|sandwich|cat|pet|dog|frozen|loins?|helper|casserole|salad|lunch|snack|poke|seared|yellowfin steak|ahi|porridge|plant[- ]based|taste|sauce|vegetables?|pepper|hot|chil(i|li)|flavou?r(ed)?|spicy|thai|lemon|herbs?|kimchi|curry|bulgogi|mayo|dressing|garlic|onion|tomato|sesame|jalape(n|ñ)o|smoked|sriracha|teriyaki|dill|bbq)\\b') },
  { product: 'Meatless burgers, 226 grams', value: 226, unit: 'g', match: re('\\b(veggie|vegetarian|vegan|plant[- ]based|meatless|beyond|impossible|garden)\\b.*\\bburgers?\\b|\\bburgers?\\b.*\\b(veggie|plant[- ]based|meatless)\\b'), not: re('\\b(buns?|sauce|seasoning)\\b') },
  // Dairy and eggs.
  { product: 'Milk, 1 litre', value: 1, unit: 'l', match: re('\\bmilk\\b'), not: re('\\b(chocolate|choc|flavou?r(ed)?|strawberry|banana|vanilla|coconut|almond|oat|soy|rice|cashew|nut|hemp|pea|condensed|evaporated|powder(ed)?|buttermilk|goat|tea|coffee|shakes?|chips|cookies?|bars?|candy|bread|biscuits?|crackers?|cereal|caramel|cream|kefir|yogh?urt|kids|baby|formula|chai|matcha|latte|honey|sweetened|dessert|pudding|thistle|wafers?|cakes?|ice|chocolate milk|protein|fairlife|a2|organic)\\b') },
  { product: 'Milk, 2 litres', value: 2, unit: 'l', match: re('\\bmilk\\b'), not: re('\\b(chocolate|choc|flavou?r(ed)?|strawberry|banana|vanilla|coconut|almond|oat|soy|rice|cashew|nut|hemp|pea|condensed|evaporated|powder(ed)?|buttermilk|goat|tea|coffee|shakes?|chips|cookies?|bars?|candy|bread|biscuits?|crackers?|cereal|caramel|cream|kefir|yogh?urt|kids|baby|formula|chai|matcha|latte|honey|sweetened|dessert|pudding|thistle|wafers?|cakes?|ice|protein|fairlife|a2|organic)\\b') },
  { product: 'Milk, 4 litres', value: 4, unit: 'l', match: re('\\bmilk\\b'), not: re('\\b(chocolate|choc|flavou?r(ed)?|strawberry|banana|vanilla|coconut|almond|oat|soy|rice|cashew|nut|hemp|pea|condensed|evaporated|powder(ed)?|buttermilk|goat|tea|coffee|shakes?|chips|cookies?|bars?|candy|bread|biscuits?|crackers?|cereal|caramel|cream|kefir|yogh?urt|kids|baby|formula|chai|matcha|latte|honey|sweetened|dessert|pudding|thistle|wafers?|cakes?|ice|protein|fairlife|a2|organic)\\b') },
  { product: 'Soy milk, 1.89 litres', value: 1.89, unit: 'l', match: re('\\bsoy ?(milk|beverage|drink)\\b|\\bsoymilk\\b'), not: re('\\b(chocolate|choc|cups?|boxes|tetra)\\b') },
  { product: 'Nut milk, 1.89 litres', value: 1.89, unit: 'l', match: re('\\b(almond|cashew|nut|hazelnut|macadamia|walnut|pistachio)\\b ?(milk|beverage|drink)\\b|\\balmondmilk\\b'), not: re('\\b(chocolate|choc|bars?|cookies|snacks?|butter|cups?|creamer)\\b') },
  { product: 'Cream, 1 litre', value: 1, unit: 'l', match: re('\\b(whipping|table|cooking|coffee|half[- ]and[- ]half|half ?& ?half|heavy) cream\\b|\\bcream\\b.*\\b(5|10|18|33|35|36) ?%|\\bcreme\\b.*\\b(10|18|35) ?%'), not: re('\\b(ice cream|sour cream|cream cheese|creamer|whipped|topping|cookies?|soup|sauce|creamed|cream of|biscuits?|wafers?|cakes?|puffs?|filled|sandwich|liqueur|aerosol)\\b') },
  { product: 'Butter, 454 grams', value: 454, unit: 'g', match: re('\\bbutter\\b'), not: re('\\b(peanut|almond|cashew|nut|seed|sunflower|apple|cocoa|shea|body|buttermilk|cookies?|popcorn|chicken|croissants?|sauce|garlic|tarts?|biscuits?|crackers?|chips|candy|toffee|scotch|beans|lettuce|squash|chocolate|cups?|flavou?r(ed)?|margarine|ghee|vegan|plant|cream|bread|rolls?|chicken|shortbread|caramel|pecan|tart|knife|dish|butterscotch|butterfly|buttercup|nut butter|soy|lotion|spread|spreadable|whipped|oil|blend)\\b') },
  { product: 'Margarine, 907 grams', value: 907, unit: 'g', match: re('\\bmargarine\\b|\\bbecel\\b|\\bfleischmann'), not: re('\\b(cookies?|crackers?)\\b') },
  { product: 'Block cheese, 500 grams', value: 500, unit: 'g', match: re('\\b(cheddar|mozzarella|marble|colby|monterey|gouda|swiss|havarti|brick|edam|farmer|old|medium|mild)\\b.*\\bcheese\\b|\\bcheese\\b.*\\b(cheddar|mozzarella|marble|colby|gouda|havarti|brick|block)\\b|\\b(cheddar|mozzarella|marble)\\b(?!.*\\b(crackers?|chips|sauce)\\b)'), not: re('\\b(shredded|grated|slices?|sliced|singles|string|strings|sticks?|snacks?|spread|cream cheese|cottage|crackers?|sauce|dip|puffs?|curls|bread|macaroni|mac|pizza|burgers?|cheesecake|cakes?|soup|popcorn|ricotta|parmesan|feta|bocconcini|brie|camembert|goat|nachos?|tortilla|pasta|bites|cubes|portions|babybel|individually|wrapped|flavou?r(ed)?|curds?|pretzels?|crisps|goldfish|cheez|smoked|plant|vegan|dairy[- ]free|bagels?|buns?|biscuits?)\\b') },
  { product: 'Yogurt, 500 grams', value: 500, unit: 'g', dense: true, match: re('\\by[oa]gh?o?urt\\b'), not: re('\\b(drinks?|drinkable|tubes?|cups?|frozen|bars?|coated|covered|raisins|bites|pretzels|melts|granola|dressing|dip|smoothies?|kefir|cereal|cookies|chips|snacks?|dog|dessert|tzatziki|starter|culture|multipack|pack)\\b') },
  { product: 'Eggs, 1 dozen', value: 12, unit: 'ea', match: re('\\beggs?\\b'), not: re('\\b(noodles?|chocolate|easter|nog|eggnog|rolls?|salad|sandwich|mayo|substitute|whites|beaters|liquid|cooked|boiled|bites|pasta|bread|replacer|plant|vegan|cadbury|kinder|surprise|benedict|scotch|ramen|tarts?|custard|drop|fried|dumplings?|yolks?|powder|bagels?|foo young|eggplants?|candy|cream|creme|wash|tofu|patties|mcmuffin|frittata|oatmeal|oats|kits?|curry|matzo|wraps?|bowls?|scrambles?|omelets?|quiche|chips|crackers?|cartons? only|quail|duck)\\b') },
  // Fruit and vegetables.
  { product: 'Apples, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bapples?\\b'), not: notPrepared('sauce|cider|crisp|cinnamon|turnovers?|strudel|fritters?|butter|crumble|rings|slices|sliced|pineapple|custard|danish|tarts?|apple ?jacks|caramel|candied|toffee|pie|chunks') },
  { product: 'Oranges, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\boranges?\\b|\\bnavels?\\b'), not: notPrepared('marmalade|soda|pop|crush|fanta|zest|peel|chicken|liqueur|tea|cranberry|mango|pineapple|carrot|pekoe|segments|fruit|in syrup|mandarins?|clementines?|tangerines?|scented|bitters|extract|sweet potato|lentils|pepper|peppers') },
  { product: 'Oranges, 1.36 kilograms', value: 1.36, unit: 'kg', match: re('\\boranges?\\b|\\bnavels?\\b'), not: notPrepared('marmalade|soda|pop|crush|fanta|zest|peel|chicken|liqueur|tea|cranberry|mango|pineapple|carrot|pekoe|segments|fruit|in syrup|mandarins?|clementines?|tangerines?|scented|bitters|extract|sweet potato|lentils|pepper|peppers') },
  { product: 'Bananas, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bbananas?\\b'), not: notPrepared('bread|split|cream|peppers?|plantains?|milk|chips') },
  { product: 'Pears, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bpears?\\b'), not: notPrepared('halves|in syrup|in juice|nectar|prickly|cider|asian pear drink|diced|slices') },
  { product: 'Lemons, unit', value: 1, unit: 'ea', linear: true, match: re('\\blemons?\\b'), not: notPrepared('lemonade|tea|pepper|curd|zest|soda|meringue|limes?|dressing|chicken|grass|balm|scent(ed)?|cleaner|dish|detergent|squeeze|wedges|sparkling|water|oil') },
  { product: 'Limes, unit', value: 1, unit: 'ea', linear: true, match: re('\\blimes?\\b'), not: notPrepared('soda|lemons?|key lime|scent(ed)?|cleaner|dish|detergent|squeeze|sparkling|water|tortilla|leaves|pickle|cordial|margarita') },
  { product: 'Grapes, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bgrapes?\\b'), not: notPrepared('grapefruits?|soda|seed|leaves|tomato(es)?|raisins|wine') },
  { product: 'Cantaloupe, unit', value: 1, unit: 'ea', linear: true, match: re('\\bcantaloupes?\\b'), not: notPrepared('chunks|cubed|cut|slices|halves|halved|spears') },
  { product: 'Strawberries, 454 grams', value: 454, unit: 'g', match: re('\\bstrawberr(y|ies)\\b'), not: notPrepared('banana|kiwi|lemonade|cheesecake|shortcake|twizzlers|rhubarb|tea|topping|cream|pop|wafers?|milk|sliced') },
  { product: 'Avocado, unit', value: 1, unit: 'ea', linear: true, match: re('\\bavocados?\\b'), not: notPrepared('oil|guacamole|toast|sushi|rolls?|dressing|mayo|salad|ranch|chunks|halves|pulp') },
  { product: 'Potatoes, 4.54 kilograms', value: 4.54, unit: 'kg', match: re('\\bpotato(es)?\\b'), not: notPrepared('sweet|fries|fried|french|wedges|hash|tots|mashed|instant|flakes|salad|skins|starch|flour|scalloped|au gratin|perogies|pierogi|pierogies|gnocchi|rosti|puffs|stix|sticks|baked|stuffed|roasted|bun|buns|bread|rolls|latkes|pancakes|hashbrowns|nuggets|yams?') },
  { product: 'Potatoes, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bpotato(es)?\\b'), not: notPrepared('sweet|fries|fried|french|wedges|hash|tots|mashed|instant|flakes|salad|skins|starch|flour|scalloped|au gratin|perogies|pierogi|pierogies|gnocchi|rosti|puffs|stix|sticks|baked|stuffed|roasted|bun|buns|bread|rolls|latkes|pancakes|hashbrowns|nuggets|yams?') },
  { product: 'Sweet potatoes, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bsweet potato(es)?\\b|\\byams?\\b'), not: notPrepared('fries|puree|cubes|cubed|noodles|spirals|riced|mash(ed)?|wedges|tots') },
  { product: 'Tomatoes, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\btomato(es)?\\b'), not: notPrepared('paste|ketchup|diced|crushed|whole|stewed|sun[- ]dried|salsa|basil|pizza|pasta|bruschetta|cocktail|clamato|v8|puree|passata|strained|tins?|cans?|chopped|plum|peeled|soup|rice|beans|sardines|in juice|sauce') },
  { product: 'Cabbage, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bcabbages?\\b'), not: notPrepared('rolls|salad|coleslaw|slaw|kimchi|sauerkraut|dumplings?|shredded') },
  { product: 'Carrots, 1.36 kilograms', value: 1.36, unit: 'kg', match: re('\\bcarrots?\\b'), not: notPrepared('cake|sticks?|coins|shredded|peas and carrots|peas & carrots|mixed|puree|cubes?|diced|sliced|baby carrots|mini|dip|crinkle|chips|ranch|hummus|celery') },
  { product: 'Onions, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bonions?\\b'), not: notPrepared('green onions?|rings|fried|crispy|garlic|scallions?|shallots?|leeks?|chives?|minced|caramelized|cream|sour cream|chutney|salt|bagels?|bread|diced|chopped|sliced|pearl|cocktail') },
  { product: 'Onions, 1.36 kilograms', value: 1.36, unit: 'kg', match: re('\\bonions?\\b'), not: notPrepared('green onions?|rings|fried|crispy|garlic|scallions?|shallots?|leeks?|chives?|minced|caramelized|cream|sour cream|chutney|salt|bagels?|bread|diced|chopped|sliced|pearl|cocktail') },
  { product: 'Celery, unit', value: 1, unit: 'ea', linear: true, match: re('\\bcelery\\b'), not: notPrepared('salt|seeds?|hearts?|sticks?|cream of|root|celeriac|diced|chopped|carrots?') },
  { product: 'Cucumber, unit', value: 1, unit: 'ea', linear: true, match: re('\\bcucumbers?\\b'), not: notPrepared('pickles?|relish|lotion|gin|water|salad|tzatziki|mini|minis|baby|snacking|scent(ed)?|sliced|dill') },
  { product: 'Mushrooms, 227 grams', value: 227, unit: 'g', match: re('\\bmushrooms?\\b'), not: notPrepared('cream of|pieces|stems|pizza|stir ?fry|burgers?|risotto|gravy|cream|marinated|stuffed|jar(red)?|tins?|in water|enoki|shiitake|oyster|king|chanterelle|porcini|morels?|truffles?|wood ear|reishi|lion|chaga|capsules?|gummies|coffee|extract') },
  { product: 'Iceberg lettuce, unit', value: 1, unit: 'ea', linear: true, match: re('\\biceberg\\b'), not: notPrepared('salad|mix|shredded|chopped|blend|cut') },
  { product: 'Romaine lettuce, unit', value: 1, unit: 'ea', linear: true, match: re('\\bromaine\\b'), not: notPrepared('salad|caesar|mix|chopped|hearts?|blend|cut|spring') },
  { product: 'Broccoli, unit', value: 1, unit: 'ea', linear: true, match: re('\\bbroccoli\\b'), not: notPrepared('florets|slaw|salad|cheese|rice|riced|stir ?fry|mix|medley|tots|crowns?|rabe|raab|rapini|sprouts|cauliflower|chinese|gai lan|broccolini|steam(er|able)') },
  { product: 'Peppers, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\b(red|green|yellow|orange|bell|sweet|field)\\b.*\\bpeppers?\\b|\\bpeppers?\\b.*\\b(red|green|yellow|orange|bell|sweet)\\b'), not: notPrepared('hot|chil(i|li|e)s?|jalape(n|ñ)os?|banana|pepperoncini|roasted|stuffed|flakes|ground|black pepper|white pepper|peppercorns?|steak|chicken|salsa|cheese|pepperoni|dr\\.? pepper|mix|strips|sliced|diced|mini|baby|snacking|shishito|habanero|scotch bonnet|thai|poblano|cherry') },
  { product: 'Squash, per kilogram', value: 1, unit: 'kg', linear: true, match: re('\\bsquash\\b'), not: notPrepared('puree|noodles?|ravioli|cordial|zucchini|cubes?|cubed|spirals|riced|mash(ed)?|seeds?|blossoms?') },
  { product: 'Salad greens, 142 grams', value: 142, unit: 'g', match: re('\\b(spring mix|mixed greens|baby spinach|arugula|baby greens|salad greens|mesclun|power greens|baby kale|spinach|super greens|herb salad|half ?& ?half|50/50)\\b'), not: notPrepared('pie|pasta|ravioli|feta|tortillas?|spanakopita|artichoke|creamed|cooked|cheese|noodles?|chopped kits?|coleslaw|kimchi|seeds?') },
  // Frozen.
  { product: 'Frozen french fried potatoes, 750 grams', value: 750, unit: 'g', match: re('\\bfries\\b|\\bfrench fried\\b|\\bfrites\\b'), not: re('\\b(seasoning|sauce|chips|cheese|poutine|dip|onion|sweet potato|zucchini|carrot|fish|chicken|salt)\\b') },
  { product: 'Frozen green beans, 750 grams', value: 750, unit: 'g', match: re('\\bfrozen\\b.*\\b(green|cut|french[- ]style|whole) beans\\b|\\b(green|cut) beans\\b.*\\bfrozen\\b'), not: re('\\b(canned|in sauce|casserole|almonds?|stir ?fry|mix|medley)\\b') },
  { product: 'Frozen broccoli, 500 grams', value: 500, unit: 'g', match: re('\\bfrozen\\b.*\\bbroccoli\\b|\\bbroccoli\\b.*\\bfrozen\\b'), not: re('\\b(cheese|sauce|rice|riced|stir ?fry|mix|medley|tots|bites|cauliflower|carrots?|pizza|soup|casserole|quiche|pasta)\\b') },
  { product: 'Frozen corn, 750 grams', value: 750, unit: 'g', match: re('\\bfrozen\\b.*\\b(corn|kernel)\\b|\\b(corn|kernel)\\b.*\\bfrozen\\b|\\bcorn niblets\\b'), not: re('\\b(cob|cobs|cobbettes|dogs?|bread|muffins?|chips|tortillas?|soup|chowder|ribs|riblets|fritters|mix|medley|peas|carrots|beans|pizza|nuggets)\\b') },
  { product: 'Frozen mixed vegetables, 750 grams', value: 750, unit: 'g', match: re('\\bmixed vegetables\\b|\\bmixed veg(gies)?\\b|\\b(california|winter|normandy|stir ?fry|oriental|asian|italian|garden|fiesta|country|harvest) (blend|mix|vegetables)\\b|\\bvegetable (blend|medley|mix)\\b'), not: re('\\b(chips|crackers?|juice|soup|pakoras?|samosas?|spring rolls?|pizza|dumplings?|rice|noodles?|pasta|sauce|seasoning|dip|cream cheese|dried|canned|tins?|in brine|fried|patties|burgers?|baby|pouch|stock|broth|bouillon|oil)\\b') },
  { product: 'Frozen peas, 750 grams', value: 750, unit: 'g', match: re('\\bfrozen\\b.*\\b(green |sweet )?peas\\b|\\b(green |sweet )?peas\\b.*\\bfrozen\\b|\\bpetite peas\\b'), not: re('\\b(chick|snow|snap|split|pea protein|wasabi|carrots?|soup|canned|mix|medley|pods|black[- ]eyed|pigeon|dried|rice)\\b') },
  { product: 'Frozen pizza, 390 grams', value: 390, unit: 'g', match: re('\\bpizzas?\\b'), not: re('\\b(sauce|crusts?|dough|kits?|pockets?|rolls?|bites|mozza(rella)?|cheese blend|sticks|seasoning|flavou?r(ed)?|crackers?|chips|goldfish|snacks?|pizzeria|pans?|stone|cutter|mini|bagels?|pops|pretzels?|toaster|lunch|combo|pizzaiolo|shredded|spice|oregano|pepperoni slices|dip|wings?|subs?)\\b') },
  { product: 'Frozen spinach, 300 grams', value: 300, unit: 'g', match: re('\\bfrozen\\b.*\\bspinach\\b|\\bspinach\\b.*\\bfrozen\\b|\\bchopped spinach\\b'), not: re('\\b(pie|pasta|ravioli|feta|spanakopita|artichoke|creamed|dip|pizza|quiche|soup|rice|cheese|wraps?|tortillas?|lasagna|pastry|rolls?|triangles?|puffs?|bites|samosas?)\\b') },
  { product: 'Frozen strawberries, 600 grams', value: 600, unit: 'g', match: re('\\bfrozen\\b.*\\bstrawberr(y|ies)\\b|\\bstrawberr(y|ies)\\b.*\\bfrozen\\b'), not: re('\\b(yogh?urt|bars?|ice cream|cheesecake|pie|waffles?|pops?|smoothies? kits?|dessert|daiquiri|margarita|lemonade|banana|blend|mix|medley|mango|blueberr(y|ies)|rhubarb|sauce|topping|syrup|whole sliced|sliced)\\b') },
  // Bakery, grains and breakfast.
  { product: 'White bread, 675 grams', value: 675, unit: 'g', match: re('\\bwhite\\b.*\\bbread\\b|\\bbread\\b.*\\bwhite\\b|\\bsandwich bread\\b|\\bwonder\\b.*\\bbread\\b'), not: re('\\b(crumbs|flour|mix|machine|sticks|stuffing|garlic|naan|pita|buns?|rolls?|bagels?|toast(ed)?|croutons|whole|wheat|grain|multigrain|rye|sourdough|gluten|keto|raisin|cinnamon|brioche|italian|french|baguette|ciabatta|sliced cheese|frozen|garlic|cheese|loaf pan|pudding|dough|cake)\\b') },
  { product: 'Flatbread and pita, 500 grams', value: 500, unit: 'g', match: re('\\bpitas?\\b|\\bflatbreads?\\b|\\bnaan\\b|\\blavash\\b|\\btortillas?\\b'), not: re('\\b(chips|crackers?|pizzas?|sandwich|kits?|dips?|soup|crisps|bites|thins|chicken|beef|pork|salsa|seasoning|hummus|wraps? kit|tacos? kit|press|warmer|frozen|mini|pockets?|snacks?)\\b') },
  { product: 'Crackers and crisp breads, 200 grams', value: 200, unit: 'g', match: re('\\bcrackers?\\b|\\bcrisp ?breads?\\b|\\bcrispbreads?\\b|\\btriscuits?\\b|\\britz\\b|\\bwheat thins\\b|\\bbreton\\b|\\bstoned wheat\\b|\\bsoda crackers\\b|\\bpremium plus\\b'), not: re('\\b(firecrackers?|nutcrackers?|graham|animal|shrimp|cheese and crackers|cheese & crackers|lunch|kits?|crumbs|crackerjack|cracker jack|soup|dog|cat|pet|crackling|chocolate|dips?|snack packs?|kids|cups?|dunk)\\b') },
  { product: 'Cookies and sweet biscuits, 300 grams', value: 300, unit: 'g', match: re('\\bcookies?\\b|\\bsweet biscuits?\\b|\\boreos?\\b|\\bchips ahoy\\b|\\bdigestives?\\b|\\bshortbread\\b|\\bwafers?\\b|\\bbiscotti\\b|\\bfudgee[- ]?o\\b|\\bdad\'?s\\b.*\\bcookies\\b'), not: re('\\b(dough|mix|cutters?|dog|cat|pet|ice cream|cereal|crumbs|cookie butter|cream liqueur|bars?|baby|teething|frozen|scones?|cups?|crust|pie|shells?|sandwich ice|cookie cake|cake|candles?|jar|tin only|pack of 20 snack|snack packs?|thins? snack|mini packs?)\\b') },
  { product: 'Dry or fresh pasta, 500 grams', value: 500, unit: 'g', match: re('\\b(pasta|spaghetti|spaghettini|linguine|linguini|fettuccine|fettuccini|penne|rotini|fusilli|macaroni|rigatoni|lasagna|lasagne|farfalle|orzo|elbows|tortellini|ravioli|egg noodles|vermicelli|capellini|bucatini|ziti|gemelli|cavatappi|orecchiette|tagliatelle|pappardelle|conchiglie|shells)\\b'), not: re('\\b(sauce|salad|kits?|dinners?|meals?|bakes?|frozen|soup|kraft dinner|mac ?(&|and) ?cheese|cheese|sides?|ready|cups?|bowls?|chips|rice|squash|seasoning|primavera|alfredo|bolognese|marinara|with|tomato|canned|zoodles|veggie|chef boyardee|heat|microwave|instant|chickpea|lentil|bean|gluten[- ]free|keto|konjac|shirataki|rice noodles?|seafood|shrimp|clam|clams|tuna|chicken|beef|pork|sausage|spinach and ricotta|stuffed)\\b') },
  { product: 'Brown rice, 900 grams', value: 900, unit: 'g', match: re('\\bbrown rice\\b|\\brice\\b.*\\bbrown\\b'), not: re('\\b(cakes?|crackers?|chips|pasta|noodles?|syrup|vinegar|flour|cereal|bowls?|cups?|ready|instant|microwave|minute|express|pilaf|seasoned|sides?|mix|cooked|frozen|sushi|spaghetti|penne|fusilli|crisps|snaps|thins|protein|tea|miso|blend|quinoa|wild)\\b') },
  { product: 'White rice, 2 kilograms', value: 2, unit: 'kg', match: re('\\b(white|basmati|jasmine|long[- ]grain|parboiled|calrose|sushi|short[- ]grain|medium[- ]grain|sona masoori|thai fragrant|fragrant) rice\\b|\\brice\\b.*\\b(basmati|jasmine|parboiled|calrose|long grain)\\b'), not: re('\\b(brown|wild|red|black|cakes?|crackers?|chips|pasta|noodles?|vermicelli|paper|wine|vinegar|flour|cereal|krispies|crisp(y|ies)?|bowls?|cups?|ready|instant|microwave|minute|express|pilaf|seasoned|sides?|mix|cooked|frozen|pudding|milk|drink|bran|sticks|syrup|sauce|fried|risotto|congee|porridge|seasoning|cauliflower|glutinous|sticky|sweet|blend|quinoa)\\b') },
  { product: 'Cereal, 400 grams', value: 400, unit: 'g', match: re('\\bcereals?\\b|\\bcheerios\\b|\\bcorn flakes\\b|\\bcornflakes\\b|\\bfrosted flakes\\b|\\bspecial k\\b|\\braisin bran\\b|\\bshreddies\\b|\\bmini[- ]?wheats\\b|\\bfroot loops\\b|\\brice krispies\\b|\\bcap\'?n crunch\\b|\\blucky charms\\b|\\bcinnamon toast crunch\\b|\\bvector\\b|\\bmuesli\\b|\\bgranola\\b(?!.*\\bbars?\\b)|\\bcrunchy nut\\b|\\bcorn pops\\b|\\bhoney nut\\b|\\bgolden grahams\\b|\\bweetabix\\b|\\bshredded wheat\\b|\\ball[- ]bran\\b|\\bharvest crunch\\b|\\bjust right\\b|\\bcocoa puffs\\b|\\bcrispix\\b|\\bchex\\b(?!.*mix)'), not: re('\\b(bars?|bites|baby|infant|pablum|oatmeal|oats|porridge|cream of wheat|snack mix|chex mix|cups?|milk|treats|squares|pouch|kids pack|variety pack|mini boxes|single serve|bowl)\\b') },
  { product: 'Wheat flour, 2.5 kilograms', value: 2.5, unit: 'kg', match: re('\\bflour\\b'), not: re('\\b(almond|coconut|rice|corn|tapioca|chickpea|gram|besan|cassava|oat|rye|spelt|buckwheat|gluten[- ]free|potato|soy|sorghum|teff|mix|tortillas?|pizza dough|blend|banana|cake mix|self[- ]raising|self[- ]rising|semolina|durum|atta|chapati|mais|masa|arrowroot|quinoa|millet|tiger nut|cricket|keto|tempura|batter|breading|coating|cookies|crackers?|bread)\\b') },
  { product: 'White sugar, 2 kilograms', value: 2, unit: 'kg', match: re('\\bsugar\\b'), not: re('\\b(brown|icing|powdered|confectioner|cubes?|syrup|free|substitute|cookies?|cereal|candy|coated|cinnamon|maple|coconut|raw|demerara|turbinado|cane juice|reduced|no sugar|less sugar|zero|snap peas|snaps|crystals|decorating|sprinkles|colou?red|sanding|pearl|rock|jaggery|palm|monk|stevia|sweetener|scrub|wax|gum|lemonade|drink|beets?|pie|wafers|daddy|baby|sugar[- ]free|sugarfree|cones?|kelp|plum|cane sugar|added|yogh?urts?|yellow|golden|xylose|xylitol|erythritol|allulose|cups?|bars?|organic)\\b') },
  { product: 'Apple juice, 2 litres', value: 2, unit: 'l', match: re('\\bapple juice\\b|\\bapple cider\\b|\\bjus de pomme\\b'), not: re('\\b(vinegar|blend|cocktail|boxes|box|pouch(es)?|sparkling|cranberry|mango|grape|kiwi|strawberry|carrot|kids|beverage|drink|from concentrate frozen|frozen|concentrate|hard|alcohol|cups?|packs?)\\b') },
  { product: 'Orange juice, 2 litres', value: 2, unit: 'l', match: re('\\borange juice\\b|\\bjus d\'orange\\b'), not: re('\\b(cocktail|blend|drink|sparkling|concentrate|frozen|boxes|box|mango|banana|carrot|pineapple|crush|flavou?r(ed)?|tangerine|passion|strawberry|kids|pouch(es)?|beverage|cups?|packs?)\\b') },
  { product: 'Roasted or ground coffee, 340 grams', value: 340, unit: 'g', match: re('\\bcoffee\\b|\\bespresso\\b'), not: re('\\b(pods?|k-?cups?|capsules?|keurig|nespresso|instant|cold brew|creamers?|whitener|mate|liqueur|syrup|latte|cappuccino|drinks?|bottled|cans?|ready to drink|cakes?|candy|chocolate|filters?|maker|grinder|ice cream|cookies|cocoa|frappuccino|mocha mix|tassimo|singles|steep|crisp|bars?|mug|press|kahlua|crema|beverage|iced|creamer|soluble|freeze[- ]dried|sachets?|packets?|dalgona|roll|beans? chocolate|coated|table|mate|substitute|chicory|decanter|carafe|pot|spoon|scoop|grounds bin)\\b') },
  { product: 'Tea (20 bags)', value: 20, unit: 'ea', linear: true, match: re('\\btea\\b'), not: re('\\b(iced|ice tea|nestea|drinks?|bottled|kettle|cups?|biscuits?|cookies?|cakes?|tree|lights?|candles?|towels?|kombucha|latte|concentrate|mix|powder|loose|leaf|leaves|pots?|infuser|strainer|sweet tea|bubble|boba|milk tea|cans?|sparkling|lemonade|sticks|beverage|pearls|matcha|sandwich|sets?|tins? only)\\b') },
  // Condiments, oils, spreads.
  { product: 'Ketchup, 1 litre', value: 1, unit: 'l', dense: true, match: re('\\bketchup\\b|\\bcatsup\\b'), not: re('\\b(chips|flavou?r(ed)?|packets?|portions?|crisps|seasoning|dip|singles|mini|cups?)\\b') },
  { product: 'Vegetable oil, 3 litres', value: 3, unit: 'l', match: re('\\bvegetable oil\\b|\\bcorn oil\\b|\\bsoybean oil\\b|\\bsunflower oil\\b'), not: re('\\b(spray|cooking spray|mayo|margarine|spread|chips|in vegetable oil|tuna|sardines|fish|packed in|with vegetable oil|blend with olive|olive)\\b') },
  { product: 'Canola oil, 3 litres', value: 3, unit: 'l', match: re('\\bcanola oil\\b|\\bcanola\\b.*\\boil\\b'), not: re('\\b(spray|cooking spray|mayo|margarine|spread|chips|made with|cooked in|fish|tuna|in canola|with canola|olive)\\b') },
  { product: 'Olive oil, 1 litre', value: 1, unit: 'l', match: re('\\bolive oil\\b|\\bhuile d\'olive\\b'), not: re('\\b(spray|in olive oil|with olive oil|tuna|sardines|anchov(y|ies)|chips|crackers?|dressing|mayo|margarine|spread|made with|marinated|artichokes?|sun[- ]dried|soap|hair|skin|body|blend|infused|garlic|chili|truffle|lemon|basil|rosemary|pomace|cooking spray|canola|vegetable)\\b') },
  { product: 'Baby food, 128 millilitres', value: 128, unit: 'ml', dense: true, match: re('\\bbaby food\\b|\\bstrained\\b|\\bstage [123]\\b|\\bgerber\\b|\\bheinz (baby|by nature)\\b|\\blove child\\b|\\bbaby gourmet\\b|\\bpur[eé]e for babies\\b|\\borganic baby\\b'), not: re('\\b(formula|cereal|wipes|lotion|shampoo|powder|oil|puffs|teethers?|teething|biscuits?|crackers?|melts|yogh?urt|snacks?|bars?|bites|cookies|rusks|juice|water|bottles?|diapers?)\\b') },
  { product: 'Infant formula, 900 grams', value: 900, unit: 'g', match: re('\\b(infant|baby|toddler) formula\\b|\\bsimilac\\b|\\benfamil\\b|\\bgood start\\b|\\bkendamil\\b|\\bnutramigen\\b|\\bbebelac\\b|\\bformula\\b.*\\b(infant|baby|stage [123]|0[- ]12|0\\+)\\b'), not: re('\\b(ready[- ]to[- ]feed|ready to feed|liquid|concentrate|bottles?|wipes|nipples?|dispenser|pitcher|mixer)\\b') },
  { product: 'Peanut butter, 1 kilogram', value: 1, unit: 'kg', dense: true, match: re('\\bpeanut butter\\b|\\bbeurre d\'arachide\\b'), not: re('\\b(cups?|cookies?|bars?|crackers?|chips|candy|chocolate|filled|pretzels?|cereal|puffs|granola|bites|sandwich|ice cream|powder(ed)?|pb2|pb fit|protein|fudge|wafers?|treats?|dog|cat|reese|reese\'s|squares|swirl|flavou?r(ed)?|honey|maple|cinnamon|banana|jelly|jam|cheerios|kisses|eggs|trees|sauce|dressing|satay|smoothie|oatmeal|bark|clusters|m&m|snack|mini|portions?|to go|squeeze|packets?)\\b') },
  { product: 'Mayonnaise, 890 millilitres', value: 890, unit: 'ml', dense: true, match: re('\\bmayo(nnaise)?\\b|\\bmiracle whip\\b'), not: re('\\b(chipotle|sriracha|garlic|aioli|flavou?r(ed)?|wasabi|truffle|vegan|plant|tuna|egg salad|salad|sandwich|dressing|packets?|portions?|spicy|squeeze|kewpie|japanese|lime|lemon|pesto|bacon|cheese|avocado|olive oil|light|lite|half the fat|reduced)\\b') },
  { product: 'Salsa, 418 millilitres', value: 418, unit: 'ml', dense: true, match: re('\\bsalsa\\b'), not: re('\\b(chips|seasoning|mix|kits?|tortillas?|con queso|queso|cheese|flavou?r(ed)?|dip and|dancing|cups?|portions?|fresh|refrigerated|verde chips|snack)\\b') },
  { product: 'Pasta sauce, 650 millilitres', value: 650, unit: 'ml', dense: true, match: re('\\b(pasta|spaghetti|marinara|arrabbiata|bolognese|vodka|tomato basil|tomato and basil|tomato & basil|meat|alfredo|primavera|puttanesca|rosee|rosé|four cheese|garden vegetable|mushroom|traditional|roasted garlic|sweet basil) sauce\\b|\\bpasta sauce\\b|\\bmarinara\\b|\\b(ragu|prego|classico|barilla|unico|neilson|hunt\'?s|sacla|rao\'?s|mezzetta|primo)\\b.*\\bsauce\\b'), not: re('\\b(pizza|chips|seasoning|mix|packet|pouch|in tomato sauce|beans|sardines|meatballs|pasta with|ravioli|lasagna|kits?|dinners?|meals?|spaghetti with|cups?|portions?|pesto|soy|bbq|hot sauce|wings?|dipping|sweet and sour|teriyaki|ketchup|hp|steak)\\b') },
  { product: 'Salad dressing, 475 millilitres', value: 475, unit: 'ml', dense: true, match: re('\\bdressing\\b|\\bvinaigrette\\b'), not: re('\\b(stuffing|turkey|bread|seasoning|mix|packets?|chips|crackers?|dip mix|cookies|pretzels|popcorn|wound|bandages?|gown|kits?|cups?|portions?|singles|spray|powder|dry|mini)\\b') },
  // Canned and dry goods.
  { product: 'Canned baked beans, 398 millilitres', value: 398, unit: 'ml', dense: true, match: re('\\bbaked beans\\b|\\bbeans in tomato sauce\\b|\\bpork (and|&|n\') beans\\b|\\bbeans with pork\\b|\\bfeves au lard\\b'), not: re('\\b(chips|seasoning|soup|frozen|dried|dry)\\b') },
  { product: 'Canned tomatoes, 796 millilitres', value: 796, unit: 'ml', dense: true, match: re('\\b(diced|crushed|whole|stewed|plum|peeled|canned|chopped|san marzano)\\b.*\\btomato(es)?\\b|\\btomato(es)?\\b.*\\b(diced|crushed|whole peeled|stewed|canned|chopped)\\b'), not: re('\\b(paste|ketchup|juice|soup|sun[- ]dried|dried|salsa|seasoning|chips|cherry|grape|fresh|on the vine|vine|beefsteak|heirloom|pizza|pasta sauce|puree|passata|kits?|chopped salad|green|tomatillos?|frozen|bruschetta|in oil|sauce)\\b') },
  { product: 'Canned soup, 284 millilitres', value: 284, unit: 'ml', dense: true, match: re('\\bsoups?\\b|\\bchowder\\b|\\bbisque\\b'), not: re('\\b(noodle soup bowl|ramen|instant|cups?|bowls?|mix|dry|packets?|dumplings?|bases?|stock|broth|bouillon|powder|seasoning|spoons?|ladle|pots?|bones?|frozen|kits?|starter|onion soup mix|lipton|pho|udon|miso|tom yum|pouch(es)?|ready to serve fresh|fresh|refrigerated|chilled|soup greens|vegetables for soup)\\b') },
  { product: 'Canned beans and lentils, 540 millilitres', value: 540, unit: 'ml', match: re('\\b(chick ?peas|garbanzo|kidney beans|black beans|white beans|navy beans|romano beans|pinto beans|lentils|cannellini|mixed beans|six bean|bean medley|black[- ]eyed peas|fava beans|butter beans|great northern|lima beans|pois chiches)\\b'), not: re('\\b(dried|dry|baked|soup|chips|salad|hummus|pasta|snacks?|roasted|crunchy|flour|sprouted|seasoned|chili|refried|in tomato sauce|curry|dal|dhal|masala|ready meals?|frozen|puffs|crackers?|bites|burgers?|patties|tortillas?|rice|crisps)\\b') },
  { product: 'Canned corn, 341 millilitres', value: 341, unit: 'ml', match: re('\\b(kernel corn|whole kernel|niblets|cream(ed|[- ]style)? corn|peaches (and|&) cream corn|sweet corn|corn)\\b'), not: re('\\b(flakes|chips|starch|syrup|meal|bread|tortillas?|dogs?|nuts|pops?|popcorn|on the cob|cob|cobs|frozen|baby corn|chowder|soup|salsa|oil|cornish|candy|cereal|puffs|corned|peppercorns?|cornflakes|cornmeal|fritos|nachos?|tacos?|masa|muffins?|flour|grits|polenta|snacks?|crackers?|cakes?|milk|silk|tea|husks?|on cob|mix|medley|peas|carrots|beans)\\b') },
  { product: 'Canned peach, 398 millilitres', value: 398, unit: 'ml', match: re('\\bpeach(es)?\\b'), not: re('\\b(juice|nectar|tea|drinks?|soda|flavou?r(ed)?|yogh?urt|jam|jelly|pie|cups?|baby|pouch(es)?|candy|gumm(y|ies)|rings|dried|salsa|iced|cobbler|mango|raspberry|fresh|schnapps|sparkling|water|fuzzy|ice cream|pears?|mixed|fruit cocktail|cream corn|peaches (and|&) cream)\\b') },
  { product: 'Canned pear, 398 millilitres', value: 398, unit: 'ml', match: re('\\bpears?\\b'), not: re('\\b(juice|nectar|tea|drinks?|soda|flavou?r(ed)?|yogh?urt|jam|jelly|pie|cups?|baby|pouch(es)?|candy|gumm(y|ies)|dried|iced|fresh|prickly|cider|sparkling|water|peach(es)?|mixed|fruit cocktail|asian pear drink|bosc|anjou|bartlett(?!.*\\b(halves|in))|forelle|red pears)\\b') },
  { product: 'Dried lentils, 900 grams', value: 900, unit: 'g', match: re('\\blentils?\\b'), not: re('\\b(canned|soup|chips|pasta|snacks?|crackers?|dal|dhal|curry|salad|sprouted|ready|cooked|meals?|puffs|flour|bites|crisps|patties|burgers?|in water|in brine|tins?|cans?)\\b') },
  { product: 'Dry beans and legumes, 900 grams', value: 900, unit: 'g', match: re('\\b(dried|dry)\\b.*\\b(beans|peas|chick ?peas|legumes)\\b|\\b(split peas|navy beans|kidney beans|black beans|pinto beans|chick ?peas|white beans|romano beans|lima beans|mung beans|adzuki|great northern beans|black[- ]eyed peas|fava beans|soybeans|soy beans)\\b'), not: re('\\b(canned|soup|chips|snacks?|roasted|crunchy|salted|seasoned|flour|pasta|baked|in sauce|coffee|jelly|cocoa|vanilla|green beans|frozen|edamame|sprouts|refried|hummus|in water|in brine|tins?|cans?|curry|ready|cooked|meals?|puffs|crisps|patties|burgers?)\\b') },
  { product: 'Tofu, 350 grams', value: 350, unit: 'g', match: re('\\btofu\\b'), not: re('\\b(desserts?|pudding|sauce|burgers?|noodles?|meals?|bowls?|snacks?|jerky|skin|puffs|fried|soup|fish|dog|cakes?|nuggets|sausages?|hot dogs?|dumplings?|balls?|bites|marinated|smoked|seasoned|flavou?r(ed)?|pressed|press)\\b') },
  { product: 'Hummus, 227 grams', value: 227, unit: 'g', dense: true, match: re('\\bhumm?o?us\\b'), not: re('\\b(chips|crackers?|snack packs?|cups?|with pita|kits?|pretzels|singles|to go|minis?|portions?|seasoning|mix|chickpeas? only)\\b') },
  { product: 'Almonds, 200 grams', value: 200, unit: 'g', match: re('\\balmonds?\\b'), not: re('\\b(milk|beverage|butter|flour|oil|chocolate|covered|bars?|cookies|cereal|granola|extract|paste|croissants?|cakes?|biscotti|crackers?|candied|honey|smokehouse|flavou?r(ed)?|cream|yogh?urt|thins|joy|nougat|torrone|marzipan|drinks?|bliss|almondmilk|roca|toffee|clusters|bark|dragees?|jordan|sugared|cinnamon|wasabi|salt and vinegar|sea salt|bbq|spicy|chili|dark|coconut|tamari|mix|trail|snack packs?|almond joy)\\b') },
  { product: 'Peanuts, 450 grams', value: 450, unit: 'g', match: re('\\bpeanuts?\\b'), not: re('\\b(butter|oil|candy|chocolate|m&m|m&ms|bars?|cookies|brittle|crackers?|sauce|noodles?|satay|cereal|granola|flour|clusters|reese|snickers|cracker jack|coated|covered|honey|beer nuts|spicy|thai|dressing|free|allergy|flavou?r(ed)?|mix|trail|chili|bbq|dill|salt and vinegar|caramel|praline|toffee|nut bar|powder|protein|sweet|sugared|smoked|wasabi|squares|cups?|eggs)\\b') },
  { product: 'Sunflower seeds, 400 grams', value: 400, unit: 'g', match: re('\\bsunflower (seeds?|kernels?)\\b|\\bseeds?\\b.*\\bsunflower\\b'), not: re('\\b(oil|butter|bread|crackers?|bars?|bird|wild bird|feed|feeder|chocolate|spread|flour|lecithin|garden|planting|sprouting|grow|packet of seeds|flower seeds|mix|trail)\\b') },
  // Personal care and household.
  { product: 'Deodorant, 85 grams', value: 85, unit: 'g', dense: true, match: re('\\bdeodorants?\\b|\\banti-?perspirants?\\b|\\bantiperspirants?\\b'), not: re('\\b(spray|body spray|aerosol|wipes|powder|foot|shoe|fridge|refrigerator|car|carpet|pet|dog|cat|litter|air|room|toilet|cream|soap|body wash|mist|roll-on for pets|travel|mini|trial|twin pack|2 pack|two pack|3 pack|value pack|pack of)\\b') },
  { product: 'Toothpaste, 100 millilitres', value: 100, unit: 'ml', dense: true, match: re('\\btoothpaste\\b|\\bdentifrice\\b|\\btooth paste\\b'), not: re('\\b(brush(es)?|floss|whitening strips|strips|tablets|travel|holder|dispenser|squeezer|mouthwash|rinse|kids|children|baby|toddler|pet|dog|cat|twin pack|2 pack|two pack|3 pack|value pack|pack of|mini|trial)\\b') },
  { product: 'Shampoo, 400 millilitres', value: 400, unit: 'ml', dense: true, match: re('\\bshampoos?\\b'), not: re('\\b(dog|cat|pet|carpet|car|horse|dry shampoo|brush(es)?|cap|bars?|kids|baby|travel|mini|trial|twin pack|2 pack|two pack|value pack|pack of|conditioner|2[- ]in[- ]1|3[- ]in[- ]1|body wash|wash|cleanser|rug|upholstery|machine)\\b') },
  { product: 'Laundry detergent, 4.43 litres', value: 4.43, unit: 'l', match: re('\\blaundry\\b.*\\bdetergent\\b|\\bdetergent\\b.*\\blaundry\\b|\\bliquid laundry\\b|\\b(tide|persil|gain|purex|xtra|ivory snow|sunlight|arm (&|and) hammer|seventh generation|method|nature clean|kirkland|oxi ?clean|all|cheer|wisk)\\b.*\\b(liquid|he|detergent)\\b'), not: re('\\b(pods?|pacs?|sheets?|tablets?|powder|dish|dishwasher|dishes|softener|fabric softener|stain|booster|scent beads|unstopables|bleach|oxi[- ]?boost|wash cloth|pre[- ]?treat|spray|bars?|soap|hand|body|car|dryer)\\b') },
];

/*
 * FRESH FOOD IS NAMED PLAINLY. A product sold loose or by weight is recognised only when its name is
 * nothing but the product: every word left after sizes and the shared neutral words below must be one
 * of its own words. Seen 2026-11-08 on Project Hammer names: "Marshmallow Bananas", "Guava, Mango, and
 * Banana Fruit Blend" and "Tomato Hot Pot Base" all matched a pattern and none is fresh fruit.
 */
const NEUTRAL = new Set(
  ('organic fresh large small medium jumbo extra xl bag bags bagged pack package packaged value family size sized ' +
    'lb lbs kg g gr oz per each ea count ct pc pcs piece pieces unit units local ontario canada canadian grade a no ' +
    'product of from mexico usa us peru chile imported premium select bunch loose your market compliments president ' +
    'presidents s choice name western selection irresistibles great sunkist dole chiquita del monte foodland the ' +
    'approx approximately avg average about x kilo kilos pound pounds gram grams tray clamshell container box case ' +
    'natural naturally raised farm farms grown field greenhouse hothouse quality fancy number california florida bc ' +
    'quebec tm r brand sold by weight halal air chilled free run range grain fed without antibiotics new').split(' '),
);
const STRICT_WORDS: Readonly<Record<string, string>> = {
  'Beef stewing cuts, per kilogram': 'beef stewing stew cubes meat boneless aaa aa angus inside outside round chuck simmering',
  'Beef striploin cuts, per kilogram': 'beef strip striploin loin steak steaks york aaa aa angus grilling boneless',
  'Beef top sirloin cuts, per kilogram': 'beef top sirloin steak steaks aaa aa angus grilling boneless cap roast',
  'Beef rib cuts, per kilogram': 'beef rib ribs ribeye eye prime steak steaks roast aaa aa angus grilling bone in short simmering boneless',
  'Ground beef, per kilogram': 'ground beef lean regular minced angus chuck sirloin',
  'Pork loin cuts, per kilogram': 'pork loin chops chop tenderloin centre center boneless bone in rib end roast fast fry butterfly butterflied thick thin cut combo',
  'Pork rib cuts, per kilogram': 'pork ribs rib back side spare spareribs baby st louis style rack racks riblets simmering',
  'Pork shoulder cuts, per kilogram': 'pork shoulder butt blade roast steaks steak boneless bone in picnic chops',
  'Whole chicken, per kilogram': 'whole chicken chickens young roaster roasting fryer',
  'Chicken breasts, per kilogram': 'chicken breast breasts boneless skinless bone in skin on split fillets',
  'Chicken thigh, per kilogram': 'chicken thigh thighs boneless skinless bone in skin on',
  'Chicken drumsticks, per kilogram': 'chicken drumstick drumsticks legs leg skin on',
  'Salmon, per kilogram': 'salmon fillet fillets filet steak steaks portions portion side atlantic sockeye coho pink chinook keta wild farmed skin on boneless skinless',
  'Apples, per kilogram': 'apple apples gala ambrosia mcintosh honeycrisp fuji granny smith red delicious golden spartan empire cortland jazz envy pink lady cosmic crisp royal sweetango braeburn jonagold paula northern spy cripps shiny idared crispin mutsu salish lucy rose green yellow sugarbee kanzi opal',
  'Oranges, per kilogram': 'orange oranges navel navels valencia cara blood sweet juicing seedless',
  'Oranges, 1.36 kilograms': 'orange oranges navel navels valencia cara blood sweet juicing seedless',
  'Bananas, per kilogram': 'banana bananas yellow green ripe fairtrade fair trade',
  'Pears, per kilogram': 'pear pears bartlett bosc anjou red green asian forelle concorde packham comice',
  'Lemons, unit': 'lemon lemons meyer',
  'Limes, unit': 'lime limes persian',
  'Grapes, per kilogram': 'grape grapes red green black seedless globe cotton candy moon drops sweet scarlet autumn crimson thompson',
  'Cantaloupe, unit': 'cantaloupe cantaloupes melon',
  'Avocado, unit': 'avocado avocados hass ripe ready eat',
  'Potatoes, 4.54 kilograms': 'potato potatoes russet russets yukon gold white red yellow baking washed bakers pei island',
  'Potatoes, per kilogram': 'potato potatoes russet russets yukon gold white red yellow baking washed bakers pei island',
  'Sweet potatoes, per kilogram': 'sweet potato potatoes yam yams orange white purple japanese',
  'Tomatoes, per kilogram': 'tomato tomatoes roma beefsteak vine on field red cluster campari',
  'Cabbage, per kilogram': 'cabbage green red savoy napa',
  'Carrots, 1.36 kilograms': 'carrot carrots orange table washed',
  'Onions, per kilogram': 'onion onions yellow cooking white red sweet spanish vidalia',
  'Onions, 1.36 kilograms': 'onion onions yellow cooking white red sweet spanish vidalia',
  'Celery, unit': 'celery stalk stalks head',
  'Cucumber, unit': 'cucumber cucumbers english long seedless',
  'Mushrooms, 227 grams': 'mushroom mushrooms white button cremini crimini brown whole sliced portobello',
  'Iceberg lettuce, unit': 'iceberg lettuce head',
  'Romaine lettuce, unit': 'romaine lettuce head green',
  'Broccoli, unit': 'broccoli head',
  'Peppers, per kilogram': 'pepper peppers sweet bell red green yellow orange',
  'Squash, per kilogram': 'squash butternut acorn spaghetti buttercup kabocha delicata hubbard ambercup sweet dumpling red kuri',
  'Strawberries, 454 grams': 'strawberry strawberries sweet',
  'Salad greens, 142 grams': 'spring mix mixed greens baby spinach arugula kale mesclun power super herb salad half blend leaves leaf',
};
const strictSets = new Map(Object.entries(STRICT_WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

/** True when every word of the name, less sizes and neutral words, is one of the product's own. */
export function plainlyNamed(product: string, name: string): boolean {
  const own = strictSets.get(product);
  if (!own) return true;
  const words = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\d+(\.\d+)?\s*(kg|g|lb|lbs|oz|ml|l|ea|ct)\b/g, ' ')
    .split(/[^a-z]+/)
    .filter((w) => w && !NEUTRAL.has(w));
  return words.length > 0 && words.every((w) => own.has(w));
}

/*
 * PACKAGED FOOD AGREES WITH ITS CATEGORY. When the item has a category path (the catalogue's, or the
 * one the ladder sorted its name into), one of its category tags must contain one of these stems.
 * "Cracker Barrel Cheddar Cheese Slices" matches the crackers pattern by name; its category says cheese.
 * An item with no category at all is judged by its name alone.
 */
const CATEGORY_STEMS: Readonly<Record<string, string>> = {
  'Bacon, 500 grams': 'bacon',
  'Wieners, 400 grams': 'frankfurter hot-dog wiener sausage',
  'Shrimp, 300 grams': 'shrimp prawn',
  'Canned salmon, 213 grams': 'salmon',
  'Canned tuna, 170 grams': 'tuna',
  'Meatless burgers, 226 grams': 'burger meat-analogue meat-substitute plant-based vegetarian vegan',
  'Milk, 1 litre': 'milk',
  'Milk, 2 litres': 'milk',
  'Milk, 4 litres': 'milk',
  'Soy milk, 1.89 litres': 'soy plant-based milk-substitute plant-milk',
  'Nut milk, 1.89 litres': 'almond nut plant-based milk-substitute plant-milk',
  'Cream, 1 litre': 'cream',
  'Butter, 454 grams': 'butter',
  'Margarine, 907 grams': 'margarine spread fats',
  'Block cheese, 500 grams': 'cheese',
  'Yogurt, 500 grams': 'yogurt yoghurt',
  'Eggs, 1 dozen': 'egg',
  'Frozen french fried potatoes, 750 grams': 'fries frozen potato',
  'Frozen green beans, 750 grams': 'frozen bean vegetable',
  'Frozen broccoli, 500 grams': 'frozen broccoli vegetable',
  'Frozen corn, 750 grams': 'frozen corn vegetable',
  'Frozen mixed vegetables, 750 grams': 'frozen vegetable',
  'Frozen peas, 750 grams': 'frozen pea vegetable',
  'Frozen pizza, 390 grams': 'pizza',
  'Frozen spinach, 300 grams': 'frozen spinach vegetable',
  'Frozen strawberries, 600 grams': 'frozen strawberr fruit berr',
  'White bread, 675 grams': 'bread',
  'Flatbread and pita, 500 grams': 'flatbread pita tortilla naan bread wrap',
  'Crackers and crisp breads, 200 grams': 'cracker crispbread crisp-bread rusk',
  'Cookies and sweet biscuits, 300 grams': 'biscuit cookie wafer shortbread',
  'Dry or fresh pasta, 500 grams': 'pasta noodle spaghetti macaroni lasagn ravioli tortellini',
  'Brown rice, 900 grams': 'rice',
  'White rice, 2 kilograms': 'rice',
  'Cereal, 400 grams': 'breakfast-cereal granola muesli cereal-flakes puffed',
  'Wheat flour, 2.5 kilograms': 'flour',
  'White sugar, 2 kilograms': 'sugar',
  'Apple juice, 2 litres': 'apple-juice juice cider',
  'Orange juice, 2 litres': 'orange-juice juice',
  'Roasted or ground coffee, 340 grams': 'coffee',
  'Tea (20 bags)': 'tea',
  'Ketchup, 1 litre': 'ketchup tomato-sauce condiment',
  'Vegetable oil, 3 litres': 'oil',
  'Canola oil, 3 litres': 'oil',
  'Olive oil, 1 litre': 'oil',
  'Baby food, 128 millilitres': 'baby',
  'Infant formula, 900 grams': 'infant baby formula',
  'Peanut butter, 1 kilogram': 'peanut-butter nut-butter',
  'Mayonnaise, 890 millilitres': 'mayonnaise condiment',
  'Salsa, 418 millilitres': 'salsa dip sauce',
  'Pasta sauce, 650 millilitres': 'sauce',
  'Salad dressing, 475 millilitres': 'dressing vinaigrette sauce',
  'Canned baked beans, 398 millilitres': 'baked-beans bean legume',
  'Canned tomatoes, 796 millilitres': 'tomato',
  'Canned soup, 284 millilitres': 'soup',
  'Canned beans and lentils, 540 millilitres': 'bean chickpea lentil legume pulse',
  'Canned corn, 341 millilitres': 'corn',
  'Canned peach, 398 millilitres': 'peach fruit',
  'Canned pear, 398 millilitres': 'pear fruit',
  'Dried lentils, 900 grams': 'lentil legume pulse',
  'Dry beans and legumes, 900 grams': 'bean legume pulse pea chickpea',
  'Tofu, 350 grams': 'tofu soy',
  'Hummus, 227 grams': 'hummus dip spread',
  'Almonds, 200 grams': 'almond nut',
  'Peanuts, 450 grams': 'peanut nut legume',
  'Sunflower seeds, 400 grams': 'sunflower seed',
  'Deodorant, 85 grams': 'deodorant antiperspirant',
  'Toothpaste, 100 millilitres': 'toothpaste',
  'Shampoo, 400 millilitres': 'shampoo',
  'Laundry detergent, 4.43 litres': 'detergent laundry',
};
const stemLists = new Map(Object.entries(CATEGORY_STEMS).map(([k, v]) => [k, v.split(' ')]));

/** True when the item has no category, or one of its tags agrees with the product. */
export function categoryAgrees(product: string, path: readonly string[]): boolean {
  const stems = stemLists.get(product);
  if (!stems || path.length === 0) return true;
  return path.some((tag) => stems.some((s) => tag.toLowerCase().includes(s)));
}

/* -------------------------------------------------------------- data file */

/** The committed data: newest value per product and place. */
export interface StatcanTable {
  readonly table: string;
  readonly source: string;
  /** Newest month anywhere in the table, YYYY-MM. */
  readonly latestMonth: string;
  /** product -> place -> [month YYYY-MM, cents] */
  readonly values: Readonly<Record<string, Readonly<Record<string, readonly [string, number]>>>>;
  /** Written by `calibrate`: product -> shelf factor. Absent until calibrated; the rung then answers nothing. */
  readonly shelfFactor?: Readonly<Record<string, number>>;
  /** Written by `calibrate`: product -> shelf factor for a premium version. */
  readonly premiumFactor?: Readonly<Record<string, number>>;
  readonly calibration?: Calibration['measured'];
}

/** Builds the data file from the StatCan full-table CSV (`18100245.csv`). */
export function buildTable(csvText: string): StatcanTable {
  const values: Record<string, Record<string, [string, number]>> = {};
  let header: string[] | null = null;
  let latest = '';
  const col: Record<string, number> = {};
  const r = new CsvReader((row) => {
    if (header === null) {
      header = row.map((h) => h.replace(/^﻿/, ''));
      header.forEach((h, i) => (col[h] = i));
      for (const need of ['REF_DATE', 'GEO', 'Products', 'UOM', 'VALUE']) {
        if (col[need] === undefined) throw new Error(`statcan: the CSV has no ${need} column (got ${header.join(',')})`);
      }
      return;
    }
    const month = row[col.REF_DATE!]?.trim() ?? '';
    const geo = row[col.GEO!]?.trim() ?? '';
    const product = row[col.Products!]?.trim() ?? '';
    const uom = row[col.UOM!]?.trim() ?? '';
    const raw = row[col.VALUE!]?.trim() ?? '';
    if (!/^\d{4}-\d{2}$/.test(month) || !geo || !product || uom !== 'Dollars' || raw === '') return;
    const dollars = Number(raw);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    const byGeo = (values[product] ??= {});
    const had = byGeo[geo];
    if (!had || had[0] < month) byGeo[geo] = [month, cents];
    if (month > latest) latest = month;
  });
  r.push(csvText);
  r.end();
  if (!latest) throw new Error('statcan: no priced rows read from the CSV');
  const missing = ITEMS.filter((i) => !values[i.product]);
  if (missing.length > 0) throw new Error(`statcan: the table has no rows for ${missing.map((m) => m.product).join('; ')}`);
  return { table: TABLE_ID, source: TABLE_URL, latestMonth: latest, values };
}

let cached: { path: string; table: StatcanTable | null } | null = null;

/**
 * The committed table, read once. A missing or unreadable file is logged loudly
 * with a fixed tag and the rung is skipped (null), never a crash.
 */
export function loadTable(file: string = DEFAULT_PATH): StatcanTable | null {
  if (cached && cached.path === file) return cached.table;
  let table: StatcanTable | null = null;
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8')) as StatcanTable;
    if (t && typeof t.latestMonth === 'string' && t.values && typeof t.values === 'object') table = t;
    else console.error(`[statcan-fault] bad_file ${file}`);
  } catch (err) {
    console.error(`[statcan-fault] unreadable ${file} - ${err instanceof Error ? err.message : String(err)}`);
  }
  cached = { path: file, table };
  return table;
}

/* --------------------------------------------------------------- matching */

const PROVINCES: Readonly<Record<string, string>> = {
  NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island', NS: 'Nova Scotia', NB: 'New Brunswick',
  QC: 'Quebec', ON: 'Ontario', MB: 'Manitoba', SK: 'Saskatchewan', AB: 'Alberta', BC: 'British Columbia',
  YT: 'Whitehorse, Yukon', NT: 'Yellowknife, Northwest Territories',
};
const BY_NAME = new Map<string, string>(Object.values(PROVINCES).map((n) => [n.toLowerCase(), n]));
BY_NAME.set('yukon', PROVINCES.YT!);
BY_NAME.set('northwest territories', PROVINCES.NT!);
BY_NAME.set('québec', PROVINCES.QC!);

/** The table's place name for a shopper's region ("ON", "Ontario", "CA-ON"), or null. */
export function placeOf(region: string | null | undefined): string | null {
  const t = (region ?? '').trim();
  if (!t) return null;
  const code = t.toUpperCase().replace(/^CA-/, '');
  return PROVINCES[code] ?? BY_NAME.get(t.toLowerCase()) ?? null;
}

function sizeOf(item: StatcanItem): ComparisonQuantity {
  return toComparison(item.value, item.unit)!;
}

/** A size read as the item's family, with grams and millilitres as one for a `dense` item. */
function comparable(item: StatcanItem, q: ComparisonQuantity): number | null {
  const own = sizeOf(item);
  if (q.family === own.family) return q.baseValue / own.baseValue;
  if (item.dense && (q.family === 'mass' || q.family === 'volume') && (own.family === 'mass' || own.family === 'volume')) {
    return q.baseValue / own.baseValue;
  }
  return null;
}

/** "72 tea bags", "20 bags": a bag count when the size is not one. */
function bagCount(text: string): ComparisonQuantity | null {
  const m = /(\d+)\s*(?:tea\s*)?(?:bags|sachets|teabags)\b/i.exec(text);
  return m ? toComparison(Number(m[1]), 'ea') : null;
}

export type MatchMiss = 'no_name' | 'no_match' | 'no_size' | 'size_out_of_band';
export interface Match {
  readonly item: StatcanItem;
  /** The item's size over the product's: the scale applied to the average. */
  readonly ratio: number;
  /**
   * The item had no size at all, so the product's own size is assumed (ratio 1) and the answer takes
   * the wider spread measured for that (`calibration.sigmaSizeAssumed`). Only when exactly one table
   * product matched: "2% Milk" with no size could be 1, 2 or 4 litres, so it is not assumed.
   */
  readonly sizeAssumed?: boolean;
}

/*
 * PREMIUM VERSIONS. Measured 2026-11-08: across every egg Project Hammer sells, the shelf price was
 * 1.46 times the StatCan average, because organic, free-run and omega-3 cartons sit in the same pool as
 * plain ones; a plain $7.49 carton of 18 then read as a great price. So the shelf factor is measured on
 * standard products only, and a premium version (these words in its name) gets the premium factor,
 * measured separately on the premium rows.
 */
export const PREMIUM = /\b(organic|organique|biologique|bio|free[- ]?run|free[- ]?range|omega[- ]?(3|plus)?|nest[- ]?laid\w*|solar|grass[- ]?fed|pasture[- ]?raised|pastured|artisan(al)?|gourmet|premium|non[- ]?gmo|gluten[- ]?free|keto|lactose[- ]?free|a2|imported|wild[- ]caught|albacore|solid white)\b/i;
export function isPremium(name: string | null): boolean {
  return PREMIUM.test(name ?? '');
}

/**
 * Which table product a named, sized item is, or why none. `target` is the
 * item's size as the ladder read it; `sizeText` is its size as text (a tea bag
 * count is read from it, or from the name, when the size is not a count).
 */
/** The table products a lower-cased name is, by name and category alone (no size). */
export function namedProducts(n: string, path: readonly string[] = []): StatcanItem[] {
  return ITEMS.filter(
    (i) => i.match.test(n) && !(i.not?.test(n) ?? false) && plainlyNamed(i.product, n) && categoryAgrees(i.product, path),
  );
}

export function matchItem(
  name: string | null,
  target: ComparisonQuantity | null,
  sizeText: string | null = null,
  path: readonly string[] = [],
): Match | { miss: MatchMiss } {
  const n = (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return { miss: 'no_name' };
  const named = namedProducts(n, path);
  if (named.length === 0) return { miss: 'no_match' };
  let best: Match | null = null;
  let anySize = false;
  for (const item of named) {
    let q = target;
    if (item.unit === 'ea' && (!q || q.family !== 'count')) q = bagCount(`${sizeText ?? ''} ${n}`) ?? (q?.family === 'count' ? q : null);
    if (!q) continue;
    anySize = true;
    const ratio = comparable(item, q);
    if (ratio === null) continue;
    const [lo, hi] = item.linear ? LINEAR_BAND : PACK_BAND;
    if (ratio < lo || ratio > hi) continue;
    if (!best || Math.abs(Math.log(ratio)) < Math.abs(Math.log(best.ratio))) best = { item, ratio };
  }
  if (best) return best;
  if (anySize || target !== null) return { miss: 'size_out_of_band' };
  /*
   * No size at all: the product's own size, only when one product matched (never a guess between
   * sizes), and only when something besides the name pattern vouches for it: a fresh item named
   * plainly, or a packaged item whose category agrees. The size was the guard that kept "Scrambled
   * Egg Kit, 85 g" out of the eggs; without a size, the category has to.
   */
  const only = named.length === 1 ? named[0]! : null;
  if (only && (strictSets.has(only.product) || (path.length > 0 && categoryAgrees(only.product, path)))) {
    return { item: only, ratio: 1, sizeAssumed: true };
  }
  return { miss: 'no_size' };
}

export interface NationalAverage {
  /** The shelf price this answer centres on: the average, times the shelf factor, scaled to the item's size. */
  readonly centreCents: number;
  /** The measured spread of shelf prices around that centre (log sigma). */
  readonly sigmaLog: number;
  readonly product: string;
  readonly place: string;
  readonly month: string;
  /** The product's own average as StatCan prints it, before the shelf factor and the size. */
  readonly averageCents: number;
  readonly shelfFactor: number;
  readonly ratio: number;
  /** The name carries a premium word, so the premium factor was used. */
  readonly premium: boolean;
  /** The item had no size; the product's own was assumed and the wider measured spread used. */
  readonly sizeAssumed: boolean;
}

/**
 * StatCan's averages are what shoppers paid, sales included and weighted by what sold (store brands,
 * big packs). The ladder's other rungs centre on REGULAR shelf prices ("a sale row never enters a
 * centre", estimate.ts). Measured 2026-11-08, Hammer's regular Toronto prices for the same products
 * sit well above the Ontario averages (the data file's `calibration`): used raw, the average would
 * call most ordinary regular prices "bad". So the average is multiplied by a shelf factor measured per
 * product, shrunk toward the all-products factor by `SHRINK_N` (a product with few Hammer prices
 * leans on the overall factor). The factors live in the data file, written by `calibrate`.
 *
 * SHRINK_N was picked on held-out data, 2026-11-08: factors fitted on half the Hammer product names,
 * judged on the other half (13,190 rows), median |log error| 0.235 at 2, 0.237 at 5, 0.245 at 20,
 * 0.252 at 40, and 0.284 with one factor for every product. The products differ for real.
 */
export const SHRINK_N = 2;

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

/**
 * The StatCan average for one item, scaled to its size, for the shopper's
 * province (else Canada), or the reason there is none. `asOf` is YYYY-MM-DD.
 */
export function nationalAverageFor(
  q: {
    name: string | null;
    target: ComparisonQuantity | null;
    sizeText?: string | null;
    path?: readonly string[];
    region?: string | null;
    asOf: string;
  },
  table: StatcanTable | null,
): NationalAverage | { miss: MatchMiss | 'no_table' | 'no_value' | 'too_old' | 'no_shelf_factor' } {
  if (!table) return { miss: 'no_table' };
  const m = matchItem(q.name, q.target, q.sizeText ?? null, q.path ?? []);
  if ('miss' in m) return m;
  const byPlace = table.values[m.item.product];
  if (!byPlace) return { miss: 'no_value' };
  const want = placeOf(q.region);
  const pick = (want ? byPlace[want] : undefined) ?? byPlace.Canada;
  const place = want && byPlace[want] ? want : 'Canada';
  if (!pick) return { miss: 'no_value' };
  const [month, cents] = pick;
  if (monthsBetween(month, q.asOf.slice(0, 7)) > MAX_AGE_MONTHS) return { miss: 'too_old' };
  // No measured factor, no answer: the raw average is a different quantity from a shelf price.
  const premium = isPremium(q.name);
  const factor = (premium ? table.premiumFactor : table.shelfFactor)?.[m.item.product];
  const sigma = m.sizeAssumed ? table.calibration?.sigmaSizeAssumed : table.calibration?.sigma;
  const usable = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
  if (!usable(factor) || !usable(sigma)) return { miss: 'no_shelf_factor' };
  return {
    centreCents: Math.max(1, Math.round(cents * factor * m.ratio)),
    sigmaLog: sigma,
    product: m.item.product,
    place,
    month,
    averageCents: cents,
    shelfFactor: factor,
    ratio: m.ratio,
    premium,
    sizeAssumed: m.sizeAssumed === true,
  };
}

/* ------------------------------------------------------------ calibration */

export interface Calibration {
  /** product -> shelf factor for a standard version (regular shelf price over the StatCan average, shrunk). */
  readonly shelfFactor: Record<string, number>;
  /** product -> shelf factor for a premium version (`PREMIUM` words in the name). */
  readonly premiumFactor: Record<string, number>;
  readonly measured: {
    readonly on: string;
    readonly from: string;
    readonly place: string;
    readonly rows: number;
    readonly premiumRows: number;
    readonly products: number;
    /** Median over products of the standard factor before shrinking. */
    readonly overallFactor: number;
    /** Median over products of premium over standard. */
    readonly overallPremiumUplift: number;
    /** Robust spread of log(shelf / (average x factor x size)) over every matched row. */
    readonly sigma: number;
    /** The same with the size left out (the product's own size assumed): the spread an unsized item gets. */
    readonly sigmaSizeAssumed: number;
    /** Share of matched rows inside p10..p90 of a bell at `sigma`. */
    readonly insideP10P90: number;
    readonly perProduct: Record<string, { n: number; nPremium: number; factor: number; premiumFactor: number; sigma: number }>;
  };
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}
const robustSigma = (xs: readonly number[], centre: number) => 1.4826 * median(xs.map((x) => Math.abs(x - centre)));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Shelf factors and the spreads, from regular shelf prices of named, sized products in one place.
 * `rows` are (name, size text, cents); `place` is the table's place they were seen in.
 *
 * Standard and premium rows are measured apart. The standard factor is each product's median log
 * ratio, shrunk toward the median over products by `SHRINK_N`. The premium factor is the standard
 * factor times the product's own premium uplift (premium median over standard median), shrunk toward
 * the median uplift the same way: a product with three organic rows leans on the overall uplift.
 */
export function calibrate(
  rows: Iterable<{ name: string; sizeText: string; cents: number }>,
  table: StatcanTable,
  place: string,
  meta: { on: string; from: string },
  shrinkN: number = SHRINK_N,
): Calibration {
  type Obs = { x: number; logRatio: number };
  const std = new Map<string, Obs[]>();
  const prem = new Map<string, Obs[]>();
  let n = 0;
  let nPrem = 0;
  const anySizeRows: { product: string; premium: boolean; y: number }[] = [];
  // Hammer writes some multipacks size first ("90G*4"); the size parser reads pack first ("4x90g").
  const flip = (s: string) => s.replace(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\s*[x*]\s*(\d+)\b/i, '$3x$1$2');
  for (const r of rows) {
    if (!Number.isInteger(r.cents) || r.cents <= 0) continue;
    const pq = parseQuantity(flip(r.sizeText)) ?? parseQuantity(flip(r.name));
    const target = pq ? toComparison(pq.value, pq.unit) : null;
    // Only sized rows calibrate: an assumed size would measure the assumption, not the shelf.
    if (!target) continue;
    /*
     * The size-assumed spread: every row whose name names exactly one product, at ANY size in that
     * product's family, priced as if it were the product's own size. That is what an unsized item could
     * be (a 2.84 L ketchup read as 1 L), so its spread is measured over all of them, not the in-band few.
     */
    const byName = namedProducts(r.name.toLowerCase().replace(/\s+/g, ' ').trim());
    if (byName.length === 1 && comparable(byName[0]!, target) !== null) {
      const a = table.values[byName[0]!.product]?.[place] ?? table.values[byName[0]!.product]?.Canada;
      if (a) anySizeRows.push({ product: byName[0]!.product, premium: isPremium(r.name), y: Math.log(r.cents / a[1]) });
    }
    const m = matchItem(r.name, target, r.sizeText);
    if ('miss' in m || m.sizeAssumed) continue;
    const avg = table.values[m.item.product]?.[place] ?? table.values[m.item.product]?.Canada;
    if (!avg) continue;
    const into = isPremium(r.name) ? prem : std;
    const list = into.get(m.item.product) ?? [];
    list.push({ x: Math.log(r.cents / (avg[1] * m.ratio)), logRatio: Math.log(m.ratio) });
    into.set(m.item.product, list);
    n++;
    if (into === prem) nPrem++;
  }
  if (n === 0) throw new Error('statcan calibrate: no row matched any product');
  const xs = (l: readonly Obs[] | undefined) => (l ?? []).map((o) => o.x);
  // Overall standard factor: the median of the per-product medians, so a product with many rows does not dominate.
  const overall = median([...std.values()].map((l) => median(xs(l))));
  const upliftsSeen = ITEMS.filter((i) => std.has(i.product) && prem.has(i.product)).map(
    (i) => median(xs(prem.get(i.product))) - median(xs(std.get(i.product))),
  );
  const overallUplift = upliftsSeen.length ? median(upliftsSeen) : 0;

  const shelfFactor: Record<string, number> = {};
  const premiumFactor: Record<string, number> = {};
  const perProduct: Calibration['measured']['perProduct'] = {};
  const residuals: number[] = [];
  const unsized: number[] = [];
  for (const item of ITEMS) {
    const s = xs(std.get(item.product));
    const p = xs(prem.get(item.product));
    const own = s.length ? median(s) : overall;
    const mu = (s.length * own + shrinkN * overall) / (s.length + shrinkN);
    const up = p.length ? median(p) - own : overallUplift;
    const upMu = (p.length * up + shrinkN * overallUplift) / (p.length + shrinkN);
    const factor = r3(Math.exp(mu));
    const pFactor = r3(Math.exp(mu + upMu));
    shelfFactor[item.product] = factor;
    premiumFactor[item.product] = pFactor;
    perProduct[item.product] = { n: s.length, nPremium: p.length, factor, premiumFactor: pFactor, sigma: s.length ? r3(robustSigma(s, own)) : 0 };
    for (const o of std.get(item.product) ?? []) residuals.push(o.x - Math.log(factor));
    for (const o of prem.get(item.product) ?? []) residuals.push(o.x - Math.log(pFactor));
  }
  for (const r of anySizeRows) unsized.push(r.y - Math.log((r.premium ? premiumFactor : shelfFactor)[r.product]!));
  const sigma = robustSigma(residuals, median(residuals));
  const sigmaSizeAssumed = Math.max(sigma, robustSigma(unsized, median(unsized)));
  const inside = residuals.filter((x) => Math.abs(x) <= 1.2816 * sigma).length / residuals.length;
  return {
    shelfFactor,
    premiumFactor,
    measured: {
      ...meta,
      place,
      rows: n,
      premiumRows: nPrem,
      products: new Set([...std.keys(), ...prem.keys()]).size,
      overallFactor: r3(Math.exp(overall)),
      overallPremiumUplift: r3(Math.exp(overallUplift)),
      sigma: r3(sigma),
      sigmaSizeAssumed: r3(sigmaSizeAssumed),
      insideP10P90: r3(inside),
      perProduct,
    },
  };
}

/* -------------------------------------------------------------------- CLI */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, a, b] = process.argv.slice(2);
  const out = DEFAULT_PATH;
  const write = (t: StatcanTable) => fs.writeFileSync(out, JSON.stringify(t, null, 1) + '\n');
  if (cmd === 'build' && a) {
    // A monthly rebuild keeps the measured factors: they are ratios, and a new month does not move them.
    const old = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, 'utf8')) as StatcanTable) : null;
    const t: StatcanTable = { ...buildTable(fs.readFileSync(a, 'utf8')), ...(old?.shelfFactor ? { shelfFactor: old.shelfFactor, premiumFactor: old.premiumFactor, calibration: old.calibration } : {}) };
    write(t);
    console.log(`statcan: ${Object.keys(t.values).length} products, newest month ${t.latestMonth}, ${t.shelfFactor ? 'factors kept' : 'NOT CALIBRATED (run calibrate)'}, written to ${out}`);
  } else if (cmd === 'calibrate' && a && b) {
    // a: a prices database holding the Project Hammer load; b: hammer-N-product.csv (for sizes).
    const { DatabaseSync } = await import('node:sqlite');
    const { readProducts } = await import('./hammer.ts');
    const t = JSON.parse(fs.readFileSync(out, 'utf8')) as StatcanTable;
    const products = readProducts(fs.readFileSync(b, 'utf8'));
    const db = new DatabaseSync(a, { readOnly: true });
    const rows: { name: string; sizeText: string; cents: number }[] = [];
    let newest = '';
    for (const r of db.prepare("SELECT seller_sku, price_cents, seen_on FROM observation WHERE seller = 'hammer' AND kind = 'regular'").all() as { seller_sku: string; price_cents: number; seen_on: string }[]) {
      const p = products.get(String(r.seller_sku).replace(/#regular$/, ''));
      if (!p) continue;
      rows.push({ name: p.name, sizeText: p.units, cents: r.price_cents });
      if (r.seen_on > newest) newest = r.seen_on;
    }
    const c = calibrate(rows, t, 'Ontario', { on: new Date().toISOString().slice(0, 10), from: `Project Hammer regular prices, Toronto, newest ${newest}` });
    write({ ...t, shelfFactor: c.shelfFactor, premiumFactor: c.premiumFactor, calibration: c.measured });
    const m = c.measured;
    console.log(`statcan calibrate: ${m.rows} rows (${m.premiumRows} premium), ${m.products} of ${ITEMS.length} products, standard factor ${m.overallFactor}, premium uplift ${m.overallPremiumUplift}, sigma ${m.sigma}, sigma size assumed ${m.sigmaSizeAssumed}, inside p10..p90 ${(m.insideP10P90 * 100).toFixed(1)}%`);
  } else {
    console.error('usage: node price/src/statcan.ts build <18100245.csv> | calibrate <prices.db> <hammer-product.csv>   (writes price/statcan-averages.json)');
    process.exit(2);
  }
}
