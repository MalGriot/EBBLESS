// Voice DJ (#553): per-user daily request counter, one Durable Object per
// signed-in user (named "u:<sub>"). A Durable Object rather than KV because
// KV puts are capped on the free tier (the account-wide daily put limit has
// already been hit once, see README "Testing against staging") and KV
// read-modify-write is racy; a SQLite-backed DO's storage is free-tier
// friendly and serialized. Holds only today's count; older days are deleted.
import { DurableObject } from 'cloudflare:workers';

export class VoiceQuota extends DurableObject {
  // { ok, used }: ok=false when today's count already reached limit (nothing is counted then).
  async take(limit) {
    const day = new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get(day)) || 0;
    if (used >= limit) return { ok: false, used };
    await this.ctx.storage.put(day, used + 1);
    for (const k of (await this.ctx.storage.list()).keys()) if (k !== day) await this.ctx.storage.delete(k);
    return { ok: true, used: used + 1 };
  }
  async refund() {
    const day = new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get(day)) || 0;
    if (used > 0) await this.ctx.storage.put(day, used - 1);
  }

  // Account-wide daily neuron estimate (instance named "g:<UTC date>"; see voice.js VOICE_NEURONS_PER_CALL).
  // Reserves `cost` neurons if the day's total stays within `budget`. Nothing is reserved when it would not.
  async spend(cost, budget) {
    const key = 'n:' + new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get(key)) || 0;
    if (used + cost > budget) return { ok: false, used };
    await this.ctx.storage.put(key, used + cost);
    for (const k of (await this.ctx.storage.list()).keys()) if (k !== key) await this.ctx.storage.delete(k);
    return { ok: true, used: used + cost };
  }
  async unspend(cost) {
    const key = 'n:' + new Date().toISOString().slice(0, 10);
    const used = (await this.ctx.storage.get(key)) || 0;
    if (used > 0) await this.ctx.storage.put(key, Math.max(0, used - cost));
  }
}
