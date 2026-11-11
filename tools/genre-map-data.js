// Source data for the genre map (Browse by genre). Hand-written by us: genre
// families, their well-established sub-styles and the relationships between
// them (a style that grew out of, or is commonly filed beside, another). It is
// NOT taken from any third-party map. `node tools/genre-map-layout.js` turns
// this into fixed positions (tools/genre-map.json and the block in index.html).
//
// Line format inside a family:  Name | prominence 1-10 | neighbors, comma separated
// The first line of a family is its root (the 12 cards on the genre page plus
// Blues, Metal and World). `fm` names the key in FM_GENRES / FM_GENRE_RE that
// the app already uses for that family; styles that are listed under that key
// in the app play exactly the way the genre page plays them.
'use strict';

const FAMILIES = [
  { id: 'hiphop', fm: 'Hip-Hop', hue: 27, sat: 88, at: [560, 175] },
  { id: 'rnb', fm: 'R&B / Soul', hue: 326, sat: 78, at: [930, 175] },
  { id: 'funk', fm: 'Funk', hue: 47, sat: 92, at: [1300, 175] },
  { id: 'jazz', fm: 'Jazz', hue: 242, sat: 82, at: [1670, 175] },
  { id: 'blues', fm: null, hue: 272, sat: 62, at: [1670, 525] },
  { id: 'rock', fm: 'Rock', hue: 356, sat: 80, at: [1300, 525] },
  { id: 'metal', fm: null, hue: 222, sat: 14, at: [1670, 875] },
  { id: 'country', fm: 'Country & Folk', hue: 74, sat: 62, at: [1300, 875] },
  { id: 'classical', fm: 'Classical', hue: 210, sat: 70, at: [930, 875] },
  { id: 'world', fm: null, hue: 30, sat: 22, at: [560, 875] },
  { id: 'latin', fm: 'Latin', hue: 164, sat: 72, at: [190, 875] },
  { id: 'afro', fm: 'Afro', hue: 96, sat: 70, at: [560, 525] },
  { id: 'reggae', fm: 'Reggae', hue: 136, sat: 66, at: [190, 525] },
  { id: 'electronic', fm: 'Electronic', hue: 188, sat: 82, at: [190, 175] },
  { id: 'pop', fm: 'Pop', hue: 292, sat: 70, at: [930, 525] }
];

// families that sit beside each other on the map
const FAMILY_LINKS = [
  ['hiphop', 'rnb'], ['rnb', 'funk'], ['funk', 'jazz'], ['jazz', 'blues'], ['blues', 'rock'], ['rock', 'metal'],
  ['rock', 'pop'], ['pop', 'electronic'], ['pop', 'rnb'], ['electronic', 'hiphop'], ['reggae', 'hiphop'],
  ['reggae', 'afro'], ['afro', 'funk'], ['afro', 'latin'], ['latin', 'pop'], ['jazz', 'classical'],
  ['classical', 'world'], ['world', 'latin'], ['country', 'blues'], ['country', 'rock'], ['afro', 'jazz'],
  ['world', 'afro'], ['electronic', 'reggae'], ['electronic', 'afro']
];

const SRC = {
  hiphop: `
Hip-Hop|10|
Boom bap|8|Conscious rap,Underground rap,Old school hip-hop,East Coast rap
Trap|9|Southern rap,Drill,Melodic rap
Conscious rap|7|Boom bap,Underground rap,Jazz rap
Drill|7|Trap,Grime,UK rap
Underground rap|6|Boom bap,Alternative hip-hop
Southern rap|7|Trap,Crunk
Old school hip-hop|6|East Coast rap,Boom bap,Funk
Gangsta rap|6|West Coast rap,G-funk,East Coast rap
G-funk|5|West Coast rap,P-Funk,Gangsta rap
East Coast rap|5|Boom bap,Gangsta rap
West Coast rap|5|G-funk,Gangsta rap
Jazz rap|5|Boom bap,Neo-soul,Conscious rap,Modern jazz
Cloud rap|4|Trap
Melodic rap|5|Trap,Contemporary R&B
Grime|6|Drill,UK garage,Dancehall,UK rap
UK rap|5|Grime,Drill,Afroswing
Crunk|4|Southern rap,Trap
Alternative hip-hop|5|Underground rap,Trip hop,Jazz rap
`,
  rnb: `
R&B / Soul|10|
Neo-soul|8|Contemporary R&B,Soul jazz,Alternative R&B,Jazz rap,Afro-soul
Classic soul|8|Motown,Southern soul,Philly soul
Contemporary R&B|9|Alternative R&B,New jack swing,Quiet storm,Dance pop
Quiet storm|6|Slow jams,Smooth jazz,Contemporary R&B
Gospel soul|5|Gospel,Classic soul,Southern soul
Motown|6|Classic soul,Northern soul,Doo-wop
Southern soul|5|Classic soul,Blues
Philly soul|5|Classic soul,Disco
Northern soul|4|Motown,Classic soul
New jack swing|5|Contemporary R&B,Hip-Hop,Funk
Alternative R&B|6|Neo-soul,Contemporary R&B,Trip hop
Disco|7|Funk,Philly soul,House,Dance pop,Boogie
Doo-wop|4|Motown,Rhythm and blues,Rock and roll
Rhythm and blues|4|Blues,Doo-wop,Rock and roll
Slow jams|4|Quiet storm,Contemporary R&B
Gospel|6|Gospel soul,Contemporary gospel
Contemporary gospel|4|Gospel,Contemporary R&B
`,
  funk: `
Funk|10|
Classic funk|8|P-Funk,Funk rock,Soul jazz,Classic soul
P-Funk|6|Classic funk,G-funk,Funk rock
Funk rock|5|Classic funk,Nu-funk,Hard rock
Nu-funk|5|Classic funk,Funk rock,Acid jazz
Jazz-funk|5|Soul jazz,Jazz fusion,Classic funk,Acid jazz
Boogie|4|Disco,Classic funk
Acid jazz|5|Jazz-funk,Soul jazz,Nu jazz,Nu-funk
`,
  electronic: `
Electronic|10|
Afro-house|8|House,Deep house,Amapiano,Gqom
Deep house|8|House,Afro-house,Downtempo
Techno|8|Minimal techno,Acid house
Drum and bass|8|Jungle,Breakbeat,Dubstep
Ambient|7|Downtempo,Minimalism,Neoclassical
Downtempo|6|Ambient,Trip hop,Lo-fi beats,Deep house
House|9|Deep house,Tech house,Progressive house,Acid house,Disco
Tech house|5|House,Techno,Minimal techno
Progressive house|5|House,Trance
Trance|7|Progressive house
Dubstep|7|Drum and bass,Dub,Future bass,UK garage
Electro|4|Techno,Breakbeat
Synthwave|5|Synth-pop
IDM|4|Ambient,Breakbeat,Techno
Breakbeat|4|Jungle,Drum and bass,Electro
Jungle|5|Drum and bass,Breakbeat,Dancehall
UK garage|5|Grime,House,Dubstep
Minimal techno|4|Techno,Tech house
Acid house|4|House,Techno
Hardstyle|4|Trance,EDM
Future bass|5|Dubstep,EDM,Electropop
Lo-fi beats|6|Downtempo,Boom bap,Jazz rap
EDM|6|House,Trance,Dance pop,Future bass
Trip hop|5|Downtempo,Alternative hip-hop,Alternative R&B,Dub
`,
  jazz: `
Jazz|10|
Bebop|8|Hard bop,Cool jazz,Swing,Post-bop
Soul jazz|6|Hard bop,Neo-soul,Jazz-funk,Classic funk
Modern jazz|7|Post-bop,Jazz fusion,Free jazz
Jazz fusion|7|Jazz-funk,Modern jazz,Funk rock,Progressive rock
Spiritual jazz|6|Free jazz,Modern jazz
Swing|7|Big band,Bebop,Vocal jazz,Dixieland
Big band|5|Swing,Vocal jazz
Dixieland|4|Swing,Blues
Cool jazz|6|Bebop,Bossa nova,Hard bop,Smooth jazz
Hard bop|6|Bebop,Soul jazz,Post-bop,Cool jazz
Free jazz|5|Spiritual jazz,Modern jazz
Latin jazz|5|Salsa,Bossa nova,Bebop
Smooth jazz|6|Cool jazz,Quiet storm,Jazz-funk
Vocal jazz|5|Swing,Big band,Cool jazz
Nu jazz|4|Acid jazz,Downtempo,Modern jazz
Post-bop|4|Modern jazz,Hard bop,Bebop
`,
  blues: `
Blues|10|
Delta blues|5|Blues
Chicago blues|5|Electric blues,Delta blues
Electric blues|5|Chicago blues,Blues rock
`,
  rock: `
Rock|10|
Classic rock|8|Hard rock,Blues rock,Rock and roll,Psychedelic rock
Indie rock|7|Alternative,Post-punk,Garage rock,Indie pop
Alternative|7|Indie rock,Grunge,Britpop,Emo
Punk|7|Hardcore punk,Pop punk,Garage rock,Post-punk
Blues rock|6|Electric blues,Classic rock,Southern rock
Hard rock|7|Classic rock,Heavy metal,Glam rock
Progressive rock|5|Psychedelic rock,Jazz fusion
Psychedelic rock|6|Classic rock,Progressive rock,Garage rock
Garage rock|4|Punk,Indie rock
Grunge|6|Alternative,Hard rock,Punk
Post-punk|5|Punk,New wave,Indie rock,Shoegaze
Shoegaze|4|Dream pop,Post-punk,Alternative
Britpop|4|Alternative,Indie rock,Pop rock
Folk rock|5|Folk,Classic rock,Country rock
Soft rock|4|Pop rock,Classic rock,Singer-songwriter
Glam rock|4|Hard rock,Classic rock
Rockabilly|4|Rock and roll,Country
New wave|5|Post-punk,Synth-pop,Punk
Emo|4|Pop punk,Alternative
Pop punk|5|Punk,Emo,Pop rock
Hardcore punk|4|Punk,Metalcore
Southern rock|4|Blues rock,Country rock
Post-rock|4|Ambient,Indie rock
Rock and roll|6|Rockabilly,Rhythm and blues,Classic rock,Doo-wop
Dream pop|4|Shoegaze,Indie pop
`,
  metal: `
Metal|10|
Heavy metal|8|Hard rock,Thrash metal
Thrash metal|6|Heavy metal,Hardcore punk,Death metal
Death metal|5|Thrash metal,Black metal
Black metal|4|Death metal,Doom metal
Doom metal|4|Heavy metal,Black metal
Metalcore|4|Hardcore punk,Death metal
Nu metal|5|Hip-Hop
`,
  pop: `
Pop|10|
Indie pop|7|Dream pop,Indie rock,Bedroom pop,Synth-pop
Synth-pop|7|New wave,Electropop,Synthwave
Dance pop|7|Electropop,Disco,EDM,Contemporary R&B
Singer-songwriter|7|Soft rock,Folk,Indie folk
Electropop|6|Synth-pop,Dance pop
Teen pop|4|Dance pop,Pop rock
K-pop|7|Dance pop,Contemporary R&B,Hip-Hop
J-pop|5|K-pop,City pop
Art pop|4|Indie pop,Electropop
Bedroom pop|4|Indie pop,Lo-fi beats
Pop rock|6|Soft rock,Britpop
Adult contemporary|4|Soft rock,Quiet storm
City pop|4|Disco,Boogie,Soft rock,J-pop
Afropop|5|Afrobeats,Dance pop
`,
  reggae: `
Reggae|10|
Roots reggae|8|Dub,Rocksteady,Lovers rock
Dancehall|8|Reggae fusion,Afroswing,Dub
Dub|6|Roots reggae,Dubstep,Trip hop
Reggae fusion|5|Dancehall,Hip-Hop
Ska|5|Rocksteady
Rocksteady|4|Ska,Roots reggae
Lovers rock|4|Roots reggae,Contemporary R&B
Soca|5|Dancehall
`,
  afro: `
Afro|10|
Afrobeats|9|Afro-fusion,Afropop,Dancehall,Afroswing
Amapiano|8|Afro-house,Gqom
Highlife|6|Afrobeat
Afro-fusion|5|Afrobeats,Afro-soul,Contemporary R&B
Afrobeat|6|Highlife,Classic funk,Jazz-funk
Afroswing|4|Afrobeats,Dancehall,UK rap
Gqom|4|Amapiano,Afro-house
Soukous|4|Highlife
Bongo flava|4|Afrobeats,Hip-Hop
Afro-soul|4|Neo-soul,Afro-fusion
`,
  latin: `
Latin|10|
Reggaeton|9|Dancehall,Latin trap,Latin pop
Salsa|7|Son cubano,Latin jazz,Bachata
Bachata|7|Merengue,Salsa,Latin pop
Latin pop|7|Reggaeton,Bachata,Pop,Bolero
Cumbia|6|Norteño,Merengue
Merengue|4|Bachata,Cumbia,Salsa
Bossa nova|6|Samba,Cool jazz,MPB,Latin jazz
Samba|6|Bossa nova,MPB
MPB|5|Bossa nova,Samba
Tango|4|Bolero,Flamenco
Mariachi|4|Corridos tumbados
Norteño|4|Cumbia
Corridos tumbados|4|Latin trap
Bolero|4|Latin pop,Son cubano,Tango
Sertanejo|4|Country
Baile funk|4|Hip-Hop,Reggaeton
Son cubano|4|Salsa,Bolero
Latin trap|4|Trap,Reggaeton,Corridos tumbados
`,
  classical: `
Classical|10|
Piano|6|Neoclassical,Romantic era,Chamber
Orchestral|7|Symphony,Film score
Chamber|5|Piano,Baroque
Opera|6|Choral,Romantic era,Orchestral
Baroque|6|Chamber,Choral
Romantic era|5|Piano,Opera,Orchestral
Minimalism|4|Ambient,Contemporary classical,Neoclassical
Contemporary classical|4|Minimalism
Choral|4|Opera,Baroque
Film score|6|Orchestral,Neoclassical
Neoclassical|5|Piano,Minimalism,Ambient,Film score
Symphony|5|Orchestral
`,
  country: `
Country & Folk|10|
Country|9|Americana,Honky-tonk,Country pop,Country rock,Bluegrass
Americana|6|Country,Alt-country,Folk,Blues
Bluegrass|5|Country
Folk|7|Americana,Indie folk
Outlaw country|4|Country,Honky-tonk,Country rock
Honky-tonk|4|Country,Outlaw country
Country pop|5|Country,Pop
Alt-country|4|Americana,Indie rock,Country rock
Country rock|5|Country,Classic rock,Southern rock,Alt-country
Indie folk|6|Folk,Singer-songwriter,Indie pop
`,
  world: `
World|10|
Flamenco|4|Tango
Bollywood|6|Indian classical,Bhangra
Indian classical|4|Bollywood
Bhangra|4|Bollywood
Arabic pop|4|
`
};

module.exports = { FAMILIES, FAMILY_LINKS, SRC };
