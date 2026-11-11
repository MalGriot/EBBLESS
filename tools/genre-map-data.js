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
`,
  jazz: `
Jazz|10||
Dixieland|4|1910|Blues
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
`,
  blues: `
Blues|10||
Delta blues|5|1920|Blues
Chicago blues|5|1940|Delta blues
Electric blues|5|1940|Delta blues
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
`,
  reggae: `
Reggae|10||
Ska|5|1950|Rhythm and blues
Rocksteady|4|1960|Ska
Roots reggae|8|1970|Rocksteady
Dub|6|1970|Roots reggae
Lovers rock|4|1970|Roots reggae,Classic soul
Soca|5|1970|
Dancehall|8|1980|Roots reggae,Dub
Reggae fusion|5|1990|Dancehall
`,
  afro: `
Afro|10||
Highlife|6|1920|
Afrobeat|6|1970|Highlife,Classic funk,Jazz-funk
Soukous|4|1960|Son cubano
Afro-soul|4|2000|Neo-soul
Bongo flava|4|1990|Old school hip-hop,Contemporary R&B
Afrobeats|9|2000|Highlife,Afrobeat,Dancehall,Contemporary R&B
Gqom|4|2010|House
Amapiano|8|2010|Deep house
Afro-fusion|5|2010|Afrobeats
Afroswing|4|2010|Afrobeats,Dancehall,UK rap
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
`,
  world: `
World|10||
Indian classical|4|1600|
Flamenco|4|1800|
Bollywood|6|1930|Indian classical
Arabic pop|4|1970|
Bhangra|4|1980|
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
`
};

module.exports = { FAMILIES, LANES, SRC };
