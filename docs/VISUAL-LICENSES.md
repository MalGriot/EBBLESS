# EBBLESS visuals: sources and licenses

Sibling of [AUDIO-LICENSES.md](AUDIO-LICENSES.md), same rules: every
third-party visual engine or preset pack EBBLESS loads gets a row here before
it ships, with the real license and where to re-check it. If a license can't
be confirmed, write `unknown`.

## Light show (MilkDrop)

Loaded only when the light show opens, from jsdelivr at exact versions with
SRI hashes (`MILK_LIB` / `MILK_PACKS` in `index.html`). Nothing is bundled
into the repo except the generated tags file.

| What | Version | Source | Author | License | Status |
|------|---------|--------|--------|---------|--------|
| butterchurn (WebGL MilkDrop engine) | 2.6.7 | https://github.com/jberg/butterchurn, npm `butterchurn` | Jordan Berg | MIT | Fine |
| butterchurn-presets (base, extra, extra2, md1 packs; 395 unique presets) | 2.4.7 | https://github.com/jberg/butterchurn-presets, npm `butterchurn-presets` | Packaged by Jordan Berg; presets by the MilkDrop community (author names are in each preset's name: Geiss, Flexi, Martin, Rovastar, and others) | MIT for the package. The individual presets carry no license of their own; many shipped with MilkDrop 2, which Nullsoft released under BSD-3-Clause in 2013. | Fine for in-app display, credited by name in the light show. Re-check per preset before any paid or redistributed use (recordings, exports, merch). |
| `visuals/milkdrop-tags.json` | generated | `tools/milkdrop-tag.js` | EBBLESS | EBBLESS-owned (measurements only, no preset code) | Fine |

Not used, on purpose: Milkbeat (GPL v3) code, and projectM's preset
collections, which are not in a format butterchurn runs without conversion.
