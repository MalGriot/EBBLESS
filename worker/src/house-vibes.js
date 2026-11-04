// House vibes: MAL GRIOT's own read on a vibe, ahead of the model's.
//
// The list lives in /house-vibes.json at the repo root (its "_how" field says
// how to edit it), so the app can read the same phrases: typing exactly one of
// them goes to vibe search even when it's short. Wrangler bundles the JSON into
// the worker at deploy, so an edit goes live with the next worker deploy (and
// the next site push for the app side).
import data from '../../house-vibes.json';

export const HOUSE_VIBES_VERSION = Number(data && data.version) || 1;
export const HOUSE_VIBES = Array.isArray(data && data.vibes) ? data.vibes : [];
