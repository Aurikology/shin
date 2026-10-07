/**
 * Every country in the world, and the regions of the ones where a region changes
 * what a price means. Static: no network, no service, nothing to be down.
 *
 * Audit rows 14, 15, 34 (`docs/audit-google-doc-2026-09-19.md`). Jamin,
 * 2026-09-17: "Pexi will work for all locations accross the world in all
 * languages." The market picker offered three countries; this is the whole
 * list, so it is the only place a country is named.
 *
 * Why a table and not `Intl.DisplayNames`: the STORED value of a market is the
 * English name from this table, and it has to be the same string on every phone
 * and every ICU build ("Czechia" on one, "Czech Republic" on another would fork
 * the data). `Intl.DisplayNames` is used only to name a country in a language
 * this table has no column for, and only when the runtime has it.
 *
 * Row format: CODE|CURRENCY|English|French|French preposition. The fifth column
 * is left empty for "en" (en France, en Iran); "au", "aux" and "à" mark the
 * others. French contracts the preposition with the article and the contraction
 * depends on the country's gender and number, so it is data, never assembled
 * from the name at the call site (see the note on `countryIn` in screens/market.js).
 *
 * XK (Kosovo) is not in ISO 3166-1; it is the code the EU, CLDR and the
 * currency lists use for it, so it is here rather than leaving a country out.
 * Uninhabited territories (Antarctica, Bouvet, Heard) are left out: nobody
 * shops there.
 */

import { REGION_ROWS } from './regions.js';

const COUNTRY_ROWS = `
AD|EUR|Andorra|Andorre|
AE|AED|United Arab Emirates|Émirats arabes unis|aux
AF|AFN|Afghanistan|Afghanistan|
AG|XCD|Antigua and Barbuda|Antigua-et-Barbuda|à
AI|XCD|Anguilla|Anguilla|à
AL|ALL|Albania|Albanie|
AM|AMD|Armenia|Arménie|
AO|AOA|Angola|Angola|
AR|ARS|Argentina|Argentine|
AS|USD|American Samoa|Samoa américaines|aux
AT|EUR|Austria|Autriche|
AU|AUD|Australia|Australie|
AW|AWG|Aruba|Aruba|à
AX|EUR|Åland Islands|Îles Åland|aux
AZ|AZN|Azerbaijan|Azerbaïdjan|en
BA|BAM|Bosnia and Herzegovina|Bosnie-Herzégovine|en
BB|BBD|Barbados|Barbade|à la
BD|BDT|Bangladesh|Bangladesh|au
BE|EUR|Belgium|Belgique|en
BF|XOF|Burkina Faso|Burkina Faso|au
BG|EUR|Bulgaria|Bulgarie|en
BH|BHD|Bahrain|Bahreïn|à
BI|BIF|Burundi|Burundi|au
BJ|XOF|Benin|Bénin|au
BL|EUR|Saint Barthélemy|Saint-Barthélemy|à
BM|BMD|Bermuda|Bermudes|aux
BN|BND|Brunei|Brunéi Darussalam|au
BO|BOB|Bolivia|Bolivie|en
BQ|USD|Caribbean Netherlands|Pays-Bas caribéens|aux
BR|BRL|Brazil|Brésil|au
BS|BSD|Bahamas|Bahamas|aux
BT|BTN|Bhutan|Bhoutan|au
BW|BWP|Botswana|Botswana|au
BY|BYN|Belarus|Biélorussie|en
BZ|BZD|Belize|Belize|au
CA|CAD|Canada|Canada|au
CC|AUD|Cocos (Keeling) Islands|Îles Cocos|aux
CD|CDF|Congo (Kinshasa)|Congo-Kinshasa (RD Congo)|au
CF|XAF|Central African Republic|République centrafricaine|en
CG|XAF|Congo (Brazzaville)|Congo-Brazzaville|au
CH|CHF|Switzerland|Suisse|en
CI|XOF|Côte d'Ivoire|Côte d'Ivoire|en
CK|NZD|Cook Islands|Îles Cook|aux
CL|CLP|Chile|Chili|au
CM|XAF|Cameroon|Cameroun|au
CN|CNY|China|Chine|en
CO|COP|Colombia|Colombie|en
CR|CRC|Costa Rica|Costa Rica|au
CU|CUP|Cuba|Cuba|à
CV|CVE|Cape Verde|Cap-Vert|au
CW|ANG|Curaçao|Curaçao|à
CX|AUD|Christmas Island|Île Christmas|à l'
CY|EUR|Cyprus|Chypre|à
CZ|CZK|Czechia|Tchéquie|en
DE|EUR|Germany|Allemagne|en
DJ|DJF|Djibouti|Djibouti|à
DK|DKK|Denmark|Danemark|au
DM|XCD|Dominica|Dominique|en
DO|DOP|Dominican Republic|République dominicaine|en
DZ|DZD|Algeria|Algérie|en
EC|USD|Ecuador|Équateur|en
EE|EUR|Estonia|Estonie|en
EG|EGP|Egypt|Égypte|en
EH|MAD|Western Sahara|Sahara occidental|au
ER|ERN|Eritrea|Érythrée|en
ES|EUR|Spain|Espagne|en
ET|ETB|Ethiopia|Éthiopie|en
FI|EUR|Finland|Finlande|en
FJ|FJD|Fiji|Fidji|aux
FK|FKP|Falkland Islands|Îles Malouines|aux
FM|USD|Micronesia|Micronésie|en
FO|DKK|Faroe Islands|Îles Féroé|aux
FR|EUR|France|France|en
GA|XAF|Gabon|Gabon|au
GB|GBP|United Kingdom|Royaume-Uni|au
GD|XCD|Grenada|Grenade|à la
GE|GEL|Georgia|Géorgie|en
GF|EUR|French Guiana|Guyane française|en
GG|GBP|Guernsey|Guernesey|à
GH|GHS|Ghana|Ghana|au
GI|GIP|Gibraltar|Gibraltar|à
GL|DKK|Greenland|Groenland|au
GM|GMD|Gambia|Gambie|en
GN|GNF|Guinea|Guinée|en
GP|EUR|Guadeloupe|Guadeloupe|en
GQ|XAF|Equatorial Guinea|Guinée équatoriale|en
GR|EUR|Greece|Grèce|en
GT|GTQ|Guatemala|Guatemala|au
GU|USD|Guam|Guam|à
GW|XOF|Guinea-Bissau|Guinée-Bissau|en
GY|GYD|Guyana|Guyana|au
HK|HKD|Hong Kong|Hong Kong|à
HN|HNL|Honduras|Honduras|au
HR|EUR|Croatia|Croatie|en
HT|HTG|Haiti|Haïti|en
HU|HUF|Hungary|Hongrie|en
ID|IDR|Indonesia|Indonésie|en
IE|EUR|Ireland|Irlande|en
IL|ILS|Israel|Israël|en
IM|GBP|Isle of Man|Île de Man|à l'
IN|INR|India|Inde|en
IO|USD|British Indian Ocean Territory|Territoire britannique de l'océan Indien|dans le
IQ|IQD|Iraq|Irak|en
IR|IRR|Iran|Iran|en
IS|ISK|Iceland|Islande|en
IT|EUR|Italy|Italie|en
JE|GBP|Jersey|Jersey|à
JM|JMD|Jamaica|Jamaïque|en
JO|JOD|Jordan|Jordanie|en
JP|JPY|Japan|Japon|au
KE|KES|Kenya|Kenya|au
KG|KGS|Kyrgyzstan|Kirghizistan|au
KH|KHR|Cambodia|Cambodge|au
KI|AUD|Kiribati|Kiribati|au
KM|KMF|Comoros|Comores|aux
KN|XCD|Saint Kitts and Nevis|Saint-Christophe-et-Niévès|à
KP|KPW|North Korea|Corée du Nord|en
KR|KRW|South Korea|Corée du Sud|en
KW|KWD|Kuwait|Koweït|au
KY|KYD|Cayman Islands|Îles Caïmans|aux
KZ|KZT|Kazakhstan|Kazakhstan|au
LA|LAK|Laos|Laos|au
LB|LBP|Lebanon|Liban|au
LC|XCD|Saint Lucia|Sainte-Lucie|à
LI|CHF|Liechtenstein|Liechtenstein|au
LK|LKR|Sri Lanka|Sri Lanka|au
LR|LRD|Liberia|Libéria|au
LS|LSL|Lesotho|Lesotho|au
LT|EUR|Lithuania|Lituanie|en
LU|EUR|Luxembourg|Luxembourg|au
LV|EUR|Latvia|Lettonie|en
LY|LYD|Libya|Libye|en
MA|MAD|Morocco|Maroc|au
MC|EUR|Monaco|Monaco|à
MD|MDL|Moldova|Moldavie|en
ME|EUR|Montenegro|Monténégro|au
MF|EUR|Saint Martin|Saint-Martin|à
MG|MGA|Madagascar|Madagascar|à
MH|USD|Marshall Islands|Îles Marshall|aux
MK|MKD|North Macedonia|Macédoine du Nord|en
ML|XOF|Mali|Mali|au
MM|MMK|Myanmar|Myanmar|au
MN|MNT|Mongolia|Mongolie|en
MO|MOP|Macao|Macao|à
MP|USD|Northern Mariana Islands|Îles Mariannes du Nord|aux
MQ|EUR|Martinique|Martinique|en
MR|MRU|Mauritania|Mauritanie|en
MS|XCD|Montserrat|Montserrat|à
MT|EUR|Malta|Malte|à
MU|MUR|Mauritius|Maurice|à
MV|MVR|Maldives|Maldives|aux
MW|MWK|Malawi|Malawi|au
MX|MXN|Mexico|Mexique|au
MY|MYR|Malaysia|Malaisie|en
MZ|MZN|Mozambique|Mozambique|au
NA|NAD|Namibia|Namibie|en
NC|XPF|New Caledonia|Nouvelle-Calédonie|en
NE|XOF|Niger|Niger|au
NF|AUD|Norfolk Island|Île Norfolk|à l'
NG|NGN|Nigeria|Nigéria|au
NI|NIO|Nicaragua|Nicaragua|au
NL|EUR|Netherlands|Pays-Bas|aux
NO|NOK|Norway|Norvège|en
NP|NPR|Nepal|Népal|au
NR|AUD|Nauru|Nauru|à
NU|NZD|Niue|Niué|à
NZ|NZD|New Zealand|Nouvelle-Zélande|en
OM|OMR|Oman|Oman|à
PA|PAB|Panama|Panama|au
PE|PEN|Peru|Pérou|au
PF|XPF|French Polynesia|Polynésie française|en
PG|PGK|Papua New Guinea|Papouasie-Nouvelle-Guinée|en
PH|PHP|Philippines|Philippines|aux
PK|PKR|Pakistan|Pakistan|au
PL|PLN|Poland|Pologne|en
PM|EUR|Saint Pierre and Miquelon|Saint-Pierre-et-Miquelon|à
PN|NZD|Pitcairn Islands|Îles Pitcairn|aux
PR|USD|Puerto Rico|Porto Rico|à
PS|ILS|Palestine|Palestine|en
PT|EUR|Portugal|Portugal|au
PW|USD|Palau|Palaos|aux
PY|PYG|Paraguay|Paraguay|au
QA|QAR|Qatar|Qatar|au
RE|EUR|Réunion|La Réunion|à
RO|RON|Romania|Roumanie|en
RS|RSD|Serbia|Serbie|en
RU|RUB|Russia|Russie|en
RW|RWF|Rwanda|Rwanda|au
SA|SAR|Saudi Arabia|Arabie saoudite|en
SB|SBD|Solomon Islands|Îles Salomon|aux
SC|SCR|Seychelles|Seychelles|aux
SD|SDG|Sudan|Soudan|au
SE|SEK|Sweden|Suède|en
SG|SGD|Singapore|Singapour|à
SH|SHP|Saint Helena|Sainte-Hélène|à
SI|EUR|Slovenia|Slovénie|en
SJ|NOK|Svalbard and Jan Mayen|Svalbard et Jan Mayen|au
SK|EUR|Slovakia|Slovaquie|en
SL|SLE|Sierra Leone|Sierra Leone|en
SM|EUR|San Marino|Saint-Marin|à
SN|XOF|Senegal|Sénégal|au
SO|SOS|Somalia|Somalie|en
SR|SRD|Suriname|Suriname|au
SS|SSP|South Sudan|Soudan du Sud|au
ST|STN|São Tomé and Príncipe|Sao Tomé-et-Principe|à
SV|USD|El Salvador|Salvador|au
SX|ANG|Sint Maarten|Sint Maarten|à
SY|SYP|Syria|Syrie|en
SZ|SZL|Eswatini|Eswatini|en
TC|USD|Turks and Caicos Islands|Îles Turques-et-Caïques|aux
TD|XAF|Chad|Tchad|au
TG|XOF|Togo|Togo|au
TH|THB|Thailand|Thaïlande|en
TJ|TJS|Tajikistan|Tadjikistan|au
TK|NZD|Tokelau|Tokelau|aux
TL|USD|Timor-Leste|Timor oriental|au
TM|TMT|Turkmenistan|Turkménistan|au
TN|TND|Tunisia|Tunisie|en
TO|TOP|Tonga|Tonga|aux
TR|TRY|Türkiye|Turquie|en
TT|TTD|Trinidad and Tobago|Trinité-et-Tobago|à
TV|AUD|Tuvalu|Tuvalu|aux
TW|TWD|Taiwan|Taïwan|à
TZ|TZS|Tanzania|Tanzanie|en
UA|UAH|Ukraine|Ukraine|en
UG|UGX|Uganda|Ouganda|en
US|USD|United States|États-Unis|aux
UY|UYU|Uruguay|Uruguay|en
UZ|UZS|Uzbekistan|Ouzbékistan|en
VA|EUR|Vatican City|Vatican|au
VC|XCD|Saint Vincent and the Grenadines|Saint-Vincent-et-les-Grenadines|à
VE|VES|Venezuela|Venezuela|au
VG|USD|British Virgin Islands|Îles Vierges britanniques|aux
VI|USD|U.S. Virgin Islands|Îles Vierges des États-Unis|aux
VN|VND|Vietnam|Viêt Nam|au
VU|VUV|Vanuatu|Vanuatu|au
WF|XPF|Wallis and Futuna|Wallis-et-Futuna|à
WS|WST|Samoa|Samoa|aux
XK|EUR|Kosovo|Kosovo|au
YE|YER|Yemen|Yémen|au
YT|EUR|Mayotte|Mayotte|à
ZA|ZAR|South Africa|Afrique du Sud|en
ZM|ZMW|Zambia|Zambie|en
ZW|ZWG|Zimbabwe|Zimbabwe|au
`;

/**
 * @typedef {{ code: string, currency: string, en: string, fr: string, prep: string }} Country
 */

/** @type {readonly Country[]} */
export const COUNTRIES = Object.freeze(
  COUNTRY_ROWS.trim().split('\n').map((line) => {
    const [code, currency, en, fr, prep] = line.split('|');
    return Object.freeze({ code, currency, en, fr, prep: prep || 'en' });
  }),
);

/** Spellings people type that are not the table's own name. Lower case, accents stripped. */
const ALIASES = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states of america': 'US', 'etats-unis d\'amerique': 'US',
  uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'czech republic': 'CZ', turkey: 'TR', 'ivory coast': 'CI', 'cote divoire': 'CI', burma: 'MM',
  'cabo verde': 'CV', swaziland: 'SZ', 'east timor': 'TL', macedonia: 'MK', holland: 'NL',
  'republic of ireland': 'IE', 'democratic republic of the congo': 'CD', drc: 'CD', 'dr congo': 'CD',
  'republic of the congo': 'CG', 'republic of korea': 'KR', 'hong kong sar': 'HK',
  uae: 'AE', emirates: 'AE', 'the bahamas': 'BS', 'the gambia': 'GM', 'the netherlands': 'NL',
  'sao tome and principe': 'ST', vatican: 'VA', 'holy see': 'VA',
  angleterre: 'GB', 'grande-bretagne': 'GB', 'republique tcheque': 'CZ',
};

/** Lower case, accents and apostrophe variants removed: "États-Unis" and "etats-unis" are one key. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .trim();
}

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
const byName = new Map();
for (const c of COUNTRIES) {
  byName.set(normalize(c.en), c);
  byName.set(normalize(c.fr), c);
}

/** The country with this ISO code (any case), or null. */
export function countryByCode(code) {
  return byCode.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/**
 * The country a stored or typed value means: an ISO code, an English or French
 * name, or a common alias. Null when it is none of them, and never a guess.
 */
export function findCountry(value) {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (/^[A-Za-z]{2}$/.test(text)) return countryByCode(text);
  const key = normalize(text);
  const named = byName.get(key);
  if (named) return named;
  const aliased = ALIASES[key];
  return aliased ? countryByCode(aliased) : null;
}

/**
 * The name in a language. English and French come from the table. Any other
 * language asks `Intl.DisplayNames` when the runtime has it, and falls back to
 * the English name, which is always right if not always local.
 */
export function countryName(country, lang = 'en') {
  if (!country) return '';
  if (lang === 'fr') return country.fr;
  if (lang === 'en' || !lang) return country.en;
  try {
    const name = new Intl.DisplayNames([lang], { type: 'region' }).of(country.code);
    if (typeof name === 'string' && name !== '' && name !== country.code) return name;
  } catch {
    /* the runtime has no Intl.DisplayNames or does not know the language */
  }
  return country.en;
}

/** English takes "the" before these ("in the Netherlands"); every "... Islands" name does too. */
const THE_COUNTRIES = new Set(['US', 'GB', 'AE', 'NL', 'BQ', 'PH', 'BS', 'GM', 'CF', 'DO', 'MV', 'SC', 'KM', 'IM', 'IO']);

/**
 * The country in the form that follows "in" (English) or the French
 * preposition: "in Canada", "au Canada", "aux États-Unis", "en France".
 */
export function countryInPhrase(country, lang = 'en') {
  if (!country) return '';
  if (lang !== 'fr') return `in ${THE_COUNTRIES.has(country.code) || /Islands$/.test(country.en) ? 'the ' : ''}${country.en}`;
  const prep = country.prep;
  const glue = prep.endsWith("'") ? '' : ' ';
  return `${prep}${glue}${country.fr}`;
}

/**
 * Countries matching what was typed, alphabetised in `lang`. Matches the
 * English name, the French name, the ISO code and the currency code, ignoring
 * case and accents, so "etats", "germ", "de" and "eur" all find something.
 * An empty query is every country.
 */
export function searchCountries(query, lang = 'en') {
  const q = normalize(query);
  const pick = lang === 'fr' ? (c) => c.fr : (c) => c.en;
  let collator = null;
  try {
    collator = new Intl.Collator(lang === 'fr' ? 'fr' : 'en');
  } catch {
    collator = null;
  }
  const cmp = (a, b) => (collator ? collator.compare(pick(a), pick(b)) : pick(a).localeCompare(pick(b)));
  const hits = q === ''
    ? COUNTRIES.slice()
    : COUNTRIES.filter((c) =>
        normalize(c.en).includes(q)
        || normalize(c.fr).includes(q)
        || c.code.toLowerCase() === q
        || c.currency.toLowerCase() === q);
  return hits.sort(cmp);
}

/* ------------------------------------------------------------------ regions */

/*
 * The region table itself is data and lives in `lib/regions.js` (first-level
 * subdivisions for the countries where a region can change what a price means).
 * A country with no entry has no region step and its region stays unknown. The
 * two per-country flags that become the prompt hints (`regionMatters`, the
 * EU/EEA bloc) are in the same file and are read by `catalogue/src/market.ts`,
 * a separate question from which regions the picker can name.
 */

/** @type {Readonly<Record<string, readonly { code: string, en: string, fr: string }[]>>} */
export const REGIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(REGION_ROWS).map(([country, rows]) => [
      country,
      Object.freeze(rows.split('\n').map((line) => {
        const [code, en, fr] = line.split('|');
        return Object.freeze({ code, en, fr: fr || en });
      })),
    ]),
  ),
);

/** The regions the picker can name for a country (an ISO code), or an empty list. */
export function regionsOf(countryCode) {
  return REGIONS[String(countryCode ?? '').trim().toUpperCase()] ?? [];
}

/** The region of a country that a stored or typed value means (code, English or French name), or null. */
export function findRegion(countryCode, value) {
  const key = normalize(value);
  if (key === '') return null;
  return regionsOf(countryCode).find((r) => normalize(r.en) === key || normalize(r.fr) === key || r.code.toLowerCase() === key) ?? null;
}

/** A stored region (its English name) as it reads in `lang`. An unknown one is shown as stored. */
export function regionLabel(countryCode, value, lang = 'en') {
  const r = findRegion(countryCode, value);
  if (!r) return String(value ?? '');
  return lang === 'fr' ? r.fr : r.en;
}
