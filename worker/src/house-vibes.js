// House vibes: MAL GRIOT's own read on a vibe, ahead of the model's.
//
// When a sentence contains one of an entry's `match` phrases, /vibe-interpret
// builds from this entry first: its seed songs lead the list (still checked
// against the Apple Music catalog, so a typo just drops that song), its tags
// come before the model's, and `energy` (0..1, optional) replaces the model's
// range. Everything else about the vibe still comes from the model.
//
// Add entries in your own words and your own picks. Example shape:
//
//   {
//     match: ['sunday cookout', 'backyard cookout'],
//     tags: ['soul', 'funk', 'rnb'],
//     energy: [0.5, 0.8],
//     seeds: [{ artist: 'Artist Name', title: 'Song Title' }],
//   },
//
// Bump HOUSE_VIBES_VERSION after editing so answers cached for a week pick up
// the change (only sentences that match an entry are affected).
export const HOUSE_VIBES_VERSION = 1;
export const HOUSE_VIBES = [];
