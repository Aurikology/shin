/**
 * The first-level regions of the world's countries, and the two per-country flags
 * that turn into prompt hints. Data only: no logic, no network, nothing to be
 * down. The functions that read it live in `lib/countries.js` (regionsOf,
 * findRegion) and `catalogue/src/market.ts` (the two hints for Gemini).
 *
 * Audit rows 14 and 15, beta-gaps item 19. Jamin, 2026-09-17: same-country prices
 * compare, cross-country prices do not, "Some provinces in the same country might
 * have very different prices whereas some countries like the eu might have similar
 * prices accross countries." A user can now name their region in every country
 * below, and the flags tell Gemini which countries are worth asking about.
 *
 * WHERE THE NAMES COME FROM, said plainly: no ISO 3166-2, CLDR or country-state
 * package exists in this repo or its node_modules, and `Intl.DisplayNames` names
 * countries, not subdivisions. So every block below is HAND-TYPED from knowledge,
 * not read from a file, and none has been checked against ISO's own list. Canada,
 * the US and Australia carry over unchanged from the earlier table. A block marked
 * "LOCAL KEYS" uses short keys of our own instead of ISO 3166-2 codes. The key is
 * only an id inside this table: what the phone stores and sends is the English
 * name, never the key (`store.setRegion`).
 *
 * Row format: CODE|English|French. The French column is left out when it is the
 * same as the English. Names are the English form where a common one exists
 * (Bavaria, Lower Saxony) and the country's own name otherwise.
 *
 * Belongs elsewhere, and is left out: the ISO country codes that already have a
 * row of their own in the picker (Hong Kong, Macau, Taiwan, Aland, the overseas
 * territories of France other than the five that are regions of France), so no
 * place is offered twice.
 */

export const REGION_ROWS = {
  CA: `AB|Alberta
BC|British Columbia|Colombie-Britannique
MB|Manitoba
NB|New Brunswick|Nouveau-Brunswick
NL|Newfoundland and Labrador|Terre-Neuve-et-Labrador
NS|Nova Scotia|Nouvelle-Écosse
NT|Northwest Territories|Territoires du Nord-Ouest
NU|Nunavut
ON|Ontario
PE|Prince Edward Island|Île-du-Prince-Édouard
QC|Quebec|Québec
SK|Saskatchewan
YT|Yukon`,
  US: `AL|Alabama
AK|Alaska
AZ|Arizona
AR|Arkansas
CA|California|Californie
CO|Colorado
CT|Connecticut
DE|Delaware
DC|District of Columbia|District de Columbia
FL|Florida|Floride
GA|Georgia|Géorgie
HI|Hawaii|Hawaï
ID|Idaho
IL|Illinois
IN|Indiana
IA|Iowa
KS|Kansas
KY|Kentucky
LA|Louisiana|Louisiane
ME|Maine
MD|Maryland
MA|Massachusetts
MI|Michigan
MN|Minnesota
MS|Mississippi
MO|Missouri
MT|Montana
NE|Nebraska
NV|Nevada
NH|New Hampshire
NJ|New Jersey
NM|New Mexico|Nouveau-Mexique
NY|New York
NC|North Carolina|Caroline du Nord
ND|North Dakota|Dakota du Nord
OH|Ohio
OK|Oklahoma
OR|Oregon
PA|Pennsylvania|Pennsylvanie
RI|Rhode Island
SC|South Carolina|Caroline du Sud
SD|South Dakota|Dakota du Sud
TN|Tennessee
TX|Texas
UT|Utah
VT|Vermont
VA|Virginia|Virginie
WA|Washington
WV|West Virginia|Virginie-Occidentale
WI|Wisconsin
WY|Wyoming`,
  AU: `ACT|Australian Capital Territory|Territoire de la capitale australienne
NSW|New South Wales|Nouvelle-Galles du Sud
NT|Northern Territory|Territoire du Nord
QLD|Queensland
SA|South Australia|Australie-Méridionale
TAS|Tasmania|Tasmanie
VIC|Victoria
WA|Western Australia|Australie-Occidentale`,
  GB: `ENG|England|Angleterre
NIR|Northern Ireland|Irlande du Nord
SCT|Scotland|Écosse
WLS|Wales|Pays de Galles`,
  DE: `BW|Baden-Württemberg
BY|Bavaria
BE|Berlin
BB|Brandenburg
HB|Bremen
HH|Hamburg
HE|Hesse
MV|Mecklenburg-Vorpommern
NI|Lower Saxony
NW|North Rhine-Westphalia
RP|Rhineland-Palatinate
SL|Saarland
SN|Saxony
ST|Saxony-Anhalt
SH|Schleswig-Holstein
TH|Thuringia`,
  FR: `ARA|Auvergne-Rhône-Alpes
BFC|Bourgogne-Franche-Comté
BRE|Brittany|Bretagne
CVL|Centre-Val de Loire
COR|Corsica|Corse
GES|Grand Est
HDF|Hauts-de-France
IDF|Île-de-France
NOR|Normandy|Normandie
NAQ|Nouvelle-Aquitaine
OCC|Occitanie
PDL|Pays de la Loire
PAC|Provence-Alpes-Côte d'Azur
GP|Guadeloupe
MQ|Martinique
GF|French Guiana|Guyane
RE|Réunion|La Réunion
YT|Mayotte`,
  ES: `AN|Andalusia
AR|Aragon
AS|Asturias
IB|Balearic Islands
PV|Basque Country
CN|Canary Islands
CB|Cantabria
CL|Castile and León
CM|Castilla-La Mancha
CT|Catalonia
CE|Ceuta
EX|Extremadura
GA|Galicia
RI|La Rioja
MD|Madrid
ML|Melilla
MC|Murcia
NC|Navarre
VC|Valencian Community`,
  IT: `65|Abruzzo
23|Aosta Valley
75|Apulia
77|Basilicata
78|Calabria
72|Campania
45|Emilia-Romagna
36|Friuli-Venezia Giulia
62|Lazio
42|Liguria
25|Lombardy
57|Marche
67|Molise
21|Piedmont
88|Sardinia
82|Sicily
32|Trentino-South Tyrol
52|Tuscany
55|Umbria
34|Veneto`,
  NL: `DR|Drenthe
FL|Flevoland
FR|Friesland
GE|Gelderland
GR|Groningen
LI|Limburg
NB|North Brabant
NH|North Holland
OV|Overijssel
UT|Utrecht
ZE|Zeeland
ZH|South Holland`,
  BE: `BRU|Brussels-Capital Region|Région de Bruxelles-Capitale
VLG|Flanders|Flandre
WAL|Wallonia|Wallonie`,
  CH: `AG|Aargau|Argovie
AI|Appenzell Innerrhoden|Appenzell Rhodes-Intérieures
AR|Appenzell Ausserrhoden|Appenzell Rhodes-Extérieures
BL|Basel-Landschaft|Bâle-Campagne
BS|Basel-Stadt|Bâle-Ville
BE|Bern|Berne
FR|Fribourg
GE|Geneva|Genève
GL|Glarus|Glaris
GR|Graubünden|Grisons
JU|Jura
LU|Lucerne
NE|Neuchâtel
NW|Nidwalden|Nidwald
OW|Obwalden|Obwald
SH|Schaffhausen
SZ|Schwyz
SO|Solothurn|Soleure
SG|St. Gallen|Saint-Gall
TG|Thurgau|Thurgovie
TI|Ticino|Tessin
UR|Uri
VS|Valais
VD|Vaud
ZG|Zug
ZH|Zurich`,
  AT: `1|Burgenland
2|Carinthia
3|Lower Austria
4|Upper Austria
5|Salzburg
6|Styria
7|Tyrol
8|Vorarlberg
9|Vienna`,
  IE: `C|Connacht
L|Leinster
M|Munster
U|Ulster`,
  PL: `DS|Lower Silesia
KP|Kuyavia-Pomerania
LU|Lublin
LB|Lubusz
LD|Łódź
MA|Lesser Poland
MZ|Masovia
OP|Opole
PK|Subcarpathia
PD|Podlaskie
PM|Pomerania
SL|Silesia
SK|Świętokrzyskie
WN|Warmia-Masuria
WP|Greater Poland
ZP|West Pomerania`,
  SE: `AB|Stockholm
AC|Västerbotten
BD|Norrbotten
C|Uppsala
D|Södermanland
E|Östergötland
F|Jönköping
G|Kronoberg
H|Kalmar
I|Gotland
K|Blekinge
M|Skåne
N|Halland
O|Västra Götaland
S|Värmland
T|Örebro
U|Västmanland
W|Dalarna
X|Gävleborg
Y|Västernorrland
Z|Jämtland`,
  NO: `32|Akershus
42|Agder
34|Innlandet
56|Finnmark
15|Møre og Romsdal
18|Nordland
03|Oslo
11|Rogaland
33|Buskerud
40|Telemark
50|Trøndelag
55|Troms
46|Vestland
39|Vestfold
31|Østfold`,
  DK: `84|Capital Region of Denmark
82|Central Denmark Region
81|North Denmark Region
85|Region Zealand
83|Region of Southern Denmark`,
  FI: `02|South Karelia
03|South Ostrobothnia
04|Southern Savonia
05|Kainuu
06|Kanta-Häme
07|Central Ostrobothnia
08|Central Finland
09|Kymenlaakso
10|Lapland
11|Pirkanmaa
12|Ostrobothnia
13|North Karelia
14|Northern Ostrobothnia
15|Northern Savonia
16|Päijät-Häme
17|Satakunta
18|Uusimaa
19|Southwest Finland`,
  PT: `01|Aveiro
02|Beja
03|Braga
04|Bragança
05|Castelo Branco
06|Coimbra
07|Évora
08|Faro
09|Guarda
10|Leiria
11|Lisbon
12|Portalegre
13|Porto
14|Santarém
15|Setúbal
16|Viana do Castelo
17|Vila Real
18|Viseu
20|Azores
30|Madeira`,
  MX: `AGU|Aguascalientes
BCN|Baja California
BCS|Baja California Sur
CAM|Campeche
CHP|Chiapas
CHH|Chihuahua
CMX|Mexico City
COA|Coahuila
COL|Colima
DUR|Durango
GUA|Guanajuato
GRO|Guerrero
HID|Hidalgo
JAL|Jalisco
MEX|State of Mexico
MIC|Michoacán
MOR|Morelos
NAY|Nayarit
NLE|Nuevo León
OAX|Oaxaca
PUE|Puebla
QUE|Querétaro
ROO|Quintana Roo
SLP|San Luis Potosí
SIN|Sinaloa
SON|Sonora
TAB|Tabasco
TAM|Tamaulipas
TLA|Tlaxcala
VER|Veracruz
YUC|Yucatán
ZAC|Zacatecas`,
  BR: `AC|Acre
AL|Alagoas
AP|Amapá
AM|Amazonas
BA|Bahia
CE|Ceará
DF|Federal District
ES|Espírito Santo
GO|Goiás
MA|Maranhão
MT|Mato Grosso
MS|Mato Grosso do Sul
MG|Minas Gerais
PA|Pará
PB|Paraíba
PR|Paraná
PE|Pernambuco
PI|Piauí
RJ|Rio de Janeiro
RN|Rio Grande do Norte
RS|Rio Grande do Sul
RO|Rondônia
RR|Roraima
SC|Santa Catarina
SP|São Paulo
SE|Sergipe
TO|Tocantins`,
  AR: `C|Buenos Aires City
B|Buenos Aires Province
K|Catamarca
H|Chaco
U|Chubut
X|Córdoba
W|Corrientes
E|Entre Ríos
P|Formosa
Y|Jujuy
L|La Pampa
F|La Rioja
M|Mendoza
N|Misiones
Q|Neuquén
R|Río Negro
A|Salta
J|San Juan
D|San Luis
Z|Santa Cruz
S|Santa Fe
G|Santiago del Estero
V|Tierra del Fuego
T|Tucumán`,
  CL: `AI|Aysén
AN|Antofagasta
AP|Arica and Parinacota
AR|La Araucanía
AT|Atacama
BI|Biobío
CO|Coquimbo
LI|O'Higgins
LL|Los Lagos
LR|Los Ríos
MA|Magallanes
ML|Maule
NB|Ñuble
RM|Santiago Metropolitan
TA|Tarapacá
VS|Valparaíso`,
  CO: `AMA|Amazonas
ANT|Antioquia
ARA|Arauca
ATL|Atlántico
BOL|Bolívar
BOY|Boyacá
CAL|Caldas
CAQ|Caquetá
CAS|Casanare
CAU|Cauca
CES|Cesar
CHO|Chocó
COR|Córdoba
CUN|Cundinamarca
DC|Bogotá
GUA|Guainía
GUV|Guaviare
HUI|Huila
LAG|La Guajira
MAG|Magdalena
MET|Meta
NAR|Nariño
NSA|Norte de Santander
PUT|Putumayo
QUI|Quindío
RIS|Risaralda
SAP|San Andrés and Providencia
SAN|Santander
SUC|Sucre
TOL|Tolima
VAC|Valle del Cauca
VAU|Vaupés
VID|Vichada`,
  IN: `AP|Andhra Pradesh
AR|Arunachal Pradesh
AS|Assam
BR|Bihar
CG|Chhattisgarh
GA|Goa
GJ|Gujarat
HR|Haryana
HP|Himachal Pradesh
JH|Jharkhand
KA|Karnataka
KL|Kerala
MP|Madhya Pradesh
MH|Maharashtra
MN|Manipur
ML|Meghalaya
MZ|Mizoram
NL|Nagaland
OD|Odisha
PB|Punjab
RJ|Rajasthan
SK|Sikkim
TN|Tamil Nadu
TS|Telangana
TR|Tripura
UP|Uttar Pradesh
UK|Uttarakhand
WB|West Bengal
AN|Andaman and Nicobar Islands
CH|Chandigarh
DH|Dadra and Nagar Haveli and Daman and Diu
DL|Delhi
JK|Jammu and Kashmir
LA|Ladakh
LD|Lakshadweep
PY|Puducherry`,
  CN: `AH|Anhui
BJ|Beijing
CQ|Chongqing
FJ|Fujian
GS|Gansu
GD|Guangdong
GX|Guangxi
GZ|Guizhou
HI|Hainan
HE|Hebei
HL|Heilongjiang
HA|Henan
HB|Hubei
HN|Hunan
JS|Jiangsu
JX|Jiangxi
JL|Jilin
LN|Liaoning
NM|Inner Mongolia
NX|Ningxia
QH|Qinghai
SN|Shaanxi
SD|Shandong
SH|Shanghai
SX|Shanxi
SC|Sichuan
TJ|Tianjin
XJ|Xinjiang
XZ|Tibet
YN|Yunnan
ZJ|Zhejiang`,
  JP: `01|Hokkaido
02|Aomori
03|Iwate
04|Miyagi
05|Akita
06|Yamagata
07|Fukushima
08|Ibaraki
09|Tochigi
10|Gunma
11|Saitama
12|Chiba
13|Tokyo
14|Kanagawa
15|Niigata
16|Toyama
17|Ishikawa
18|Fukui
19|Yamanashi
20|Nagano
21|Gifu
22|Shizuoka
23|Aichi
24|Mie
25|Shiga
26|Kyoto
27|Osaka
28|Hyogo
29|Nara
30|Wakayama
31|Tottori
32|Shimane
33|Okayama
34|Hiroshima
35|Yamaguchi
36|Tokushima
37|Kagawa
38|Ehime
39|Kochi
40|Fukuoka
41|Saga
42|Nagasaki
43|Kumamoto
44|Oita
45|Miyazaki
46|Kagoshima
47|Okinawa`,
  KR: `11|Seoul
26|Busan
27|Daegu
28|Incheon
29|Gwangju
30|Daejeon
31|Ulsan
50|Sejong
41|Gyeonggi
42|Gangwon
43|North Chungcheong
44|South Chungcheong
45|North Jeolla
46|South Jeolla
47|North Gyeongsang
48|South Gyeongsang
49|Jeju`,
  ID: `AC|Aceh
SU|North Sumatra
SB|West Sumatra
RI|Riau
KR|Riau Islands
JA|Jambi
SS|South Sumatra
BB|Bangka Belitung Islands
BE|Bengkulu
LA|Lampung
JK|Jakarta
JB|West Java
JT|Central Java
YO|Yogyakarta
JI|East Java
BT|Banten
BA|Bali
NB|West Nusa Tenggara
NT|East Nusa Tenggara
KB|West Kalimantan
KT|Central Kalimantan
KS|South Kalimantan
KI|East Kalimantan
KU|North Kalimantan
SA|North Sulawesi
ST|Central Sulawesi
SN|South Sulawesi
SG|Southeast Sulawesi
GO|Gorontalo
SR|West Sulawesi
MA|Maluku
MU|North Maluku
PA|Papua
PB|West Papua
PS|South Papua
PT|Central Papua
PE|Highland Papua
PD|Southwest Papua`,
  PH: `00|Metro Manila
01|Ilocos Region
02|Cagayan Valley
03|Central Luzon
40|Calabarzon
41|Mimaropa
05|Bicol Region
06|Western Visayas
07|Central Visayas
08|Eastern Visayas
09|Zamboanga Peninsula
10|Northern Mindanao
11|Davao Region
12|Soccsksargen
13|Caraga
14|Bangsamoro
15|Cordillera Administrative Region`,
  MY: `01|Johor
02|Kedah
03|Kelantan
04|Malacca
05|Negeri Sembilan
06|Pahang
07|Penang
08|Perak
09|Perlis
10|Selangor
11|Terengganu
12|Sabah
13|Sarawak
14|Kuala Lumpur
15|Labuan
16|Putrajaya`,
  TH: `10|Bangkok
11|Samut Prakan
12|Nonthaburi
13|Pathum Thani
14|Phra Nakhon Si Ayutthaya
15|Ang Thong
16|Lop Buri
17|Sing Buri
18|Chai Nat
19|Saraburi
20|Chon Buri
21|Rayong
22|Chanthaburi
23|Trat
24|Chachoengsao
25|Prachin Buri
26|Nakhon Nayok
27|Sa Kaeo
30|Nakhon Ratchasima
31|Buri Ram
32|Surin
33|Si Sa Ket
34|Ubon Ratchathani
35|Yasothon
36|Chaiyaphum
37|Amnat Charoen
38|Bueng Kan
39|Nong Bua Lam Phu
40|Khon Kaen
41|Udon Thani
42|Loei
43|Nong Khai
44|Maha Sarakham
45|Roi Et
46|Kalasin
47|Sakon Nakhon
48|Nakhon Phanom
49|Mukdahan
50|Chiang Mai
51|Lamphun
52|Lampang
53|Uttaradit
54|Phrae
55|Nan
56|Phayao
57|Chiang Rai
58|Mae Hong Son
60|Nakhon Sawan
61|Uthai Thani
62|Kamphaeng Phet
63|Tak
64|Sukhothai
65|Phitsanulok
66|Phichit
67|Phetchabun
70|Ratchaburi
71|Kanchanaburi
72|Suphan Buri
73|Nakhon Pathom
74|Samut Sakhon
75|Samut Songkhram
76|Phetchaburi
77|Prachuap Khiri Khan
80|Nakhon Si Thammarat
81|Krabi
82|Phangnga
83|Phuket
84|Surat Thani
85|Ranong
86|Chumphon
90|Songkhla
91|Satun
92|Trang
93|Phatthalung
94|Pattani
95|Yala
96|Narathiwat`,
  // LOCAL KEYS, not ISO: Vietnam merged its provinces into 34 units in 2025 and the
  // 3166-2 codes for the new ones are not known here.
  VN: `HAN|Hanoi
HCM|Ho Chi Minh City
HPH|Hai Phong
DAD|Da Nang
HUE|Hue
CTH|Can Tho
TQU|Tuyen Quang
LCA|Lao Cai
TNG|Thai Nguyen
PTH|Phu Tho
BNI|Bac Ninh
HYE|Hung Yen
NBI|Ninh Binh
QTR|Quang Tri
QNG|Quang Ngai
GLA|Gia Lai
KHO|Khanh Hoa
LDG|Lam Dong
DLK|Dak Lak
DNA|Dong Nai
TNI|Tay Ninh
VLO|Vinh Long
DTP|Dong Thap
CMU|Ca Mau
AGG|An Giang
CBA|Cao Bang
DBI|Dien Bien
HTI|Ha Tinh
LCH|Lai Chau
LSO|Lang Son
NAN|Nghe An
QNI|Quang Ninh
THO|Thanh Hoa
SLA|Son La`,
  TR: `01|Adana
02|Adıyaman
03|Afyonkarahisar
04|Ağrı
05|Amasya
06|Ankara
07|Antalya
08|Artvin
09|Aydın
10|Balıkesir
11|Bilecik
12|Bingöl
13|Bitlis
14|Bolu
15|Burdur
16|Bursa
17|Çanakkale
18|Çankırı
19|Çorum
20|Denizli
21|Diyarbakır
22|Edirne
23|Elazığ
24|Erzincan
25|Erzurum
26|Eskişehir
27|Gaziantep
28|Giresun
29|Gümüşhane
30|Hakkâri
31|Hatay
32|Isparta
33|Mersin
34|Istanbul
35|İzmir
36|Kars
37|Kastamonu
38|Kayseri
39|Kırklareli
40|Kırşehir
41|Kocaeli
42|Konya
43|Kütahya
44|Malatya
45|Manisa
46|Kahramanmaraş
47|Mardin
48|Muğla
49|Muş
50|Nevşehir
51|Niğde
52|Ordu
53|Rize
54|Sakarya
55|Samsun
56|Siirt
57|Sinop
58|Sivas
59|Tekirdağ
60|Tokat
61|Trabzon
62|Tunceli
63|Şanlıurfa
64|Uşak
65|Van
66|Yozgat
67|Zonguldak
68|Aksaray
69|Bayburt
70|Karaman
71|Kırıkkale
72|Batman
73|Şırnak
74|Bartın
75|Ardahan
76|Iğdır
77|Yalova
78|Karabük
79|Kilis
80|Osmaniye
81|Düzce`,
  SA: `01|Riyadh
02|Makkah
03|Madinah
04|Eastern Province
05|Al-Qassim
06|Ha'il
07|Tabuk
08|Northern Borders
09|Jazan
10|Najran
11|Al Bahah
12|Al Jawf
14|Asir`,
  AE: `AZ|Abu Dhabi
AJ|Ajman
FU|Fujairah
SH|Sharjah
DU|Dubai
RK|Ras Al Khaimah
UQ|Umm Al Quwain`,
  EG: `ALX|Alexandria
ASN|Aswan
AST|Asyut
BH|Beheira
BNS|Beni Suef
C|Cairo
DK|Dakahlia
DT|Damietta
FYM|Faiyum
GH|Gharbia
GZ|Giza
IS|Ismailia
KFS|Kafr el-Sheikh
LX|Luxor
MT|Matrouh
MN|Minya
MNF|Monufia
WAD|New Valley
SIN|North Sinai
PTS|Port Said
KB|Qalyubia
KN|Qena
BA|Red Sea
SHR|Sharqia
SHG|Sohag
JS|South Sinai
SUZ|Suez`,
  NG: `AB|Abia
AD|Adamawa
AK|Akwa Ibom
AN|Anambra
BA|Bauchi
BY|Bayelsa
BE|Benue
BO|Borno
CR|Cross River
DE|Delta
EB|Ebonyi
ED|Edo
EK|Ekiti
EN|Enugu
FC|Federal Capital Territory
GO|Gombe
IM|Imo
JI|Jigawa
KD|Kaduna
KN|Kano
KT|Katsina
KE|Kebbi
KO|Kogi
KW|Kwara
LA|Lagos
NA|Nasarawa
NI|Niger
OG|Ogun
ON|Ondo
OS|Osun
OY|Oyo
PL|Plateau
RI|Rivers
SO|Sokoto
TA|Taraba
YO|Yobe
ZA|Zamfara`,
  ZA: `EC|Eastern Cape
FS|Free State
GP|Gauteng
KZN|KwaZulu-Natal
LP|Limpopo
MP|Mpumalanga
NW|North West
NC|Northern Cape
WC|Western Cape`,
  KE: `01|Baringo
02|Bomet
03|Bungoma
04|Busia
05|Elgeyo-Marakwet
06|Embu
07|Garissa
08|Homa Bay
09|Isiolo
10|Kajiado
11|Kakamega
12|Kericho
13|Kiambu
14|Kilifi
15|Kirinyaga
16|Kisii
17|Kisumu
18|Kitui
19|Kwale
20|Laikipia
21|Lamu
22|Machakos
23|Makueni
24|Mandera
25|Marsabit
26|Meru
27|Migori
28|Mombasa
29|Murang'a
30|Nairobi
31|Nakuru
32|Nandi
33|Narok
34|Nyamira
35|Nyandarua
36|Nyeri
37|Samburu
38|Siaya
39|Taita-Taveta
40|Tana River
41|Tharaka-Nithi
42|Trans Nzoia
43|Turkana
44|Uasin Gishu
45|Vihiga
46|Wajir
47|West Pokot`,
  NZ: `AUK|Auckland
BOP|Bay of Plenty
CAN|Canterbury
GIS|Gisborne
HKB|Hawke's Bay
MWT|Manawatū-Whanganui
MBH|Marlborough
NSN|Nelson
NTL|Northland
OTA|Otago
STL|Southland
TKI|Taranaki
TAS|Tasman
WKO|Waikato
WGN|Wellington
WTC|West Coast`,
  // Federal subjects as ISO 3166-2:RU lists them. Crimea and Sevastopol are under UA, as ISO has them.
  RU: `AD|Adygea
AL|Altai Republic
BA|Bashkortostan
BU|Buryatia
CE|Chechnya
CU|Chuvashia
DA|Dagestan
IN|Ingushetia
KB|Kabardino-Balkaria
KL|Kalmykia
KC|Karachay-Cherkessia
KR|Karelia
KK|Khakassia
KO|Komi
ME|Mari El
MO|Mordovia
SA|Sakha
SE|North Ossetia-Alania
TA|Tatarstan
TY|Tuva
UD|Udmurtia
ALT|Altai Krai
KAM|Kamchatka Krai
KHA|Khabarovsk Krai
KDA|Krasnodar Krai
KYA|Krasnoyarsk Krai
PER|Perm Krai
PRI|Primorsky Krai
STA|Stavropol Krai
ZAB|Zabaykalsky Krai
AMU|Amur Oblast
ARK|Arkhangelsk Oblast
AST|Astrakhan Oblast
BEL|Belgorod Oblast
BRY|Bryansk Oblast
VLA|Vladimir Oblast
VGG|Volgograd Oblast
VLG|Vologda Oblast
VOR|Voronezh Oblast
IVA|Ivanovo Oblast
IRK|Irkutsk Oblast
KGD|Kaliningrad Oblast
KLU|Kaluga Oblast
KEM|Kemerovo Oblast
KIR|Kirov Oblast
KOS|Kostroma Oblast
KGN|Kurgan Oblast
KRS|Kursk Oblast
LEN|Leningrad Oblast
LIP|Lipetsk Oblast
MAG|Magadan Oblast
MOS|Moscow Oblast
MUR|Murmansk Oblast
NIZ|Nizhny Novgorod Oblast
NGR|Novgorod Oblast
NVS|Novosibirsk Oblast
OMS|Omsk Oblast
ORE|Orenburg Oblast
ORL|Oryol Oblast
PNZ|Penza Oblast
PSK|Pskov Oblast
ROS|Rostov Oblast
RYA|Ryazan Oblast
SAK|Sakhalin Oblast
SAM|Samara Oblast
SAR|Saratov Oblast
SVE|Sverdlovsk Oblast
SMO|Smolensk Oblast
TAM|Tambov Oblast
TVE|Tver Oblast
TOM|Tomsk Oblast
TUL|Tula Oblast
TYU|Tyumen Oblast
ULY|Ulyanovsk Oblast
CHE|Chelyabinsk Oblast
YAR|Yaroslavl Oblast
MOW|Moscow
SPE|Saint Petersburg
YEV|Jewish Autonomous Oblast
CHU|Chukotka
KHM|Khanty-Mansi
NEN|Nenets
YAN|Yamalo-Nenets`,
  UA: `05|Vinnytsia
07|Volyn
09|Luhansk
12|Dnipropetrovsk
14|Donetsk
18|Zhytomyr
21|Zakarpattia
23|Zaporizhzhia
26|Ivano-Frankivsk
30|Kyiv City
32|Kyiv Oblast
35|Kirovohrad
40|Sevastopol
43|Crimea
46|Lviv
48|Mykolaiv
51|Odesa
53|Poltava
56|Rivne
59|Sumy
61|Ternopil
63|Kharkiv
65|Kherson
68|Khmelnytskyi
71|Cherkasy
74|Chernihiv
77|Chernivtsi`,
  PK: `PB|Punjab
SD|Sindh
KP|Khyber Pakhtunkhwa
BA|Balochistan
IS|Islamabad Capital Territory
JK|Azad Jammu and Kashmir
GB|Gilgit-Baltistan`,
  BD: `A|Barishal
B|Chattogram
C|Dhaka
D|Khulna
H|Mymensingh
E|Rajshahi
F|Rangpur
G|Sylhet`,
};

/**
 * The per-country flag `regionMatters`: true where prices inside the country
 * differ enough by region (state or provincial sales tax, duty-free or reduced-tax
 * zones, distance and freight, a big gap between cities and the rest) that Pexi
 * asks Gemini for offers in the user's own region. It feeds `{{REGION_MATTERS_HINT}}`.
 * The first ten are the earlier list, kept as it was; the rest are added in the
 * same spirit. It is a starting judgement, a hint and not a verdict, and it wants
 * Jamin's eye: a country left out is `no`, which tells Gemini nothing either way
 * beyond "not known to".
 */
export const REGION_MATTERS = Object.freeze([
  'CA', 'US', 'AU', 'IN', 'CN', 'BR', 'MX', 'DE', 'RU', 'ID',
  'AR', 'CL', 'CO', 'CH', 'ES', 'FR', 'PT', 'GB', 'MY', 'NG', 'PK',
]);

/**
 * The per-country cross-border flag: the blocs whose member countries can price
 * alike, so a price in one may be worth showing beside a price in another. It
 * feeds `{{CROSS_BORDER_HINT}}`, and only ever between two members that also
 * share a currency, because Pexi never converts one. EU: the 27 member states
 * (Bulgaria joined the euro in 2026). EEA: the three EFTA members of the single
 * market that are not in the EU.
 */
export const CROSS_BORDER_BLOCS = Object.freeze({
  EU: Object.freeze([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  ]),
  EEA: Object.freeze(['IS', 'LI', 'NO']),
});

const ofCode = (code) => String(code ?? '').trim().toUpperCase();

/** The two flags for a country (an ISO code): `{ regionMatters, crossBorderBloc }`. */
export function countryFlags(code) {
  const c = ofCode(code);
  const bloc = Object.keys(CROSS_BORDER_BLOCS).find((b) => CROSS_BORDER_BLOCS[b].includes(c)) ?? null;
  return { regionMatters: REGION_MATTERS.includes(c), crossBorderBloc: bloc };
}
