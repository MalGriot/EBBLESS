// Geethub #596: anonymous log of manual link fixes (listener picked a
// different video in the "Refresh link" picker). Each entry is what the
// matcher chose vs what the listener chose, plus the ranked candidates, so
// patterns in scoreCandidate's misses can be found later. No user id, no IP,
// no playlist name or link: just track title/artist and public video info.
// Stored in MATCH_REPORTS under `linkfix:<ts>:<uuid>`; reviewed through the
// owner-only GET /admin/linkfixes (summarizeLinkFixes below).

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0; };
const vid = (c) => {
  c = c && typeof c === 'object' ? c : {};
  return { videoId: str(c.videoId, 64), title: str(c.title, 300), channel: str(c.channel, 200), duration: num(c.duration, 86400) };
};
const SOURCES = ['spotify', 'apple', 'soundcloud', 'youtube', 'other'];

export function sanitizeLinkFix(body) {
  body = body && typeof body === 'object' ? body : {};
  const from = vid(body.from), to = vid(body.to);
  if (!to.videoId || !str(body.title, 300)) return null;
  const ranked = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 15).map(c => vid(c));
  return {
    title: str(body.title, 300),
    artist: str(body.artist, 300),
    source: SOURCES.includes(body.source) ? body.source : 'other',
    srcDuration: num(body.srcDuration, 86400),
    from, to,
    // 1-based position of the chosen video in the fresh ranking, 0 = not in it.
    pickedRank: num(body.pickedRank, 15),
    fromRank: num(body.fromRank, 15),
    candidates: ranked,
    resolveVersion: str(body.resolveVersion, 32),
    ts: Date.now(),
  };
}

const isTopic = (ch) => /-\s*topic$/i.test(ch || '');
const kw = ['live', 'remix', 'cover', 'lyric', 'official video', 'official audio', 'instrumental', 'sped up', 'slowed'];

// Counts only: which kinds of video the matcher got wrong and listeners
// preferred. Enough to see whether a scoring change (e.g. more weight on
// Topic channels or duration) would have avoided the fix.
export function summarizeLinkFixes(entries) {
  const s = { total: entries.length, pickedWasRank: {}, chosenTopicChannel: 0, replacedTopicChannel: 0,
    chosenDurationCloser: 0, chosenNotInRanking: 0, replacedKeywords: {}, chosenKeywords: {}, repeatTracks: [] };
  const seen = {};
  for (const e of entries) {
    const r = String(e.pickedRank || 0);
    s.pickedWasRank[r] = (s.pickedWasRank[r] || 0) + 1;
    if (!e.pickedRank) s.chosenNotInRanking++;
    if (isTopic(e.to.channel)) s.chosenTopicChannel++;
    if (isTopic(e.from.channel)) s.replacedTopicChannel++;
    if (e.srcDuration && e.from.duration && e.to.duration &&
        Math.abs(e.to.duration - e.srcDuration) < Math.abs(e.from.duration - e.srcDuration)) s.chosenDurationCloser++;
    for (const k of kw) {
      if ((e.from.title || '').toLowerCase().includes(k)) s.replacedKeywords[k] = (s.replacedKeywords[k] || 0) + 1;
      if ((e.to.title || '').toLowerCase().includes(k)) s.chosenKeywords[k] = (s.chosenKeywords[k] || 0) + 1;
    }
    const key = (e.title + ' - ' + e.artist).toLowerCase();
    seen[key] = (seen[key] || 0) + 1;
  }
  s.repeatTracks = Object.entries(seen).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([track, n]) => ({ track, n }));
  return s;
}
