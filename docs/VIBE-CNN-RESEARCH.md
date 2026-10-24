# Issue #519: can CNNs catch a listener's vibe 95% accurately?

Research only, 2026-10-25. No code changed.

## Recommendation (read this first)

**Prototype, small and offline. Do not build into the app yet. Do not promise 95%.**

1. 95% is not a real target. No one can measure it, because humans do not agree with each other that closely about mood (see ceiling below).
2. A pretrained audio embedding could plausibly beat today's tags and BPM at "sounds like this", but only if EBBLESS can get audio to analyze. That is the real blocker, not the model.
3. Smallest first step: a one-evening script on the dev machine that takes about 200 tracks from the test playlists, pulls their 30 second preview clips, runs a pretrained Essentia model, and checks whether its "nearest songs" beat the current `/similar` + `/metrics` picks in a blind listen. Cost: zero. Ship nothing until that wins.

## What EBBLESS does today

- **Sentence to vibe** (`/vibe-interpret` in `worker/src/index.js`): Cloudflare Workers AI (free tier, Llama 3.1 8B) turns "rainy Sunday, warm and slow" into a title, Last.fm-style tags, target energy/tempo ranges and seed songs. A keyword lexicon (`vibeHeuristic`) is the fallback. Seed songs are checked against iTunes so invented ones are dropped. Last.fm `tag.getTopTracks` fills the list.
- **Ranking** (`rankVibeTracks` in `index.html`): re-ranks against energy/BPM from `/metrics` (Deezer BPM, optional GetSongBPM), extends thin lists with `/similar`, then matches each song to a playable video via `/search`.
- **Currents** (IMPROVEMENTS.md, `currents-playlist-algorithm`): picks by genre, year and "vibe" using the same tags/metrics, not audio.
- **Browse by vibe**: the Find music grid (`FM_VIBES`) is hand-made lists plus a tempo filter.

So today's "vibe" is metadata: crowd tags, BPM, key, energy numbers, and an LLM's reading of the words. Nothing listens to the audio. That is cheap, free, and decent for mainstream songs, and weak for small artists with few tags (which is exactly who EBBLESS wants to surface).

## Could CNNs help?

Yes, in a narrower way than the issue implies.

- A CNN on mel-spectrograms (MusiCNN, VGGish-style, the Essentia/MTG models) turns a clip into a vector or into mood/genre/instrument scores. Songs close in that space tend to feel alike. This fills the gap for songs with no tags, and could rank within a tag ("rainy" songs that actually sound rainy).
- Modern options are not really "train a CNN". They are pretrained embeddings used as-is:
  - **Essentia / MusiCNN** (MTG, Barcelona): small (about 787K parameters, [ISMIR 2020 abstract](https://program.ismir2020.net/static/lbd/ISMIR2020-LBD-439-abstract.pdf)), ready-made mood, genre, danceability and tagging heads, TF.js and ONNX versions exist ([Essentia models](https://essentia.upf.edu/models.html)). Essentia.js has a browser mood demo ([demos](https://essentia.upf.edu/demos.html)).
  - **CLAP** (LAION): audio and text in one space, so "warm slow rainy" could be matched to audio directly. Audio encoder gives a 512-number vector; an ONNX audio export exists for `laion/clap-htsat-unfused`, and a Transformers.js build exists ([HF model](https://huggingface.co/Xenova/clap-htsat-unfused), [export write-up](https://dev.to/kiarina/classifying-environmental-sounds-with-clap-and-onnx-runtime-a-1-nn-evaluation-on-esc-50-hoi)). The music-tuned checkpoint (`larger_clap_music`) has no ONNX build I could find. It is a transformer, not a CNN, and larger (I could not confirm file sizes; check before planning).
- The model is the easy part. Getting it is not a research problem; feeding it is.

## The accuracy ceiling

- Mood is subjective. In the MediaEval "Emotion in Music" task, people agreed with each other only fairly: Krippendorff's alpha about 0.32 (valence) and 0.35 (arousal) for whole clips ([MediaEval 2013](https://ceur-ws.org/Vol-1043/mediaeval2013_submission_5.pdf)). A music-video study found human-vs-consensus agreement of roughly 0.41 for arousal and 0.24 for valence ([arXiv 2202.10453](https://arxiv.org/pdf/2202.10453)). Different metrics, so not directly comparable, but the picture is clear: the labels themselves are noisy.
- Models do reasonably on arousal (calm vs intense, close to what BPM and energy already capture) and poorly on valence (happy vs sad), with published results well short of anything like 95%. A "95% accuracy" number only appears when the task is easy (a few coarse classes, or a model tested on its own training clips).
- A listener's vibe also depends on context (time, activity, history), which audio cannot see. The honest claim: "better than tags alone for songs with weak metadata." That is a win, but it is not 95%.
- Do not put any accuracy figure in copy. If we want a number later, measure it ourselves: blind A/B of old vs new picks by real listeners.

## The blocker: where does the audio come from?

EBBLESS plays YouTube through an iframe. The browser cannot read audio out of a cross-origin YouTube player, and having the worker download YouTube audio to analyze it is against YouTube's terms and against how the rest of the app is built (see `docs/PLATFORM-AUDIT.md`). Spotify's 30 second preview URLs are no longer reliable for new apps. That leaves:

- **Deezer / iTunes 30 second previews**: the worker already talks to both (BPM, art). Short, legal for analysis-style use only per their terms (verify before relying on it), and not every song has one.
- **User's own uploaded songs** (`docs/PROPOSAL-upload-songs.md`): fully allowed, and this is the clean in-browser case, but only covers those files.

So the realistic design is: analyze previews, not the actual stream, and store only the resulting small vector per song.

## Cost and where it could run

| Where | Free? | Verdict |
|---|---|---|
| In the browser (TF.js / ONNX Runtime Web, WASM) | Yes, user's CPU | Fine for a small MusiCNN-class model (a few MB) on a short clip, a few seconds on a phone. Hurts the GPU/memory budget in `CLAUDE.md` if WebGL is used; prefer WASM, run once per song, never during playback. Does not fit "single static file" unless the model loads lazily from a separate file. Only possible on audio the browser can fetch, which excludes YouTube. |
| Cloudflare Worker | Doubtful | Free tier has a tiny CPU budget per request and no practical room to decode MP3 and run a CNN. Workers AI has audio models, but not mood/music embedding ones that I could confirm. Not a fit. |
| Offline batch on the dev machine | Yes | Best fit. Precompute vectors for a catalog (the Find music artists, test playlists), store as a small JSON/KV file, and let the worker do nearest-neighbor on tiny numbers. KV write limits (README) mean batch it, in staging first. |
| Paid GPU service | No | Not justified at this stage. |

Licensing: the MTG/Essentia models are CC BY-NC-SA 4.0 ([Essentia models](https://essentia.upf.edu/models.html)). Non-commercial only. If EBBLESS ever earns money, this needs a license from MTG or a different model (CLAP is more permissive but verify the checkpoint). Settle this before shipping anything.

Training our own CNN: not worth it. It needs thousands of labeled tracks we do not have, and the pretrained models beat anything we could train on our own listeners.

## Smallest first step (the prototype)

1. Pick 200 songs from the existing test playlists (see memory: test playlist).
2. Script (Python or Node, on the dev machine, not in the repo's app) fetches Deezer/iTunes preview clips, runs an Essentia MusiCNN embedding + mood heads, saves vectors to a local file.
3. For 10 seed songs, list top 10 neighbors by audio vector next to what `/similar` + `/metrics` give today.
4. Blind listen. Decision rule: if audio neighbors are clearly better on at least 6 of 10 seeds, write a proposal for a precomputed-vector layer feeding `rankVibeTracks`. If not, close the issue as "tags and BPM are good enough for now".

Suggested change to issue #519: retitle to "audio embeddings for vibe matching (prototype)" and drop the 95% from the title.

## Not recommended now

- Real-time analysis of whatever is playing (no legal audio access, GPU budget risk).
- Any accuracy claim in the UI.
- Shipping a model in `index.html` before the prototype proves a gain.
