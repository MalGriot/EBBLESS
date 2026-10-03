// Background podcast captions for iPhone (GitHub #241). iOS freezes a web
// app the moment it leaves the screen, so the on-device generator stops.
// When that happens the app hands the rest of the episode to this Durable
// Object, which transcribes it with Workers AI one 2 MB slice per alarm (the
// same slices the app uses, so results line up) until the app comes back.
// On return the app collects what's done, this object erases itself, and
// the device's own generator carries on.
//
// Free forever: a shared daily budget (PodCaptionBudget) stops background
// work at POD_CAPTION_DAILY_MIN audio minutes, under Workers AI's free
// 10,000 neurons/day (~214 audio minutes, also shared with /vibe-interpret).
// Results are only a handoff buffer: deleted on collect, or 2 hours after
// the handoff at the latest.
import { DurableObject } from 'cloudflare:workers';
import { parseTimedText } from './pod-text.js';

export const POD_CAPTION_CHUNK_BYTES = 2 * 1024 * 1024;
const POD_CAPTION_DAILY_MIN = 150;
const POD_CAPTION_TTL_MS = 2 * 3600 * 1000;
const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';

function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// [[start, end, text], ...] in episode seconds, from Whisper's output
function whisperCues(out, offset) {
  let segs = Array.isArray(out && out.segments) ? out.segments
    .map(s => ({ t: Number(s.start), end: Number(s.end), text: String(s.text || '').trim() })) : [];
  if (!segs.length && out && out.vtt) segs = parseTimedText(out.vtt);
  return segs
    .filter(s => isFinite(s.t) && s.text && !/^[\[(][^\])]*[\])]$/.test(s.text))
    .map(s => [Math.round((offset + s.t) * 100) / 100, Math.round((offset + (isFinite(s.end) ? s.end : s.t)) * 100) / 100, s.text]);
}

export class PodCaptionBudget extends DurableObject {
  // true (and the minutes are counted) while today's budget has room
  async take(minutes) {
    const day = new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get(day)) || 0;
    if (used + minutes > POD_CAPTION_DAILY_MIN) return false;
    await this.ctx.storage.put(day, used + minutes);
    // keep only today's counter
    const keys = await this.ctx.storage.list();
    for (const k of keys.keys()) if (k !== day) await this.ctx.storage.delete(k);
    return true;
  }
}

export class PodCaptioner extends DurableObject {
  // job: { url, total, dur, lang, from, done: [slice indices], at }
  async start(job) {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.put('job', { ...job, done: job.done || [], at: Date.now(), state: 'working', gen: crypto.randomUUID() });
    // a short grace period: a quick glance away (notification, Control
    // Center) is collected before any background work is spent
    await this.ctx.storage.setAlarm(Date.now() + 8000);
  }

  // everything finished so far, then erase it all
  async collect() {
    const job = await this.ctx.storage.get('job');
    if (!job) return { parts: {}, state: 'none' };
    const parts = {};
    const stored = await this.ctx.storage.list({ prefix: 'p:' });
    for (const [k, v] of stored) parts[k.slice(2)] = v;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return { parts, state: job.state };
  }

  async alarm() {
    const job = await this.ctx.storage.get('job');
    if (!job) return;
    if (Date.now() - job.at > POD_CAPTION_TTL_MS) { await this.ctx.storage.deleteAll(); return; }
    if (job.state !== 'working') return;
    const n = Math.ceil(job.total / POD_CAPTION_CHUNK_BYTES);
    const done = new Set(job.done);
    let i = -1;
    for (let k = 0; k < n; k++) { const j = (job.from + k) % n; if (!done.has(j)) { i = j; break; } }
    const stop = async (state) => {
      job.state = state;
      await this.ctx.storage.put('job', job);
      await this.ctx.storage.setAlarm(job.at + POD_CAPTION_TTL_MS); // cleanup
    };
    // a collect (or a new start) can land while this slice is being
    // transcribed; only write back if this is still the same live job
    const stillMine = async () => {
      const cur = await this.ctx.storage.get('job');
      return !!cur && cur.gen === job.gen && cur.state === 'working';
    };
    if (i < 0) return stop('done');
    const start = i * POD_CAPTION_CHUNK_BYTES, end = Math.min(job.total, start + POD_CAPTION_CHUNK_BYTES) - 1;
    const minutes = (end - start + 1) / job.total * job.dur / 60;
    const budget = this.env.POD_CAPTION_BUDGET.get(this.env.POD_CAPTION_BUDGET.idFromName('budget'));
    if (!(await budget.take(minutes))) return (await stillMine()) ? stop('capped') : undefined;
    try {
      const res = await fetch(job.url, { headers: { 'Range': 'bytes=' + start + '-' + end } });
      if (res.status !== 206) { try { if (res.body) await res.body.cancel(); } catch (e) {} return (await stillMine()) ? stop('failed') : undefined; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const input = { audio: toBase64(bytes) };
      if (job.lang && job.lang !== 'en') input.language = job.lang;
      const out = await this.env.AI.run(WHISPER_MODEL, input);
      if (!(await stillMine())) return;
      await this.ctx.storage.put('p:' + i, whisperCues(out, start / job.total * job.dur));
    } catch (e) {
      if (!(await stillMine())) return;
      // the account's AI allowance is spent: stop, never retry into a bill
      if (/limit|quota|neuron|429|capacity/i.test(String(e && e.message))) return stop('capped');
      // one bad slice (undecodable cut, model hiccup): skip it, keep going
      await this.ctx.storage.put('p:' + i, []);
    }
    job.done.push(i);
    await this.ctx.storage.put('job', job);
    await this.ctx.storage.setAlarm(Date.now());
  }
}
