// Source data for the genre map (Browse by genre), a flow chart of genre lineage. Hand-written by us: genre
// families, their well-established sub-styles and the relationships between
// when each emerged (rough decade) and which genres it grew out of. Only
// well-established lineage is listed; where a link is arguable it is left out.
// It is NOT taken from any third-party map. `node tools/genre-map-layout.js`
// turns this into fixed positions (tools/genre-map.json and the block in index.html).
//
// Line format inside a family:  Name | prominence 1-10 | decade it emerged (1600, 1950...) | came from, comma separated
// (the first line of a family is its root: it heads the lane and has no decade or lineage)
// The first line of a family is its root (the 12 cards on the genre page plus
// Blues, Metal and World). `fm` names the key in FM_GENRES / FM_GENRE_RE that
// the app already uses for that family; styles that are listed under that key
// in the app play exactly the way the genre page plays them.
'use strict';

const FAMILIES = [
  { id: 'hiphop', fm: 'Hip-Hop', hue: 27, sat: 88 },
  { id: 'rnb', fm: 'R&B / Soul', hue: 326, sat: 78 },
  { id: 'funk', fm: 'Funk', hue: 47, sat: 92 },
  { id: 'jazz', fm: 'Jazz', hue: 242, sat: 82 },
  { id: 'blues', fm: null, hue: 272, sat: 62 },
  { id: 'rock', fm: 'Rock', hue: 356, sat: 80 },
  { id: 'metal', fm: null, hue: 222, sat: 14 },
  { id: 'country', fm: 'Country & Folk', hue: 74, sat: 62 },
  { id: 'classical', fm: 'Classical', hue: 210, sat: 70 },
  { id: 'world', fm: null, hue: 30, sat: 22 },
  { id: 'latin', fm: 'Latin', hue: 164, sat: 72 },
  { id: 'afro', fm: 'Afro', hue: 96, sat: 70 },
  { id: 'reggae', fm: 'Reggae', hue: 136, sat: 66 },
  { id: 'electronic', fm: 'Electronic', hue: 188, sat: 82 },
  { id: 'pop', fm: 'Pop', hue: 292, sat: 70 }
];

const LANES = ['blues', 'rnb', 'jazz', 'funk', 'hiphop', 'electronic', 'reggae', 'afro', 'latin', 'pop', 'rock', 'metal', 'country', 'world', 'classical'];

const SRC = {
  hiphop: `
Hip-Hop|10||
Old school hip-hop|6|1970|Classic funk,Classic soul,Disco
East Coast rap|5|1980|Old school hip-hop
West Coast rap|5|1980|Old school hip-hop
Conscious rap|7|1980|Old school hip-hop
UK rap|5|1980|Old school hip-hop
Boom bap|8|1980|East Coast rap
Gangsta rap|6|1980|West Coast rap
G-funk|5|1990|Gangsta rap,P-Funk
Southern rap|7|1990|Old school hip-hop
Underground rap|6|1990|Boom bap
Alternative hip-hop|5|1990|Boom bap
Jazz rap|5|1990|Boom bap
Crunk|4|2000|Southern rap
Trap|9|2000|Southern rap
Grime|6|2000|UK garage,Dancehall
Drill|7|2010|Trap
Melodic rap|5|2010|Trap
Cloud rap|4|2010|
Mumble rap|3|2010|Trap
Phonk|3|2010|Southern rap|memphis phonk
Hyphy|3|2000|West Coast rap|bay area rap
Chopped and screwed|3|1990|Southern rap|screw;houston rap
Memphis rap|3|1990|Southern rap
Miami bass|4|1980|Electro,Old school hip-hop|booty bass
Bounce|3|1990||new orleans bounce
Horrorcore|3|1990|Gangsta rap
Hardcore hip-hop|4|1990|East Coast rap|hardcore rap
Political hip-hop|3|1980|Conscious rap
Turntablism|3|1990|Old school hip-hop|djing;scratching
Instrumental hip-hop|3|1990|Boom bap|beats;beat tape
Abstract hip-hop|3|1990|Alternative hip-hop|experimental hip-hop
Pop rap|4|1980|Old school hip-hop
Rap rock|3|1980|Old school hip-hop,Hard rock
Rap metal|3|1990|Rap rock,Heavy metal
Trap soul|3|2010|Trap,Contemporary R&B
Emo rap|3|2010|Trap,Emo|sad rap
Hip house|3|1980|House,Old school hip-hop
Snap music|3|2000|Crunk
UK drill|4|2010|Drill,Grime
Latin hip-hop|3|1990|Old school hip-hop|rap en espanol
French hip-hop|3|1990|Old school hip-hop|french rap;rap francais
Korean hip-hop|3|1990|Old school hip-hop,K-pop|k-hiphop
Afro trap|3|2010|Trap,Afrobeats
Desi hip-hop|3|2000|Bhangra,Old school hip-hop|indian hip-hop;gully rap
`,
  rnb: `
R&B / Soul|10||
Gospel|6|1930|
Rhythm and blues|4|1940|Blues,Swing
Doo-wop|4|1950|Rhythm and blues
Classic soul|8|1950|Gospel,Rhythm and blues
Motown|6|1960|Doo-wop,Rhythm and blues
Southern soul|5|1960|Gospel,Rhythm and blues
Gospel soul|5|1960|Gospel,Classic soul
Northern soul|4|1970|Motown
Philly soul|5|1970|Classic soul
Quiet storm|6|1970|Classic soul
Disco|7|1970|Classic funk,Philly soul
Slow jams|4|1980|Quiet storm
New jack swing|5|1980|Old school hip-hop
Contemporary R&B|9|1980|Quiet storm,New jack swing
Neo-soul|8|1990|Classic soul,Contemporary R&B
Contemporary gospel|4|1990|Gospel,Contemporary R&B
Alternative R&B|6|2010|Contemporary R&B
Soul blues|3|1960|Southern soul,Electric blues
Psychedelic soul|4|1960|Classic soul,Psychedelic rock
Chicago soul|3|1960|Classic soul
Blue-eyed soul|3|1960|Classic soul
Hip-hop soul|3|1990|Contemporary R&B,Old school hip-hop
Retro soul|3|2000|Classic soul,Neo-soul|vintage soul
Brit soul|3|2000|Neo-soul
Urban gospel|3|1990|Contemporary gospel
Italo disco|3|1980|Disco|italo
Eurodisco|3|1970|Disco
Hi-NRG|3|1980|Disco|high energy
Post-disco|3|1980|Disco,Boogie
`,
  funk: `
Funk|10||
Classic funk|8|1960|Classic soul
P-Funk|6|1970|Classic funk
Funk rock|5|1970|Classic funk,Classic rock
Jazz-funk|5|1970|Classic funk,Soul jazz
Boogie|4|1980|Disco,Classic funk
Acid jazz|5|1980|Jazz-funk,Soul jazz
Nu-funk|5|2000|Classic funk
Go-go|3|1970|Classic funk
Funk metal|3|1980|Funk rock,Heavy metal
Electro-funk|3|1980|Classic funk,Electro
Psychedelic funk|3|1970|Classic funk,Psychedelic rock
Deep funk|3|1990|Classic funk
Minneapolis sound|3|1980|Classic funk,New wave|prince
Afro-funk|3|1970|Afrobeat,Classic funk|afrofunk
Nu disco|3|2000|Disco,House
`,
  jazz: `
Jazz|10||
Dixieland|4|1910|Blues,Ragtime
Swing|7|1930|Dixieland
Big band|5|1930|Swing
Vocal jazz|5|1930|Swing
Bebop|8|1940|Swing
Latin jazz|5|1940|Bebop,Son cubano
Cool jazz|6|1950|Bebop
Hard bop|6|1950|Bebop
Modern jazz|7|1950|
Soul jazz|6|1950|Hard bop
Free jazz|5|1960|Bebop
Post-bop|4|1960|Hard bop,Cool jazz
Spiritual jazz|6|1960|Free jazz,Post-bop
Jazz fusion|7|1970|Post-bop,Classic funk
Smooth jazz|6|1980|Jazz fusion
Nu jazz|4|1990|Acid jazz
Ragtime|4|1900||
Stride|3|1920|Ragtime|stride piano
Chicago jazz|3|1920|Dixieland
Kansas City jazz|3|1930|Swing,Blues
Gypsy jazz|4|1930|Swing|jazz manouche;django
Boogie-woogie|4|1930|Blues|boogie woogie
West Coast jazz|3|1950|Cool jazz
Modal jazz|4|1950|Cool jazz,Hard bop|kind of blue
Third stream|3|1950|Cool jazz,Contemporary classical
Avant-garde jazz|3|1960|Free jazz|avant garde jazz
Ethio-jazz|4|1960|Latin jazz|ethiopian jazz;ethiopiques;mulatu astatke;ethio jazz;ethiopian music
Afro-jazz|3|1960||african jazz
Cape jazz|3|1970||south african jazz;township jazz;abdullah ibrahim
Jazz-rock|3|1970|Jazz fusion,Progressive rock
Contemporary jazz|3|1980|Smooth jazz,Jazz fusion
Swing revival|3|1990|Swing|neo-swing
Electro swing|3|2000|Swing,House
`,
  blues: `
Blues|10||
Delta blues|5|1920|Blues
Chicago blues|5|1940|Delta blues
Electric blues|5|1940|Delta blues
Memphis blues|3|1910|Blues
Classic female blues|3|1920|Blues|vaudeville blues
Country blues|3|1920|Blues|acoustic blues
Piedmont blues|3|1920|Country blues
Jump blues|4|1940|Swing,Boogie-woogie
West Coast blues|3|1940|Jump blues
Texas blues|3|1950|Electric blues
Swamp blues|3|1950|Electric blues|louisiana blues
Hill country blues|3|1950|Delta blues|north mississippi blues
British blues|4|1960|Chicago blues|uk blues
`,
  rock: `
Rock|10||
Rock and roll|6|1950|Rhythm and blues,Country
Rockabilly|4|1950|Country,Rhythm and blues
Folk rock|5|1960|Folk,Rock and roll
Garage rock|4|1960|Rock and roll
Classic rock|8|1960|Rock and roll
Blues rock|6|1960|Electric blues,Rock and roll
Psychedelic rock|6|1960|Garage rock,Folk rock
Hard rock|7|1960|Blues rock
Progressive rock|5|1970|Psychedelic rock
Glam rock|4|1970|Rock and roll
Southern rock|4|1970|Blues rock,Country rock
Soft rock|4|1970|Folk rock
Punk|7|1970|Garage rock
Post-punk|5|1970|Punk
New wave|5|1970|Punk
Hardcore punk|4|1980|Punk
Alternative|7|1980|Post-punk
Shoegaze|4|1980|Post-punk,Psychedelic rock
Dream pop|4|1980|Post-punk
Grunge|6|1990|Hardcore punk,Heavy metal
Emo|4|1990|Hardcore punk
Indie rock|7|1990|Post-punk
Pop punk|5|1990|Punk,Pop rock
Britpop|4|1990|Indie rock
Post-rock|4|1990|
Surf rock|3|1960|Rock and roll
Garage rock revival|3|2000|Garage rock,Post-punk
Art rock|3|1970|Progressive rock
Krautrock|4|1970|Psychedelic rock|kosmische
Space rock|3|1970|Psychedelic rock
Pub rock|3|1970|Rock and roll
Arena rock|3|1970|Hard rock,Progressive rock|aor
Yacht rock|3|1970|Soft rock
Noise rock|3|1980|Post-punk
Gothic rock|3|1980|Post-punk|goth rock;goth
Neo-psychedelia|3|1980|Psychedelic rock,Post-punk
Oi!|3|1980|Punk|street punk
Anarcho-punk|3|1980|Punk
Post-punk revival|3|2000|Post-punk
Stoner rock|3|1990|Doom metal,Psychedelic rock|desert rock
Math rock|3|1990|Progressive rock
Post-hardcore|3|1990|Hardcore punk
Midwest emo|3|1990|Emo
Screamo|3|1990|Emo,Hardcore punk
Skate punk|3|1990|Hardcore punk
Riot grrrl|3|1990|Punk
Slowcore|3|1990|Indie rock|sadcore
Ska punk|3|1980|Ska,Punk
`,
  metal: `
Metal|10||
Heavy metal|8|1970|Hard rock,Blues rock
Doom metal|4|1980|Heavy metal
Thrash metal|6|1980|Heavy metal,Hardcore punk
Death metal|5|1980|Thrash metal
Black metal|4|1980|Thrash metal
Metalcore|4|1990|Hardcore punk,Thrash metal
Nu metal|5|1990|Heavy metal,Funk rock
Power metal|4|1980|Heavy metal
Progressive metal|4|1980|Heavy metal,Progressive rock|prog metal
Speed metal|3|1980|Heavy metal
New wave of British heavy metal|3|1970|Heavy metal|nwobhm
Glam metal|3|1980|Heavy metal,Glam rock|hair metal
Grindcore|3|1980|Hardcore punk,Death metal
Crossover thrash|3|1980|Thrash metal,Hardcore punk
Groove metal|3|1990|Thrash metal
Industrial metal|3|1990|Heavy metal
Gothic metal|3|1990|Doom metal
Symphonic metal|3|1990|Power metal,Gothic metal
Folk metal|3|1990|Heavy metal,Folk
Sludge metal|3|1990|Doom metal,Hardcore punk
Drone metal|3|1990|Doom metal
Melodic death metal|3|1990|Death metal
Technical death metal|3|1990|Death metal|tech death
Alternative metal|3|1990|Heavy metal,Grunge
Deathcore|3|2000|Death metal,Metalcore
Djent|3|2000|Progressive metal
Post-metal|3|2000|Doom metal,Post-rock
`,
  pop: `
Pop|10||
Pop rock|6|1960|Rock and roll
Singer-songwriter|7|1960|Folk
Adult contemporary|4|1970|Soft rock
City pop|4|1970|Disco,Soft rock
Synth-pop|7|1980|New wave
Dance pop|7|1980|Disco,Synth-pop
Indie pop|7|1980|Post-punk
Afropop|5|1980|Highlife,Soukous
K-pop|7|1990|Dance pop,Contemporary R&B
J-pop|5|1990|City pop
Teen pop|4|1990|
Electropop|6|2000|Synth-pop
Bedroom pop|4|2010|Indie pop
Art pop|4|2010|
Baroque pop|3|1960|Pop rock
Bubblegum pop|3|1960|Pop rock
Girl group|3|1960|Doo-wop,Motown|girl groups
Folk pop|3|1960|Folk rock
Power pop|3|1970|Pop rock
Europop|3|1980|Disco,Synth-pop
Jangle pop|3|1980|Folk rock,Post-punk
Twee pop|3|1980|Indie pop
Sophisti-pop|3|1980|Synth-pop
Mandopop|3|1980||chinese pop;c-pop
Cantopop|3|1970||hong kong pop
Chamber pop|3|1990|Baroque pop
Boy band|3|1990|New jack swing,Teen pop
Hyperpop|3|2010|Electropop
`,
  reggae: `
Reggae|10||
Ska|5|1950|Rhythm and blues,Mento
Rocksteady|4|1960|Ska
Roots reggae|8|1970|Rocksteady
Dub|6|1970|Roots reggae
Lovers rock|4|1970|Roots reggae,Classic soul
Soca|5|1970|
Dancehall|8|1980|Roots reggae,Dub
Reggae fusion|5|1990|Dancehall
Mento|3|1950||jamaican folk;mento music
Skinhead reggae|3|1960|Rocksteady|suedehead
Dub poetry|3|1970|Dub
Two-tone|3|1970|Ska,Punk|2 tone
Reggae en español|3|1980|Roots reggae|spanish reggae
Ragga|3|1980|Dancehall|raggamuffin
Digital dancehall|3|1980|Dancehall|ragga dancehall
Third-wave ska|3|1990|Two-tone|ska third wave
Zouk|3|1980||french caribbean
`,
  afro: `
Afro|10||
Highlife|6|1920|
Afrobeat|6|1970|Highlife,Classic funk,Jazz-funk
Soukous|4|1960|Rumba congolaise
Afro-soul|4|2000|Neo-soul
Bongo flava|4|1990|Old school hip-hop,Contemporary R&B
Afrobeats|9|2000|Highlife,Afrobeat,Dancehall,Contemporary R&B
Gqom|4|2010|House
Amapiano|8|2010|Deep house
Afro-fusion|5|2010|Afrobeats
Afroswing|4|2010|Afrobeats,Dancehall,UK rap
Palm-wine music|3|1920||palm wine
Juju|3|1930||juju music
Rumba congolaise|4|1940|Son cubano|congolese rumba
Mbaqanga|3|1960||township jive
Fuji|3|1960||fuji music
Makossa|3|1960|Highlife,Rumba congolaise
Benga|3|1960||kenyan benga
Mbalax|3|1970|Son cubano|senegalese music
Desert blues|3|1970|Blues|tuareg blues;tinariwen;assouf
Chimurenga|3|1970|Mbira music|thomas mapfumo
Ndombolo|3|1990|Soukous
Kwaito|4|1990|House,Mbaqanga
Hiplife|3|1990|Highlife,Old school hip-hop
Kuduro|3|1990||angolan dance music
Azonto|3|2010|Hiplife
Mbira music|3|1800||zimbabwean mbira;shona music
Taarab|4|1900||swahili music
Semba|3|1950||angolan music
Coupé-décalé|3|2000||coupe decale;ivorian dance
`,
  latin: `
Latin|10||
Mariachi|4|1800|
Tango|4|1900|
Merengue|4|1800|
Son cubano|4|1910|
Samba|6|1910|
Sertanejo|4|1920|
Bolero|4|1930|
Cumbia|6|1940|
Norteño|4|1900|
Bossa nova|6|1950|Samba,Cool jazz
Salsa|7|1960|Son cubano,Latin jazz
Bachata|7|1960|Bolero
MPB|5|1960|Bossa nova,Samba
Latin pop|7|1980|Bolero
Baile funk|4|1990|Southern rap
Reggaeton|9|1990|Dancehall,Old school hip-hop
Latin trap|4|2010|Trap,Reggaeton
Corridos tumbados|4|2010|Norteño,Trap
Habanera|3|1800|
Danzón|3|1800|Habanera
Choro|4|1800||chorinho
Corrido|3|1900|
Andean folk|3|1900||huayno;musica andina;andean music
Banda|3|1900|
Ranchera|4|1900||mexican folk
Son montuno|3|1930|Son cubano
Mambo|3|1940|Danzón,Son cubano
Forró|3|1940||forro
Baião|3|1940||baiao
Vallenato|4|1940|
Cha-cha-chá|3|1950|Mambo|cha cha cha
Latin ballad|3|1950|Bolero|balada
Nuevo tango|3|1950|Tango,Modern jazz|piazzolla
Tropicália|4|1960|Bossa nova,Psychedelic rock|tropicalia;tropicalismo
Boogaloo|3|1960|Mambo,Classic soul|latin boogaloo
Chicha|3|1960|Cumbia,Psychedelic rock|psychedelic cumbia
Tejano|4|1960|Norteño,Country|tex-mex
Samba rock|3|1960|Samba,Classic soul
Nueva canción|3|1960|Folk|nueva cancion
Pagode|3|1970|Samba
Nueva trova|3|1970|Nueva canción
Rock en español|3|1980|Rock and roll,New wave|latin rock
Salsa romántica|3|1980|Salsa,Latin ballad|salsa romantica
Dembow|3|1990|Dancehall
Cumbia villera|3|1990|Cumbia
Timba|3|1990|Salsa
Neoperreo|3|2010|Reggaeton|perreo
`,
  classical: `
Classical|10||
Opera|6|1600|
Choral|4|1500|
Baroque|6|1600|
Chamber|5|1700|Baroque
Orchestral|7|1700|Baroque
Symphony|5|1750|Baroque
Piano|6|1800|
Romantic era|5|1800|Symphony
Film score|6|1930|Romantic era
Contemporary classical|4|1950|
Minimalism|4|1960|Contemporary classical
Neoclassical|5|2000|Minimalism
Gregorian chant|3|1000||plainchant;plainsong
Medieval music|3|1000|Gregorian chant
Renaissance music|3|1400|Medieval music
Early music|3|1400|Medieval music
Concerto|3|1700|Baroque
String quartet|3|1700|Chamber
Sonata|3|1700|Baroque
Classical era|4|1750|Baroque|mozart;haydn;viennese classicism
Art song|3|1800||lieder;lied
Operetta|3|1850|Opera
Impressionism|3|1900|Romantic era|debussy;ravel
Musical theatre|3|1900|Operetta|musicals;broadway
Serialism|3|1920|Romantic era|twelve-tone
Neoclassicism|3|1920|Classical era|stravinsky
Electroacoustic|3|1950|Contemporary classical|tape music
Spectral music|3|1970|Contemporary classical
Video game music|3|1980|Film score|game soundtrack;vgm
`,
  country: `
Country & Folk|10||
Folk|7|1900|
Country|9|1920|Folk,Blues
Bluegrass|5|1940|Folk
Honky-tonk|4|1940|Country
Country rock|5|1960|Country,Folk rock
Outlaw country|4|1970|Honky-tonk
Country pop|5|1970|Country,Pop rock
Americana|6|1990|Country,Folk
Alt-country|4|1990|Country rock,Outlaw country
Indie folk|6|2000|Folk,Indie rock
Appalachian folk|4|1900|Folk|mountain music
Old-time|3|1900|Folk|old time music
Cajun|3|1930||cajun music
Western swing|3|1930|Swing,Country
Zydeco|3|1950|Cajun,Rhythm and blues
Nashville sound|3|1950|Country,Honky-tonk
Bakersfield sound|3|1950|Honky-tonk
Folk revival|3|1950|Folk
Countrypolitan|3|1960|Nashville sound
Celtic folk|4|1960|Folk|irish folk;celtic music
Psychedelic folk|3|1960|Folk,Psychedelic rock
Contemporary folk|3|1960|Folk
Newgrass|3|1970|Bluegrass|progressive bluegrass
Red dirt|3|1970|Outlaw country
Neo-traditional country|3|1980|Honky-tonk|new traditionalist
Cowpunk|3|1980|Country,Punk
Anti-folk|3|1980|Folk,Punk
Freak folk|3|2000|Psychedelic folk|new weird america
Bro-country|3|2010|Country pop
`,
  world: `
World|10||
Indian classical|4|1600|
Flamenco|4|1800|
Bollywood|6|1930|Indian classical
Arabic pop|4|1970|
Bhangra|4|1980|
Hindustani classical|3|1600|Indian classical|hindustani
Carnatic music|3|1600|Indian classical|south indian classical
Persian classical|3|1700||iranian classical;dastgah
Gamelan|3|1500||indonesian gamelan
Sufi music|3|1200||sufi
Qawwali|4|1200|Sufi music|nusrat fateh ali khan
Bhajan|3|1500||devotional
Ghazal|3|1800|Hindustani classical
Tarab|3|1800||arabic classical
Gnawa|3|1800||morocco trance
Klezmer|3|1800||yiddish music
Balkan brass|3|1800||brass band;gypsy brass
Polka|3|1800|
Hawaiian music|3|1800||slack key;hula
Fado|4|1800||portuguese fado
Chanson|4|1900||french chanson
Raï|3|1920||rai;algerian pop
Enka|3|1950|
Anatolian rock|3|1960|Psychedelic rock|turkish psychedelic;anadolu rock
Indian pop|3|1990|Bollywood|indipop
Arabic hip-hop|3|2000|Arabic pop,Old school hip-hop
`,
  electronic: `
Electronic|10||
Ambient|7|1970|
Electro|4|1980|Classic funk
House|9|1980|Disco
Acid house|4|1980|House
Techno|8|1980|Electro,House
Deep house|8|1980|House
Breakbeat|4|1980|Old school hip-hop
Synthwave|5|2000|Synth-pop
Trance|7|1990|Techno
Jungle|5|1990|Breakbeat,Dancehall
Drum and bass|8|1990|Jungle
UK garage|5|1990|House,Jungle
Trip hop|5|1990|Dub,Boom bap
Downtempo|6|1990|Ambient,Trip hop
IDM|4|1990|Techno,Ambient
Minimal techno|4|1990|Techno
Progressive house|5|1990|House
Tech house|5|1990|House,Techno
Afro-house|8|2000|Deep house
Dubstep|7|2000|UK garage,Dub
Hardstyle|4|2000|Trance
Future bass|5|2010|Dubstep
EDM|6|2010|House,Trance
Lo-fi beats|6|2010|Jazz rap
Musique concrète|3|1940||musique concrete;tape music
Industrial|3|1970||industrial music;throbbing gristle
New age|4|1970|Ambient|new age music
Chicago house|4|1980|House|jack house
Garage house|3|1980|House,Disco|nyc garage;paradise garage
Detroit techno|4|1980|Electro
Ambient house|3|1980|Ambient,House
EBM|3|1980|Industrial,Synth-pop|electronic body music
Darkwave|3|1980|Post-punk,Synth-pop|dark wave
Chiptune|3|1980||8-bit;chip music
Eurobeat|3|1980|Hi-NRG,Italo disco
Eurodance|4|1990|House,Hi-NRG|euro dance
Ghetto house|3|1990|Chicago house
Breakbeat hardcore|3|1990|Breakbeat,Acid house|rave;hardcore rave
Happy hardcore|3|1990|Breakbeat hardcore
Gabber|3|1990|Techno|hardcore techno
Big beat|4|1990|Breakbeat,Acid house
Goa trance|3|1990|Trance
Psytrance|3|1990|Goa trance|psychedelic trance
Hard trance|3|1990|Trance
Hard techno|3|1990|Techno
Acid techno|3|1990|Acid house,Techno
Dub techno|3|1990|Techno,Dub
Ambient techno|3|1990|Ambient,Techno
Dark ambient|3|1990|Ambient
Chillout|3|1990|Ambient house|chill out
Lounge|3|1990|Downtempo|lounge music
Glitch|3|1990|IDM
2-step garage|3|1990|UK garage|2 step;two step
Speed garage|3|1990|Garage house
Techstep|3|1990|Drum and bass
Breakcore|3|1990|Breakbeat hardcore
Juke|3|2000|Ghetto house|chicago juke
Footwork|3|2000|Juke
Microhouse|3|2000|Minimal techno,House
Electro house|3|2000|Electro,House
Electroclash|3|2000|Electro,New wave
Moombahton|3|2000|Reggaeton,House
Brostep|3|2000|Dubstep
Future garage|3|2000|UK garage,Dubstep
Bassline|3|2000|UK garage|bassline house
Liquid funk|3|2000|Drum and bass|liquid drum and bass
Neurofunk|3|2000|Drum and bass
Jump-up|3|2000|Drum and bass
Chillwave|3|2000|Synth-pop|glo-fi
Industrial techno|3|2000|Techno,Industrial
Melodic techno|3|2010|Techno,Trance
Vaporwave|3|2010|Chillwave
Lo-fi house|3|2010|House,Lo-fi beats
Riddim|3|2010|Dubstep
Drumstep|3|2010|Drum and bass,Dubstep
Big room|3|2010|Electro house|big room house
Future house|3|2010|Deep house
Tropical house|3|2010|Deep house
Bass house|3|2010|House
Trap EDM|3|2010|Trap,Dubstep
`
};

module.exports = { FAMILIES, LANES, SRC };
