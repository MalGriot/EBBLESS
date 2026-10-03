// Podcast chapters and captions (GitHub #241). Parsers for what a feed item
// can point at: Podcasting 2.0 <podcast:chapters> (JSON chapters file),
// Podlove Simple Chapters (<psc:chapter> inline in the feed) and
// <podcast:transcript> (WebVTT, SRT or JSON). Everything comes out in the
// shape the client's lyrics view already renders: { t: seconds, text }.

const MAX_LINES = 5000;
const MAX_CHAPTERS = 300;

// "01:02:03.500" / "02:03,5" / "3723.5" -> seconds (null when unreadable)
export function clockToSeconds(s) {
  s = String(s == null ? '' : s).trim().replace(',', '.');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (!/^\d+(:\d+){1,2}(\.\d+)?$/.test(s)) return null;
  return s.split(':').reduce((acc, n) => acc * 60 + parseFloat(n), 0);
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? decodeEntities(m[1] != null ? m[1] : m[2]).trim() : '';
}

function cleanChapters(list) {
  const out = list
    .filter(c => c && c.t != null && isFinite(c.t) && c.t >= 0 && c.title)
    .sort((a, b) => a.t - b.t);
  // a repeated start time is the same chapter twice - keep the first
  return out.filter((c, i) => i === 0 || c.t !== out[i - 1].t).slice(0, MAX_CHAPTERS);
}

// One feed <item>'s chapter/transcript pointers. Inline Podlove chapters come
// back parsed; the Podcasting 2.0 files are only urls, fetched on demand by
// /podtext so a 300-episode feed doesn't cost 300 extra fetches.
export function itemPodText(item) {
  const out = {};
  const psc = item.match(/<psc:chapters[\s>][\s\S]*?<\/psc:chapters>/i);
  if (psc) {
    const chapters = cleanChapters((psc[0].match(/<psc:chapter\s[^>]*>/gi) || [])
      .map(tag => ({ t: clockToSeconds(attr(tag, 'start')), title: attr(tag, 'title') })));
    if (chapters.length > 1) out.chapters = chapters;
  }
  if (!out.chapters) {
    const tag = (item.match(/<podcast:chapters\s[^>]*>/i) || [])[0];
    const u = tag && attr(tag, 'url');
    if (u && /^https?:\/\//i.test(u)) out.chaptersUrl = u.replace(/^http:\/\//i, 'https://');
  }
  // several transcript formats are often listed - take the one with timing
  const rank = { vtt: 3, srt: 2, json: 1 };
  let best = null;
  (item.match(/<podcast:transcript\s[^>]*>/gi) || []).forEach(tag => {
    const u = attr(tag, 'url');
    const kind = transcriptKind(attr(tag, 'type'), u);
    if (!u || !/^https?:\/\//i.test(u) || !kind) return;
    if (!best || rank[kind] > rank[best.kind]) best = { u, kind };
  });
  if (best) {
    out.transcriptUrl = best.u.replace(/^http:\/\//i, 'https://');
    out.transcriptType = best.kind;
  }
  return out;
}

export function transcriptKind(type, url) {
  type = String(type || '').toLowerCase();
  if (/vtt/.test(type)) return 'vtt';
  if (/srt|subrip/.test(type)) return 'srt';
  if (/json/.test(type)) return 'json';
  const ext = (String(url || '').split('?')[0].match(/\.([a-z]+)$/i) || [])[1];
  return ext && ['vtt', 'srt', 'json'].includes(ext.toLowerCase()) ? ext.toLowerCase() : null;
}

// Podcasting 2.0 JSON chapters file. toc:false entries are silent markers
// (ad slots, image changes), not chapters a listener navigates by.
export function parseChaptersJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return []; }
  const list = Array.isArray(data && data.chapters) ? data.chapters : [];
  return cleanChapters(list
    .filter(c => c && c.toc !== false)
    .map(c => ({ t: Number(c.startTime), title: String(c.title || '').trim() })));
}

function stripCueMarkup(s) {
  return decodeEntities(String(s || '')
    .replace(/<\/?(?:c|i|b|u|v|lang|ruby|rt)(?:[.\s][^>]*)?>/gi, '')
    .replace(/<\d+:\d+[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// WebVTT and SRT share the "start --> end" cue line; everything else (cue
// ids, WEBVTT header, NOTE/STYLE blocks) is skipped by only reading blocks
// that have one. "<v Speaker>" voice tags become the cue's speaker.
export function parseTimedText(text) {
  const cues = [];
  String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach(block => {
    const lines = block.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) return;
    const [a, b] = lines[i].split('-->');
    const t = clockToSeconds(a), end = clockToSeconds((b || '').trim().split(/\s+/)[0]);
    if (t == null) return;
    const raw = lines.slice(i + 1).join(' ');
    const v = raw.match(/<v(?:\.[^\s>]*)?\s+([^>]+)>/i);
    const body = stripCueMarkup(raw);
    if (body) cues.push({ t, end: end == null ? t : end, text: body, speaker: v ? v[1].trim() : '' });
  });
  return cues;
}

// Podcasting 2.0 JSON transcript: { segments: [{ startTime, endTime, body, speaker }] }
export function parseTranscriptJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return []; }
  const segs = Array.isArray(data && data.segments) ? data.segments : [];
  return segs
    .map(s => ({ t: Number(s.startTime), end: Number(s.endTime), text: stripCueMarkup(s.body), speaker: String(s.speaker || '').trim() }))
    .filter(c => isFinite(c.t) && c.text);
}

// Caption files are often cut a few words (or one word) per cue. Join cues
// into readable lines: keep going until a sentence ends, the line gets long,
// the speaker changes, or there's a real pause.
export function cuesToLines(cues) {
  const lines = [];
  let cur = null;
  cues.slice().sort((a, b) => a.t - b.t).forEach(c => {
    const pause = cur && c.t - cur.end > 2;
    const join = cur && !pause && c.speaker === cur.speaker &&
      cur.text.length + c.text.length < 110 && !/[.?!…]["')\]]?$/.test(cur.text);
    if (join) {
      cur.text += ' ' + c.text;
      cur.end = Math.max(cur.end, c.end || c.t);
    } else {
      if (cur) lines.push(cur);
      cur = { t: c.t, end: c.end || c.t, text: c.text, speaker: c.speaker };
    }
  });
  if (cur) lines.push(cur);
  let lastSpeaker = '';
  return lines.slice(0, MAX_LINES).map(l => {
    // name the speaker only when it changes
    const text = l.speaker && l.speaker !== lastSpeaker ? l.speaker + ': ' + l.text : l.text;
    lastSpeaker = l.speaker || lastSpeaker;
    return { t: Math.round(l.t * 100) / 100, text };
  });
}

export function parseTranscript(text, kind) {
  return cuesToLines(kind === 'json' ? parseTranscriptJson(text) : parseTimedText(text));
}
