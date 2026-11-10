// MD5 and HMAC-MD5 over bytes. Only exists because Patreon signs webhooks with
// HMAC-MD5 (X-Patreon-Signature) and WebCrypto in Workers/Node has no MD5 HMAC.
// Used for webhook authenticity only, never for storing or hashing secrets.

const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

export function md5(bytes) {
  const len = bytes.length;
  const padded = new Uint8Array(((len + 8) >> 6 << 6) + 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(len / 536870912), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const m = dv.getUint32(off + g * 4, true);
      f = (f + a + K[i] + m) >>> 0;
      a = d; d = c; c = b;
      const s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((f << s) | (f >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16), ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

export function hmacMd5Hex(keyStr, msgBytes) {
  const enc = new TextEncoder();
  let key = enc.encode(keyStr);
  if (key.length > 64) key = md5(key);
  const ipad = new Uint8Array(64).fill(0x36), opad = new Uint8Array(64).fill(0x5c);
  key.forEach((b, i) => { ipad[i] ^= b; opad[i] ^= b; });
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(ipad); inner.set(msgBytes, 64);
  const ih = md5(inner);
  const outer = new Uint8Array(64 + 16);
  outer.set(opad); outer.set(ih, 64);
  return [...md5(outer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
